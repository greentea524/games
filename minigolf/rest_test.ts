// Minigolf's at-rest detector (#113).
//
//   npx tsx minigolf/rest_test.ts
//
// #113 is specific about what to check here, and specific about why: "Check
// the at-rest detector, not the physics." The physics is cannon-es's problem.
// What is this game's problem is telling *slow* from *stopped*, and the naive
// answer — speed below a threshold — is wrong in a way that looks right: a
// ball easing down a ramp passes under any threshold you pick, on its way to
// going faster.
//
// So the detector is a *timer*, reset by a single fast frame, and its length
// is derived rather than chosen: longer than a ball on the gentlest authored
// slope takes to accelerate through the speed threshold from a standstill.
// The checks below assert that relationship, then drive a real ball down the
// steepest authored slope to confirm it holds in the simulation and not only
// in the arithmetic.
import {
  MAX_PUTT_SPEED,
  REST_MARGIN,
  REST_SPEED,
  REST_TIME,
  ROLL_ACCEL,
  STILL_SPEED,
  createSim,
  type SimOptions,
} from './physics'
import { HOLES, MAX_SLOPE, MIN_SLOPE, type Box, type Hole } from './holes'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * A course that is one ramp and nothing else.
 *
 * Built rather than borrowed from `HOLES` for the reason the tilt-maze fixture
 * had to be: a real hole has walls and flats a rolling ball can reach, and a
 * ball that stopped because it hit something would look exactly like a ball
 * the detector correctly called stopped.
 */
function rampCourse(slope: number): Hole {
  const ramp: Box = {
    x: 0,
    y: 0,
    z: 0,
    w: 6,
    h: 0.4,
    d: 24,
    tiltX: -slope,
    surface: 'green',
  }
  return {
    name: `ramp ${slope}`,
    par: 1,
    // Up-slope end. With tiltX negative the surface falls away toward -z.
    tee: { x: 0, z: 9 },
    // Far away, so nothing is ever holed during these runs.
    cup: { x: 100, y: 0, z: 100 },
    boxes: [ramp],
  }
}

/**
 * Drops the ball onto the ramp, then stops it dead on the surface.
 *
 * Measurement starts from a standstill *on a slope*, which is the case the
 * whole derivation is about: a ball momentarily at rest on a gradient has not
 * stopped, it is about to roll. Letting it settle and then measuring — the
 * first version — began with the ball already above the speed threshold, so
 * the timer never started and degrading it proved nothing.
 */
function settleOnRamp(slope: number, options: SimOptions = {}) {
  const sim = createSim(rampCourse(slope), options)
  // Above the surface at the tee end, then dropped. The height is not
  // computed — an earlier version placed the ball at a hand-derived surface
  // height, got it wrong by 0.17 units, and left the ball hanging in the air.
  // Every measurement after that was of a ball in free fall at 9.8 u/s^2
  // rather than one rolling on a ramp at 1.66, which made the slope irrelevant
  // and the derivation untested. Letting physics find the surface cannot be
  // wrong about where the surface is.
  sim.ball.position.set(0, 9 * Math.sin(slope) + 1.5, 9)
  sim.ball.velocity.setZero()
  sim.ball.angularVelocity.setZero()
  for (let t = 0; t < 1.2; t += 1 / 120) sim.step(1 / 120)

  // Now stop it dead *on* the surface, holding it there long enough for the
  // contact to resolve.
  for (let t = 0; t < 0.3; t += 1 / 120) {
    sim.step(1 / 120)
    sim.ball.velocity.setZero()
    sim.ball.angularVelocity.setZero()
  }

  // Clear the rest timer, which the holding above has been filling — three
  // tenths of a second of a deliberately motionless ball is, correctly, a ball
  // at rest, and leaving that on the clock would mean the measurement started
  // already qualified. A zero-power stroke is the game's own way of saying
  // "the ball is placed and released": it zeroes the velocity and the timer
  // and nothing else.
  sim.putt(0, -1, 0)
  return sim
}

// --- the derivation itself ------------------------------------------------

