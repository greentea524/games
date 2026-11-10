// Tube Runner's camera follow (#154).
//
//   npx tsx tube-runner/follow_test.ts
//
// The complaint was that steering did not feel smooth, and the cause was a
// jump in the camera's speed — which is the speed the whole tube turns at on
// screen. So that is what this measures: the camera's speed, step to step,
// through a press, a hold and a release, with the rule the game shipped with
// as the control.
import { ROTATE_SPEED } from './track'
import { CAM_MAX_LAG, CAM_RELEASE_STIFFNESS, CAM_STIFFNESS, followStep, type Follow } from './follow'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * A rule for following: given where the camera stands relative to the runner
 * at the start of a step, and how fast the runner turns during it, where it
 * stands relative to them at the end.
 */
type Rule = (state: Follow, held: boolean, dt: number, turning: number) => Follow

const spring: Rule = (state, held, dt, turning) =>
  followStep(state, held ? CAM_STIFFNESS : CAM_RELEASE_STIFFNESS, dt, turning)

/** The first spring: solved as if the runner stood still within each step. */
const stillTarget: Rule = (state, held, dt, turning) =>
  followStep(
    { offset: state.offset - turning * dt, velocity: state.velocity },
    held ? CAM_STIFFNESS : CAM_RELEASE_STIFFNESS,
    dt,
  )

/** What shipped in #145: an exponential catch-up at 5 a second, capped. */
const capped: Rule = (state, _held, dt, turning) => {
  let offset = (state.offset - turning * dt) * (1 - Math.min(1, dt * 5))
  if (Math.abs(offset) > CAM_MAX_LAG) offset = Math.sign(offset) * CAM_MAX_LAG
  return { offset, velocity: 0 }
}

/**
 * Holds a turn for `hold` seconds, then lets go for `after`, and reports what
 * the camera did. The camera's speed is measured from where it actually went,
 * not from the rule's own idea of its velocity, so both rules are judged alike.
 */
function play(rule: Rule, dt: number, hold = 0.6, after = 0.8) {
  let state: Follow = { offset: 0, velocity: 0 }
  let runner = 0
  let camera = 0
  let speed = 0
  let worstJump = 0
  let worstLag = 0
  let settled = 0
  let overshoot = 0
  for (let t = 0; t < hold + after - 1e-9; t += dt) {
    const held = t < hold
    const turning = held ? ROTATE_SPEED : 0
    state = rule({ offset: camera - runner, velocity: state.velocity }, held, dt, turning)
    runner += turning * dt
    const next = runner + state.offset
    const nextSpeed = (next - camera) / dt
    worstJump = Math.max(worstJump, Math.abs(nextSpeed - speed))
    speed = nextSpeed
    camera = next
    const lag = runner - camera
    worstLag = Math.max(worstLag, lag)
    overshoot = Math.max(overshoot, -lag)
    if (held) settled = lag
  }
  return { worstJump, worstLag, settled, overshoot, restLag: Math.abs(runner - camera) }
}

const FINE = 1 / 240

{
  const s = play(spring, FINE)
  check(
    'a held turn settles the runner the intended distance ahead of the camera',
    Math.abs(s.settled - CAM_MAX_LAG) < CAM_MAX_LAG * 0.05,
    `${s.settled.toFixed(3)} rad against ${CAM_MAX_LAG}`,
  )
  check(
    'and never further, so nothing has to cap it',
    s.worstLag <= CAM_MAX_LAG * 1.02,
    `at most ${s.worstLag.toFixed(3)} rad`,
  )
  check(
    'letting go brings the camera up to the runner and no further',
    s.restLag < 0.005 && s.overshoot < 0.005,
    `${s.restLag.toFixed(4)} rad apart at rest, ${s.overshoot.toFixed(4)} past`,
  )

  // The measure itself. A camera whose speed is continuous changes it, in one
  // step, by at most its greatest acceleration times the step — here the
  // spring's stiffness times the speed it is chasing. A jump does not shrink
  // with the step.
  const limit = CAM_STIFFNESS * ROTATE_SPEED * FINE * 1.5
  check(
    'the camera never changes speed in a jump — press, hold or release',
    s.worstJump <= limit,
    `at most ${s.worstJump.toFixed(2)} rad/s in a 240th of a second`,
  )
  const old = play(capped, FINE)
  check(
    'and the capped catch-up it replaced is caught doing exactly that',
    old.worstJump > 2 && old.worstJump > limit * 3,
    `${old.worstJump.toFixed(2)} rad/s in one step`,
  )
}

{
  // A check must not assume sixty frames a second, and neither may the feel:
  // a no-GPU machine renders this game at 10 to 14.
  const rates = [240, 60, 30, 12]
  const runs = rates.map((r) => ({ r, s: play(spring, 1 / r) }))
  check(
    'the turn settles in the same place at any frame rate',
    runs.every((x) => Math.abs(x.s.settled - CAM_MAX_LAG) < CAM_MAX_LAG * 0.02 && x.s.worstLag <= CAM_MAX_LAG * 1.02),
    runs.map((x) => `${x.r} fps ${x.s.settled.toFixed(3)}`).join(', '),
  )
  const naive = rates.map((r) => ({ r, s: play(stillTarget, 1 / r) }))
  check(
    'where a spring solved for a runner standing still each frame does not, and is caught',
    naive.some((x) => Math.abs(x.s.settled - CAM_MAX_LAG) > CAM_MAX_LAG * 0.2),
    naive.map((x) => `${x.r} fps ${x.s.settled.toFixed(3)}`).join(', '),
  )
  check(
    'and comes to rest without ringing at any of them',
    runs.every((x) => x.s.restLag < 0.01 && x.s.overshoot < 0.02),
    runs.map((x) => `${x.r} fps ${x.s.overshoot.toFixed(4)} past`).join(', '),
  )
}

console.log(ok ? '\nALL TUBE RUNNER FOLLOW CHECKS PASS' : '\nTUBE RUNNER FOLLOW CHECKS FAILED')
process.exit(ok ? 0 : 1)
