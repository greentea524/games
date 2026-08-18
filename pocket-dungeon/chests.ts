import type { RNG } from './rng'
import { ITEMS, type ItemDef } from './items'

/**
 * Chests (#83).
 *
 * Two tiers, and the whole point of two tiers is that the golden one is
 * *meaningfully* better rather than statistically better — so the tables are
 * explicit item lists, not a weight filter over the shared pool. A golden
 * chest can never hand back a Rusty Sword.
 *
 * Scrolls are deliberately absent from both tables. They are in the floor
 * drop pool, but nothing in the game reads `scrollEffect` or ever calls
 * `ScrollIdentifier.identify` — a scroll is currently an inventory slot that
 * does nothing. Putting one in a chest would make opening it a punishment.
 */
export type ChestTier = 'wooden' | 'golden' | 'locked'

interface LootEntry {
  id: string
  weight: number
}

const GOLDEN_TABLE: LootEntry[] = [
  { id: 'potion_big_heal', weight: 4 },
  { id: 'ration', weight: 3 },
  { id: 'iron_blade', weight: 3 },
  { id: 'chain_mail', weight: 3 },
  { id: 'flame_brand', weight: 2 },
  { id: 'plate_armor', weight: 2 },
  { id: 'band_mending', weight: 2 },
  { id: 'coin_lucky', weight: 2 },
]

const CHEST_TABLES: Record<ChestTier, LootEntry[]> = {
  // Consumables and starter gear. This is the chest you open on floor 1.
  wooden: [
    { id: 'potion_heal', weight: 5 },
    { id: 'bread', weight: 4 },
    { id: 'meat', weight: 3 },
    { id: 'rusty_sword', weight: 3 },
    { id: 'leather_vest', weight: 3 },
    { id: 'ring_bronze', weight: 2 },
  ],
  // No entry here overlaps the wooden table's gear, so opening a golden chest
  // cannot hand back something the wooden tier already gives.
  golden: GOLDEN_TABLE,
  // Locked chests (#59) draw from the same table rather than a fourth tier of
  // gear. The golden table already holds the best weapon, the best armour and
  // the best potion in the game, so "better than golden" cannot mean better
  // items without inventing top-tier gear this issue did not ask for. It
  // means *more* of them — see LOOT_PER_CHEST.
  locked: GOLDEN_TABLE,
}

/**
 * How many items a chest of each tier yields.
 *
 * This is where a locked chest earns the key it costs. Two draws from the
 * golden table is a real step up from one, and it stays honest about the fact
 * that there is nothing rarer than a Flame Brand to hand out.
 */
export const LOOT_PER_CHEST: Record<ChestTier, number> = {
  wooden: 1,
  golden: 1,
  locked: 2,
}

/** Every item id either table can produce, for checks and for tooling. */
export function chestLootIds(tier: ChestTier): string[] {
  return CHEST_TABLES[tier].map((e) => e.id)
}

/**
 * What one chest of this tier contains.
 *
 * Returns a copy, the same way `rollFloorItems` does — floor items are mutated
 * in place when picked up, and handing out the shared `ITEMS` object would let
 * one pickup edit the item database for the rest of the run.
 */
export function rollChestLoot(tier: ChestTier, rng: RNG): ItemDef[] {
  const table = CHEST_TABLES[tier]
  const total = table.reduce((s, e) => s + e.weight, 0)
  const draw = (): ItemDef => {
    let roll = rng.nextFloat(0, total)
    for (const entry of table) {
      roll -= entry.weight
      if (roll <= 0) return { ...ITEMS[entry.id] }
    }
    return { ...ITEMS[table[table.length - 1].id] }
  }
  return Array.from({ length: LOOT_PER_CHEST[tier] }, draw)
}

/**
 * How many chests of each tier this floor gets.
 *
 * Wooden chests are the baseline. Golden ones are a depth curve rather than a
 * flat chance, so the vault floors feel different from the cellar without
 * needing separate tables per biome.
 *
 * @param guaranteedGolden Set by the Treasury modifier (#69), which already
 *   guarantees a rare floor drop; a chest is the more legible version of the
 *   same promise.
 */
export function rollChests(depth: number, rng: RNG, guaranteedGolden = false): ChestTier[] {
  const chests: ChestTier[] = []
  const woodenCount = rng.nextInt(1, 2)
  for (let i = 0; i < woodenCount; i++) chests.push('wooden')

  if (guaranteedGolden) {
    chests.push('golden')
  } else if (rng.nextFloat(0, 1) < GOLDEN_CHANCE_BASE + depth * GOLDEN_CHANCE_PER_DEPTH) {
    chests.push('golden')
  }

  // Locked chests start at the catacombs. Floors 1-4 are where the game is
  // learned, and a chest you cannot open is a poor first lesson — the same
  // reasoning that keeps the Bonepile out of the cellar (#60).
  if (depth >= LOCKED_MIN_DEPTH && rng.nextFloat(0, 1) < LOCKED_CHANCE) {
    chests.push('locked')
  }
  return chests
}

/** Floor 1 sits at 13%, floor 12 at 45%. */
export const GOLDEN_CHANCE_BASE = 0.1
export const GOLDEN_CHANCE_PER_DEPTH = 0.029

export const LOCKED_MIN_DEPTH = 5
export const LOCKED_CHANCE = 0.35

/**
 * How many keys a floor should place, given the chests it rolled (#59).
 *
 * One per locked chest, always. A locked chest whose key is left to a
 * weighted roll is a chest that is dead content on the floors where the roll
 * misses, which is the opposite of what the feature is for. Keys carry over
 * between floors, so a spare is never wasted — it just opens something later.
 */
export function keysForFloor(chests: ChestTier[]): number {
  return chests.filter((c) => c === 'locked').length
}
