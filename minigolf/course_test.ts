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
import { BALL_RADIUS, COURSE, CUP_RADIUS, createSim, type Sim } from './physics'
import { HOLES, MAX_SLOPE, RISE_HEIGHT, rampRun, type Box, type Hole } from './holes'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * How far a ball still has to travel to reach the cup — along the course, not
 * through it (#141).
 *
 * This was straight-line distance plus a penalty per unit of height, which is
 * right for a course whose route only ever closes on the cup, and #113's three
 * holes all did. #141's did not, and the greedy solver parked in the obvious
 * trap: on `Shelf` it sat on the floor directly under the cup, 0.6 below it
 * and — by that measure — nearer than anywhere on the ramp that leads up; on
 * `Summit`, a U, it pressed against the wall between the legs, the nearest
 * point in plan to a cup on the other side. Six strokes of standing still.
 *
 * So the measure is a walking distance: a grid over the course's surfaces,
 * where walls block and a change of level only connects along a ramp, filled
 * outward from the cup. It changes only which stroke looks like progress. The
 * physics still decides every outcome, and a hole the ball cannot finish still
 * fails — see `routeCost` for why unreachable is a fallback and not a verdict.
 */
const CELL = 0.2
/** Largest rise between neighbouring cells that still counts as one surface. */
const STEP = 0.08

/** The top of whatever green is under (x, z), or null for none. */
function surfaceAt(hole: Hole, x: number, z: number): number | null {
  let top: number | null = null
  for (const b of hole.boxes) {
    if (b.surface !== 'green' || Math.abs(x - b.x) > b.w / 2) continue
    let y: number
    if (b.tiltX) {
      // The top face's centre sits half a slab out along the tilted normal;
      // from there the surface runs along the tilted local z axis.
      const c = Math.cos(b.tiltX)
      const s = Math.sin(b.tiltX)
      const tz = b.z + (b.h / 2) * s
      const ty = b.y + (b.h / 2) * c
      const u = (z - tz) / c
      if (Math.abs(u) > b.d / 2) continue
      y = ty - u * s
    } else {
      if (Math.abs(z - b.z) > b.d / 2) continue
      y = b.y + b.h / 2
    }
    if (top === null || y > top) top = y
  }
  return top
}

/** Is there a wall at (x, z) standing above a surface at `y`? */
function walled(hole: Hole, x: number, z: number, y: number): boolean {
  // Slightly under the ball's radius: a ball resting against a wall must still
  // land in a cell the field can see.
  const r = 0.1
  return hole.boxes.some(
    (b) =>
      b.surface === 'wall' &&
      Math.abs(x - b.x) <= b.w / 2 + r &&
      Math.abs(z - b.z) <= b.d / 2 + r &&
      b.y + b.h / 2 > y + 0.05 &&
      b.y - b.h / 2 < y + 0.3,
  )
}

interface RouteField {
  /** Walking distance from (x, y, z) to the cup; Infinity if unconnected. */
  from(x: number, y: number, z: number): number
}

function routeField(hole: Hole): RouteField {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const b of hole.boxes) {
    minX = Math.min(minX, b.x - b.w / 2)
    maxX = Math.max(maxX, b.x + b.w / 2)
    minZ = Math.min(minZ, b.z - b.d / 2)
    maxZ = Math.max(maxZ, b.z + b.d / 2)
  }
  const nx = Math.ceil((maxX - minX) / CELL) + 1
  const nz = Math.ceil((maxZ - minZ) / CELL) + 1
  const height = new Array<number | null>(nx * nz)
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = minX + i * CELL
      const z = minZ + k * CELL
      const y = surfaceAt(hole, x, z)
      height[i * nz + k] = y !== null && !walled(hole, x, z, y) ? y : null
    }
  }
  const cellOf = (x: number, z: number) => [
    Math.round((x - minX) / CELL),
    Math.round((z - minZ) / CELL),
  ]

  // Dijkstra outward from the cup. A few thousand cells; the plain scan for
  // the nearest unsettled cell is fast enough and easy to read.
  const dist = new Array<number>(nx * nz).fill(Infinity)
  const done = new Array<boolean>(nx * nz).fill(false)
  const [ci, ck] = cellOf(hole.cup.x, hole.cup.z)
  dist[ci * nz + ck] = 0
  for (;;) {
    let at = -1
    for (let n = 0; n < dist.length; n++) {
      if (!done[n] && dist[n] < Infinity && (at < 0 || dist[n] < dist[at])) at = n
    }
    if (at < 0) break
    done[at] = true
    const i = Math.floor(at / nz)
    const k = at % nz
    for (let di = -1; di <= 1; di++) {
      for (let dk = -1; dk <= 1; dk++) {
        const a = i + di
        const c = k + dk
        if ((!di && !dk) || a < 0 || c < 0 || a >= nx || c >= nz) continue
        const n = a * nz + c
        const h0 = height[at]
        const h1 = height[n]
        if (h0 === null || h1 === null || Math.abs(h1 - h0) > STEP * Math.hypot(di, dk)) continue
        const d = dist[at] + CELL * Math.hypot(di, dk)
        if (d < dist[n]) dist[n] = d
      }
    }
  }

  return {
    from(x, y, z) {
      // The nearest cell on the ball's own level, within a couple of cells: a
      // ball against a wall sits on the edge of the walled-off band.
      const [i, k] = cellOf(x, z)
      const floor = y - BALL_RADIUS
      let best = Infinity
      for (let di = -2; di <= 2; di++) {
        for (let dk = -2; dk <= 2; dk++) {
          const a = i + di
          const c = k + dk
          if (a < 0 || c < 0 || a >= nx || c >= nz) continue
          const h = height[a * nz + c]
          if (h === null || Math.abs(h - floor) > 0.2) continue
          best = Math.min(best, dist[a * nz + c] + CELL * Math.hypot(di, dk))
        }
      }
      return best
    },
  }
}

