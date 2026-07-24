import { Inventory, ScrollIdentifier, ActionHistory } from './items'
import { RNG } from './rng'

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

  // Hunger Clock
  static hunger: number = 100
  static maxHunger: number = 100
  static hungerDrainRate: number = 1 // per turn

  // Inventory & Scrolls
  static inventory: Inventory = new Inventory()
  static scrollIdentifier: ScrollIdentifier = new ScrollIdentifier(new RNG(Date.now()))
  static actionHistory: ActionHistory = new ActionHistory()

  static setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
  }

  static drainHunger() {
    this.hunger = Math.max(0, this.hunger - this.hungerDrainRate)
    // Starving: lose 1 HP per turn when hunger is 0
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
    this.floorDepth = 1
    this.playerHp = 20
    this.maxHp = 20
    this.playerAtk = 4
    this.playerBaseAtk = 4
    this.turnsCount = 0
    this.turnState = TurnState.PLAYER_TURN
    this.hunger = 100
    this.inventory = new Inventory()
    this.scrollIdentifier = new ScrollIdentifier(new RNG(this.seed))
    this.actionHistory = new ActionHistory()
  }
}
