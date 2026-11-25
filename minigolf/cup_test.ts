// Checks on Minigolf's cup. Run with `npx tsx minigolf/cup_test.ts`.
//
// The cup used to be a distance and a speed: within 0.3 of the middle at
// under 2.4 u/s and the ball vanished, anything faster rolled across. Now the
// ball has to fall in, so these roll balls at it and watch what happens. The
// old rule is the control: it holes a putt that clips the edge and passes
// over one struck firmly through the middle, and the real cup does neither.

import { BALL_RADIUS, COURSE, CUP_DEPTH, CUP_RADIUS, createSim } from './physics'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

console.log('\n### minigolf cup ###\n')

const hole = COURSE[0]
const STEP = 1 / 120

interface Run {
  holed: boolean
  /** The lowest the ball's centre went, from the rim. */
  lowest: number
  /** Where it ended, from the cup. */
  end: { x: number; z: number; y: number }
  /** Its heading across the green when it left the cup's neighbourhood. */
  heading: number
  speedAfter: number
}

/** Rolls a ball straight up the hole at the cup, `offset` to the side of its middle. */
function roll(speed: number, offset: number): Run {
  const sim = createSim(hole)
  sim.ball.position.set(hole.cup.x + offset, BALL_RADIUS, hole.cup.z + 0.5)
  sim.ball.velocity.set(0, 0, -speed)
  sim.ball.angularVelocity.set(-speed / BALL_RADIUS, 0, 0)
  let lowest = Infinity
  let heading = NaN
  let speedAfter = NaN
  let holedAt = -1
  for (let t = 0; t < 4; t += STEP) {
    sim.step(STEP)
    lowest = Math.min(lowest, sim.ball.position.y - hole.cup.y)
    if (holedAt < 0 && sim.holed()) holedAt = t
    if (Number.isNaN(heading) && sim.ball.position.z < hole.cup.z - CUP_RADIUS - BALL_RADIUS) {
      heading = Math.atan2(sim.ball.velocity.x, -sim.ball.velocity.z)
      speedAfter = Math.hypot(sim.ball.velocity.x, sim.ball.velocity.z)
    }
    // Long enough to settle, short of the wall behind the cup.
    if (holedAt < 0 && sim.ball.position.z < hole.cup.z - 1) break
  }
  const p = sim.ball.position
  return { holed: holedAt >= 0, lowest, end: { x: p.x - hole.cup.x, z: p.z - hole.cup.z, y: p.y - hole.cup.y }, heading, speedAfter }
}

/** The old rule, as it was: near enough and slow enough, at the moment it passes. */
function oldRule(speed: number, offset: number) {
  return Math.abs(offset) < 0.3 && speed < 2.4
}

{
  const r = roll(1, 0)
  check('a gentle putt through the middle drops in', r.holed)
  check('and comes to rest on the cup\'s floor', Math.abs(r.end.y - (-CUP_DEPTH + BALL_RADIUS)) < 0.01, `centre at ${r.end.y.toFixed(3)}`)
}

{
  const r = roll(6, 0)
  check('a hard putt through the middle crosses the cup', !r.holed, `ended ${r.end.z.toFixed(2)} past it`)
  check('and dips into it on the way', r.lowest < BALL_RADIUS - 0.01, `dipped ${(BALL_RADIUS - r.lowest).toFixed(3)}`)
  check('and is slowed by the far lip', r.speedAfter < 6 * 0.9, `${r.speedAfter.toFixed(2)} u/s after, from 6`)
}

{
  // The lip-out: the old rule holes this one, the real cup turns it away.
  const speed = 2
  const offset = 0.22
  const r = roll(speed, offset)
  check('control: the old rule holes a putt that clips the edge', oldRule(speed, offset))
  check('a putt that clips the edge lips out', !r.holed)
  check('and the rim turns it', Math.abs(r.heading) > 0.05, `heading ${(r.heading * 180 / Math.PI).toFixed(1)}°`)
}

{
  const speed = 3
  check('control: the old rule lets a firm putt through the middle roll over', !oldRule(speed, 0))
  check('a firm putt through the middle hits the back of the cup and drops', roll(speed, 0).holed)
}

{
  // The further off the middle, the gentler a putt has to be to drop.
  const fastest = (offset: number) => {
    let best = 0
    for (let v = 0.5; v <= 7; v += 0.1) if (roll(v, offset).holed) best = v
    return best
  }
  const speeds = [0, 0.1, 0.2].map(fastest)
  check('the fastest putt that drops is slower the further off the middle it is',
    speeds[0] > speeds[1] && speeds[1] > speeds[2] && speeds[2] > 0,
    speeds.map((v, i) => `${[0, 0.1, 0.2][i]} off: ${v.toFixed(1)}`).join(', '))
}

for (const [r, falls] of [[0.2, true], [0.28, true], [0.31, false]] as const) {
  const sim = createSim(hole)
  sim.ball.position.set(hole.cup.x + r, BALL_RADIUS, hole.cup.z)
  for (let t = 0; t < 3; t += STEP) sim.step(STEP)
  check(`a ball left ${r} from the middle ${falls ? 'tips in over the edge' : 'stays on the green'}`, sim.holed() === falls,
    `centre at ${(sim.ball.position.y - hole.cup.y).toFixed(3)}`)
}

{
  // Once in, it stays in: the game goes on stepping the ball after it is holed.
  const sim = createSim(hole)
  sim.ball.position.set(hole.cup.x, BALL_RADIUS, hole.cup.z + 0.5)
  sim.ball.velocity.set(0, 0, -3.5)
  let holed = false
  let out = false
  for (let t = 0; t < 4; t += STEP) {
    sim.step(STEP)
    if (sim.holed()) holed = true
    else if (holed) out = true
  }
  check('a holed ball never climbs out again', holed && !out)
}

console.log(failed ? `\n${failed} FAILED\n` : '\nALL CUP CHECKS PASS\n')
process.exit(failed ? 1 : 0)
