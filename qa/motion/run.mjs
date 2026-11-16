// `prefers-reduced-motion` is honoured, and checked (#138).
//
//   npm run qa:motion
//
// `shared/motion.ts` is read at six sites across four games (five since #179,
// which added Static), and until this
// file nothing checked any of them. The call being present in the source is a
// data structure; whether the motion stops is the effect, and the effect was
// unmeasured — the same shape as #134 and #136.
//
// ## Paired, deliberately
//
// Every game is loaded twice, once normally and once with the media preference
// emulated, and both halves are asserted. "Nothing moves under the preference"
// is half a claim: a game that never moved, or one broken in a way that stills
// it, satisfies it. The check is that the motion **is there by default and gone
// under the preference**, which only a pair can say.
//
// The preference is emulated on the browser context rather than switched after
// load, because two of the four read it during `create()` and a preference
// applied later would arrive after the decision.
//
// ## The four games that do not call it are correct
//
// #138 asked whether Minigolf, Tilt Maze, Anomaly Room and Voxel Digger were
// omissions. They are not, and the answer is not a matter of taste: none of
// them has any decorative motion to suppress. A putt rolling, a ball under a
// tilt, a block turning under the player's finger — each is the simulation the
// player is acting on, and suppressing it would suppress the game. Anomaly Room
// is the strongest case and read the other way at first glance, since its whole
// premise is noticing a small visual change; grepping its renderer for any
// time-varying transform — `elapsed`, `clock`, `dt`, `Math.sin`, `Math.cos` —
// returns nothing at all. The room is *still* by design. There is nothing there
// to turn off.
//
// So the four below are the whole population, and a fifth game joining them is
// a question for whoever writes it rather than a gap here.
import { launchTouch, gameUrl, controls, canvasPoint, checker, PAD, ACT } from '../touch/driver.mjs'
import { startDevServer } from '../harness.mjs'

const { check, finish } = checker()

/**
 * What each game does that is decoration, and how to see it.
 *
 * `measure` returns a number that should be positive with motion and zero
 * without. One number rather than a boolean so the failure message can say how
 * much moved, which is the difference between "this regressed" and "this is
 * measuring nothing".
 */
