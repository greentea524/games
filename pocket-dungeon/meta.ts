// --- Meta-Progression: Persistent data saved to LocalStorage ---

import { loadSave, saveSave } from '../shared/storage'
import { ITEMS, type ItemDef } from './items'

const SAVE_KEY = 'pocket_dungeon_meta'
const SAVE_VERSION = 1

export type ClassName = 'knight' | 'scout' | 'alchemist'

export interface ClassDef {
  id: ClassName
  name: string
  description: string
  hp: number
  atk: number
  hunger: number
  unlockCost: number // 0 = unlocked by default
}

export const CLASSES: Record<ClassName, ClassDef> = {
  knight: {
    id: 'knight', name: 'Knight',
    description: 'Balanced. Sturdy armor.',
    hp: 20, atk: 4, hunger: 100, unlockCost: 0,
  },
  scout: {
    id: 'scout', name: 'Scout',
    description: 'Fast. Low HP, high ATK.',
    hp: 14, atk: 6, hunger: 80, unlockCost: 50,
  },
  alchemist: {
    id: 'alchemist', name: 'Alchemist',
    description: 'Scholarly. IDs 1 scroll.',
    hp: 16, atk: 3, hunger: 120, unlockCost: 80,
  },
}

export interface ShopItem {
  id: string
  name: string
  description: string
  cost: number
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'start_sword', name: 'Rusty Sword', description: 'Begin runs with a Rusty Sword (+2 ATK).', cost: 30 },
  { id: 'start_food', name: 'Lunch Box', description: 'Begin runs with +30 bonus hunger.', cost: 40 },
  { id: 'start_potion', name: 'Potion', description: 'Begin runs with 1 Health Potion.', cost: 25 },
]

export interface RunStats {
  date: string
  className: ClassName
  floorsCleared: number
  turnsUsed: number
  goldEarned: number
  victory: boolean
}

export interface MetaSave {
  gold: number
  unlockedClasses: ClassName[]
  purchasedItems: string[]
  bestFloor: number
  totalRuns: number
  totalVictories: number
  runHistory: RunStats[]
  /**
   * Gear the *last* run ended holding (#86). Replaced wholesale each run
   * rather than appended to: a growing list would turn the shop into a
   * museum of every sword ever equipped, and the point is that a run's
   * findings are recoverable until the next run overwrites them.
   */
  recovered: string[]
  /**
   * The one item bought back out of `recovered`, waiting to be handed over.
   * Granted at the start of the next run and cleared — see `takeKeepsake`.
   */
  keepsake: string | null
}

function defaultSave(): MetaSave {
  return {
    gold: 0,
    unlockedClasses: ['knight'],
    purchasedItems: [],
    bestFloor: 0,
    totalRuns: 0,
    totalVictories: 0,
    runHistory: [],
    recovered: [],
    keepsake: null,
  }
}

export function loadMeta(): MetaSave {
  // No try/catch: loadSave does not throw, which is the reason it exists.
  //
  // Spreading over the defaults means a field missing from an older save gets
  // its default rather than becoming undefined, so no version gate is applied
  // here — every field is optional by construction.
  return loadSave(SAVE_KEY, SAVE_VERSION, defaultSave(), (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    return { ...defaultSave(), ...(payload as Partial<MetaSave>) }
  })
}

export function saveMeta(meta: MetaSave) {
  saveSave(SAVE_KEY, SAVE_VERSION, meta)
}

export function addGold(amount: number) {
  const meta = loadMeta()
  meta.gold += amount
  saveMeta(meta)
}

export function recordRun(stats: RunStats) {
  const meta = loadMeta()
  meta.totalRuns++
  if (stats.victory) meta.totalVictories++
  if (stats.floorsCleared > meta.bestFloor) meta.bestFloor = stats.floorsCleared
  meta.gold += stats.goldEarned
  meta.runHistory.push(stats)
  // Keep last 20 runs
  if (meta.runHistory.length > 20) meta.runHistory.shift()
  saveMeta(meta)
}

