// Digging, and knowing when you have dug enough (#115).
//
// The rules are small. A cell is rock, buried shape, or dug out. You may dig a
// rock cell if you can see it, you may not dig the shape, and seeing a cell
// tells you which of the two it is. Everything else — scoring, the drill, the
// guess — sits on top of that.
//
// The part worth care is what "you have dug enough" means, because the game
// ends on a guess and a guess is only fair if the answer was actually knowable.
// It is knowable when exactly one candidate shape is still consistent with
// everything the player can see, and `dig_test.ts` proves that state is always
// reachable inside `PROOF_BUDGET` by playing every layout with a solver.
import {
  BLOCK,
  PROOF_BUDGET,
  SHAPES,
  allCells,
  cellsOf,
  inside,
  key,
  neighbours,
  onSurface,
  unkey,
  type Block,
  type Shape,
} from './block'

export interface DigState {
  block: Block
  /** The cells the buried shape fills. Fixed for a round. */
  shape: ReadonlySet<number>
  /** Rock cells dug out so far, in the order they went. */
  removed: number[]
  /**
   * How many cells each tap took, in order (#151). A tap digs a patch, so the
   * player's count — and what undo puts back — is taps, while every rule
   * above it still reasons about cells. Their sum is always `removed.length`.
   */
  strokes: number[]
}

export function createState(shape: Shape, block: Block = BLOCK): DigState {
  return { block, shape: cellsOf(block, shape), removed: [], strokes: [] }
}

/**
 * True when a cell has been dug out.
 *
 * A `Set` rebuilt from the list would be faster; the list is the primary
 * record because the undo #115 asks for needs the order, and two copies of the
 * same fact drift.
 */
export const isRemoved = (state: DigState, k: number): boolean => state.removed.includes(k)

/** A view of the removed cells that is cheap to query repeatedly. */
export function removedSet(state: DigState): Set<number> {
  return new Set(state.removed)
}

/**
 * Can the player see this cell?
 *
 * A cell on the block's outside is visible from the start; anything else needs
 * a neighbour dug away first. This is an approximation of what a ray from the
 * camera can actually reach — down a long crooked shaft it is generous — and
 * it is generous in the direction that matters, because the solver uses it to
 * decide what is reachable and the shortest path to any cell is a straight
 * shaft from the nearest face, which is never in doubt.
 */
export function isVisible(block: Block, k: number, removed: ReadonlySet<number>): boolean {
  if (removed.has(k)) return false
  if (onSurface(block, k)) return true
  return neighbours(block, k).some((n) => removed.has(n))
}

/** Rock that can be dug right now: visible, and not part of the shape. */
export function isDiggable(
  state: DigState,
  k: number,
  removed: ReadonlySet<number> = removedSet(state),
): boolean {
  return !state.shape.has(k) && isVisible(state.block, k, removed)
}

/**
 * Every cell whose nature the player knows.
 *
 * Dug cells — they were rock, or they could not have been dug — plus every
 * cell currently in view, whose colour says which it is.
 */
export function knownCells(state: DigState): Set<number> {
  const removed = removedSet(state)
  const known = new Set<number>(removed)
  for (const k of removed) {
    for (const n of neighbours(state.block, k)) if (!removed.has(n)) known.add(n)
  }
  // The block's outer skin is in view before a single dig, and every candidate
  // sits well inside it — so this adds nothing to what can be ruled out. It is
  // here because leaving it out would make `knownCells` mean "known by
  // digging" while reading as "known", and the next person to use it would be
  // wrong in a way that quietly loosens the guess.
  for (const k of allCells(state.block)) if (onSurface(state.block, k)) known.add(k)
  return known
}

/**
 * The candidates still consistent with what the player can see.
 *
 * A candidate survives while it agrees with the truth on every known cell. The
 * truth always survives, so this can never be empty.
 */
export function survivors(state: DigState, candidates: Shape[] = SHAPES): Shape[] {
  const known = knownCells(state)
  return candidates.filter((candidate) => {
    const cells = cellsOf(state.block, candidate)
    for (const k of known) {
      if (cells.has(k) !== state.shape.has(k)) return false
    }
    return true
  })
}

/** True once only one candidate is left — the point at which a guess is fair. */
export const identified = (state: DigState, candidates: Shape[] = SHAPES): boolean =>
  survivors(state, candidates).length === 1

// --- the drill (#151, #152) ---------------------------------------------------
//
// A tap used to take one cube, then (#151) a 3×3 patch one layer deep. Both
// left the player aiming at the floor of a hole they could not see into: at
// the opening camera angle the second tap at the same spot lands on the
// hole's wall, digs sideways, and six taps in nothing has been found.
//
// So a tap drills. It takes the 3×3 patch across the tapped face and carries
// each of its nine columns straight in, away from the face, until that column
// meets the find or leaves the block. One tap reaches the find from any face,
// and a column that misses it leaves a hole clean through — which says
// "nothing here" as plainly as the find says "something".
//
// Every cube a drill takes is one a player could have dug one at a time, in
// the order the drill takes them: the patch is rock already in view, and each
// cube deeper is uncovered by the one before it. The find is never dug and
// never jumped — a column stops dead at it.