{
  // A *rolling* ball's acceleration, 5/7 of g sin(theta), and the threshold it
  // breaks first. #146 found the old version used a sliding block's and the
  // speed threshold, and its 2.2x margin was really 1.6x.
  const crossing = STILL_SPEED / ROLL_ACCEL
  check(
    'the rest window outlasts a ball accelerating on the gentlest slope',
    REST_TIME > crossing,
    `waits ${REST_TIME.toFixed(3)}s; a rolling ball passes ${STILL_SPEED.toFixed(3)} u/s in ${crossing.toFixed(3)}s`,
  )
  check(
    'and with margin, not just barely',
    REST_TIME / crossing >= 2,
    `${(REST_TIME / crossing).toFixed(2)}x, from REST_MARGIN=${REST_MARGIN}`,
  )
  check(
    'the authored slopes stay inside the range the derivation assumes',
    MIN_SLOPE > 0 && MAX_SLOPE >= MIN_SLOPE,
    `${MIN_SLOPE}..${MAX_SLOPE} rad`,
  )
  // If a hole ever authors a shallower ramp than the derivation was made
  // against, the detector's window is no longer long enough — so the constant
  // is a constraint on authoring, and this is what enforces it.
  for (const hole of HOLES) {
    const shallowest = hole.boxes
      .map((b) => Math.max(Math.abs(b.tiltX ?? 0), Math.abs(b.tiltZ ?? 0)))
      .filter((t) => t > 0)
    check(
      `${hole.name}: no ramp shallower than MIN_SLOPE`,
      shallowest.every((t) => t >= MIN_SLOPE - 1e-9),
      shallowest.length ? shallowest.map((t) => t.toFixed(2)).join(', ') : 'flat',
    )
  }
}

// --- never at rest while still descending ---------------------------------

{
  // Released from a standstill on the steepest slope — the ball is genuinely
  // slow for the first fraction of a second, which is exactly when a naive
  // detector fires.
  const sim = settleOnRamp(MAX_SLOPE)
  let calledAtRest = false
  let descended = 0
  const startY = sim.ball.position.y
  let maxSpeed = 0

  for (let t = 0; t < 3; t += 1 / 120) {
    sim.step(1 / 120)
    maxSpeed = Math.max(maxSpeed, sim.ball.velocity.length())
    if (sim.atRest()) calledAtRest = true
  }
  descended = startY - sim.ball.position.y

  check(
    'the ball really does roll down the steepest slope',
    descended > 0.5 && maxSpeed > REST_SPEED * 3,
    `fell ${descended.toFixed(2)} units, peaked at ${maxSpeed.toFixed(2)} u/s`,
  )
  check(
    'and is never called at rest on the way down',
    !calledAtRest,
    'slow is not stopped',
  )
}

// --- and not on the gentlest one either, with rolling resistance (#146) ------
//
// The steepest slope above is the easy case. The detector's whole derivation
// is about the *gentlest*, where gravity barely beats whatever slows the ball
// — and #146 added something that slows it. Resistance applies on level greens
// only, so on a ramp it must change nothing; staged on ramps too, the ball is
// called at rest halfway down, which is how the flat-only rule was found.

{
  const watch = (options: SimOptions) => {
    const sim = settleOnRamp(MIN_SLOPE, options)
    let calledAtRest = false
    let longest = 0
    for (let t = 0; t < 3; t += 1 / 120) {
      sim.step(1 / 120)
      longest = Math.max(longest, sim.stillFor())
      if (sim.atRest()) calledAtRest = true
    }
    return { calledAtRest, longest }
  }
  const real = watch({})
  check(
    'released from a dead stop on the gentlest slope, the ball is never called at rest',
    !real.calledAtRest && real.longest < REST_TIME / 1.5,
    `still for at most ${real.longest.toFixed(3)} s against a ${REST_TIME.toFixed(3)} s window`,
  )
  const staged = watch({ rollingOnRamps: true })
  check(
    'and resistance on ramps too would break that — the staged defect is caught',
    staged.calledAtRest,
    `still for ${staged.longest.toFixed(3)} s — called at rest on the ramp`,
  )
}

// --- the ball stops rather than creeping (#146) -----------------------------
//
// Damping alone took a fraction of the speed each second, so every putt ended
// in about 3.5 s of a ball barely moving before the game would let you strike
// again. Measured on an unbounded flat green, from the moment the ball drops
// under 1 u/s to the moment the detector calls it at rest — and the full-power
// range, which the holes were built around and must not move.