export function unlockClass(className: ClassName): boolean {
  const meta = loadMeta()
  const classDef = CLASSES[className]
  if (meta.unlockedClasses.includes(className)) return false
  if (meta.gold < classDef.unlockCost) return false
  meta.gold -= classDef.unlockCost
  meta.unlockedClasses.push(className)
  saveMeta(meta)
  return true
}

export function purchaseShopItem(itemId: string): boolean {
  const meta = loadMeta()
  const item = SHOP_ITEMS.find(i => i.id === itemId)
  if (!item) return false
  if (meta.purchasedItems.includes(itemId)) return false
  if (meta.gold < item.cost) return false
  meta.gold -= item.cost
  meta.purchasedItems.push(itemId)
  saveMeta(meta)
  return true
}

// --- Carry-over between runs (#86) ------------------------------------------
//
// Gold already carried over: `recordRun` banks the whole run's take on death
// and on victory alike, and the shop spends it. What did not carry was
// anything you *found* — a Flame Brand pulled out of a golden chest on floor
// 11 died with you and left no trace, so a deep run and a shallow one were
// worth exactly the same amount of gold and nothing else.
//
// The shape here is a rental, not a ratchet:
//
//   - only the last run's gear is recoverable, so nothing accumulates;
//   - exactly one item can be held at a time, so nothing compounds;
//   - it is consumed when the next run starts, so it is bought again each
//     time, competing with the class unlocks for the same gold.
//
// That last point is what keeps it from trivialising the early floors. A
// Flame Brand every run costs 40 gold every run; the Scout costs 80 once.

/** Categories worth carrying. Consumables are not — see `recoverGear`. */
const RECOVERABLE: ReadonlySet<string> = new Set(['weapon', 'armor', 'accessory'])

/**
 * What a recovered item costs to buy back.
 *
 * Derived from the item's own bonus rather than written down per item, so a
 * new sword is priced the moment it is added. The scale is set against the
 * existing shop: the cheapest recovery is 20 and the dearest 40, which brackets
 * the 25-40 permanent unlocks and sits under the 50-80 class unlocks. A Rusty
 * Sword recovered for one run at 20 is deliberately worse value than the 30
 * that buys one at the start of *every* run.
 */
export function keepsakeCost(def: ItemDef): number {
  if (def.atkBonus) return 10 + def.atkBonus * 5
  if (def.defBonus) return 10 + def.defBonus * 2
  return 30
}

/**
 * Records what a finished run was wearing.
 *
 * Consumables are left out on purpose. Recovering a loaf of bread is not
 * progression, and the shop already sells a starting potion; gear is the
 * thing a run finds that a run currently loses.
 */
export function recoverGear(ids: (string | null | undefined)[]) {
  const meta = loadMeta()
  meta.recovered = ids.filter(
    (id): id is string => !!id && !!ITEMS[id] && RECOVERABLE.has(ITEMS[id].category),
  )
  saveMeta(meta)
}

/**
 * Buys one recovered item back, replacing whatever was already held.
 *
 * Replacing rather than refusing is the kinder failure: a player who buys the
 * armour and then wants the sword instead would otherwise be stuck with a
 * decision they cannot see the consequences of yet. The gold is spent either
 * way, so this cannot be used to hold two.
 */
export function buyKeepsake(itemId: string): boolean {
  const meta = loadMeta()
  if (!meta.recovered.includes(itemId)) return false
  const def = ITEMS[itemId]
  if (!def) return false
  const cost = keepsakeCost(def)
  if (meta.gold < cost) return false
  meta.gold -= cost
  meta.keepsake = itemId
  saveMeta(meta)
  return true
}

/**
 * Hands the keepsake over and clears it, so it is held for exactly one run.
 *
 * Clearing here rather than at the end of the run matters: a run abandoned by
 * closing the tab has already been paid for, and the item should still be
 * waiting.
 */
export function takeKeepsake(): ItemDef | null {
  const meta = loadMeta()
  if (!meta.keepsake) return null
  const def = ITEMS[meta.keepsake] ?? null
  meta.keepsake = null
  saveMeta(meta)
  return def
}
