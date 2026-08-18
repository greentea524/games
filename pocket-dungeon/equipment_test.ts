// Equipment checks (#82): the accessory slot, its passives, and the rule that
// decides whether walking onto gear replaces what you already have.
//
//   npx tsx pocket-dungeon/equipment_test.ts
//
// All of this lives in `GameState` as pure state transitions, so it runs
// without a browser. `resetRun` reads the meta save, so localStorage is
// stubbed the same way shared/storage_test.ts does it.
//
// The downgrade checks are the point. Before this issue, gear was equipped by
// walking onto it with no comparison at all, so stepping on a Rusty Sword
// while holding the Flame Brand quietly took you from +6 ATK to +2. That bug
// was invisible in play — nothing announced it, the ATK readout just fell.

/** Minimal localStorage stand-in, so `loadMeta` has something to read. */
function stubStorage() {
  const map = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}
stubStorage()

const { GameState } = await import('./state')
const { ITEMS } = await import('./items')

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- the slot exists and is empty at the start of a run -------------------

GameState.resetRun()
check('a run starts with the accessory slot empty', GameState.inventory.equippedAccessory === null)
check(
  'every accessory in the item table carries a passive',
  Object.values(ITEMS)
    .filter((i) => i.category === 'accessory')
    .every((i) => i.passive !== undefined),
)
const accessories = Object.values(ITEMS).filter((i) => i.category === 'accessory')
check('there are three accessories', accessories.length === 3, accessories.map((a) => a.name).join(', '))

// --- Bronze Ring: hunger drains on alternate turns ------------------------

GameState.resetRun()
const baseHunger = GameState.hunger
for (let i = 0; i < 20; i++) {
  GameState.advanceTurn()
  GameState.drainHunger()
}
const withoutRing = baseHunger - GameState.hunger

GameState.resetRun()
GameState.equipAccessory(ITEMS.ring_bronze)
// An odd number of turns, deliberately. Halving the *rate* to 0.5 a turn also
// costs 10 hunger over 20 turns and leaves a whole number, so an even-length
// run cannot tell the two implementations apart — the first version of this
// check could not fail. Stepping to 21 puts a fractional rate on 89.5.
let everIntegral = true
for (let i = 0; i < 21; i++) {
  GameState.advanceTurn()
  GameState.drainHunger()
  if (!Number.isInteger(GameState.hunger)) everIntegral = false
}
const withRing = baseHunger - GameState.hunger

check('20 turns bare costs 20 hunger', withoutRing === 20, `${withoutRing}`)
check('the Bronze Ring halves that', withRing === 10, `${withRing}`)
check(
  'hunger is a whole number after every single turn, odd ones included',
  everIntegral,
  `ended at ${GameState.hunger}`,
)

// --- Mending Band: 1 HP every 8 turns, and only when wounded --------------

GameState.resetRun()
GameState.equipAccessory(ITEMS.band_mending)
GameState.playerHp = 1
let ticks = 0
for (let i = 0; i < 24; i++) if (GameState.advanceTurn()) ticks++
check('the Mending Band heals 3 times over 24 turns', ticks === 3, `${ticks}`)
check('and the HP actually went up', GameState.playerHp === 4, `${GameState.playerHp}`)

GameState.resetRun()
GameState.equipAccessory(ITEMS.band_mending)
let fullTicks = 0
for (let i = 0; i < 24; i++) if (GameState.advanceTurn()) fullTicks++
check('it never heals past max HP', fullTicks === 0 && GameState.playerHp === GameState.maxHp)

GameState.resetRun()
GameState.equipAccessory(ITEMS.band_mending)
GameState.playerHp = 0
let deadTicks = 0
for (let i = 0; i < 24; i++) if (GameState.advanceTurn()) deadTicks++
check('and it never revives a dead player', deadTicks === 0 && GameState.playerHp === 0)

GameState.resetRun()
GameState.playerHp = 1
let bareTicks = 0
for (let i = 0; i < 24; i++) if (GameState.advanceTurn()) bareTicks++
check('no band, no regeneration', bareTicks === 0 && GameState.playerHp === 1)

// --- Lucky Coin: doubles gold, and stays a whole number -------------------