/**
 * The solver's measure of a resting ball: its walking distance to the cup.
 *
 * Where the field has no route — which is exactly the case for a broken hole —
 * this falls back to the old straight-line measure, offset so any connected
 * position beats any unconnected one. The field is a guide and not a judge: if
 * an unconnected field ended the solve, a hole could be failed by a grid
 * artefact, and both controls below would be caught by the map instead of by
 * the ball actually failing to get there. They are not; the ball plays on.
 */
function routeCost(sim: Sim, hole: Hole, field: RouteField): number {
  const p = sim.ball.position
  const walk = field.from(p.x, p.y, p.z)
  if (walk < Infinity) return walk
  return 1000 + Math.hypot(p.x - hole.cup.x, p.z - hole.cup.z) + 2 * Math.abs(p.y - hole.cup.y)
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
  const field = routeField(hole)
  const strokes: Stroke[] = []

  for (let n = 0; n < budget; n++) {
    let best: Stroke | null = null
    let bestCost = Infinity

    for (const stroke of candidates()) {
      copyBall(sim, probe)
      const outcome = playStroke(probe, stroke)
      if (outcome === 'off') continue
      const cost = outcome === 'holed' ? -1 : routeCost(probe, hole, field)
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

{
  // One per hole #141 added, as #141 asked: wall off the route and the solver
  // has to say so. A new hole the solver finishes has only been shown to be
  // finishable; this shows the solver would have noticed if it were not.
  const hole = (name: string) => HOLES.find((h) => h.name === name)!
  const sealed = (name: string, ...walls: Box[]): Hole => ({
    ...hole(name),
    name: `${name} (sealed)`,
    boxes: [...hole(name).boxes, ...walls],
  })
  const across = (x: number, z: number, w: number, d: number, y = 0): Box => ({
    x, y: y + 0.25, z, w, h: 0.5, d, surface: 'wall',
  })
  const cases: [Hole, string][] = [
    [sealed('Gate', across(0.6, 0, 1, 0.4)), 'the gate closed'],
    [sealed('Bank', across(2.25, 0, 1.5, 0.4)), 'the gap past the baffle closed'],
    [sealed('Drop', across(0, -2, 4, 0.4)), 'a wall across the lower green'],
    [sealed('Split', across(-1.25, 1.5, 0.9, 0.4), across(1.6, 1.5, 3.2, 0.4)), 'both lanes closed'],
    [sealed('Shelf', across(-2, 0.3, 2, 0.4)), 'the foot of the ramp closed'],
    [sealed('Summit', across(0, -4, 0.4, 4)), 'the cross leg cut'],
  ]
  for (const [h, how] of cases) {
    check(`${h.name} is caught`, solve(h, h.par + 3) === null, how)
  }

  // And the one hole whose design is a claim about routes: `Split` says
  // neither lane is wrong. Close either one and it must still be holed by the
  // other — otherwise "two lanes" is one lane and a wall.
  for (const [lane, wall] of [
    ['east', across(-1.25, 1.5, 0.9, 0.4)],
    ['west', across(1.6, 1.5, 3.2, 0.4)],
  ] as const) {
    const other = lane === 'east' ? 'west gate' : 'east lane'
    const h = sealed('Split', wall)
    const strokes = solve(h, h.par + 3)
    check(
      `Split with its ${other} closed is still holed`,
      strokes !== null,
      strokes ? `${strokes.length} strokes by the ${lane} lane` : `the ${lane} lane is not a route`,
    )
  }
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
  // By name, not index: #141 put holes in front of it, and `HOLES[2]` quietly
  // became the Elbow — a flat hole, so the control would have tested nothing.
  const rise = HOLES.find((h) => h.name === 'Rise')!
  const lowRails: Hole = {
    ...rise,
    name: 'Rise (short rails)',
    boxes: rise.boxes.map((b) => (b.surface === 'wall' ? { ...b, y: 0.25, h: 0.5 } : b)),
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
