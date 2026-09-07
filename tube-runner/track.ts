// Tube Runner's rules, with no three.js in sight (#111).
//
// The whole of the game's difficulty is that a gap resolves late: it
// foreshortens as it approaches and only reads clearly once it is close. That
// is what earns the third dimension, and it is also what makes the generator
// the dangerous part. #111 names it: "a randomly placed ring sequence will
// sometimes be unreadable and feel cheap".
//
// The answer is not to tune the randomness until it feels fair. It is to
// derive the bound — how far a gap may move between one ring and the next —
// from the numbers that decide whether the player can physically get there,
// and then to assert that the generator never breaks it. `track_test.ts` does
// exactly that, and it is `qa:units`-shaped: pure arithmetic, no browser.
//
// Angles are radians around the tube. Distances are world units along it.

/**
 * Radius of the tube. The player runs around its inside surface.
 *
 * Used only by the renderer — every fairness number below is derived from
 * `ROTATE_SPEED` and `RING_SPACING`, which are an angular rate and a distance
 * along the tube, so widening the tube changes how the game looks and not one
 * thing about whether a track is playable.
 */
export const TUBE_RADIUS = 2.2

/** Distance between consecutive obstacle rings. */
export const RING_SPACING = 6

/**
 * How fast the player can swing around the tube, in radians per second.
 *
 * This is the number every fairness claim below is ultimately derived from —
 * it is the player's entire physical capability, since rotating is the only
 * verb the game has.
 */
export const ROTATE_SPEED = 3.6

/** Half the angular width of a ring's gap. A gap spans about 70 degrees. */
export const GAP_HALF = 0.61

/**
 * Half the angular width of the player.
 *
 * Included in the collision test rather than treating the player as a point:
 * clipping the edge of a ring with your shoulder has to count, or the gap is
 * effectively wider than it looks and the game reads as loose.
 */
export const PLAYER_HALF = 0.18

/**
 * The radial band an obstacle ring is solid across, as a fraction of
 * `TUBE_RADIUS`, and the radius the player runs at.
 *
 * These live here, beside the collision test, because they are what makes that
 * test *true* rather than merely self-consistent — and the first version got it
 * wrong in a way nothing could see.
 *
 * `clearsRing` compares angles and nothing else. That is only a correct model
 * of "did the player hit the ring" if the player actually occupies the radius
 * the ring is solid at. Originally the ring was an annulus from 1.76 to 2.20
 * and the player was the camera, at 0.35 — flying through the wide-open hole
 * in the middle of every ring, while the game decided crashes from an angle
 * they never physically tested. It played as a hitbox that fired at nothing,
 * because that is what it was.
 *
 * `track_test.ts` asserts the player's whole radial extent lies inside the
 * band, so the two can never drift apart again.
 */
export const RING_INNER_FACTOR = 0.7
export const RING_OUTER_FACTOR = 1
export const RING_INNER_RADIUS = TUBE_RADIUS * RING_INNER_FACTOR
export const RING_OUTER_RADIUS = TUBE_RADIUS * RING_OUTER_FACTOR

/**
 * The runner stands on the inside surface of the tube, and reaches inward
 * toward the axis.
 *
 * Stated as feet-on-the-wall plus a height rather than as a centre plus a
 * half-thickness, because the second version got it wrong: a runner's "up" is
 * toward the axis, so a body described as `radius +/- half` put its head
 * *outside* the tube and its feet floating, and the number the check compared
 * against described nothing that existed. Feet and height are what the mesh
 * is actually built from, so they are what the check should be built from too.
 */
export const PLAYER_FOOT_RADIUS = TUBE_RADIUS
export const PLAYER_HEIGHT = 0.5
/** The innermost radius any part of the runner reaches — the top of the head. */
export const PLAYER_INNER_RADIUS = PLAYER_FOOT_RADIUS - PLAYER_HEIGHT

