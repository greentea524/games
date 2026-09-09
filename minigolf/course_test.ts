// Minigolf's holes are actually completable (#113).
//
//   npx tsx minigolf/course_test.ts
//
// `rest_test.ts` checks the detector. This checks the *course*, and it exists
// because every hole defect this game has had was invisible to everything
// else: the geometry rendered correctly, the build passed, the contrast suite
// passed, and the ball could not reach the cup.
//
// Three shipped in one file. A ramp long enough to reach the plateau's height
// before it reached the plateau's edge, leaving the plateau's side face as an
// unmarked wall part-way up the climb. Side rails half a metre tall guarding a
// green raised a metre, so the raised green had no edge. And a boundary wall
// laid across the mouth of the leg the tee shot travels down. None of them is
// a *physics* bug — the simulation was faithfully reporting a ball hitting a
// wall that was really there.
//
// What no other check could see is the only thing that matters about a hole:
// whether a player can finish it. So this one plays them.
import { COURSE, CUP_RADIUS, createSim, type Sim } from './physics'
import { HOLES, MAX_SLOPE, RISE_HEIGHT, rampRun, type Box, type Hole } from './holes'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * How far from the cup the ball came to rest, with a penalty for being on the
 * wrong level.
 *
 * On `Rise` the cup sits directly above the lower green, so plan distance
 * alone rates a ball at the foot of the ramp as nearly holed. The penalty is
 * what makes climbing count as progress.
 */
function costToCup(sim: Sim, hole: Hole): number {
  const dx = sim.ball.position.x - hole.cup.x
  const dz = sim.ball.position.z - hole.cup.z
  const dy = sim.ball.position.y - hole.cup.y
  return Math.hypot(dx, dz) + 2 * Math.abs(dy)
}

interface Stroke {
  dirX: number
  dirZ: number
  power: number
}

/** Every stroke the solver is allowed to consider. */
function candidates(): Stroke[] {
  const out: Stroke[] = []
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2
    for (const power of [0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
      out.push({ dirX: Math.cos(a), dirZ: Math.sin(a), power })
    }
  }
  return out
}

const SETTLE_LIMIT = 14

/**
 * Runs one stroke to its conclusion: holed, off the course, or at rest.
 *
 * The at-rest detector is what ends the stroke, which makes this a check on
 * that too — a detector that never fired would hang here rather than pass.
 */
function playStroke(sim: Sim, stroke: Stroke): 'holed' | 'off' | 'rest' | 'rolling' {
  sim.putt(stroke.dirX, stroke.dirZ, stroke.power)
  for (let t = 0; t < SETTLE_LIMIT; t += 1 / 120) {
    sim.step(1 / 120)
    if (sim.holed()) return 'holed'
    if (sim.offCourse()) return 'off'
    if (sim.atRest()) return 'rest'
  }
  return 'rolling'
}

function copyBall(from: Sim, to: Sim) {
  to.ball.position.copy(from.ball.position)
  to.ball.quaternion.copy(from.ball.quaternion)
  to.ball.velocity.setZero()
  to.ball.angularVelocity.setZero()
  to.ball.force.setZero()
  to.ball.torque.setZero()
  to.ball.wakeUp()
}

/**
 * Plays a hole greedily and returns the strokes taken, or null if it could not
 * be finished within `budget`.
 *
 * Greedy rather than optimal on purpose. A search good enough to find a
 * one-in-a-thousand line would call a hole playable that no person could
 * finish; this one only ever takes the stroke that ends nearest the cup, which
 * is roughly what a player does. If greedy can finish it, it is finishable.
 */
function solve(hole: Hole, budget: number): Stroke[] | null {
  const sim = createSim(hole)
  const probe = createSim(hole)
  const strokes: Stroke[] = []

  for (let n = 0; n < budget; n++) {
    let best: Stroke | null = null
    let bestCost = Infinity

    for (const stroke of candidates()) {
      copyBall(sim, probe)
      const outcome = playStroke(probe, stroke)
      if (outcome === 'off') continue
      const cost = outcome === 'holed' ? -1 : costToCup(probe, hole)
      if (cost < bestCost) {
        bestCost = cost
        best = stroke
      }
    }
    if (!best) return null

    strokes.push(best)
    const outcome = playStroke(sim, best)
    if (outcome === 'holed') return strokes
    if (outcome === 'off') return null
  }
  return null
}

// --- every authored hole can be finished ----------------------------------

for (const hole of HOLES) {
  const budget = hole.par + 3
  const strokes = solve(hole, budget)
  check(
    `${hole.name}: can be holed`,
    strokes !== null,
    strokes
      ? `${strokes.length} strokes, par ${hole.par}`
      : `not holed in ${budget} strokes`,
  )
}

check('the scorecard covers every hole', COURSE.length === HOLES.length, `${COURSE.length}`)

// --- and the check can tell when one cannot -------------------------------
//
// Both controls are the real defects, put back. A check that only ever sees
// working holes has never been shown to notice a broken one, and this repo has
// shipped checks that passed for the wrong reason.

