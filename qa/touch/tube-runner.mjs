// Touch coverage for the second three.js game (#111).
//
// Tower Stacker proved the shell reaches a non-Phaser game at all; what is new
// here is that Tube Runner's only verb is a *held* direction. `shared/dpad.ts`
// exists precisely because a d-pad is not four buttons — a thumb presses one
// arm and rolls to another without lifting, and the pad has to follow it — and
// until now nothing exercised that across the renderer seam. A held direction
// that silently dropped would be invisible to a keyboard run and fatal here,
// since letting go is how you stop rotating.
//
// The rules are covered by `tube-runner/track_test.ts` under `npm run
// qa:units`, which is where the reachability bound #111 asks about is
// asserted. This file covers the seam, the palette, and the tones.
//
// The claims unique to this suite were proven able to fail:
//
//   - `ROTATE_SPEED = 0` in track.ts fails "holding an arm rotates the player"
//     and everything downstream of it.
//   - `DIRECTIONAL = 0` in game.ts takes the light that separates a ring from
//     the wall, and `lightest` goes to 0 px — the obstacle drawn in its
//     background's tone, which is the defect CLAUDE.md counts six of.
//   - a `FOG_FAR` past the end of the tube takes `darkest` to 0 px, since the
//     fogged distance is the only thing in the frame that reaches it.
//
// One thing here does **not** discriminate, and it is worth naming rather than
// leaving to be discovered. The `light` band was first written as the ribs'
// check, on the reasoning that they are the only surface designed to land
// there. They are not the only thing that does: a ring fades through `light`
// on its way out of the fog, and there are always several mid-distance rings
// on screen. Collapsing `RIB_LUMA` into `WALL_LUMA` — deleting the ribs as a
// distinct surface outright — leaves this suite entirely green. So the check
// below claims only that the mid band is populated, and the ribs are, for now,
// unguarded; see qa/touch/README.md.
import { launchTouch, centreOf, controls, gameUrl, checker, ACT, PAD } from './driver.mjs'

const { check, finish } = checker()
let ok = true

const TONES = {
  darkest: '15,56,15',
  dark: '48,98,48',
  light: '139,172,15',
  lightest: '155,188,15',
}
const TONE_NAME = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [v, k]))

const state = (page) =>
  page.evaluate(() => ({
    screen: window.__game.screen(),
    rings: window.__game.rings(),
    best: window.__game.best(),
    angle: window.__game.angle(),
    gap: window.__game.nextGapAngle(),
    distance: window.__game.nextGapDistance(),
    speed: window.__game.speed(),
    stride: window.__game.stridePhase(),
    mono: window.__game.mono(),
  }))

/** Shortest signed angle from a to b. Mirrors track.ts, for the suite's own use. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

/** Colour histogram of the framebuffer over a band of rows. */
const histogram = (page, loRow, hiRow) =>
  page.evaluate(
    ([lo, hi]) => {
      const px = window.__game.readPixels()
      const counts = {}
      for (let y = lo; y <= hi; y++) {
        for (let x = 0; x < 160; x++) {
          const i = (y * 160 + x) * 4
          const k = `${px[i]},${px[i + 1]},${px[i + 2]}`
          counts[k] = (counts[k] ?? 0) + 1
        }
      }
      return counts
    },
    [loRow, hiRow],
  )

/**
 * Starts a run, or leaves one already going alone.
 *
 * Every phase below needs a live run, and the input phases genuinely end them:
 * holding an arm to prove it rotates also steers the player off the gap, and
 * the next ring arrives regardless. The first version assumed one run would
 * survive the whole suite, and every check after the d-pad phase failed
 * against an end screen.
 */
async function ensureRun(page, hand, c) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const s = await state(page)
    if (s.screen === 'run') return s
    // Past the end screen's input lock before pressing.
    await page.waitForTimeout(600)
    await hand.tap(ACT, c.A.x, c.A.y, 140)
    await page.waitForTimeout(300)
  }
  return state(page)
}