const SPEED_BASE = 7
const SPEED_STEP = 0.22
/**
 * Fastest the run gets, in world units per second.
 *
 * A cap is not optional here. Speed shortens the time between rings, which is
 * the numerator of the reachability bound below — uncapped, the bound falls
 * to zero and every ring would have to reuse the previous gap exactly, which
 * is a game that stops being a game before it stops being winnable.
 */
export const SPEED_CAP = 14

/** Forward speed once `ringsPassed` rings are behind the player. */
export function speedAt(ringsPassed: number): number {
  return Math.min(SPEED_BASE + ringsPassed * SPEED_STEP, SPEED_CAP)
}

/**
 * The fraction of the theoretically available rotation the generator will use.
 *
 * The player does not begin turning the instant a ring is behind them: they
 * have to read the next gap out of a foreshortened ring first. Spending the
 * whole budget would produce sequences that are *exactly* reachable by a
 * player who reacted with no delay at all, which is nobody. The quarter held
 * back here is that reaction time.
 */
export const REACTION_FRACTION = 0.75

/**
 * How far the gap may move between two rings at `speed`, in radians.
 *
 * The derivation is the entire fairness argument, and it is short: at `speed`,
 * consecutive rings are `RING_SPACING / speed` seconds apart; in that time the
 * player covers `ROTATE_SPEED` radians per second; keep `REACTION_FRACTION`
 * of it.
 *
 * Capped at PI because that is the furthest any two angles can be apart — past
 * that the shorter way round is the other way, and a "bound" larger than PI
 * would not bound anything.
 */
export function reachableDelta(speed: number): number {
  return Math.min(Math.PI, ROTATE_SPEED * (RING_SPACING / speed) * REACTION_FRACTION)
}

/**
 * The smallest move the generator will ask for.
 *
 * Without a floor the sequence drifts toward gaps that barely move and the run
 * turns into holding one angle, which is the failure mode on the other side of
 * the one #111 warns about. Yielded to the bound when the two conflict: at the
 * speed cap fairness wins over interest.
 */
export const MIN_DELTA = 0.35

/** Shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

/** Wraps an angle into [0, 2PI). */
export function normaliseAngle(a: number): number {
  const t = a % (Math.PI * 2)
  return t < 0 ? t + Math.PI * 2 : t
}

/**
 * Where the next ring's gap goes.
 *
 * `rand` returns [0, 1); it is a parameter so the tests can drive this with a
 * seeded sequence and so a run is reproducible if that is ever wanted.
 *
 * The move is drawn from the reachable band, with the small moves in the
 * middle excluded rather than the band simply being narrowed — narrowing it
 * would throw away the interesting end of the range to remove the dull one.
 */
export function nextGap(previous: number, speed: number, rand: () => number): number {
  const bound = reachableDelta(speed)
  const floor = Math.min(MIN_DELTA, bound)
  const magnitude = floor + rand() * (bound - floor)
  const direction = rand() < 0.5 ? -1 : 1
  return normaliseAngle(previous + magnitude * direction)
}

/**
 * Builds a whole sequence of gap angles.
 *
 * The generator is deterministic given `rand`, and the renderer uses it to
 * fill a pool rather than allocating rings mid-run.
 */
export function generateGaps(count: number, rand: () => number, first = 0): number[] {
  const gaps = [normaliseAngle(first)]
  for (let i = 1; i < count; i++) {
    gaps.push(nextGap(gaps[i - 1], speedAt(i - 1), rand))
  }
  return gaps
}

/**
 * Whether the player at `playerAngle` clears a ring whose gap is at `gapAngle`.
 *
 * The player's whole width has to be inside the gap, not just their centre —
 * see `PLAYER_HALF`. No physics engine and no raycast: the ring is an
 * annulus and the player is an arc on it, so clearing it is one angular
 * comparison, which is what keeps this game as small as #111 asks.
 */
export function clearsRing(playerAngle: number, gapAngle: number): boolean {
  return Math.abs(angleDelta(playerAngle, gapAngle)) <= GAP_HALF - PLAYER_HALF
}

/**
 * A small deterministic generator, so a run can be replayed and a test can be
 * driven with the same numbers twice.
 *
 * mulberry32 — short, and good enough for choosing angles.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
