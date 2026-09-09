// Touch coverage for Tube Runner (#111), on the standalone stage (#120).
//
// The rules — the reachability bound, the generator, the collision test and
// the speed curve — are in `tube-runner/track_test.ts` under `npm run
// qa:units`, untouched by the rework. This file covers the seam.
//
// #120 replaced the d-pad with hold zones on the left and right halves of the
// canvas, so the checks that used to drive `shared/dpad.ts` drive those
// instead. The claims they encoded are the same and are worth restating,
// because they are what makes a *held* control different from a button:
// holding turns, letting go stops dead, and rolling a thumb from one side to
// the other reverses without ever passing through "not turning". A held
// direction that silently dropped would be invisible to a keyboard run and
// fatal here, since letting go is how you stop.
//
// One check is new, and it guards #120's own second note. The fairness bound
// in `track.ts` is derived from `ROTATE_SPEED` being a rate the player
// actually achieves; if the control eased into it, every generated track would
// be slightly harder than the bound promises — the exact unfairness the bound
// exists to rule out. Easing is the natural thing to add to a touch control,
// so the suite measures the rate at the start of a hold and again later and
// requires them to match, and requires both to match the constant the
// generator was told about.
//
// The tone checks are re-expressed rather than dropped. In four tones the
// claim was "obstacle rings hold the lightest tone and nothing else does". In
// full colour it is the same claim in luminance: the brightest surface on
// screen reaches the value the lighting table gives a ring, and the wall sits
// far below it.
//
// One thing here still does **not** discriminate, and it is worth naming
// rather than leaving to be found. The ribs are not guarded. Collapsing
// `RIB_LUMA` into `WALL_LUMA` — deleting them as a distinct surface — leaves
// every check below green, because the rings still reach the top of the range
// and the wall still sits at the bottom. That was true of the four-tone
// version for the same reason and is recorded in `qa/touch/README.md`.
import { launchTouch, canvasPoint, gameUrl, checker, PAD, ACT } from './driver.mjs'

const { check, finish } = checker()

const state = (page) =>
  page.evaluate(() => ({
    screen: window.__game.screen(),
    rings: window.__game.rings(),
    best: window.__game.best(),
    angle: window.__game.angle(),
    speed: window.__game.speed(),
  }))

const canvasMetrics = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('#stage canvas')
    return {
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
      bufferWidth: c.width,
      dpr: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })

