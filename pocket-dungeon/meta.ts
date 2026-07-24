// --- Meta-Progression: Persistent data saved to LocalStorage ---

const SAVE_KEY = 'pocket_dungeon_meta'

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
    description: 'Balanced fighter. Sturdy armor and reliable sword.',
    hp: 20, atk: 4, hunger: 100, unlockCost: 0,
  },
  scout: {
    id: 'scout', name: 'Scout',
    description: 'Fast and hungry. Lower HP but higher ATK.',
    hp: 14, atk: 6, hunger: 80, unlockCost: 50,
  },
  alchemist: {
    id: 'alchemist', name: 'Alchemist',
    description: 'Scholarly. Extra hunger but identifies 1 scroll free.',
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
  { id: 'start_sword', name: 'Starter Sword', description: 'Begin runs with a Rusty Sword (+2 ATK).', cost: 30 },
  { id: 'start_food', name: 'Packed Lunch', description: 'Begin runs with +30 bonus hunger.', cost: 40 },
  { id: 'start_potion', name: 'Emergency Potion', description: 'Begin runs with 1 Health Potion.', cost: 25 },
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
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MetaSave>
      return { ...defaultSave(), ...parsed }
    }
  } catch { /* ignore */ }
  return defaultSave()
}

export function saveMeta(meta: MetaSave) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta))
  } catch { /* ignore */ }
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
