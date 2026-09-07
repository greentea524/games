// Tube Runner's fairness bound (#111).
//
//   npx tsx tube-runner/track_test.ts
//
// #111 names the one failure worth a check: "generate a long sequence at max
// speed and assert every consecutive gap pair is reachable". That is what the
// middle section here does, and it is the reason the bound is derived from
// `ROTATE_SPEED` and `RING_SPACING` rather than eyeballed — a number that was
// tuned until it felt right has nothing to assert against.
//
// The reachability checks deliberately do **not** measure against
// `reachableDelta`. The first version did, and it was circular: the generator
// draws its move from that function, so a check comparing the result back
// against it can only ever pass. Setting `REACTION_FRACTION = 1.4` — a
// generator handing out half again as much rotation as the player physically
// has — left the headline check green, which is precisely the "passed for the
// wrong reason" trap CLAUDE.md warns about.
//
// So the claim is made against the physical budget instead:
// `ROTATE_SPEED * (RING_SPACING / speed)`, the radians a player can actually
// cover between two rings, with no constant from the generator in it. That
// number comes from the player's capability and the track's geometry, and it
// is true whatever the generator later decides to do.
//
// Proven to fail before being trusted, by loosening the delta as #111
// suggests:
//
//   - `REACTION_FRACTION = 1.4` in track.ts fails "every consecutive gap is
//     physically reachable at the speed cap" and its full-run counterpart,
//     along with the reaction-slack check.
//   - dropping the `Math.min(Math.PI, ...)` cap in `reachableDelta` fails
//     "the bound never exceeds half a turn", because past PI the shorter way
//     round is the other way and the bound stops bounding anything.
import {
  GAP_HALF,
  PLAYER_FOOT_RADIUS,
  PLAYER_INNER_RADIUS,
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  MIN_DELTA,
  PLAYER_HALF,
  REACTION_FRACTION,
  RING_SPACING,
  ROTATE_SPEED,
  SPEED_CAP,
  angleDelta,
  clearsRing,
  generateGaps,
  nextGap,
  normaliseAngle,
  reachableDelta,
  seededRandom,
  speedAt,
} from './track'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps
const TAU = Math.PI * 2

// --- the angle helpers, which everything else is built on ------------------

{
  check('a delta of zero is zero', near(angleDelta(1, 1), 0))
  check('a small step forward is positive', near(angleDelta(1, 1.2), 0.2))
  check('a small step back is negative', near(angleDelta(1.2, 1), -0.2))
  // The case a naive `b - a` gets wrong, and the reason the generator can
  // wrap the tube without the bound suddenly reading as a full turn.
  check(
    'crossing zero takes the short way',
    near(angleDelta(0.1, TAU - 0.1), -0.2),
    `${angleDelta(0.1, TAU - 0.1)}`,
  )
  check(
    'and so does crossing it the other way',
    near(angleDelta(TAU - 0.1, 0.1), 0.2),
    `${angleDelta(TAU - 0.1, 0.1)}`,
  )
  check('a delta is never more than half a turn', Math.abs(angleDelta(0, Math.PI + 0.5)) <= Math.PI)
  check('normalising a negative angle wraps it up', near(normaliseAngle(-0.5), TAU - 0.5))
  check('normalising past a turn wraps it down', near(normaliseAngle(TAU + 0.5), 0.5))
}

// --- the bound itself ------------------------------------------------------

{
  check(
    'the bound is the rotation available between two rings',
    near(reachableDelta(SPEED_CAP), ROTATE_SPEED * (RING_SPACING / SPEED_CAP) * REACTION_FRACTION),
  )
  check('going faster leaves less room', reachableDelta(SPEED_CAP) < reachableDelta(speedAt(0)))
  // Dropping the Math.min in reachableDelta turns this red.
  check(
    'the bound never exceeds half a turn',
    [0.5, 1, 3, 7, 14].every((s) => reachableDelta(s) <= Math.PI + 1e-9),
    `at the slowest speed tried: ${reachableDelta(0.5).toFixed(3)}`,
  )
  check(
    'and it holds back reaction time rather than spending the lot',
    reachableDelta(SPEED_CAP) < ROTATE_SPEED * (RING_SPACING / SPEED_CAP),
    `${REACTION_FRACTION} of the theoretical budget`,
  )
  // If the floor ever exceeded the bound the generator would be required to
  // produce an unreachable move, which is the defect this whole file is about.
  check(
    'the smallest move the generator asks for still fits the bound at the cap',
    MIN_DELTA <= reachableDelta(SPEED_CAP),
    `${MIN_DELTA} against a bound of ${reachableDelta(SPEED_CAP).toFixed(3)}`,
  )
}

