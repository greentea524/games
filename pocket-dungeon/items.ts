import { RNG } from './rng'

// --- Item Types ---

export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'accessory'
  | 'food'
  | 'potion'
  | 'scroll'
  | 'rewind'

/**
 * What an accessory does while worn (#82). Data, not code, so the effect is
 * visible next to the item that grants it and testable without a scene.
 *
 * Every value here is chosen to stay integral. Hunger and gold are both
 * rendered as whole numbers in a 160px HUD, so a 0.5x hunger rate or a 1.5x
 * gold multiplier would put "FD:99.5" and "+4.5g" on screen.
 */
export interface AccessoryPassive {
  /** Hunger drains on alternate turns rather than every turn. */
  halfHunger?: boolean
  /** Restores 1 HP once every this many turns. */
  regenEvery?: number
  /** Multiplies gold dropped by kills. Whole numbers only. */
  goldMultiplier?: number
}

export interface ItemDef {
  id: string
  name: string
  category: ItemCategory
  description: string
  // Stat effects
  atkBonus?: number
  defBonus?: number
  healAmount?: number
  hungerRestore?: number
  // Accessory-specific
  passive?: AccessoryPassive
  // Scroll-specific
  scrollEffect?: string
  // Drop weight per biome tier (higher = more common)
  weight: number
}

// --- Item Database ---

export const ITEMS: Record<string, ItemDef> = {
  // Weapons
  rusty_sword: {
    id: 'rusty_sword', name: 'Rusty Sword', category: 'weapon',
    description: 'A dull blade. +2 ATK', atkBonus: 2, weight: 5,
  },
  iron_blade: {
    id: 'iron_blade', name: 'Iron Blade', category: 'weapon',
    description: 'A sturdy sword. +4 ATK', atkBonus: 4, weight: 3,
  },
  flame_brand: {
    id: 'flame_brand', name: 'Flame Brand', category: 'weapon',
    description: 'Burns on contact. +6 ATK', atkBonus: 6, weight: 1,
  },

  // Armor
  leather_vest: {
    id: 'leather_vest', name: 'Leather Vest', category: 'armor',
    description: 'Basic protection. +5 Max HP', defBonus: 5, weight: 5,
  },
  chain_mail: {
    id: 'chain_mail', name: 'Chain Mail', category: 'armor',
    description: 'Solid armor. +10 Max HP', defBonus: 10, weight: 3,
  },
  plate_armor: {
    id: 'plate_armor', name: 'Plate Armor', category: 'armor',
    description: 'Heavy plate. +15 Max HP', defBonus: 15, weight: 1,
  },

  // Accessories (#82). Rarer than weapons and armour, because a passive runs
  // for the rest of the floor rather than for one swing.
  ring_bronze: {
    id: 'ring_bronze', name: 'Bronze Ring', category: 'accessory',
    description: 'Hunger drains half as fast.',
    passive: { halfHunger: true }, weight: 3,
  },
  band_mending: {
    id: 'band_mending', name: 'Mending Band', category: 'accessory',
    description: 'Restores 1 HP every 8 turns.',
    passive: { regenEvery: 8 }, weight: 2,
  },
  coin_lucky: {
    id: 'coin_lucky', name: 'Lucky Coin', category: 'accessory',
    description: 'Doubles gold from kills.',
    passive: { goldMultiplier: 2 }, weight: 2,
  },

  // Food
  bread: {
    id: 'bread', name: 'Bread', category: 'food',
    description: 'Restores 30 hunger.', hungerRestore: 30, weight: 6,
  },
  meat: {
    id: 'meat', name: 'Roast Meat', category: 'food',
    description: 'Restores 50 hunger.', hungerRestore: 50, weight: 3,
  },
  ration: {
    id: 'ration', name: 'Travel Ration', category: 'food',
    description: 'Restores 70 hunger.', hungerRestore: 70, weight: 2,
  },

  // Potions
  potion_heal: {
    id: 'potion_heal', name: 'Health Potion', category: 'potion',
    description: 'Heals 10 HP.', healAmount: 10, weight: 5,
  },
  potion_big_heal: {
    id: 'potion_big_heal', name: 'Greater Potion', category: 'potion',
    description: 'Heals 25 HP.', healAmount: 25, weight: 2,
  },

  // Scrolls (unidentified until first use)
  scroll_fire: {
    id: 'scroll_fire', name: '???', category: 'scroll',
    description: 'Unknown scroll.', scrollEffect: 'fire', weight: 3,
  },
  scroll_teleport: {
    id: 'scroll_teleport', name: '???', category: 'scroll',
    description: 'Unknown scroll.', scrollEffect: 'teleport', weight: 3,
  },
  scroll_map: {
    id: 'scroll_map', name: '???', category: 'scroll',
    description: 'Unknown scroll.', scrollEffect: 'map', weight: 3,
  },
  scroll_strength: {
    id: 'scroll_strength', name: '???', category: 'scroll',
    description: 'Unknown scroll.', scrollEffect: 'strength', weight: 2,
  },

  // Turn Rewind (1 per floor)
  hourglass: {
    id: 'hourglass', name: 'Hourglass', category: 'rewind',
    description: 'Rewind 1 turn. 1 per floor.', weight: 0, // Special spawn, not random
  },
}