const GAMES = [
  {
    game: 'tube-runner',
    what: 'the score pulses as a ring is cleared',
    async measure({ page, hand }) {
      await page.waitForSelector('#stage canvas')
      await page.waitForTimeout(1200)
      const right = await canvasPoint(page, 0.78, 0.5, '#stage canvas')
      await hand.tap(PAD, right.x, right.y)
      // The pulse is a class the HUD adds while `clearFlash` is high, so it has
      // to be caught mid-run rather than read afterwards.
      let pulses = 0
      const deadline = Date.now() + 9000
      while (Date.now() < deadline) {
        await page.evaluate(async () => {
          const g = window.__game
          for (let i = 0; i < 12; i++) {
            const gap = g.nextGapAngle()
            if (gap !== null) {
              let d = gap - g.angle()
              while (d > Math.PI) d -= Math.PI * 2
              while (d < -Math.PI) d += Math.PI * 2
              g.steer(Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1)
            }
            await new Promise((r) => requestAnimationFrame(r))
          }
        })
        if (await page.evaluate(() => Boolean(document.querySelector('.tr-pulse')))) pulses++
      }
      // Rings cleared is the *denominator*: it says the run was equally busy
      // both ways, so zero pulses means the pulse was suppressed and not that
      // the run never got going.
      const rings = await page.evaluate(() => window.__game.rings())
      return { value: pulses, note: `${pulses} pulse(s) over ${rings} ring(s) cleared`, busy: rings }
    },
  },
  {
    game: 'tube-runner',
    what: 'the camera trails the runner through a turn',
    // #145: the runner swings across the screen as they steer and the camera
    // eases round after them. That swing is camera motion the player did not
    // have before, so under the preference the camera stays locked behind the
    // runner, as it always was — and the runner never leaves the middle.
    async measure({ page, hand }) {
      await page.waitForSelector('#stage canvas')
      await page.waitForTimeout(1200)
      const left = await canvasPoint(page, 0.22, 0.5, '#stage canvas')
      const right = await canvasPoint(page, 0.78, 0.5, '#stage canvas')
      await hand.tap(PAD, right.x, right.y)
      await page.waitForTimeout(300)
      const before = await page.evaluate(() => window.__game.angle())
      await hand.down(PAD, left.x, left.y)
      let most = 0
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(100)
        most = Math.max(most, await page.evaluate(() => Math.abs(window.__game.runnerScreen().x)))
      }
      const after = await page.evaluate(() => window.__game.angle())
      await hand.up(PAD)
      // Thousandths of the half-width: a locked camera projects the runner at
      // 1e-16 or so, which is the same as nothing and is not the same as 0.
      const value = Math.round(most * 1000) / 1000
      let turned = Math.abs(after - before)
      if (turned > Math.PI) turned = Math.PI * 2 - turned
      // The turn is the denominator: it says the hold steered the runner both
      // times, so a still camera means the camera was held, not the input lost.
      return {
        value,
        note: `runner up to ${value.toFixed(3)} of the half-width from centre, over a ${turned.toFixed(2)} rad turn`,
        busy: Math.round(turned * 100) / 100,
      }
    },
  },
  {
    game: 'tower-stacker',
    what: 'a landing shakes the camera',
    async measure({ page, hand }) {
      await page.waitForSelector('#stage canvas')
      await page.waitForTimeout(1400)
      const spot = await canvasPoint(page, 0.5, 0.5, '#stage canvas')
      await hand.tap(PAD, spot.x, spot.y)
      await page.waitForTimeout(700)
      let peak = 0
      for (let drop = 0; drop < 4; drop++) {
        await hand.tap(PAD, spot.x, spot.y)
        // Sampled across the frames right after the tap: shake is set on the
        // landing and decays, so a single read lands wherever it lands.
        peak = Math.max(
          peak,
          await page.evaluate(async () => {
            let most = 0
            for (let i = 0; i < 20; i++) {
              await new Promise((r) => requestAnimationFrame(r))
              most = Math.max(most, window.__game.shake())
            }
            return most
          }),
        )
        await page.waitForTimeout(200)
      }
      const height = await page.evaluate(() => window.__game.height())
      return { value: peak, note: `peak shake ${peak.toFixed(4)} over ${height} block(s)`, busy: height }
    },
  },
  {
    game: 'windup',
    what: 'the steam vents emit',
    advance: 2,
    async measure({ page }) {
      return page.evaluate(() => {
        const scene = window.__game.scene.getScene('platformer')
        let emitters = 0
        const walk = (list) => {
          for (const o of list ?? []) {
            if (o.constructor?.name === 'ParticleEmitter') emitters++
            if (o.list) walk(o.list)
          }
        }
        walk(scene?.children?.list)
        return {
          value: emitters,
          note: `${emitters} particle emitter(s)`,
          busy: scene?.scene?.isActive() ? 1 : 0,
        }
      })
    },
  },
  {
    game: 'lantern-keeper',
    what: 'the fireflies drift',
    advance: 3,
    async measure({ page }) {
      return page.evaluate(async () => {
        const scene = window.__game.scene.scenes.find((s) => s.scene.isActive() && s.fireflies)
        if (!scene) return { value: 0, note: 'no scene with fireflies is running', busy: 0 }
        const at = () => scene.fireflies.map((f) => `${f.sprite.x.toFixed(3)},${f.sprite.y.toFixed(3)}`)
        const before = at()
        await new Promise((r) => setTimeout(r, 900))
        const after = at()
        let moved = 0
        for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) moved++
        // Their alpha still tracks whether a lantern is lit either way — the
        // scene's own comment is explicit that only the movement is decoration,
        // so the fireflies must still be *there* under the preference.
        return { value: moved, note: `${moved} of ${before.length} moved`, busy: before.length }
      })
    },
  },
  {
    // #179. Static's namesake is noise, and it had two kinds: patches that
    // crackle on a tile, and noise thrown over the whole screen at a crossing.
    // The second is a full-screen flash and is not shown under the preference.
    // The first is kept, slowed — `also` holds it to that.
    game: 'static',
    what: 'noise flashes over the whole screen at a crossing',
    advance: 3,
    async measure({ page }) {
      return page.evaluate(async () => {
        const world = () => window.__game.scene.getScene('world')
        const wait = (ms) => new Promise((r) => setTimeout(r, ms))
        world().enterDoor('town', 18, 15)
        await wait(1500)
        // How often a patch changes its picture, counted over two seconds.
        const patch = world().children.list.find((o) => o.texture?.key?.startsWith('corruption_'))
        if (!patch) return { value: 0, note: 'no patch of static in the town', busy: 0 }
        let swaps = 0
        let last = patch.texture.key
        const until = performance.now() + 2000
        while (performance.now() < until) {
          await new Promise((r) => requestAnimationFrame(r))
          if (patch.texture.key !== last) { swaps++; last = patch.texture.key }
        }
        const sealed = last.includes('sealed')
        // The crossing. The overlay lives for a few hundred milliseconds, so
        // it is looked for every frame from the moment it is asked for.
        world().switchWorld()
        let frames = 0
        const end = performance.now() + 240
        while (performance.now() < end) {
          if (world().children.list.some((o) => o.texture?.key === 'noise' && o.visible)) frames++
          await new Promise((r) => requestAnimationFrame(r))
        }
        await wait(1500)
        const now = world().children.list.find((o) => o.texture?.key?.startsWith('corruption_'))
        const crossed = sealed && !!now && now.texture.key.includes('open')
        return {
          value: frames,
          note: `the overlay was up for ${frames} frames`,
          // The crossing itself must still happen, or nothing was measured.
          busy: crossed ? 1 : 0,
          swaps,
        }
      })
    },
    also(moving, still) {
      return [
        ['static: a patch crackles', moving.swaps >= 8, `${moving.swaps} changes in two seconds`],
        [
          'static: and still changes under reduced motion, under three times a second',
          still.swaps >= 1 && still.swaps <= 5,
          `${still.swaps} changes in two seconds`,
        ],
      ]
    },
  },
]

