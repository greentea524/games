// DMG contrast checks (#106).
//
//   npm run qa:contrast
//
// Four sprites have shipped invisible in this repo — #52's backdrop, #58's
// cobwebs, #83's chests and #62's lit target pad. Every one of them passed
// every functional check: right texture key, right tile, right depth, right
// alpha. All four were found only by generating a screenshot and looking at
// it, which is not a reliable way to catch a mechanical mistake.
//
// The mistake is always the same. The DMG ramp has four tones and three of the
// four games draw their background in PAL.lightest, the brightest one. Any
// sprite that also reaches for PAL.lightest or PAL.light lands on ground of
// its own colour and disappears.
//
// See qa/contrast/README.md before extending this.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { GAMES } from './manifest.mjs'
import {
  PAGE_HELPERS, SAME_TONE, STRONG_TONE, MIN_STRONG_PIXELS,
  MAX_BACKDROP_MATCH, MIN_VARIANT_MARK, MIN_VARIANT_PIXELS,
  MAX_DISSOLVED_PIXELS, DISSOLVE_TONE,
} from './contrast.mjs'

const PORT = process.env.QA_PORT ?? '5179'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

let server
if (!process.env.QA_URL) {
  const url = `http://localhost:${PORT}/games/`
  console.log(`starting a dev server on ${PORT}...`)
  server = spawn('npm', ['run', 'dev', '--', '--port', PORT], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  if (!(await waitForServer(url))) {
    console.error(`the dev server never came up on ${url}`)
    if (server.pid) process.kill(-server.pid, 'SIGTERM')
    process.exit(1)
  }
  process.env.QA_URL = url
}

// Imported *after* QA_URL is set, deliberately. driver.mjs resolves its base
// URL at module-evaluation time, so a static import here captures the default
// port before the server above has claimed one — and the suite then quietly
// tests whatever happens to be running on 5178, or fails outright when
// nothing is. That is exactly what shipped in the first version of this file.
const { launchTouch, controls, gameUrl, checker, ACT } = await import('../touch/driver.mjs')

const { check, finish } = checker()
let allOk = true

for (const entry of GAMES) {
  console.log(`\n### ${entry.game} ###\n`)
  const t = await launchTouch(gameUrl(entry.game))
  const { page, hand } = t
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2600)

  // Walk in far enough that every texture has been generated. BootScene builds
  // them all up front in these games, but reaching gameplay also proves the
  // keys the manifest names are the ones actually in use.
  try {
    const c = await controls(page)
    for (let i = 0; i < entry.advance; i++) {
      await hand.tap(ACT, c.A.x, c.A.y, 130)
      await page.waitForTimeout(800)
    }
  } catch {
    // some shells have no A button on the first screen; the textures are built
    // by BootScene regardless
  }

  // The scene the manifest names has to actually be running before anything is
  // measured. This used to be a field nobody read: every check here samples
  // textures, which `BootScene` builds up front, so the suite passed just as
  // happily against a title screen — and the comment above claiming that
  // reaching gameplay "proves the keys the manifest names are the ones
  // actually in use" was not enforced by anything. #131 needs it enforced for
  // real, because an overlay surface can only be read off a live scene.
  const reached = await page
    .waitForFunction(
      (key) => window.__game?.scene?.getScene(key)?.scene?.isActive(),
      entry.scene,
      { timeout: 8000 },
    )
    .then(() => true)
    .catch(() => false)
  check(
    `the ${entry.scene} scene is running`,
    reached,
    reached
      ? 'reached'
      : `still on ${await page.evaluate(() => window.__game.scene.scenes.filter((x) => x.scene.isActive()).map((x) => x.scene.key).join(', '))}`,
  )

  await page.evaluate(PAGE_HELPERS)

  // --- resolve the surfaces -------------------------------------------------
  //
  // In declaration order, so an `overlay` can composite itself over a surface
  // named earlier in the same entry.
  const tones = {}
  for (const [name, surface] of Object.entries(entry.surfaces)) {
    if (surface.overlay) {
      const under = tones[surface.over]
      if (!under) {
        check(`surface ${name} composites over a surface declared before it`, false,
          `'${surface.over}' is not resolved — declare it above ${name}`)
        continue
      }
      const fill = await page.evaluate(
        ({ scene, at }) => {
          const sc = window.__game.scene.getScene(scene)
          if (!sc) return null
          // Topmost first: the display list is painted in order, so the last
          // rectangle covering the point is the one a sprite is drawn on.
          const hit = sc.children.list
            .filter((o) => o.type === 'Rectangle')
            .filter((o) => {
              const x = o.x - o.width * o.originX
              const y = o.y - o.height * o.originY
              return at[0] >= x && at[0] < x + o.width && at[1] >= y && at[1] < y + o.height
            })
            .pop()
          return hit ? { fill: hit.fillColor, alpha: hit.fillAlpha } : null
        },
        { scene: surface.overlay.scene, at: surface.overlay.at },
      )
      if (!fill) {
        check(`surface ${name} finds its overlay`, false,
          `nothing in scene '${surface.overlay.scene}' covers ${JSON.stringify(surface.overlay.at)}`)
        continue
      }
      // Source-over, which is what Phaser does with a translucent fill.
      tones[name] = [16, 8, 0].map((shift, i) =>
        Math.round(((fill.fill >> shift) & 255) * fill.alpha + under[i] * (1 - fill.alpha)),
      )
      continue
    }
    tones[name] = await page.evaluate(
      ({ surface }) => {
        if (surface.cameraBackground) {
          const s = window.__game.scene.scenes.find((x) => x.scene.isActive() && x.cameras?.main)
          const c = s.cameras.main.backgroundColor
          return [c.red, c.green, c.blue]
        }
        return window.__contrast.surfaceTone(surface.texture, surface.frame, surface.rect)
      },
      { surface },
    )
  }
  for (const [name, tone] of Object.entries(tones)) {
    console.log(`  surface ${name}: rgb(${tone.join(',')})`)
  }

  const scoreAgainst = async (key, tone) =>
    page.evaluate(
      ({ key, tone, threshold, strongThreshold }) => {
        if (!window.__game.textures.exists(key)) return null
        return window.__contrast.share(key, tone, threshold, strongThreshold)
      },
      { key, tone, threshold: SAME_TONE, strongThreshold: STRONG_TONE },
    )

  // --- legibility: a sprite must not be its own background ------------------
  // One vocabulary, not two. `onFloor` and `onSky` were the only two words the
  // manifest had, which is why a sprite drawn on anything else could only be
  // written down as an exclusion — and an exclusion is not checked. Naming the
  // surface is the whole of #131's fix.
  const legible = Object.entries(entry.on).flatMap(([surface, keys]) =>
    keys.map((k) => [k, surface]),
  )
  const undeclared = Object.keys(entry.on).filter((name) => !(name in entry.surfaces))
  check(
    'every surface sprites are listed against is declared',
    undeclared.length === 0,
    undeclared.length ? `no such surface: ${undeclared.join(', ')}` : `${Object.keys(entry.on).length} in use`,
  )
  // And the other way. A surface nothing is drawn against is either a mistake
  // or dead weight, and either way it is not being checked by its presence.
  const unused = Object.keys(entry.surfaces).filter(
    (name) =>
      !(name in entry.on) &&
      !(entry.floorVariants && name === 'floor') &&
      !(entry.backdropVsPlatform && name === 'platform'),
  )
  check(
    'every declared surface has something drawn against it',
    unused.length === 0,
    unused.length ? `nothing is listed on: ${unused.join(', ')}` : 'all in use',
  )
  const failures = []
  const missing = []
  // A surface that failed to resolve above has already been reported, but the
  // sprites listed against it must not then be scored against `undefined` —
  // which throws inside the page and turns a clean failure into a stack trace.
  const unresolved = legible.filter(([, name]) => !tones[name])
  check(
    'every sprite has a surface to be scored against',
    unresolved.length === 0,
    unresolved.length
      ? `unresolved surfaces: ${[...new Set(unresolved.map(([, n]) => n))].join(', ')}`
      : `${legible.length} scored`,
  )
  const scorable = legible.filter(([, name]) => tones[name])
  for (const [key, surfaceName] of scorable) {
    const r = await scoreAgainst(key, tones[surfaceName])
    if (r === null) {
      missing.push(key)
      continue
    }
    if (r.strong < MIN_STRONG_PIXELS) failures.push(`${key} ${r.strong}px`)
  }
  check(
    `every sprite is legible against its surface (${scorable.length} checked)`,
    failures.length === 0,
    failures.length
      ? `under ${MIN_STRONG_PIXELS} strongly-contrasting pixels: ${failures.join(', ')}`
      : 'all clear',
  )

  // --- silhouette: no limb may be eaten off the outline (#107) -------------
  //
  // The rule above scores the whole sprite, so a dark body carries a sprite
  // whose horns, muzzle or lid band are painted in the floor tone. This one
  // floods in from the texture edge through everything indistinguishable from
  // the surface and counts what it swallows.
  const dissolved = []
  for (const [key, surfaceName] of scorable) {
    const n = await page.evaluate(
      ({ key, tone, threshold }) => {
        if (!window.__game.textures.exists(key)) return null
        return window.__contrast.dissolved(key, tone, threshold)
      },
      { key, tone: tones[surfaceName], threshold: DISSOLVE_TONE },
    )
    if (n !== null && n > MAX_DISSOLVED_PIXELS) dissolved.push(`${key} ${n}px`)
  }
  check(
    `no sprite has lost part of its silhouette (${scorable.length} checked)`,
    dissolved.length === 0,
    dissolved.length
      ? `over ${MAX_DISSOLVED_PIXELS}px eaten into the surface: ${dissolved.join(', ')}`
      : 'all clear',
  )
  check(
    'every key the manifest names actually exists',
    missing.length === 0,
    missing.length ? `not built: ${missing.join(', ')}` : `${scorable.length} keys resolved`,
  )

  // --- floor variants: floor-toned by design, but must carry a mark ---------
  if (entry.floorVariants) {
    const flat = []
    for (const key of entry.floorVariants) {
      const r = await scoreAgainst(key, tones.floor)
      if (r === null) {
        missing.push(key)
        continue
      }
      if (r.share < MIN_VARIANT_MARK || r.strong < MIN_VARIANT_PIXELS) {
        flat.push(`${key} ${Math.round(r.share * 100)}% / ${r.strong}px`)
      }
    }
    check(
      'floor variants carry a mark that sets them apart from plain floor',
      flat.length === 0,
      flat.length ? flat.join(', ') : `${entry.floorVariants.length} checked`,
    )
  }

  // --- separation: backdrop art must not read as a platform (#52) -----------
  if (entry.backdropVsPlatform) {
    const tooSimilar = []
    for (const key of entry.backdropVsPlatform) {
      const r = await scoreAgainst(key, tones.platform)
      if (r === null) {
        missing.push(key)
        continue
      }
      // A high score here means the backdrop shares almost nothing with the
      // platform tile, which is what we want. A *low* score means it is
      // painted in the platform's own tone and reads as standable.
      if (1 - r.share > MAX_BACKDROP_MATCH) {
        tooSimilar.push(`${key} ${Math.round((1 - r.share) * 100)}% platform-toned`)
      }
    }
    check(
      'backdrop art is not painted in the platform tone',
      tooSimilar.length === 0,
      tooSimilar.length ? tooSimilar.join(', ') : `${entry.backdropVsPlatform.length} checked`,
    )
  }

  // --- the manifest cannot silently stop covering things --------------------
  //
  // Without this, a sprite added later is simply never checked and the suite
  // passes because it is testing less than it used to.
  const covered = new Set([
    ...legible.map(([k]) => k),
    ...(entry.floorVariants ?? []),
    ...(entry.backdropVsPlatform ?? []),
    ...Object.keys(entry.exclude ?? {}),
  ])
  const unlisted = await page.evaluate(
    ({ covered }) =>
      window.__game.textures
        .getTextureKeys()
        .filter((k) => !k.startsWith('__') && /dmg/i.test(k) && !covered.includes(k)),
    { covered: [...covered] },
  )
  check(
    'no DMG texture is missing from the manifest',
    unlisted.length === 0,
    unlisted.length ? `add or exclude: ${unlisted.join(', ')}` : `${covered.size} keys accounted for`,
  )

  // --- the DMG art has to be reachable at all (#134) ------------------------
  //
  // Everything above reads textures out of the texture manager, and those exist
  // whether or not anything ever draws them. Pocket Dungeon shipped that way:
  // `GameState.setPaletteMode` and `DungeonScene.reloadPalette()` both existed
  // with no callers, because its shell had no palette control, so `paletteMode`
  // was `'gbc'` from load to unload and all 32 of its sprites scored here were
  // art no player could reach. Nothing noticed for four issues.
  //
  // So: find the control the manifest names, use it, and require the running
  // game to actually be drawing `_dmg` textures afterwards. Deliberately the
  // last thing in the entry, so it cannot perturb a measurement above it.
  const toggle = await page.$(entry.paletteToggle)
  check(
    `the shell has a palette control at ${entry.paletteToggle}`,
    Boolean(toggle),
    toggle ? 'present' : 'no element matches — the DMG art cannot be reached',
  )
  if (toggle) {
    const drawing = () =>
      page.evaluate(() => {
        let dmg = 0
        let gbc = 0
        const gbcSeen = []
        const walk = (list) => {
          for (const o of list) {
            const key = o.texture?.key
            if (typeof key === 'string') {
              if (/_dmg(_|$)/.test(key)) dmg++
              else if (/_gbc(_|$)/.test(key)) { gbc++; gbcSeen.push(key) }
            }
            if (o.list) walk(o.list)
          }
        }
        for (const s of window.__game.scene.scenes) {
          if (s.scene.isActive()) walk(s.children.list)
        }
        return { dmg, gbc, gbcKeys: [...new Set(gbcSeen)].sort() }
      })

    // The mode is binary, so two presses reach it from either starting state.
    let drawn = await drawing()
    for (let i = 0; i < 2 && drawn.dmg === 0; i++) {
      await toggle.click()
      await page.waitForTimeout(500)
      drawn = await drawing()
    }
    // `dmg > 0` is not the bar, and finding that out is what made this check
    // worth having. Pocket Dungeon passed it with the scene reload deleted,
    // on three relic pips alone — `UIScene` re-textures those from
    // `paletteMode` every frame, so a game whose HUD follows the mode and
    // whose world does not would read as fine. The bar is that *nothing* on
    // screen is still GBC art, which is what the mode means.
    check(
      'and using it leaves no GBC art on screen',
      drawn.dmg > 0 && drawn.gbc === 0,
      drawn.gbc === 0
        ? `${drawn.dmg} DMG sprite(s), no GBC`
        : `${drawn.dmg} DMG but ${drawn.gbc} GBC still drawn — ${drawn.gbcKeys.join(' ')} — reloadPalette is missing a sprite kind`,
    )
  }

  if (!finish(t.log)) allOk = false
  await t.browser.close()
}

if (server?.pid) {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

console.log(allOk ? '\nALL CONTRAST CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(allOk ? 0 : 1)