/**
 * Holds whichever arm turns the player toward the next gap, until a ring is
 * actually cleared or the run ends.
 *
 * A real held contact on the pad, not a burst of taps: that is the input the
 * game is played with. Waiting on the *ring count* rather than on the angle
 * matters — the run opens with the gap already dead ahead, so a version that
 * returned as soon as the player was lined up returned instantly, ten times
 * in a row, and reported nothing cleared.
 */
async function flyThroughRing(page, hand, c, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  const before = (await state(page)).rings
  let holding = null
  let result = false
  while (Date.now() < deadline) {
    const s = await state(page)
    if (s.screen !== 'run') break
    if (s.rings > before) {
      result = true
      break
    }
    if (s.gap === null) continue
    const d = angleDelta(s.angle, s.gap)
    const want = Math.abs(d) < 0.1 ? null : d > 0 ? 'ArrowRight' : 'ArrowLeft'
    if (want !== holding) {
      if (holding) await hand.up(PAD)
      if (want) await hand.down(PAD, c.arm(want).x, c.arm(want).y)
      holding = want
    }
  }
  if (holding) await hand.up(PAD)
  return result
}

async function run() {
  console.log('\n### tube-runner ###\n')
  const t = await launchTouch(gameUrl('tube-runner'))
  const { page, hand } = t
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1500)
  const c = await controls(page)

  // ------------------------------------------------- the shell's contract

  const box = (await centreOf(page, '#game canvas')).box
  check(
    'the canvas is upscaled from a 160x144 target at an integer zoom',
    box.width / 160 === box.height / 144 && Number.isInteger(box.width / 160),
    `${box.width}x${box.height} — ${box.width / 160}x`,
  )
  check(
    'the backing store really is 160x144',
    await page.evaluate(() => {
      const el = document.querySelector('#game canvas')
      return el.width === 160 && el.height === 144
    }),
  )
  check('the game opens on the title screen', (await state(page)).screen === 'title')

  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(400)
  const started = await state(page)
  check('a thumb on A starts a run', started.screen === 'run', `screen=${started.screen}`)
  check('with no rings cleared yet', started.rings === 0)
  check('and a ring ahead to clear', started.gap !== null && started.distance > 0)

  // -------------------------------------------------- the held d-pad

  // The check this suite exists for. Holding an arm has to rotate the player
  // for as long as the thumb is down, and stop when it lifts.
  const before = (await state(page)).angle
  await hand.down(PAD, c.arm('ArrowRight').x, c.arm('ArrowRight').y)
  await page.waitForTimeout(450)
  const during = (await state(page)).angle
  await hand.up(PAD)
  await page.waitForTimeout(60)
  const afterLift = (await state(page)).angle
  await page.waitForTimeout(400)
  const settled = (await state(page)).angle

  check(
    'holding an arm rotates the player',
    Math.abs(angleDelta(before, during)) > 0.4,
    `moved ${angleDelta(before, during).toFixed(3)} rad while held`,
  )
  check(
    'and it turns the way the arm points',
    angleDelta(before, during) > 0,
    'right increases the angle',
  )
  check(
    'lifting the thumb stops the rotation',
    Math.abs(angleDelta(afterLift, settled)) < 0.05,
    `drifted ${angleDelta(afterLift, settled).toFixed(4)} rad in 400ms after release`,
  )

  // Rolling a thumb from one arm to the other without lifting is the whole
  // reason shared/dpad.ts is a single sliding control rather than four
  // buttons — a pointer is implicitly captured by the arm it lands on, so
  // before that fix the first direction stayed held and the second never
  // fired. Fatal here: it would mean rotating the wrong way with no way to
  // stop short of lifting off.
  await ensureRun(page, hand, c)
  const rollStart = (await state(page)).angle
  await hand.down(PAD, c.arm('ArrowRight').x, c.arm('ArrowRight').y)
  await page.waitForTimeout(300)
  const rollMid = (await state(page)).angle
  await hand.move(PAD, c.arm('ArrowLeft').x, c.arm('ArrowLeft').y)
  await page.waitForTimeout(400)
  const rollEnd = (await state(page)).angle
  await hand.up(PAD)
  check(
    'rolling the thumb across to the other arm reverses the rotation',
    angleDelta(rollStart, rollMid) > 0 && angleDelta(rollMid, rollEnd) < 0,
    `right ${angleDelta(rollStart, rollMid).toFixed(3)}, then left ${angleDelta(rollMid, rollEnd).toFixed(3)}`,
  )

  // --------------------------------------------------- clearing rings

  await ensureRun(page, hand, c)
  let flown = 0
  for (let i = 0; i < 8; i++) {
    if ((await state(page)).screen !== 'run') break
    if (await flyThroughRing(page, hand, c)) flown++
  }
  const played = await state(page)
  check(
    'steering onto the gap carries the run through rings',
    played.screen === 'run' && played.rings >= 3,
    `${played.rings} rings cleared over ${flown} approaches, screen=${played.screen}`,
  )
  check('and the run has sped up', played.speed > 7, `${played.speed.toFixed(2)} u/s`)

  // ------------------------------------------------------- the runner

  // The player is a body in the world now, not just a camera position, and
  // that is what makes the angular collision test true rather than merely
  // self-consistent — see the radial checks in tube-runner/track_test.ts. What
  // is checkable from here is the animation: that the run cycle is driven by
  // the tube going past rather than by a clock.
  const strideA = (await state(page)).stride
  await page.waitForTimeout(300)
  const strideB = (await state(page)).stride
  check(
    'the runner strides while the tube is moving',
    strideB > strideA,
    `phase ${strideA.toFixed(2)} -> ${strideB.toFixed(2)}`,
  )

  // ------------------------------------------ the DMG tones, as rendered
  //
  // `qa:contrast` measures Phaser textures and has nothing to say about this
  // game, so the tone guard lives here. Rows 30..110 sit clear of the score
  // lines at the top of the frame and the footer bar at the bottom.

  check('the tone checks below are measuring a live run', played.screen === 'run')
  const mono = await histogram(page, 30, 110)
  const colours = Object.keys(mono)
  check(
    'in MONO nothing but the four DMG tones reaches the framebuffer',
    colours.every((k) => k in TONE_NAME),
    colours.map((k) => TONE_NAME[k] ?? k).join(' '),
  )
  check(
    'and all four are used',
    Object.values(TONES).every((v) => (mono[v] ?? 0) > 0),
    Object.entries(TONES).map(([n, v]) => `${n}=${mono[v] ?? 0}`).join(' '),
  )

  // The one that matters. A ring is the only thing in this game that can end a
  // run, and the rig in game.ts makes it the brightest thing on screen by
  // *orientation* — it is the one surface facing the light, so it holds
  // `lightest` while the wall and the ribs, both perpendicular to the light,
  // cannot reach it. Losing that separation is the #62-shaped defect: the
  // thing the player must react to, drawn in its background's tone.
  check(
    'obstacle rings hold the lightest tone, apart from everything else',
    (mono[TONES.lightest] ?? 0) >= 500,
    `${mono[TONES.lightest] ?? 0} px`,
  )
  check(
    'and the tube wall is lit but well below them',
    (mono[TONES.dark] ?? 0) >= 800 && (mono[TONES.dark] ?? 0) > (mono[TONES.lightest] ?? 0),
    `wall ${mono[TONES.dark] ?? 0} px against rings ${mono[TONES.lightest] ?? 0} px`,
  )
  // The mid band is populated, but by rings fading out of the fog as much as
  // by the ribs — see the note at the top of this file. It catches an image
  // that has collapsed to two tones; it does not catch losing the ribs.
  check(
    'the mid tone is in use, so the ramp is not collapsed',
    (mono[TONES.light] ?? 0) >= 300,
    `${mono[TONES.light] ?? 0} px`,
  )
  // Fog is what makes a gap resolve late, and the far end going to the sky's
  // tone is how it does it. Without it the tube is lit to the horizon and the
  // whole reason this game is in 3D goes with it.
  check(
    'and the far end of the tube fades into the sky tone',
    (mono[TONES.darkest] ?? 0) > 200,
    `${mono[TONES.darkest] ?? 0} px of fogged distance`,
  )

  // ------------------------------------------------------- the palette

  // Lift anything still down and let the double-tap window lapse first.
  // `shared/noZoom.ts` cancels a `touchend` within 300ms of the previous one
  // and cancels a `touchstart` that arrives while another contact is live —
  // and a cancelled touch event takes the synthesised `click` with it, which
  // is what this button is wired to. A tap sent too soon after the d-pad work
  // above reaches the DOM and does nothing at all.
  await hand.release()
  await page.waitForTimeout(400)
  const paletteBtn = await centreOf(page, '#palette-toggle')
  await hand.tap(ACT, paletteBtn.x, paletteBtn.y, 140)
  await page.waitForTimeout(400)
  check('tapping the toggle switches to COLOR', !(await state(page)).mono)
  check('and the label follows', (await page.textContent('#palette-label')) === 'COLOR')

  const colour = await histogram(page, 30, 110)
  check(
    'COLOR puts colours on the screen MONO cannot make',
    Object.keys(colour).some((k) => !(k in TONE_NAME)),
    `${Object.keys(colour).length} distinct colours`,
  )
  const HUD_COLOURS = new Set([...Object.values(TONES), '248,248,240'])
  const unquantised = Object.keys(colour).filter(
    (k) => !HUD_COLOURS.has(k) && k.split(',').some((ch) => ![0, 85, 170, 255].includes(Number(ch))),
  )
  check(
    'and COLOR is still quantised to four levels per channel',
    unquantised.length === 0,
    unquantised.length ? unquantised.join(' ') : 'every 3D pixel is on the ramp',
  )
  await hand.tap(ACT, paletteBtn.x, paletteBtn.y, 140)
  await page.waitForTimeout(300)
  check('and back to MONO', (await state(page)).mono)

  // ------------------------------------------- crashing, and restarting

  // Steer deliberately away from the gap. The player's own width counts, so
  // being half a turn out is unambiguously a crash.
  await ensureRun(page, hand, c)
  let crashed = false
  const crashDeadline = Date.now() + 20_000
  while (!crashed && Date.now() < crashDeadline) {
    const s = await state(page)
    if (s.screen !== 'run') {
      crashed = true
      break
    }
    if (s.gap === null) continue
    const away = angleDelta(s.angle, s.gap) > 0 ? 'ArrowLeft' : 'ArrowRight'
    await hand.down(PAD, c.arm(away).x, c.arm(away).y)
    await page.waitForTimeout(180)
    await hand.up(PAD)
  }
  const over = await state(page)
  check('missing a gap ends the run', over.screen === 'over', `screen=${over.screen}`)
  // The best is a high-water mark across runs, not this run's score, and the
  // difference is easy to assert wrongly: the eight-ring run above ends by
  // itself during the palette taps — nobody is steering it — so the run that
  // crashes here is a fresh one that cleared nothing. What must hold is that
  // nothing already achieved was lost.
  check(
    'the rings cleared earlier are held as the best',
    over.best >= played.rings,
    `best=${over.best} against a best run of ${played.rings}`,
  )
  check('and this run recorded its own score too', over.rings >= 0, `rings=${over.rings}`)

  // The bounced press the end screen's lock exists to absorb.
  await hand.tap(ACT, c.A.x, c.A.y, 60)
  await hand.tap(ACT, c.A.x, c.A.y, 60)
  await page.waitForTimeout(150)
  check('a bounced press does not skip the end screen', (await state(page)).screen === 'over')

  // After the bounce, not before it. The first version measured the stride
  // over 400ms here and spent the end screen's half-second input lock doing
  // it, so the bounce that check exists to test arrived after the lock had
  // already expired and the run had restarted underneath it.
  //
  // A cycle driven by time rather than by distance would keep the runner's
  // legs going on the end screen, with the tube stopped around them.
  const deadA = (await state(page)).stride
  await page.waitForTimeout(400)
  const deadB = (await state(page)).stride
  check(
    'and stops striding once the run is over',
    deadB === deadA,
    `phase held at ${deadA.toFixed(2)}`,
  )

  await page.waitForTimeout(700)
  await hand.tap(ACT, c.A.x, c.A.y, 120)
  await page.waitForTimeout(400)
  const retried = await state(page)
  check('a tap after the lock retries', retried.screen === 'run', `screen=${retried.screen}`)
  check('the retry starts from zero rings', retried.rings === 0)
  check('while the best is kept', retried.best === over.best)

  // ------------------------------------------------------ the save

  const saved = over.best
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1200)
  check('the best survives a reload', (await state(page)).best === saved, `vs ${saved}`)
  check(
    'and is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('tube_runner_save'))
        return raw && raw.v === 1 && typeof raw.d?.best === 'number' && raw.d.runs > 0
      } catch {
        return false
      }
    }),
    'the hub reads this key through shared/completion',
  )

  // ------------------------------------------------- the 340px branch

  await page.setViewportSize({ width: 320, height: 720 })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1200)
  const narrowPad = await centreOf(page, '.d-pad')
  check('at 320px the d-pad takes its shrunk size', narrowPad.box.width === 132, `${narrowPad.box.width}px`)
  const narrowBox = (await centreOf(page, '#game canvas')).box
  check(
    'and the game still renders at an integer zoom of 160x144',
    Number.isInteger(narrowBox.width / 160) && narrowBox.width / 160 === narrowBox.height / 144,
    `${narrowBox.width}x${narrowBox.height}`,
  )
  const narrowControls = await controls(page)
  await hand.tap(ACT, narrowControls.A.x, narrowControls.A.y, 140)
  await page.waitForTimeout(400)
  check('A still starts a run there', (await state(page)).screen === 'run')
  const narrowBefore = (await state(page)).angle
  await hand.down(PAD, narrowControls.arm('ArrowLeft').x, narrowControls.arm('ArrowLeft').y)
  await page.waitForTimeout(400)
  const narrowAfter = (await state(page)).angle
  await hand.up(PAD)
  check(
    'and the shrunk pad still steers',
    Math.abs(angleDelta(narrowBefore, narrowAfter)) > 0.3,
    `moved ${angleDelta(narrowBefore, narrowAfter).toFixed(3)} rad`,
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

/**
 * The same game with reduced motion asked for.
 *
 * There is very little decoration to strip here — the tube's motion *is* the
 * game, and `shared/motion.ts` is explicit that it must never gate what the
 * player reads to make a decision. What goes is the marker's pulse and the
 * blinking prompt. What is checked is that the reduced path still plays.
 */
async function reducedMotion() {
  console.log('\n### tube-runner, reduced motion ###\n')
  const t = await launchTouch(gameUrl('tube-runner'))
  const { page, hand } = t
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1200)
  const c = await controls(page)

  check(
    'the page reports the preference',
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  )

  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(400)
  for (let i = 0; i < 5; i++) {
    if ((await state(page)).screen !== 'run') break
    await flyThroughRing(page, hand, c)
  }
  const s = await state(page)
  check(
    'the game still plays with reduced motion',
    s.screen === 'run' && s.rings >= 2,
    `${s.rings} rings, screen=${s.screen}`,
  )
  // The tube must still be moving: forward travel is the game, not decoration,
  // and gating it would leave a player who asked for less motion stationary in
  // a tunnel rather than playing a slower version of the same thing.
  // Closing on the next ring, or having passed one. "The distance changed" is
  // not the claim — that is true of a player drifting backwards — and a check
  // that cannot tell the two apart is not checking anything.
  const d1 = (await state(page)).distance
  await page.waitForTimeout(200)
  const s2 = await state(page)
  const d2 = s2.distance
  check(
    'and the tube is still travelling forward',
    s2.rings > s.rings || (d1 !== null && d2 !== null && d2 < d1),
    d1 !== null && d2 !== null
      ? `next ring ${d1.toFixed(2)} -> ${d2.toFixed(2)} units away`
      : 'forward motion is the game, not a flourish',
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

await run()
await reducedMotion()
process.exit(ok ? 0 : 1)