// Real names revealed after first use
export const SCROLL_REAL_NAMES: Record<string, string> = {
  fire: 'Scroll of Fire',
  teleport: 'Scroll of Teleport',
  map: 'Scroll of Mapping',
  strength: 'Scroll of Strength',
}

// --- Scroll Identification System ---
// Each run shuffles which cryptic label maps to which real scroll
const CRYPTIC_LABELS = [
  'XYZZY', 'PLUGH', 'FROTZ', 'GNUSTO',
  'REZROV', 'BLORB', 'NITFOL', 'KULCAD',
]

export class ScrollIdentifier {
  // Maps scrollEffect -> cryptic label for this run
  private labelMap: Map<string, string> = new Map()
  // Tracks which scroll effects have been identified
  private identified: Set<string> = new Set()

  constructor(rng: RNG) {
    const effects = ['fire', 'teleport', 'map', 'strength']
    const shuffled = rng.shuffle([...CRYPTIC_LABELS])
    effects.forEach((eff, i) => {
      this.labelMap.set(eff, shuffled[i])
    })
  }

  getDisplayName(item: ItemDef): string {
    if (item.category !== 'scroll' || !item.scrollEffect) return item.name
    if (this.identified.has(item.scrollEffect)) {
      return SCROLL_REAL_NAMES[item.scrollEffect]
    }
    return `"${this.labelMap.get(item.scrollEffect)}" Scroll`
  }

  identify(effect: string) {
    this.identified.add(effect)
  }

  isIdentified(effect: string): boolean {
    return this.identified.has(effect)
  }
}

// --- Inventory ---

export interface InventoryItem {
  def: ItemDef
  quantity: number
}

export class Inventory {
  items: InventoryItem[] = []
  equippedWeapon: ItemDef | null = null
  equippedArmor: ItemDef | null = null
  equippedAccessory: ItemDef | null = null
  readonly maxSize = 8

  add(def: ItemDef): boolean {
    // Stack consumables
    if (def.category === 'food' || def.category === 'potion' || def.category === 'scroll' || def.category === 'rewind') {
      const existing = this.items.find(i => i.def.id === def.id)
      if (existing) {
        existing.quantity++
        return true
      }
    }
    if (this.items.length >= this.maxSize) return false
    this.items.push({ def, quantity: 1 })
    return true
  }

  remove(defId: string): boolean {
    const idx = this.items.findIndex(i => i.def.id === defId)
    if (idx === -1) return false
    this.items[idx].quantity--
    if (this.items[idx].quantity <= 0) {
      this.items.splice(idx, 1)
    }
    return true
  }

  has(defId: string): boolean {
    return this.items.some(i => i.def.id === defId && i.quantity > 0)
  }
}

// --- Floor Item Drops ---

/**
 * Rolls this floor's item drops.
 *
 * `_depth` is accepted and ignored: loot is currently identical on floor 1 and
 * floor 12. The caller already passes the depth, so scaling it is a data
 * change rather than a signature change — but choosing that curve is design
 * work, not a cleanup, so it is left as-is and named to say so.
 */
/**
 * @param opts Floor-modifier adjustments (#69): `extra` adds items beyond the
 *   usual 2-4, `suppressFood` drops everything that restores hunger (Famine),
 *   and `guaranteedRare` appends one of the scarcest items in the pool
 *   (Treasury). "Rare" is defined by spawn weight, since the pool has no
 *   rarity tier of its own.
 */
export function rollFloorItems(
  _depth: number,
  rng: RNG,
  opts: { extra?: number; suppressFood?: boolean; guaranteedRare?: boolean } = {},
): ItemDef[] {
  let pool = Object.values(ITEMS).filter(i => i.weight > 0)
  if (opts.suppressFood) {
    pool = pool.filter(i => !i.hungerRestore)
  }
  const count = rng.nextInt(2, 4) + (opts.extra ?? 0)
  const result: ItemDef[] = []

  const totalWeight = pool.reduce((s, i) => s + i.weight, 0)

  for (let c = 0; c < count; c++) {
    let roll = rng.nextFloat(0, totalWeight)
    for (const item of pool) {
      roll -= item.weight
      if (roll <= 0) {
        result.push({ ...item })
        break
      }
    }
  }

  // Always add 1 hourglass per floor
  result.push({ ...ITEMS.hourglass })

  if (opts.guaranteedRare && pool.length > 0) {
    const rarest = pool.reduce((a, b) => (b.weight < a.weight ? b : a))
    result.push({ ...rarest })
  }

  return result
}

// --- Command Pattern for Turn Rewind ---

export interface TurnSnapshot {
  playerTX: number
  playerTY: number
  playerHp: number
  hunger: number
  turnsCount: number
  enemyStates: { id: string; tx: number; ty: number; hp: number }[]
}

export class ActionHistory {
  private snapshots: TurnSnapshot[] = []
  private rewindUsed = false

  save(snapshot: TurnSnapshot) {
    this.snapshots.push(snapshot)
    // Keep last 5 turns max
    if (this.snapshots.length > 5) {
      this.snapshots.shift()
    }
  }

  canRewind(): boolean {
    return !this.rewindUsed && this.snapshots.length > 1
  }

  rewind(): TurnSnapshot | null {
    if (!this.canRewind()) return null
    this.rewindUsed = true
    // Pop current state, return previous
    this.snapshots.pop()
    return this.snapshots[this.snapshots.length - 1] ?? null
  }

  resetForFloor() {
    this.snapshots = []
    this.rewindUsed = false
  }
}
