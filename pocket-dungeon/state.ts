import { Inventory, ScrollIdentifier, ActionHistory, ITEMS } from './items'
import type { AccessoryPassive, ItemDef } from './items'
import { RNG } from './rng'
import { CLASSES, loadMeta } from './meta'
import type { ClassName } from './meta'

// A const object rather than an enum: `erasableSyntaxOnly` rejects enum
// because it emits runtime code. Values are compared by identity everywhere
// and never persisted, so naming them is safe and reads better in a debugger
// than 0/1/2 did.
export const TurnState = {
  PLAYER_TURN: 'PLAYER_TURN',
  ENEMY_TURN: 'ENEMY_TURN',
  ANIMATING: 'ANIMATING',
} as const
export type TurnState = (typeof TurnState)[keyof typeof TurnState]

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
  /** Enemies killed this run, for the end-of-run summary (#66). */
  static killsCount: number = 0
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
    // Bronze Ring (#82) skips alternate turns rather than draining at 0.5 a
    // turn. Hunger is rendered as a whole number in a 160px HUD, so a
    // fractional rate would put "FD:99.5" on screen. Callers increment the
    // turn first, so odd turns are the skipped ones.
    if (this.accessoryPassive.halfHunger && this.turnsCount % 2 === 1) return
    this.hunger = Math.max(0, this.hunger - this.hungerDrainRate)
    if (this.hunger <= 0) {
      this.playerHp = Math.max(0, this.playerHp - 1)
    }
  }

  /** The worn accessory's passive, or an empty one when the slot is bare. */
  static get accessoryPassive(): AccessoryPassive {
    return this.inventory.equippedAccessory?.passive ?? {}
  }

  /**
   * Advances the turn counter and applies anything that ticks with it.
   *
   * Both the move and the attack path used to do a bare `turnsCount++`, which
   * meant a per-turn effect had to be remembered in two places. Hunger is
   * deliberately *not* folded in here: `drainHunger` is called on moves only,
   * and moving that under this method would start charging hunger for attacks
   * — a balance change this issue did not ask for.
   *
   * @returns true when the Mending Band healed on this turn, so the caller can
   *   show it. Silent regeneration reads as a bug in a game where every other
   *   HP change floats a number.
   */
  static advanceTurn(): boolean {
    this.turnsCount++
    const every = this.accessoryPassive.regenEvery
    if (!every || this.turnsCount % every !== 0) return false
    if (this.playerHp <= 0 || this.playerHp >= this.maxHp) return false
    this.playerHp = Math.min(this.maxHp, this.playerHp + 1)
    return true
  }

  /**
   * Banks gold from a kill, after the Lucky Coin's multiplier.
   *
   * @returns the amount actually banked, so the floating "+Ng" matches the
   *   counter instead of showing the pre-multiplier figure.
   */
  static addGold(amount: number): number {
    const total = amount * (this.accessoryPassive.goldMultiplier ?? 1)
    this.runGold += total
    return total
  }

  static recalcAtk() {
    let atk = this.playerBaseAtk
    if (this.inventory.equippedWeapon?.atkBonus) {
      atk += this.inventory.equippedWeapon.atkBonus
    }
    this.playerAtk = atk
  }

  static equipWeapon(def: ItemDef) {
    this.inventory.equippedWeapon = def
    this.recalcAtk()
  }

  static equipArmor(def: ItemDef) {
    if (this.inventory.equippedArmor?.defBonus) {
      this.maxHp -= this.inventory.equippedArmor.defBonus
      this.playerHp = Math.min(this.playerHp, this.maxHp)
    }
    this.inventory.equippedArmor = def
    if (def.defBonus) {
      this.maxHp += def.defBonus
    }
  }

  static equipAccessory(def: ItemDef) {
    this.inventory.equippedAccessory = def
  }

  /**
   * Whether walking over `def` should replace what is already in its slot.
   *
   * Gear is equipped by walking onto it, with no prompt, so this is the only
   * thing standing between the player and a downgrade. Before #82 there was
   * none: picking up a Rusty Sword while holding the Flame Brand quietly
   * dropped you from +6 ATK to +2, and the same for armour. Weapons and
   * armour now only swap upward.
   *
   * Accessories are the exception, and take an empty slot only. Their
   * passives are not on a common scale — no amount of gold multiplier is
   * "more" than half hunger — so "keep the better one" has no meaning, and
   * silently swapping would be the same downgrade in a new place. Once the
   * slot is full the item stays on the floor.
   */
  static isUpgrade(def: ItemDef): boolean {
    if (def.category === 'weapon') {
      return (def.atkBonus ?? 0) > (this.inventory.equippedWeapon?.atkBonus ?? 0)
    }
    if (def.category === 'armor') {
      return (def.defBonus ?? 0) > (this.inventory.equippedArmor?.defBonus ?? 0)
    }
    if (def.category === 'accessory') {
      return this.inventory.equippedAccessory === null
    }
    return false
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
    this.killsCount = 0
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
