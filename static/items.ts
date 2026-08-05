// Item definitions and the dual-world crossover table (#72).
//
// This is a leaf module on purpose. `state.ts` needs the transform table, and
// `dialogue.ts` already imports GameState from `state.ts` — so anything both
// of them touch has to live somewhere neither one imports back into.
// `dialogue.ts` re-exports ITEMS so existing importers keep working.

export interface ItemDef {
  id: string
  name: string
  icon: string // BootScene texture key
}

export const ITEMS: Record<string, ItemDef> = {
  flashlight: { id: 'flashlight', name: 'Flashlight', icon: 'item_flashlight' },
  flashlight_dead: { id: 'flashlight_dead', name: 'Dead Flashlight', icon: 'item_flashlight_dead' },
  flower: { id: 'flower', name: 'Wilted Flower', icon: 'item_flower' },
  flower_fresh: { id: 'flower_fresh', name: 'Fresh Flower', icon: 'item_flower_fresh' },
  photo: { id: 'photo', name: 'Old Photo', icon: 'item_photo' },
  ledger: { id: 'ledger', name: 'Water Ledger', icon: 'item_ledger' },
  ren_key: { id: 'ren_key', name: "Ren's Key", icon: 'item_ren_key' },
}

/**
 * An item that exists in both worlds under two different forms. Crossing over
 * swaps whichever form is carried for its counterpart.
 *
 * Pairs are bidirectional: an item that blooms on the way in has to wilt on
 * the way back, or a player who crosses over and returns before spending it
 * keeps the transformed version and the puzzle is solvable from the wrong side.
 */
export interface Transform {
  normal: string
  statik: string
  /** Toast shown when crossing into the static world. */
  intoStatic: string
  /** Toast shown when crossing back into the normal world. */
  intoNormal: string
}

export const TRANSFORMS: Transform[] = [
  {
    normal: 'flower',
    statik: 'flower_fresh',
    intoStatic: 'Flower blooms.',
    intoNormal: 'Flower wilts.',
  },
  // Deliberately an inversion of the flower: crossing over makes this one
  // worse. If every transform were an upgrade, carrying the whole inventory
  // across would be strictly correct and the toggle would go back to being a
  // button you mash rather than a choice you make.
  {
    normal: 'flashlight',
    statik: 'flashlight_dead',
    intoStatic: 'Flashlight dies.',
    intoNormal: 'Flashlight works.',
  },
]

export interface TransformEvent {
  /** The item id *after* the swap — what the player is now carrying. */
  itemId: string
  message: string
}
