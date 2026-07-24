import { Inventory, ScrollIdentifier, ActionHistory, ITEMS } from './items'
import { RNG } from './rng'
import { ClassName, CLASSES, loadMeta } from './meta'

export enum TurnState {
  PLAYER_TURN,
  ENEMY_TURN,
  ANIMATING,
}

export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'gbc'
  static turnState: TurnState = TurnState.PLAYER_TURN
  static floorDepth: number = 1
  static seed: number = Date.now()
  static playerHp: number = 20
  static maxHp: number = 20
  static playerAtk: number = 4
  static playerBaseAtk: number = 4
  static turnsCount: number = 0
  static uiBlocking: boolean = false
  static selectedClass: ClassName = 'knight'

  // Hunger Clock
  static hunger: number = 100
  static maxHunger: number = 100
  static hungerDrainRate: number = 1 // per turn

  // Run gold (collected this run, added to meta on death/victory)
  static runGold: number = 0

  // Inventory & Scrolls
  static inventory: Inventory = new Inventory()
  static scrollIdentifier: ScrollIdentifier = new ScrollIdentifier(new RNG(Date.now()))
  static actionHistory: ActionHistory = new ActionHistory()

  static setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
  }

  static drainHunger() {
    this.hunger = Math.max(0, this.hunger - this.hungerDrainRate)
    if (this.hunger <= 0) {
      this.playerHp = Math.max(0, this.playerHp - 1)
    }
  }

  static recalcAtk() {
    let atk = this.playerBaseAtk
    if (this.inventory.equippedWeapon?.atkBonus) {
      atk += this.inventory.equippedWeapon.atkBonus
    }
    this.playerAtk = atk
  }

  static equipWeapon(def: import('./items').ItemDef) {
    this.inventory.equippedWeapon = def
    this.recalcAtk()
  }

  static equipArmor(def: import('./items').ItemDef) {
    if (this.inventory.equippedArmor?.defBonus) {
      this.maxHp -= this.inventory.equippedArmor.defBonus
      this.playerHp = Math.min(this.playerHp, this.maxHp)
    }
    this.inventory.equippedArmor = def
    if (def.defBonus) {
      this.maxHp += def.defBonus
    }
  }

  static resetRun() {
    const classDef = CLASSES[this.selectedClass]
    const meta = loadMeta()

    this.floorDepth = 1
    this.playerHp = classDef.hp
    this.maxHp = classDef.hp
    this.playerBaseAtk = classDef.atk
    this.playerAtk = classDef.atk
    this.turnsCount = 0
    this.turnState = TurnState.PLAYER_TURN
    this.hunger = classDef.hunger
    this.maxHunger = classDef.hunger
    this.runGold = 0
    this.seed = Date.now()
    this.inventory = new Inventory()
    this.scrollIdentifier = new ScrollIdentifier(new RNG(this.seed))
    this.actionHistory = new ActionHistory()

    // Apply purchased shop bonuses
    if (meta.purchasedItems.includes('start_sword')) {
      this.equipWeapon(ITEMS.rusty_sword)
    }
    if (meta.purchasedItems.includes('start_food')) {
      this.hunger = Math.min(this.maxHunger, this.hunger + 30)
    }
    if (meta.purchasedItems.includes('start_potion')) {
      this.inventory.add(ITEMS.potion_heal)
    }
  }
}
