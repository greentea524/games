// The whole of Tower Stacker's rules, with no three.js in sight (#110).
//
// Kept separate from the renderer for the reason CLAUDE.md gives for the other
// `*_test.ts` suites: the interesting part is the overlap arithmetic, and a
// check that has to stand up a WebGL context to exercise it is a check nobody
// runs. `stack_test.ts` drives this module directly.
//
// Everything here is in world units. One unit is one block-width at the base
// of the tower; the renderer scales that to the screen and never scales back.

/** A slab of the tower, or the block currently sliding above it. */
export interface Block {
  /** Centre on the sliding axis pair. */
  x: number
  z: number
  /** Extent along x and z. Always positive for a block that exists. */
  w: number
  d: number
}

/** Which axis the block slides along. Alternates every level, so the tower spirals. */
export type Axis = 'x' | 'z'

/**
 * How far off centre still counts as a perfect drop, in world units.
 *
 * This is the only skill expression in the game, so it has to be reachable
 * without being free. At the starting width of 1.0 it is a 4% tolerance; the
 * block does not shrink on a perfect drop, so the tolerance never tightens in
 * absolute terms even as the tower narrows — a run that keeps landing perfects
 * stays at full width and stays winnable.
 */
export const PERFECT_EPS = 0.04

/** The first slab. The tower is built on this and it is never dropped. */
export const BASE_BLOCK: Block = { x: 0, z: 0, w: 1, d: 1 }

/** Height of one slab, in world units. */
export const BLOCK_HEIGHT = 0.28

/** Which axis level `n` slides along. Level 0 is the first dropped block. */
export function axisFor(level: number): Axis {
  return level % 2 === 0 ? 'x' : 'z'
}

/**
 * How far the block travels either side of centre, in world units.
 *
 * Fixed rather than proportional to the block: a narrow block that also had a
 * short travel would be no harder to land than a wide one, and the run would
 * stop tightening exactly when it is supposed to bite.
 */
export const SLIDE_RANGE = 1.15

const SPEED_BASE = 0.85
const SPEED_STEP = 0.055
/**
 * Speed ceiling, in world units per second.
 *
 * Without it the run ends on reflex rather than on skill: past roughly 3.5
 * u/s the block crosses the whole 4% perfect window inside a single 60Hz
 * frame, so a perfect drop stops being something a player can aim for and
 * becomes something that happens to them.
 */
export const SPEED_CAP = 3.2

/** Slide speed at `level`, in world units per second. */
export function speedFor(level: number): number {
  return Math.min(SPEED_BASE + level * SPEED_STEP, SPEED_CAP)
}

/** What a drop did. */
export interface DropResult {
  /** The slab that lands, or null when the block missed entirely. */
  placed: Block | null
  /** The sliced-off overhang, or null on a perfect drop or a miss. */
  chip: Block | null
  /** True when the drop was inside `PERFECT_EPS` and the block kept its size. */
  perfect: boolean
  /** True when there was no overlap at all and the run ends. */
  missed: boolean
}

/** Half-extent of `b` along `axis`. */
function half(b: Block, axis: Axis): number {
  return (axis === 'x' ? b.w : b.d) / 2
}

function centre(b: Block, axis: Axis): number {
  return axis === 'x' ? b.x : b.z
}

/** A copy of `b` with its centre and extent along `axis` replaced. */
function withAxis(b: Block, axis: Axis, c: number, size: number): Block {
  return axis === 'x' ? { x: c, z: b.z, w: size, d: b.d } : { x: b.x, z: c, w: b.w, d: size }
}

/**
 * Drops `moving` onto `top`, slicing off whatever hangs over the edge.
 *
 * `moving` carries `top`'s extents — the renderer spawns it that way — so the
 * overlap is only ever narrower than what it lands on, never wider.
 *
 * The intersection is computed from the two spans rather than from the offset
 * between the centres. Both give the same answer while the widths match, but
 * only the span form stays correct if a caller ever hands this a `moving`
 * block that has been resized, and it is the form that reads as what it is.
 */
export function dropBlock(top: Block, moving: Block, axis: Axis): DropResult {
  const movLo = centre(moving, axis) - half(moving, axis)
  const movHi = centre(moving, axis) + half(moving, axis)
  const topLo = centre(top, axis) - half(top, axis)
  const topHi = centre(top, axis) + half(top, axis)

  const lo = Math.max(movLo, topLo)
  const hi = Math.min(movHi, topHi)
  const overlap = hi - lo

  if (overlap <= 0) {
    return { placed: null, chip: null, perfect: false, missed: true }
  }

  // Perfect: close enough that snapping to the slab below is the honest
  // reading of what the player did. Snapping matters as much as not shrinking
  // — without it a run of near-perfects would drift the tower sideways by
  // fractions of a unit each time and eventually fall off its own base.
  if (Math.abs(centre(moving, axis) - centre(top, axis)) <= PERFECT_EPS) {
    return {
      placed: withAxis(moving, axis, centre(top, axis), half(top, axis) * 2),
      chip: null,
      perfect: true,
      missed: false,
    }
  }

  const placed = withAxis(moving, axis, (lo + hi) / 2, overlap)

  // The overhang is whichever end of the moving block fell outside the
  // overlap. With equal extents only one end can, but taking both keeps this
  // correct for a resized `moving` and costs nothing.
  let chip: Block | null = null
  if (movLo < lo) {
    chip = withAxis(moving, axis, (movLo + lo) / 2, lo - movLo)
  } else if (movHi > hi) {
    chip = withAxis(moving, axis, (hi + movHi) / 2, movHi - hi)
  }

  return { placed, chip, perfect: false, missed: false }
}

/**
 * Where the sliding block sits at time `t` seconds into its level.
 *
 * A triangle wave over `[-SLIDE_RANGE, SLIDE_RANGE]`, starting at the far
 * negative end so every level opens with the block travelling in the same
 * direction — the alternating axis is meant to be what changes between
 * levels, not the phase.
 */
export function slideOffset(t: number, speed: number): number {
  const span = SLIDE_RANGE * 2
  const period = span * 2
  const travelled = ((t * speed) % period + period) % period
  return travelled <= span ? -SLIDE_RANGE + travelled : SLIDE_RANGE + (span - travelled)
}