/** Luminance percentiles of the rendered frame, and how much of it is fogged out. */
const tones = (page) =>
  page.evaluate(() => {
    const { data } = window.__game.stage.readPixels()
    const lum = []
    for (let i = 0; i < data.length; i += 4) {
      lum.push((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255)
    }
    lum.sort((a, b) => a - b)
    const pct = (p) => lum[Math.floor((lum.length - 1) * p)]
    return {
      p50: pct(0.5),
      p99: pct(0.99),
      dark: lum.filter((l) => l < 0.12).length / lum.length,
    }
  })

/**
 * Restarts into a fresh run and returns once it is going.
 *
 * The gestures below are measured inside the opening runway, where the track
 * has no rings yet. Anywhere else a held turn walks the player into the next
 * ring part-way through a measurement, and a run that ends mid-gesture looks
 * exactly like a control that stopped responding.
 */
/**
 * The shortest signed turn from `a` to `b`.
 *
 * `playerAngle` is normalised to [0, 2pi), so a turn that crosses zero reads
 * as a jump of nearly a full circle in the wrong direction. Comparing the raw
 * numbers reported a reversal as "0.90 to 6.10 — it went the other way", which
 * is exactly backwards.
 */
const turnBetween = (a, b) => {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

const freshRun = async (page) => {
  await page.evaluate(async () => {
    const g = window.__game
    const deadline = performance.now() + 12000
    const toward = (target) => {
      let d = target - g.angle()
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      return Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1
    }
    // End whatever is running first, by steering at the solid half of each
    // ring. Skipping this when a run happened to be live was the bug: the
    // gesture was then measured on a run several seconds old, with a ring
    // already arriving, and it ended before the thumb had turned anything —
    // which reads as a control that does nothing.
    while (g.screen() === 'run' && performance.now() < deadline) {
      const gap = g.nextGapAngle()
      if (gap !== null) g.steer(toward(gap + Math.PI))
      await new Promise((r) => requestAnimationFrame(r))
    }
    g.steer(0)
    // Then start a new one. The end screen ignores input for half a second,
    // which is the same lock `shared/runSummary` applies and the same reason.
    while (g.screen() !== 'run' && performance.now() < deadline) {
      g.press()
      await new Promise((r) => setTimeout(r, 120))
    }
  })
  await page.waitForTimeout(120)
}

/** Steers toward each gap for `ms`, so a run survives long enough to measure. */
const survive = (page, ms) =>
  page.evaluate(async (limit) => {
    const g = window.__game
    const deadline = performance.now() + limit
    while (performance.now() < deadline && g.screen() === 'run') {
      const gap = g.nextGapAngle()
      if (gap !== null) {
        let d = gap - g.angle()
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        g.steer(Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1)
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    g.steer(0)
  }, ms)

async function run() {
  console.log('\n### tube-runner ###\n')
  const t = await launchTouch(gameUrl('tube-runner'))
  const { page, hand } = t
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)

  // ------------------------------------------------- the stage's contract

  const m = await canvasMetrics(page)
  check(
    'the canvas fills the viewport rather than a fixed 160x144 box',
    m.cssWidth === m.viewport.width && m.cssHeight === m.viewport.height,
    `canvas ${m.cssWidth}x${m.cssHeight}, viewport ${m.viewport.width}x${m.viewport.height}`,
  )
  check(
    'and its drawing buffer is scaled by the device pixel ratio, capped at 2',
    m.bufferWidth === Math.round(m.cssWidth * Math.min(m.dpr, 2)),
    `buffer ${m.bufferWidth} at dpr ${m.dpr}`,
  )

  const opening = await state(page)
  check('the game opens on the title screen', opening.screen === 'title')
  check(
    'the title panel names the game',
    await page.evaluate(() => document.querySelector('.tr-panel-title')?.textContent === 'Tube Runner'),
  )

  const left = await canvasPoint(page, 0.22, 0.5, '#stage canvas')
  const right = await canvasPoint(page, 0.78, 0.5, '#stage canvas')

  await hand.tap(PAD, right.x, right.y)
  await page.waitForTimeout(400)
  check('a tap starts a run', (await state(page)).screen === 'run')

  // --------------------------------------------------------- the hold zones

  await freshRun(page)
  const before = await state(page)
  await hand.down(PAD, right.x, right.y)
  await page.waitForTimeout(420)
  const heldRight = await state(page)
  const rightTurn = turnBetween(before.angle, heldRight.angle)
  check(
    'holding the right side turns the player',
    heldRight.screen === 'run' && Math.abs(rightTurn) > 0.4,
    `moved ${rightTurn.toFixed(3)} rad, screen=${heldRight.screen}`,
  )

  // Both samples are taken *after* the release has landed. A CDP gesture is a
  // round trip of well over a hundred milliseconds, and the player keeps
  // turning for all of it — so comparing the angle before the lift against the
  // angle after it measures the harness, not the game, and reports half a
  // radian of "drift" from a control that stopped on time.
  await hand.up(PAD)
  await page.waitForTimeout(120)
  const settled = await state(page)
  await page.waitForTimeout(320)
  const later = await state(page)
  check(
    'and letting go stops dead, with no drift',
    Math.abs(turnBetween(settled.angle, later.angle)) < 0.02,
    `drifted ${turnBetween(settled.angle, later.angle).toFixed(4)} rad in 320ms after the lift`,
  )

  await freshRun(page)
  const beforeLeft = await state(page)
  await hand.down(PAD, left.x, left.y)
  await page.waitForTimeout(420)
  const heldLeft = await state(page)
  await hand.up(PAD)
  const leftTurn = turnBetween(beforeLeft.angle, heldLeft.angle)
  check(
    'the two sides turn opposite ways',
    heldLeft.screen === 'run' && Math.sign(leftTurn) === -Math.sign(rightTurn) && Math.abs(leftTurn) > 0.4,
    `right ${rightTurn.toFixed(2)}, left ${leftTurn.toFixed(2)}, screen=${heldLeft.screen}`,
  )

  // Rolling a thumb across the middle without lifting. This is the case the
  // d-pad module existed for, and it is still the one that matters: a player
  // correcting an overshoot slides across rather than lifting and re-pressing,
  // and a control that only reads the press would keep turning the wrong way.
  await freshRun(page)
  await hand.down(PAD, right.x, right.y)
  await page.waitForTimeout(320)
  await hand.move(PAD, left.x, left.y)
  // Again, both samples after the move has landed, for the same reason.
  await page.waitForTimeout(120)
  const rollStart = await state(page)
  await page.waitForTimeout(320)
  const rollEnd = await state(page)
  await hand.up(PAD)
  check(
    'rolling a thumb to the other side reverses the turn',
    rollEnd.screen === 'run' && turnBetween(rollStart.angle, rollEnd.angle) < -0.4,
    `turned ${turnBetween(rollStart.angle, rollEnd.angle).toFixed(2)} rad after crossing the middle`,
  )

  // Two thumbs down at once: the newest side wins. Cancelling to zero would
  // strand a player mid-turn at the moment they are trying to change their
  // mind, which is the worst possible time to stop responding.
  await freshRun(page)
  await hand.down(PAD, right.x, right.y)
  await page.waitForTimeout(200)
  await hand.down(ACT, left.x, left.y)
  await page.waitForTimeout(120)
  const twoStart = await state(page)
  await page.waitForTimeout(360)
  const twoEnd = await state(page)
  await hand.up(ACT)
  await hand.up(PAD)
  check(
    'a second thumb on the other side takes over',
    twoEnd.screen === 'run' && turnBetween(twoStart.angle, twoEnd.angle) < -0.3,
    `turned ${turnBetween(twoStart.angle, twoEnd.angle).toFixed(2)} rad once the second thumb landed`,
  )

  // ------------------------------------------- the rate is not eased into
  //
  // #120's second note, checked rather than trusted. The generator's fairness
  // bound assumes the player turns at `ROTATE_SPEED` from the moment they ask.

  await freshRun(page)

  // Rates are measured against the game's own clock, not the wall's.
  //
  // The loop integrates rotation in simulated seconds and clamps a long frame,
  // so under a headless renderer that drops frames the angle advances less
  // than wall time says it should — through no fault of the control. Measured
  // against `performance.now()` that reads as a rate falling from 3.2 to 2.6,
  // which is indistinguishable from the easing this exists to rule out. The
  // game's clock is the denominator the game actually used.
  const rates = await page.evaluate(async () => {
    const g = window.__game
    const { ROTATE_SPEED } = await import('/games/tube-runner/track.ts')
    const samples = []
    g.steer(1)
    const start = performance.now()
    let last = { t: g.clock(), a: g.angle() }
    while (performance.now() - start < 900 && g.screen() === 'run') {
      await new Promise((r) => requestAnimationFrame(r))
      const clock = g.clock()
      if (clock - last.t >= 0.2) {
        samples.push(Math.abs(g.angle() - last.a) / (clock - last.t))
        last = { t: clock, a: g.angle() }
      }
    }
    g.steer(0)
    return { samples, rotateSpeed: ROTATE_SPEED, screen: g.screen() }
  })
  check(
    'the rate was measured on a live run, with samples to compare',
    rates.screen === 'run' && rates.samples.length >= 2,
    `${rates.samples.length} samples, screen=${rates.screen}`,
  )
  const [firstRate, ...restRates] = rates.samples
  check(
    'the turn reaches full rate immediately, with no ramp',
    firstRate !== undefined &&
      restRates.every((r) => Math.abs(r - firstRate) / firstRate < 0.15),
    rates.samples.map((r) => r.toFixed(2)).join(' '),
  )
  check(
    'and that rate is the one the fairness bound assumes',
    firstRate !== undefined && Math.abs(firstRate - rates.rotateSpeed) / rates.rotateSpeed < 0.12,
    `${firstRate?.toFixed(2)} against ROTATE_SPEED ${rates.rotateSpeed}`,
  )

  // ----------------------------------------------- the tube, as rendered

  // Retried, because `survive` steers toward each gap but the track gets
  // faster and a run does eventually end. Measuring a crashed frame would put
  // a ring across the whole viewport and flatter every number below.
  let live = null
  for (let attempt = 0; attempt < 4; attempt++) {
    await freshRun(page)
    await survive(page, 3500)
    live = await state(page)
    if (live.screen === 'run') break
  }
  check(
    'the tone checks below are measuring a live run',
    live?.screen === 'run',
    `screen=${live?.screen}, ${live?.rings} rings`,
  )

  const tone = await tones(page)
  // The defect CLAUDE.md counts six of, in the form this game can have it: the
  // one thing that can end a run drawn at its background's value.
  check(
    'the brightest surface reaches the value the table gives a ring',
    tone.p99 >= 0.85,
    `${tone.p99.toFixed(3)} — with DIRECTIONAL at 0 the ribs become the brightest thing at 0.76`,
  )
  check(
    'and the wall sits far below it',
    tone.p99 - tone.p50 >= 0.25,
    `wall ${tone.p50.toFixed(3)}, brightest ${tone.p99.toFixed(3)}`,
  )
  // The fogged far end. A `FOG_FAR` past the end of the tube takes this to
  // nothing, because the distance is the only thing in frame that reaches it.
  check(
    'the tube fogs out to black in the distance',
    tone.dark > 0.005,
    `${(tone.dark * 100).toFixed(2)}% of the frame`,
  )

  // ------------------------------------------------- crashing and retrying

  // Turn away from the gap and hold: the ring is solid everywhere else.
  await page.evaluate(async () => {
    const g = window.__game
    const deadline = performance.now() + 20000
    while (performance.now() < deadline && g.screen() === 'run') {
      const gap = g.nextGapAngle()
      if (gap !== null) {
        let d = gap + Math.PI - g.angle()
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        g.steer(Math.abs(d) < 0.05 ? 0 : d > 0 ? 1 : -1)
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    g.steer(0)
  })
  const over = await state(page)
  check('hitting a ring ends the run', over.screen === 'over', `screen=${over.screen}`)
  check(
    'the end panel reports the run',
    await page.evaluate(() => document.querySelector('.tr-panel-body')?.textContent?.includes('rings')),
  )

  await page.waitForTimeout(700)
  await hand.tap(PAD, right.x, right.y)
  await page.waitForTimeout(400)
  const retried = await state(page)
  check('a tap after it retries', retried.screen === 'run', `screen=${retried.screen}`)
  check('and the retry starts from nothing', retried.rings === 0)
  check('while the best is kept', retried.best === over.best, `best=${retried.best}`)

  // -------------------------------------------------------- the save survives

  const saved = over.best
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)
  check('the best survives a reload', (await state(page)).best === saved, `${saved}`)
  check(
    'and it is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('tube_runner_save'))
        return raw && raw.v === 1 && typeof raw.d?.best === 'number'
      } catch {
        return false
      }
    }),
  )

  // ------------------------------------------------------------- the sound

  const label = () => page.evaluate(() => document.querySelector('.tr-sound')?.textContent)
  const on = await label()
  await page.evaluate(() => document.querySelector('.tr-sound').click())
  check('the sound can be turned off', (await label()) !== on, `${on} -> ${await label()}`)
  await page.evaluate(() => document.querySelector('.tr-sound').click())
  check('and back on', (await label()) === on, on)

  check(
    'there is a way back to the hub',
    await page.evaluate(() => {
      const a = document.querySelector('.stage3d-back')
      return Boolean(a && a.getAttribute('href'))
    }),
  )

  const passed = finish(t.log)
  await t.browser.close()
  return passed
}

process.exit((await run()) ? 0 : 1)
