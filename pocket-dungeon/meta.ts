// --- Meta-Progression: Persistent data saved to LocalStorage ---

import { loadSave, saveSave } from '../shared/storage'

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
