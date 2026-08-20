import { BOSS_DEPTHS, BOSS_FLOORS, type BossDef } from './bosses'
import { getBiome } from './enemies'

/**
 * The Relic Hunt (#84).
 *
 * The game already had a victory: walk onto the stairs on floor 12 and the
 * run ends in VICTORY. What it did not have was a victory you had to *earn*.
 * Every enemy in this game is optional — you can walk past all of them,
 * including all three bosses from #85, because the boss spawns beside the
 * stairs rather than on them. A perfect run and a run that ran away from
 * everything ended on the same screen.
 *
 * A relic per boss turns that around. The relics are the win condition, the
 * bosses are the only source, and the stairs off a boss floor stay shut until
 * that floor's boss is down — so the three fights are the run.
 *
 * ## Why bosses only
 *
 * The issue says "Bosses or special chests every 5 floors". Chests are the
 * problem half. `rollChests` places them at random and the locked tier needs
 * a key that is itself a random drop, so a chest-sourced relic cannot be
 * promised to the player. The moment the target can exceed what a run is
 * guaranteed to offer, the win condition becomes unreachable through no
 * fault of the player's — which is worse than the unconditional victory this
 * replaces, not better.
 *
 * Bosses are guaranteed: one per boss floor, and #85's schedule puts one at
 * the end of every biome. So the target is exactly the number of relics a
 * run contains, and `relics_test.ts` asserts that rather than trusting it.
 *
 * ## Why "every 5 floors" is not the schedule
 *
 * Same reason as #85. The biomes are cellar 1-4, catacomb 5-8, vault 9-12;
 * 5 and 10 are the *first* floor of two of them. One relic per biome is the
 * structure the game already has.
 */
export interface RelicDef {
  id: string
  name: string
  /** Shown when the relic is examined or picked up. Fits the 20-char HUD. */
  blurb: string
  /** The boss that carries it — the only source. */
  bossId: string
  /** The floor that boss stands on, mirrored here for lookups and checks. */
  floor: number
  /** Which biome's relic this is, for the summary line. */
  biome: string
}

const NAMES: Record<string, { id: string; name: string; blurb: string }> = {
  cellar_brute: { id: 'ember_seal', name: 'Ember Seal', blurb: 'Still warm' },
  bone_choir: { id: 'chorus_bell', name: 'Chorus Bell', blurb: 'It hums alone' },
  vault_guardian: { id: 'vault_core', name: 'Vault Core', blurb: 'The way out' },
}

/**
 * Built from the boss schedule rather than written beside it. If #85's table
 * gains a fourth boss, this gains a fourth relic and the target moves with
 * it — the alternative is two lists that agree until one of them is edited.
 */
export const RELICS: RelicDef[] = BOSS_DEPTHS.map((floor) => {
  const boss: BossDef = BOSS_FLOORS[floor]
  const named = NAMES[boss.id]
  if (!named) {
    throw new Error(`boss ${boss.id} (floor ${floor}) has no relic — add one to NAMES`)
  }
  return { ...named, bossId: boss.id, floor, biome: getBiome(floor) }
})

/** How many are needed to escape: all of them, because all of them exist. */
export const RELIC_TARGET = RELICS.length

/**
 * The floor the run ends on.
 *
 * Derived from the boss schedule rather than written down again. `modifiers.ts`
 * already holds this number as `BOSS_DEPTH`, whose own comment admits the name
 * means "the end of the run" rather than "a floor with a boss on it"; the two
 * are asserted equal in `relics_test.ts` so they cannot drift apart while both
 * exist.
 */
export const FINAL_DEPTH = Math.max(...BOSS_DEPTHS)

export function relicForBoss(bossId: string): RelicDef | null {
  return RELICS.find((r) => r.bossId === bossId) ?? null
}

export function relicById(id: string): RelicDef | null {
  return RELICS.find((r) => r.id === id) ?? null
}

/** Whether the escape portal should be open. */
export function hasAllRelics(held: readonly string[]): boolean {
  return RELICS.every((r) => held.includes(r.id))
}

/**
 * On-screen copy, kept here rather than inline in the scene so the width
 * check in `relics_test.ts` can reach it.
 *
 * Press Start 2P is a fixed 8px grid on a 160px screen, so 20 characters fill
 * it exactly and `MAX_BANNER_CHARS` (16) is the margin the modifier banners
 * already hold to. These lines are centred on a tile rather than on the
 * screen, so they have less room than that, not more.
 */
export const RELIC_COPY = {
  portalTitle: 'ESCAPE PORTAL',
  portalBody: 'On the stairs',
  sealedTitle: 'SEALED',
  /** Shown when a living boss holds the floor's stairs. */
  sealedByBoss: 'Kill the boss',
  /** Shown on the final floor, where there is no floor below to reach. */
  sealedAtBottom: 'Nothing below',
} as const
