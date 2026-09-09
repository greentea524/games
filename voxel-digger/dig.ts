// Digging, and knowing when you have dug enough (#115).
//
// The rules are small. A cell is rock, buried shape, or dug out. You may dig a
// rock cell if you can see it, you may not dig the shape, and seeing a cell
// tells you which of the two it is. Everything else — scoring, the budget, the
// guess — sits on top of that.
//
// The part worth care is what "you have dug enough" means, because the game
// ends on a guess and a guess is only fair if the answer was actually knowable.
// It is knowable when exactly one candidate shape is still consistent with
// everything the player can see, and `dig_test.ts` proves that state is always
// reachable inside the budget by playing every layout with a solver.
import {
  BLOCK,
  DIG_BUDGET,
  SHAPES,
  allCells,
  cellsOf,
  neighbours,
  onSurface,
  type Block,
  type Shape,
} from './block'

export interface DigState {
  block: Block
  /** The cells the buried shape fills. Fixed for a round. */
  shape: ReadonlySet<number>
  /** Rock cells dug out so far, in the order they went. */
  removed: number[]
}

export function createState(shape: Shape, block: Block = BLOCK): DigState {
  return { block, shape: cellsOf(block, shape), removed: [] }
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
export function isDiggable(state: DigState, k: number, removed = removedSet(state)): boolean {
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
  budget = DIG_BUDGET,
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
