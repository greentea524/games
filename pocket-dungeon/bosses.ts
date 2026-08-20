import { getBiome } from './enemies'

/**
 * Boss encounters (#85).
 *
 * One boss already existed — the Vault Guardian on floor 12, with the phase
 * machine in `boss.ts`. What was missing is the rest of the idea: a boss on
 * more than the last floor, more than one of them, and loot worth the fight.
 *
 * The issue suggests "every 5th or 10th floor". A run is twelve floors and
 * the biomes are cellar 1-4, catacomb 5-8, vault 9-12, so 5 and 10 would put
 * a boss on the *first* floor of two biomes and none at the end of the first.
 * These sit on the last floor of each biome instead: the fight is the door
 * out, which is what a boss is for, and it falls out of a structure the game
 * already has rather than a number chosen from outside it.
 */
export interface BossDef {
  id: string
  name: string
  hp: number
  atk: number
  /** BootScene texture key, minus the palette suffix. */
  spriteKey: string
  /**
   * Item id dropped on death. Drawn from the golden chest tier — the issue
   * asks for "Relics or high-tier equipment", and relics do not exist yet
   * (#84 is where they are meant to come from).
   */
  drop: string
  /** Gold on death, well above the 3 a normal kill pays. */
  gold: number
}

/**
 * Floor -> boss. Keyed by depth rather than by biome so a floor can be looked
 * up in one step and so the table reads as a schedule.
 */
export const BOSS_FLOORS: Record<number, BossDef> = {
  4: {
    id: 'cellar_brute',
    name: 'Cellar Brute',
    hp: 22,
    atk: 4,
    spriteKey: 'boss_brute',
    drop: 'chain_mail',
    gold: 12,
  },
  8: {
    id: 'bone_choir',
    name: 'Bone Choir',
    hp: 32,
    atk: 5,
    spriteKey: 'boss_choir',
    drop: 'iron_blade',
    gold: 16,
  },
  12: {
    // The original, unchanged in stats so an existing run plays the same.
    id: 'vault_guardian',
    name: 'Vault Guardian',
    hp: 40,
    atk: 6,
    spriteKey: 'boss',
    drop: 'flame_brand',
    gold: 20,
  },
}

export const BOSS_DEPTHS = Object.keys(BOSS_FLOORS)
  .map(Number)
  .sort((a, b) => a - b)

export function bossForFloor(depth: number): BossDef | null {
  return BOSS_FLOORS[depth] ?? null
}

export function isBossFloor(depth: number): boolean {
  return bossForFloor(depth) !== null
}

/**
 * The last floor of each biome, derived rather than written down.
 *
 * Used only by the checks: if the biome boundaries in `enemies.ts` ever move,
 * the boss schedule should move with them, and a test that hardcodes 4/8/12
 * would not notice.
 */
export function biomeFinalFloors(maxDepth = 12): number[] {
  const out: number[] = []
  for (let d = 1; d <= maxDepth; d++) {
    if (d === maxDepth || getBiome(d) !== getBiome(d + 1)) out.push(d)
  }
  return out
}