{
  // The junction defect, exactly as it shipped: the plateau's near edge sits
  // short of where the ramp crests, so the ramp is still below plateau height
  // when it arrives — and the plateau's side face stands proud of the ramp
  // surface as a step the climbing ball hits head-on.
  //
  // The step is only `short * tan(slope)` tall — under 15 cm on a course whose
  // ball has a 16 cm radius — which is precisely why it survived review. It
  // does not look like a wall. It behaves like one.
  const run = rampRun(RISE_HEIGHT, MAX_SLOPE)
  const c = Math.cos(MAX_SLOPE)
  const s = Math.sin(MAX_SLOPE)
  const short = 0.6
  const footZ = 1.4 * c
  const footY = -1.4 * s
  const stepped: Hole = {
    name: 'Rise (plateau short of the crest)',
    par: 3,
    tee: { x: 0, z: 3.6 },
    cup: { x: 0, y: RISE_HEIGHT, z: -6.3 },
    boxes: [
      { x: 0, y: -0.2, z: 2.5, w: 4, h: 0.4, d: 5, surface: 'green' },
      // The ramp itself is correct — it crests at exactly `-run`.
      {
        x: 0,
        y: (footY + RISE_HEIGHT) / 2 - 0.2 * c,
        z: (footZ - run) / 2 - 0.2 * s,
        w: 4,
        h: 0.4,
        d: 1.4 + Math.hypot(run, RISE_HEIGHT),
        tiltX: MAX_SLOPE,
        surface: 'green',
      },
      // The plateau is the part that is wrong, by `short` units of z.
      {
        x: 0,
        y: RISE_HEIGHT - 0.2,
        z: -run + short - 2,
        w: 4,
        h: 0.4,
        d: 4,
        surface: 'green',
      },
      { x: -2.2, y: 0.75, z: -1.55, w: 0.4, h: 1.5, d: 13.9, surface: 'wall' },
      { x: 2.2, y: 0.75, z: -1.55, w: 0.4, h: 1.5, d: 13.9, surface: 'wall' },
      { x: 0, y: 0.25, z: 5.2, w: 4.8, h: 0.5, d: 0.4, surface: 'wall' },
      {
        x: 0,
        y: RISE_HEIGHT + 0.25,
        z: -run + short - 4.2,
        w: 4.8,
        h: 0.5,
        d: 0.4,
        surface: 'wall',
      },
    ],
  }
  check(
    'a plateau that starts short of the crest is caught',
    solve(stepped, 6) === null,
    `a ${(short * Math.tan(MAX_SLOPE)).toFixed(3)}-unit step across the climb`,
  )
}

{
  // A wall across the leg the tee shot travels down — the Elbow defect,
  // reduced to its simplest form on the straight hole.
  const sealed: Hole = {
    ...HOLES[0],
    name: 'Opener (walled off)',
    boxes: [...HOLES[0].boxes, { x: 0, y: 0.25, z: 0, w: 4.8, h: 0.5, d: 0.4, surface: 'wall' }],
  }
  check(
    'a wall laid across the fairway is caught',
    solve(sealed, 5) === null,
    'the cup is unreachable',
  )
}

// --- every rail is taller than the green it edges --------------------------
//
// The solver cannot catch this one. A green with no edge does not block any
// line to the cup, it just lets a ball that drifts wide fall off the course —
// and the solver discards those candidates and plays a different stroke. So
// this is checked geometrically: a wall whose footprint touches a green must
// top out above that green's surface, or it is not a wall from up there.
//
// `Rise` shipped with 0.5-unit rails alongside a green raised a full unit.

/** Do two boxes overlap in plan, allowing for edges that merely touch? */
function abut(a: Box, b: Box): boolean {
  const slack = 0.05
  return (
    Math.abs(a.x - b.x) <= (a.w + b.w) / 2 + slack &&
    Math.abs(a.z - b.z) <= (a.d + b.d) / 2 + slack
  )
}

/** Rails that stop below a green they run alongside, as `wall -> green` pairs. */
function shortRails(hole: Hole): string[] {
  const out: string[] = []
  for (const w of hole.boxes) {
    if (w.surface !== 'wall') continue
    for (const g of hole.boxes) {
      // Ramps are skipped: their surface height varies along their length, so
      // "the green's top" is not one number. Every ramp in this course runs
      // between two flat greens that are checked.
      if (g.surface !== 'green' || g.tiltX || g.tiltZ) continue
      if (!abut(w, g)) continue
      const railTop = w.y + w.h / 2
      const greenTop = g.y + g.h / 2
      if (railTop <= greenTop + 1e-6) {
        out.push(`rail topping at ${railTop.toFixed(2)} beside a green at ${greenTop.toFixed(2)}`)
      }
    }
  }
  return out
}

for (const hole of HOLES) {
  const short = shortRails(hole)
  check(`${hole.name}: every rail clears the green it edges`, short.length === 0, short[0])
}

{
  // Every rail flattened to the default height and dropped to the lower green,
  // which is how `Rise` shipped: correct alongside the tee, and no edge at all
  // once the course climbs away from it.
  const lowRails: Hole = {
    ...HOLES[2],
    name: 'Rise (short rails)',
    boxes: HOLES[2].boxes.map((b) => (b.surface === 'wall' ? { ...b, y: 0.25, h: 0.5 } : b)),
  }
  check(
    'a rail that stops below its green is caught',
    shortRails(lowRails).length > 0,
    `${shortRails(lowRails).length} found`,
  )
}

// --- the cup is on the surface the ball arrives on -------------------------

for (const hole of HOLES) {
  const beneath = hole.boxes.filter(
    (b) =>
      b.surface === 'green' &&
      !b.tiltX &&
      !b.tiltZ &&
      Math.abs(hole.cup.x - b.x) <= b.w / 2 - CUP_RADIUS &&
      Math.abs(hole.cup.z - b.z) <= b.d / 2 - CUP_RADIUS &&
      Math.abs(hole.cup.y - (b.y + b.h / 2)) < 1e-6,
  )
  check(`${hole.name}: the cup sits on a flat green`, beneath.length > 0)
}

console.log(ok ? '\nALL MINIGOLF COURSE CHECKS PASS' : '\nMINIGOLF COURSE CHECKS FAILED')
process.exit(ok ? 0 : 1)