GameState.resetRun()
const plainDrop = GameState.addGold(3)
check('a kill banks its gold unchanged when the slot is bare', plainDrop === 3 && GameState.runGold === 3)

GameState.resetRun()
GameState.equipAccessory(ITEMS.coin_lucky)
const coinDrop = GameState.addGold(3)
check('the Lucky Coin doubles it', coinDrop === 6 && GameState.runGold === 6, `${coinDrop}`)
check('gold stays a whole number', Number.isInteger(GameState.runGold))
check(
  'the returned figure is what was banked, so the float matches the counter',
  coinDrop === GameState.runGold,
)

// --- the downgrade guard --------------------------------------------------

GameState.resetRun()
GameState.equipWeapon(ITEMS.flame_brand)
const atkWithBrand = GameState.playerAtk
check('the Flame Brand is +6 ATK', atkWithBrand === GameState.playerBaseAtk + 6)
check('a Rusty Sword no longer replaces it', GameState.isUpgrade(ITEMS.rusty_sword) === false)
check('an Iron Blade does not either', GameState.isUpgrade(ITEMS.iron_blade) === false)

GameState.resetRun()
GameState.equipWeapon(ITEMS.rusty_sword)
check('but a better weapon still does', GameState.isUpgrade(ITEMS.flame_brand) === true)

GameState.resetRun()
check('an empty weapon slot takes anything', GameState.isUpgrade(ITEMS.rusty_sword) === true)

GameState.resetRun()
const bareMaxHp = GameState.maxHp
GameState.equipArmor(ITEMS.plate_armor)
check(
  'Plate Armor is +15 max HP',
  GameState.maxHp === bareMaxHp + 15,
  `${bareMaxHp} -> ${GameState.maxHp}`,
)
check('a Leather Vest no longer replaces it', GameState.isUpgrade(ITEMS.leather_vest) === false)
GameState.resetRun()
GameState.equipArmor(ITEMS.leather_vest)
check('but heavier armour still does', GameState.isUpgrade(ITEMS.chain_mail) === true)

// Accessories take an empty slot only — their passives are not comparable, so
// there is no "better" to swap toward.
GameState.resetRun()
check('an empty accessory slot takes anything', GameState.isUpgrade(ITEMS.ring_bronze) === true)
GameState.equipAccessory(ITEMS.ring_bronze)
check('a worn accessory is never swapped out by walking', GameState.isUpgrade(ITEMS.coin_lucky) === false)
check('not even for itself', GameState.isUpgrade(ITEMS.ring_bronze) === false)

// Consumables are not gear and must not be routed through this rule.
check('food is not gear', GameState.isUpgrade(ITEMS.bread) === false)
check('potions are not gear', GameState.isUpgrade(ITEMS.potion_heal) === false)

// --- armour bookkeeping survives a swap ----------------------------------
//
// equipArmor subtracts the old bonus before adding the new one. If that ever
// stops happening, max HP ratchets upward every time armour changes.
GameState.resetRun()
const bareMax = GameState.maxHp
GameState.equipArmor(ITEMS.leather_vest)
GameState.equipArmor(ITEMS.chain_mail)
GameState.equipArmor(ITEMS.plate_armor)
check(
  'swapping armour does not stack max HP',
  GameState.maxHp === bareMax + 15,
  `${GameState.maxHp} vs expected ${bareMax + 15}`,
)

// --- accessories are reachable as floor loot -----------------------------

const { rollFloorItems } = await import('./items')
const { RNG } = await import('./rng')
let sawAccessory = 0
for (let seed = 0; seed < 400; seed++) {
  const drops = rollFloorItems(6, new RNG(seed))
  if (drops.some((d) => d.category === 'accessory')) sawAccessory++
}
check(
  'accessories actually drop on the floor',
  sawAccessory > 0,
  `${((sawAccessory / 400) * 100).toFixed(0)}% of floors carry at least one`,
)

// --- a run resets the slot ------------------------------------------------

GameState.equipAccessory(ITEMS.coin_lucky)
GameState.resetRun()
check('a new run clears the accessory', GameState.inventory.equippedAccessory === null)

console.log(ok ? '\nALL EQUIPMENT CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
