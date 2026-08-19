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
import { launchTouch, controls, gameUrl, checker, ACT } from '../touch/driver.mjs'
import { GAMES } from './manifest.mjs'
import {
  PAGE_HELPERS, SAME_TONE, STRONG_TONE, MIN_STRONG_PIXELS,
  MAX_BACKDROP_MATCH, MIN_VARIANT_MARK, MIN_VARIANT_PIXELS,
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

  await page.evaluate(PAGE_HELPERS)

  // --- resolve the surfaces -------------------------------------------------
  const tones = {}
  for (const [name, surface] of Object.entries(entry.surfaces)) {
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
  const legible = [
    ...(entry.onFloor ?? []).map((k) => [k, 'floor']),
    ...(entry.onSky ?? []).map((k) => [k, 'sky']),
  ]
  const failures = []
  const missing = []
  for (const [key, surfaceName] of legible) {
    const r = await scoreAgainst(key, tones[surfaceName])
    if (r === null) {
      missing.push(key)
      continue
    }
    if (r.strong < MIN_STRONG_PIXELS) failures.push(`${key} ${r.strong}px`)
  }
  check(
    `every sprite is legible against its surface (${legible.length} checked)`,
    failures.length === 0,
    failures.length
      ? `under ${MIN_STRONG_PIXELS} strongly-contrasting pixels: ${failures.join(', ')}`
      : 'all clear',
  )
  check(
    'every key the manifest names actually exists',
    missing.length === 0,
    missing.length ? `not built: ${missing.join(', ')}` : `${legible.length} keys resolved`,
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