// --- the check #111 asks for ----------------------------------------------

{
  /**
   * The radians a player can actually cover between two rings at `speed`.
   *
   * Written out here rather than imported, on purpose: this is the claim, and
   * it must not share a constant with the thing being claimed about. It is
   * the tube's geometry and the player's rotation speed, nothing else.
   */
  const physicalBudget = (speed: number) => Math.min(Math.PI, ROTATE_SPEED * (RING_SPACING / speed))

  // Every ring at the cap, which is the worst case the game ever presents.
  const rand = seededRandom(20260907)
  let previous = 0
  let worstOvershoot = -Infinity
  let pairs = 0
  for (let i = 0; i < 5000; i++) {
    const gap = nextGap(previous, SPEED_CAP, rand)
    const moved = Math.abs(angleDelta(previous, gap))
    worstOvershoot = Math.max(worstOvershoot, moved - physicalBudget(SPEED_CAP))
    pairs++
    previous = gap
  }
  check(
    'every consecutive gap is physically reachable at the speed cap',
    worstOvershoot <= 1e-9,
    `${pairs} pairs, worst was ${worstOvershoot > 0 ? '+' : ''}${worstOvershoot.toFixed(4)} rad against a ${physicalBudget(SPEED_CAP).toFixed(3)} rad budget`,
  )

  // And through a whole run, where the speed is climbing and the budget is
  // therefore tightening under the generator's feet.
  const gaps = generateGaps(4000, seededRandom(7))
  let unreachable = 0
  let worst = null as null | { i: number; moved: number; budget: number }
  let worstSlack = 0
  for (let i = 1; i < gaps.length; i++) {
    const budget = physicalBudget(speedAt(i - 1))
    const moved = Math.abs(angleDelta(gaps[i - 1], gaps[i]))
    if (moved > budget + 1e-9) {
      unreachable++
      if (!worst || moved - budget > worst.moved - worst.budget) worst = { i, moved, budget }
    }
    worstSlack = Math.max(worstSlack, moved / budget)
  }
  check(
    'and through a full run as the speed climbs',
    unreachable === 0,
    unreachable === 0
      ? `${gaps.length - 1} pairs all within the physical budget`
      : `${unreachable} unreachable, worst at ring ${worst!.i}: moved ${worst!.moved.toFixed(3)} with ${worst!.budget.toFixed(3)} available`,
  )

  // The slack is the point of REACTION_FRACTION: a track that is reachable
  // only by a player who began turning the instant the previous ring passed
  // is reachable by nobody. Nothing here is allowed to need more than the
  // generator's stated share of the physical budget.
  check(
    'and never needs more than the reaction budget allows',
    worstSlack <= REACTION_FRACTION + 1e-9,
    `worst move needed ${(worstSlack * 100).toFixed(1)}% of the physical budget, allowance is ${(REACTION_FRACTION * 100).toFixed(0)}%`,
  )

  // A bound nobody ever approaches would pass the check above while making a
  // dull game, so assert the generator actually uses the room it has.
  const usage = []
  for (let i = 1; i < gaps.length; i++) {
    usage.push(Math.abs(angleDelta(gaps[i - 1], gaps[i])) / reachableDelta(speedAt(i - 1)))
  }
  const maxUsage = Math.max(...usage)
  const meanUsage = usage.reduce((a, b) => a + b, 0) / usage.length
  check(
    'the generator uses most of the budget at least sometimes',
    maxUsage > 0.95,
    `peak ${(maxUsage * 100).toFixed(1)}% of budget`,
  )
  check(
    'and does not sit at the bottom of it',
    meanUsage > 0.4,
    `mean ${(meanUsage * 100).toFixed(1)}% of budget`,
  )

  // The other failure mode: a sequence that never asks the player to move.
  const still = usage.filter((u) => u < 0.02).length
  check('no ring reuses the previous gap outright', still === 0, `${still} standing pairs`)
}

// --- the generator's own guarantees ---------------------------------------

{
  const gaps = generateGaps(500, seededRandom(99))
  check('every gap is a normalised angle', gaps.every((g) => g >= 0 && g < TAU))
  check(
    'and every move clears the floor',
    gaps.slice(1).every((g, i) => Math.abs(angleDelta(gaps[i], g)) >= Math.min(MIN_DELTA, reachableDelta(speedAt(i))) - 1e-9),
  )
  check(
    'the same seed gives the same track',
    generateGaps(50, seededRandom(4)).every((g, i) => near(g, generateGaps(50, seededRandom(4))[i])),
  )
  check(
    'a different seed gives a different one',
    generateGaps(50, seededRandom(4)).some((g, i) => !near(g, generateGaps(50, seededRandom(5))[i])),
  )
  // Both directions get used, or the tube would only ever wind one way.
  const forward = gaps.slice(1).filter((g, i) => angleDelta(gaps[i], g) > 0).length
  check('gaps move both ways round the tube', forward > 100 && forward < 400, `${forward} of 499 forward`)
}