/** An axis by index: 0 is x, 1 is y, 2 is z. */
export type Axis = 0 | 1 | 2
/** Which way along an axis: toward higher coordinates, or lower. */
export type Dir = 1 | -1

/** How far a tap's patch reaches from the cube tapped: 1 makes it 3×3. */
export const BRUSH = 1

/**
 * What a score is counted in, stored beside it.
 *
 * A best set one cube a tap is not a best in drills — the same round costs a
 * fraction of the taps now — so the save and the hub's badge both ignore a
 * best from another unit, the way Minigolf ignores one from another course
 * (#141).
 */
export const SCORE_UNIT = `drills of ${2 * BRUSH + 1}x${2 * BRUSH + 1}`

/**
 * The faces a cell shows: toward a dug-out neighbour, or toward the outside
 * of the block. Each is given as the way a drill tapped there would travel —
 * `dir` points *into* the rock, away from the open side.
 */
export function openFaces(
  block: Block,
  k: number,
  removed: ReadonlySet<number>,
): { axis: Axis; dir: Dir }[] {
  const { x, y, z } = unkey(block, k)
  const c = [x, y, z]
  const out: { axis: Axis; dir: Dir }[] = []
  for (const axis of [0, 1, 2] as Axis[]) {
    for (const step of [-1, 1] as Dir[]) {
      const n = [...c]
      n[axis] += step
      if (!inside(block, n[0], n[1], n[2]) || removed.has(key(block, n[0], n[1], n[2]))) {
        out.push({ axis, dir: -step as Dir })
      }
    }
  }
  return out
}

/**
 * The patch a tap covers on the tapped layer: `target` and what surrounds it
 * across the face perpendicular to `axis`, within `radius` — open cells
 * included, because a drill carries on through them.
 *
 * Grown outward from the target rather than read off as a square, so the
 * find — which cannot be dug — stops it, the way a wall would, and so does
 * rock still out of sight.
 */
function patch(
  state: DigState,
  target: number,
  axis: Axis,
  radius: number,
  removed: ReadonlySet<number>,
): number[] {
  const b = state.block
  if (!isDiggable(state, target, removed)) return []
  const t = unkey(b, target)
  const origin = [t.x, t.y, t.z]
  const [u, w] = ([0, 1, 2] as Axis[]).filter((a) => a !== axis)
  const seen = new Set<number>([target])
  const queue = [target]
  for (let head = 0; head < queue.length; head++) {
    const c = unkey(b, queue[head])
    const at = [c.x, c.y, c.z]
    for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [...at]
      n[u] += du
      n[w] += dw
      if (Math.abs(n[u] - origin[u]) > radius || Math.abs(n[w] - origin[w]) > radius) continue
      if (!inside(b, n[0], n[1], n[2])) continue
      const nk = key(b, n[0], n[1], n[2])
      if (seen.has(nk)) continue
      seen.add(nk)
      if (removed.has(nk) || isDiggable(state, nk, removed)) queue.push(nk)
    }
  }
  return queue
}

/** The rock a tap's patch takes on the tapped layer alone: the drill's first cut. */
export function brushCells(
  state: DigState,
  target: number,
  axis: Axis,
  radius = BRUSH,
  removed: ReadonlySet<number> = removedSet(state),
): number[] {
  return patch(state, target, axis, radius, removed).filter((k) => !removed.has(k))
}

/**
 * The cells one tap takes: the patch around `target`, and each of its columns
 * carried along `axis` in direction `dir` until it meets the find or leaves
 * the block. Empty when the target itself is not diggable.
 *
 * Returned column by column, nearest cube first, which is an order every cube
 * in it could legally have been dug in — `dig_test.ts` replays it that way.
 */
export function drillCells(
  state: DigState,
  target: number,
  axis: Axis,
  dir: Dir,
  radius = BRUSH,
  removed: ReadonlySet<number> = removedSet(state),
): number[] {
  const b = state.block
  const out: number[] = []
  for (const start of patch(state, target, axis, radius, removed)) {
    const c = unkey(b, start)
    const at = [c.x, c.y, c.z]
    while (inside(b, at[0], at[1], at[2])) {
      const k = key(b, at[0], at[1], at[2])
      if (state.shape.has(k)) break
      // Open space is passed through: a drill that crosses an earlier hole
      // carries on into the rock on its far side.
      if (!removed.has(k)) out.push(k)
      at[axis] += dir
    }
  }
  return out
}

