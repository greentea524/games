// Per-floor modifiers (#69).
//
// `depth` is threaded through everything that builds a floor — `getBiome`,
// `getSpawnBudget` (literally `depth + 3`), `rollEnemies` — but every use of
// it is monotonic, so floor 8 is floor 3 with more of the same. There is no
// reason to remember a particular floor, and no reason a second run down
// feels different from the first.
//
// A modifier changes one rule for one floor. It is rolled from the run's
// seed, so a seeded run stays reproducible.
import type { RNG } from './rng'

export interface Modifier {
  /** Stable id, used by saves and tests rather than the display name. */
  key: string
  /** Banner headline. Press Start 2P at 8px — keep it short. */
  name: string
  /**
   * One line under the headline saying what actually changed.
   *
   * Press Start 2P is a fixed 8px grid, so the 160px screen fits 20
   * characters edge to edge. Keep these to MAX_BANNER_CHARS — the first draft
   * ran to 19 and filled the screen to within 4px a side.
   */
  blurb: string

  /**
   * Added to `getSpawnBudget(depth)`. The issue specifies Overgrown as
   * `depth + 6` against a baseline of `depth + 3`, which is a flat bonus
   * rather than a multiplier, so that is what this is.
   */
  spawnBudgetBonus?: number
  /** Extra floor items beyond the usual 2-4. */
  extraItems?: number
  /** Multiplies `GameState.hungerDrainRate` for this floor only. */
  hungerRateMultiplier?: number
  /** Scales damage in both directions — yours and theirs. */
  damageMultiplier?: number
  /** Overrides the fog-of-war sight radius (normally 4). */
  sightRadius?: number
  /** Every enemy begins unaware, whatever its AI would normally do. */
  enemiesStartAsleep?: boolean
  /** No food spawns on this floor. */
  suppressFood?: boolean
  /** Guarantees one of the rarest items in the pool. */
  guaranteedRare?: boolean
  /** The stairs are not painted on the map. */
  hideStairs?: boolean
}

interface Weighted {
  weight: number
  modifier: Modifier | null
}

/**
 * The table. `null` is weighted heaviest on purpose — a modifier should be an
 * event, not the norm, or "unmodified" stops being the baseline the player
 * reads everything else against.
 */
export const MODIFIER_TABLE: Weighted[] = [
  { weight: 40, modifier: null },
  {
    weight: 10,
    modifier: {
      key: 'silent_halls',
      name: 'SILENT HALLS',
      blurb: 'Nothing stirs',
      enemiesStartAsleep: true,
    },
  },
  {
    weight: 10,
    modifier: {
      key: 'famine',
      name: 'FAMINE',
      blurb: 'Twice the hunger',
      hungerRateMultiplier: 2,
      suppressFood: true,
    },
  },
  {
    weight: 10,
    modifier: {
      key: 'overgrown',
      name: 'OVERGROWN',
      blurb: 'Rich and crowded',
      spawnBudgetBonus: 3,
      extraItems: 3,
    },
  },
  {
    weight: 10,
    modifier: {
      key: 'brittle',
      name: 'BRITTLE',
      blurb: 'Damage doubled',
      damageMultiplier: 2,
    },
  },
  {
    weight: 10,
    modifier: {
      key: 'gloom',
      name: 'GLOOM',
      blurb: 'The dark closes',
      sightRadius: 2,
      hideStairs: true,
    },
  },
  {
    weight: 10,
    modifier: {
      key: 'treasury',
      name: 'TREASURY',
      blurb: 'Guarded riches',
      guaranteedRare: true,
      spawnBudgetBonus: 3,
    },
  },
]

/**
 * Widest a banner line may be. The screen is 160px and the face is a fixed
 * 8px grid, so 20 fits exactly; 16 leaves a margin that still looks composed.
 */
export const MAX_BANNER_CHARS = 16

/** Floors at or below this play as the plain game, so it can be learned. */
export const MODIFIER_MIN_DEPTH = 3
/** The boss floor. A modifier here would make that fight a coin flip. */
export const BOSS_DEPTH = 12

/**
 * Derives the seed for a floor's modifier roll from the run seed and depth.
 *
 * This has to be a real hash, not `runSeed + depth * someStride`. `RNG` is a
 * linear congruential generator, so its output is affine in its seed: two
 * seeds differing by a constant produce draws differing by a constant, and no
 * number of steps removes that — `S_n` stays affine in `S`. Feeding it
 * `runSeed + depth * stride` therefore walked a fixed ramp, and **every run
 * got the same ordered sequence of modifiers**, merely entering it at a
 * different point. Seeds 1, 2 and 3 were identical floor for floor.
 *
 * That is a nastier bug than it looks, because the distribution stays
 * textbook-correct — each modifier still comes up at its table weight, so
 * nothing short of reading a whole run's sequence reveals it.
 *
 * The mix below is splitmix32's finalizer: xorshift-multiply, which is not
 * affine, so adjacent depths decorrelate. Still fully determined by the run
 * seed, so a seeded run stays reproducible.
 */
export function modifierSeed(runSeed: number, depth: number): number {
  const mix = (n: number): number => {
    let a = n | 0
    a = Math.imul(a ^ (a >>> 16), 2246822507)
    a = Math.imul(a ^ (a >>> 13), 3266489909)
    return (a ^ (a >>> 16)) >>> 0
  }
  return mix(mix(runSeed) ^ mix(Math.imul(depth, 0x9e3779b9)))
}

/**
 * Rolls this floor's modifier, or null for an ordinary floor.
 *
 * Seed the RNG with `modifierSeed()`, never from the map generator's stream:
 * drawing from that would shift every subsequent value and change the dungeon
 * every existing seed produces.
 */
export function rollModifier(depth: number, rng: RNG): Modifier | null {
  if (depth < MODIFIER_MIN_DEPTH) return null
  if (depth >= BOSS_DEPTH) return null

  const total = MODIFIER_TABLE.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = rng.nextFloat(0, total)
  for (const entry of MODIFIER_TABLE) {
    roll -= entry.weight
    if (roll <= 0) return entry.modifier
  }
  return null
}
