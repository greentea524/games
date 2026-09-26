// `prefers-reduced-motion` is honoured, and checked (#138).
//
//   npm run qa:motion
//
// `shared/motion.ts` is read at six sites across four games, and until this
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
}

server.stop()
process.exit(finish([]) ? 0 : 1)