{
  const flatGreen: Hole = {
    name: 'flat',
    par: 1,
    tee: { x: 0, z: 0 },
    cup: { x: 100, y: 0, z: 100 },
    boxes: [{ x: 0, y: -0.2, z: 0, w: 200, h: 0.4, d: 200, surface: 'green' }],
  }
  const roll = (options: SimOptions, power: number) => {
    const sim = createSim(flatGreen, options)
    for (let t = 0; t < 0.3; t += 1 / 120) sim.step(1 / 120)
    sim.putt(0, -1, power)
    let slowAt: number | null = null
    let t = 0
    for (; t < 20; t += 1 / 120) {
      sim.step(1 / 120)
      if (slowAt === null && sim.ball.velocity.length() < 1) slowAt = t
      if (sim.atRest()) break
    }
    return { tail: t - (slowAt ?? t), distance: -sim.ball.position.z }
  }
  const full = roll({}, 1)
  const soft = roll({}, 0.3)
  check(
    'a putt stops within two seconds of slowing under 1 u/s, at any power',
    full.tail < 2 && soft.tail < 2,
    `${full.tail.toFixed(2)} s at full power, ${soft.tail.toFixed(2)} s at 0.3 — 3.56 s each before #146`,
  )
  check(
    'and a full-power putt still carries the range the holes were built for',
    Math.abs(full.distance - 12) < 0.5,
    `${full.distance.toFixed(2)} units at ${MAX_PUTT_SPEED} u/s — 12.0 before #146`,
  )
  const creep = roll({ rollingDecel: 0 }, 1)
  check(
    'and without rolling resistance the creep comes back — the check can tell',
    creep.tail > 2,
    `${creep.tail.toFixed(2)} s with damping alone`,
  )
}

// --- at rest, within a bounded time, once it genuinely stops ---------------

{
  // Flat this time, and struck gently. A detector that never fires would pass
  // the check above and be just as broken.
  const flat = rampCourse(0)
  const sim = createSim(flat)
  sim.tee()
  sim.putt(0, -1, 0.25)

  let restedAt: number | null = null
  let speedWhenRested = Infinity
  for (let t = 0; t < 20; t += 1 / 120) {
    sim.step(1 / 120)
    if (sim.atRest()) {
      restedAt = t
      speedWhenRested = sim.ball.velocity.length()
      break
    }
  }

  check(
    'a ball on the flat is eventually called at rest',
    restedAt !== null,
    restedAt === null ? 'never settled in 20s' : `after ${restedAt.toFixed(2)}s`,
  )
  check(
    'within a bounded time, not eventually-in-principle',
    restedAt !== null && restedAt < 12,
    `${restedAt?.toFixed(2)}s`,
  )
  check(
    'and it really is slow when that happens',
    speedWhenRested < REST_SPEED,
    `${speedWhenRested.toFixed(3)} u/s against a ${REST_SPEED} threshold`,
  )
}

// --- and it can fail ------------------------------------------------------
//
// The checks above are only worth having if the *timer* is what makes them
// pass. #113 asks for this explicitly: degrade the detector until a
// slow-rolling ball is wrongly called stopped.
//
// Two ways, both of which the derivation says should break it, and both run
// here rather than by hand because they cost milliseconds.

{
  // 1. Too short a window: the ball dips under the threshold on its way down
  //    and the timer completes before it accelerates back through.
  const short = settleOnRamp(MAX_SLOPE, { restTime: 0.02 })
  let wronglyRested = false
  for (let t = 0; t < 3; t += 1 / 120) {
    short.step(1 / 120)
    if (short.atRest()) wronglyRested = true
  }
  check(
    'a window shorter than the derivation calls a descending ball stopped',
    wronglyRested,
    'restTime 0.02s — the timer is what does the work',
  )

  // 2. Too high a speed threshold: the ball never breaks it at all, so the
  //    timer runs to completion while the ball is plainly still rolling.
  const loose = settleOnRamp(MAX_SLOPE, { restSpeed: 50, restSpin: 500 })
  let looselyRested = false
  for (let t = 0; t < 3; t += 1 / 120) {
    loose.step(1 / 120)
    if (loose.atRest()) looselyRested = true
  }
  check(
    'and so does a speed threshold nothing can exceed',
    looselyRested,
    'restSpeed 50 u/s — the threshold is what does the rest',
  )
}

console.log(ok ? '\nALL MINIGOLF REST CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