/** Takes one tap's cells out of the block. */
export function digStroke(state: DigState, cells: readonly number[]): void {
  if (cells.length === 0) return
  state.removed.push(...cells)
  state.strokes.push(cells.length)
}

/** Puts the last tap's cells back, and returns them. */
export function undoStroke(state: DigState): number[] {
  const n = state.strokes.pop()
  if (n === undefined) return []
  return state.removed.splice(state.removed.length - n, n)
}

// --- reachability -----------------------------------------------------------

/**
 * The digs needed to reach every rock cell, and how to get there.
 *
 * A breadth-first sweep inward from everything currently exposed. Shape cells
 * are walls: they cannot be dug, so a route cannot pass through one — which is
 * the reason a cell tucked behind the buried object can cost far more to reach
 * than its distance from the surface suggests.
 */
export function digDistances(state: DigState): Distances {
  const removed = removedSet(state)
  const out = new Map<number, { cost: number; from: number | null }>()
  const queue: number[] = []

  const consider = (k: number, cost: number, from: number | null) => {
    if (state.shape.has(k) || removed.has(k) || out.has(k)) return
    out.set(k, { cost, from })
    queue.push(k)
  }

  // Everything diggable right now is one dig away.
  for (const k of allCells(state.block)) {
    if (isVisible(state.block, k, removed)) consider(k, 1, null)
  }
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head]
    const cost = out.get(k)!.cost
    for (const n of neighbours(state.block, k)) consider(n, cost + 1, k)
  }
  return out
}

export type Distances = Map<number, { cost: number; from: number | null }>

/** The cells to dig, in order, to remove `target`. Empty if unreachable. */
export function pathTo(state: DigState, target: number, dist = digDistances(state)): number[] {
  if (!dist.has(target)) return []
  const path: number[] = []
  let at: number | null = target
  while (at !== null) {
    path.push(at)
    at = dist.get(at)!.from
  }
  return path.reverse()
}

/**
 * The cheapest way to bring `cell` into view, as the digs it takes.
 *
 * Either dig the cell itself, if it is rock, or dig a neighbour and look at
 * it — which is the only option for a shape cell, and usually cheaper anyway.
 */
export function exposePath(
  state: DigState,
  cell: number,
  dist = digDistances(state),
): number[] {
  let best: number[] | null = null
  const offer = (k: number) => {
    if (!dist.has(k)) return
    const path = pathTo(state, k, dist)
    if (path.length && (!best || path.length < best.length)) best = path
  }
  offer(cell)
  for (const n of neighbours(state.block, cell)) offer(n)
  return best ?? []
}

// --- the solver -------------------------------------------------------------

export interface Solution {
  digs: number[]
  /** Candidates left at the end. One means identified. */
  left: number
}

/**
 * Digs until one candidate is left, or until nothing more can be learned.
 *
 * Greedy, and knowingly so: at each step it takes the cheapest dig that rules
 * *any* candidate out. It also plays with knowledge no player has — it knows
 * the answer, and aims straight at the cells that separate it from the rest.
 *
 * That is exactly the question #115 asks, though. The check is whether "some
 * sequence of digs within the budget exposes enough to disambiguate", not
 * whether a player who is guessing would find it. If this cannot do it inside
 * the budget, nobody can.
 */
export function solve(
  shape: Shape,
  candidates: Shape[] = SHAPES,
  budget = PROOF_BUDGET,
  block: Block = BLOCK,
): Solution {
  const state = createState(shape, block)
  const cellSets = new Map(candidates.map((c) => [c.id, cellsOf(block, c)]))

  while (state.removed.length < budget) {
    const left = survivors(state, candidates)
    if (left.length <= 1) break

    const known = knownCells(state)
    // One sweep per step, shared by every candidate cell considered below.
    // Recomputing it inside `exposePath` made the solver quadratic in the
    // block's cell count, which only showed up on the oversized blocks the
    // "buried too deep" control needs.
    const dist = digDistances(state)
    let best: number[] | null = null
    for (const candidate of left) {
      if (candidate.id === shape.id) continue
      const cells = cellSets.get(candidate.id)!
      for (const k of cells) {
        if (state.shape.has(k) || known.has(k)) continue
        const path = exposePath(state, k, dist)
        if (path.length && (!best || path.length < best.length)) best = path
      }
      for (const k of state.shape) {
        if (cells.has(k) || known.has(k)) continue
        const path = exposePath(state, k, dist)
        if (path.length && (!best || path.length < best.length)) best = path
      }
    }
    if (!best) break
    if (state.removed.length + best.length > budget) break
    state.removed.push(...best)
  }

  return { digs: state.removed, left: survivors(state, candidates).length }
}