const server = await startDevServer({ port: process.env.QA_PORT ?? '5178' })

console.log('\n### reduced motion ###\n')

for (const entry of GAMES) {
  const run = async (reducedMotion) => {
    const t = await launchTouch(gameUrl(entry.game), reducedMotion ? { reducedMotion } : {})
    try {
      if (entry.advance) {
        await t.page.waitForSelector('canvas')
        await t.page.waitForTimeout(2600)
        try {
          const c = await controls(t.page)
          for (let i = 0; i < entry.advance; i++) {
            await t.hand.tap(ACT, c.A.x, c.A.y, 130)
            await t.page.waitForTimeout(900)
          }
        } catch {
          // no A button on the first screen; the measure below says so
        }
      }
      return await entry.measure(t)
    } finally {
      await t.browser.close()
    }
  }

  const moving = await run(undefined)
  const still = await run('reduce')

  check(
    `${entry.game}: ${entry.what}`,
    moving.value > 0,
    `${moving.note} — with no preference set`,
  )
  // The denominator. Without it, "nothing moved" could mean the game never
  // started, and the pair below would agree for the wrong reason.
  check(
    `${entry.game}: and the same run happens under the preference`,
    still.busy > 0,
    `${still.busy} vs ${moving.busy} — if this is 0 the game did not get going`,
  )
  check(
    `${entry.game}: but it holds still`,
    still.value === 0,
    `${still.note} — under prefers-reduced-motion: reduce`,
  )
  // Motion a game keeps under the preference, but changes: both halves again.
  for (const [name, ok, detail] of entry.also?.(moving, still) ?? []) check(name, ok, detail)
}

server.stop()
process.exit(finish([]) ? 0 : 1)