// --- the player is where the ring is --------------------------------------
//
// `clearsRing` compares angles and nothing else, which is a correct model of
// hitting a ring only if the player occupies the radius the ring is solid at.
// The first version failed exactly here and nothing noticed: the ring was an
// annulus from 1.76 to 2.20 and the player was the camera at 0.35, sailing
// through the open middle of every ring while crashes were decided from an
// angle their body never tested. Every check in this file still passed,
// because every check in this file was about angles.
//
// Proven to fail: setting PLAYER_RADIUS back to 0.35 fails both of these.

{
  check(
    'the ring is solid across a real band',
    RING_OUTER_RADIUS > RING_INNER_RADIUS,
    `${RING_INNER_RADIUS.toFixed(2)}..${RING_OUTER_RADIUS.toFixed(2)}`,
  )
  check(
    'the runner stands on the tube wall',
    PLAYER_FOOT_RADIUS === RING_OUTER_RADIUS,
    `feet at ${PLAYER_FOOT_RADIUS.toFixed(2)}, wall at ${RING_OUTER_RADIUS.toFixed(2)}`,
  )
  check(
    'and their whole body is inside the band the ring is solid across',
    PLAYER_INNER_RADIUS >= RING_INNER_RADIUS && PLAYER_FOOT_RADIUS <= RING_OUTER_RADIUS,
    `runner spans ${PLAYER_INNER_RADIUS.toFixed(2)}..${PLAYER_FOOT_RADIUS.toFixed(2)}, ring is solid ${RING_INNER_RADIUS.toFixed(2)}..${RING_OUTER_RADIUS.toFixed(2)}`,
  )
  // Head clearance. Without it the ring's inner edge could sit between the
  // runner's shoulders and their scalp — a hitbox that catches the body but
  // lets the head through, which is worse than either extreme.
  check(
    'with clearance over their head, not just at their feet',
    PLAYER_INNER_RADIUS - RING_INNER_RADIUS > 0.1,
    `${(PLAYER_INNER_RADIUS - RING_INNER_RADIUS).toFixed(2)} units of headroom`,
  )
  // The gap has to be wide enough at the player's radius to be worth aiming
  // for. An angular gap subtends an arc that shrinks as the radius shrinks, so
  // a player pushed too far inward would face a gap narrower than they are.
  // Measured at the head, where the arc is narrowest — clearing at the feet
  // and clipping at the shoulders would be the same defect as above.
  const gapArc = 2 * GAP_HALF * PLAYER_INNER_RADIUS
  const playerArc = 2 * PLAYER_HALF * PLAYER_INNER_RADIUS
  check(
    'and the gap is wider than the player at that radius',
    gapArc > playerArc,
    `gap ${gapArc.toFixed(2)} units across, player ${playerArc.toFixed(2)}`,
  )
}

// --- clearing a ring -------------------------------------------------------

{
  check('dead centre of the gap clears', clearsRing(1.0, 1.0))
  check('the edge of the tolerance clears', clearsRing(1.0, 1.0 + (GAP_HALF - PLAYER_HALF) - 1e-9))
  check('just past it does not', !clearsRing(1.0, 1.0 + (GAP_HALF - PLAYER_HALF) + 1e-6))
  check('the far side of the tube does not', !clearsRing(0, Math.PI))
  // The player's own width has to count, or the gap plays wider than it looks.
  check(
    'a player whose shoulder overlaps the ring is stopped',
    !clearsRing(0, GAP_HALF - PLAYER_HALF + 0.01),
    'their centre is inside the gap but their edge is not',
  )
  check(
    'clearing wraps around zero like everything else',
    clearsRing(TAU - 0.05, 0.05),
    'a gap either side of zero is one gap',
  )
  check('and the tolerance is positive at all', GAP_HALF > PLAYER_HALF, `${GAP_HALF} vs ${PLAYER_HALF}`)
}

// --- the speed curve -------------------------------------------------------

{
  check('speed climbs with rings passed', speedAt(10) > speedAt(0))
  check('it is capped', speedAt(10_000) === SPEED_CAP, `${speedAt(10_000)}`)
  check('the cap is reached, not merely approached', speedAt(200) === SPEED_CAP)
  check('and the run starts slower than it ends', speedAt(0) < SPEED_CAP)
}

console.log(ok ? '\nALL TUBE RUNNER TRACK CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
