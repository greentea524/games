// Run-to-run carry-over (#86).
//
//   npx tsx pocket-dungeon/carryover_test.ts
//
// This touches the meta save, so it runs against a stubbed localStorage in
// the same way `shared/storage_test.ts` does — no browser needed.
//
// The checks that matter are the *bounds*. A carry-over that accumulates or
// compounds is how a roguelite stops being one: two runs in you are starting
// with a Flame Brand and Plate Armor and floors 1-4 are a formality. So the
// design is a rental — last run's gear only, one item at a time, consumed on
// use — and every one of those three words is asserted below, because none of
// them is visible from reading `resetRun`.
//
// The migration check at the bottom is the other important one. This adds two
// fields to a save format that is already on people's machines.

/** Minimal localStorage stand-in, same shape as shared/storage_test.ts uses. */
function stubStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
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
  return map
}
const store = stubStorage()

const {
  loadMeta, saveMeta, recoverGear, buyKeepsake, takeKeepsake, keepsakeCost, SHOP_ITEMS, CLASSES,
} = await import('./meta')
const { ITEMS } = await import('./items')

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const reset = (gold = 500) => {
  store.clear()
  const meta = loadMeta()
  meta.gold = gold
  saveMeta(meta)
}

// --- what a run leaves behind ----------------------------------------------

reset()
recoverGear(['flame_brand', 'chain_mail', 'coin_lucky'])
check(
  'gear the run was wearing is recoverable',
  loadMeta().recovered.join() === 'flame_brand,chain_mail,coin_lucky',
  loadMeta().recovered.join(', '),
)

recoverGear(['bread', 'potion_heal', 'scroll_fire', 'rusty_sword'])
check(
  'consumables are not — only gear is progression',
  loadMeta().recovered.join() === 'rusty_sword',
  `kept: ${loadMeta().recovered.join(', ') || 'nothing'}`,
)

recoverGear([undefined, null, 'not_an_item', 'iron_blade'])
check(
  'empty slots and unknown ids are dropped rather than stored',
  loadMeta().recovered.join() === 'iron_blade',
  loadMeta().recovered.join(', '),
)

// The bound that stops accumulation. Written as two runs in sequence, because
// that is the thing being claimed: run two's gear *replaces* run one's.
reset()
recoverGear(['flame_brand', 'plate_armor'])
recoverGear(['rusty_sword'])
check(
  'a new run replaces the last run’s gear rather than adding to it',
  loadMeta().recovered.join() === 'rusty_sword',
  `after two runs: ${loadMeta().recovered.join(', ')}`,
)

// --- buying one back --------------------------------------------------------

reset(500)
recoverGear(['flame_brand', 'chain_mail'])
const goldBefore = loadMeta().gold
check('buying a recovered item succeeds', buyKeepsake('flame_brand') === true)
check(
  'and costs its price',
  loadMeta().gold === goldBefore - keepsakeCost(ITEMS.flame_brand),
  `${goldBefore} -> ${loadMeta().gold}, price ${keepsakeCost(ITEMS.flame_brand)}`,
)
check('the item is held', loadMeta().keepsake === 'flame_brand')

// The bound that stops compounding.
buyKeepsake('chain_mail')
check(
  'buying a second replaces the first — only one is ever held',
  loadMeta().keepsake === 'chain_mail',
  `holding ${loadMeta().keepsake}`,
)

check(
  'an item this run did not recover cannot be bought',
  buyKeepsake('plate_armor') === false,
  'plate_armor was never recovered',
)
check('nor can a nonexistent one', buyKeepsake('not_an_item') === false)

reset(0)
recoverGear(['flame_brand'])
check('and neither can one you cannot afford', buyKeepsake('flame_brand') === false)
check('with no gold taken', loadMeta().gold === 0 && loadMeta().keepsake === null)

// --- and it is consumed -----------------------------------------------------

reset(500)
recoverGear(['iron_blade'])
buyKeepsake('iron_blade')
const first = takeKeepsake()
check('starting a run hands the keepsake over', first?.id === 'iron_blade', first?.name)
check('and empties the slot', loadMeta().keepsake === null)
const second = takeKeepsake()
check(
  'so the run after that gets nothing — it is a rental, not an unlock',
  second === null,
  second ? `still holding ${second.name}` : 'empty',
)

// --- pricing ---------------------------------------------------------------
//
// Measured against the shop it sits in rather than asserted as literals: the
// point of the scale is where it falls relative to the permanent unlocks, and
// a test full of magic numbers would not notice if those moved.

const gearIds = Object.values(ITEMS)
  .filter((i) => ['weapon', 'armor', 'accessory'].includes(i.category))
  .map((i) => i.id)
const prices = gearIds.map((id) => ({ id, cost: keepsakeCost(ITEMS[id]) }))
const cheapestUnlock = Math.min(...SHOP_ITEMS.map((i) => i.cost))
const cheapestClass = Math.min(
  ...Object.values(CLASSES).filter((c) => c.unlockCost > 0).map((c) => c.unlockCost),
)

check(
  'every piece of gear has a price',
  prices.every((p) => p.cost > 0),
  prices.map((p) => `${p.id} ${p.cost}g`).join(', '),
)
check(
  'a better weapon costs more than a worse one',
  keepsakeCost(ITEMS.rusty_sword) < keepsakeCost(ITEMS.iron_blade) &&
    keepsakeCost(ITEMS.iron_blade) < keepsakeCost(ITEMS.flame_brand),
  `${keepsakeCost(ITEMS.rusty_sword)}/${keepsakeCost(ITEMS.iron_blade)}/${keepsakeCost(ITEMS.flame_brand)}`,
)
check(
  'and better armour likewise',
  keepsakeCost(ITEMS.leather_vest) < keepsakeCost(ITEMS.chain_mail) &&
    keepsakeCost(ITEMS.chain_mail) < keepsakeCost(ITEMS.plate_armor),
  `${keepsakeCost(ITEMS.leather_vest)}/${keepsakeCost(ITEMS.chain_mail)}/${keepsakeCost(ITEMS.plate_armor)}`,
)
// Renting a Rusty Sword for one run must be worse value than buying one for
// every run, or the permanent unlock is dead content.
check(
  'renting the starter sword costs less than owning it forever',
  keepsakeCost(ITEMS.rusty_sword) < (SHOP_ITEMS.find((i) => i.id === 'start_sword')?.cost ?? 0),
  `${keepsakeCost(ITEMS.rusty_sword)}g for one run vs ${SHOP_ITEMS.find((i) => i.id === 'start_sword')?.cost}g forever`,
)
check(
  'no rental costs more than unlocking a class',
  Math.max(...prices.map((p) => p.cost)) < cheapestClass,
  `dearest rental ${Math.max(...prices.map((p) => p.cost))}g vs cheapest class ${cheapestClass}g`,
)
check(
  'the cheapest rental is not free money either',
  Math.min(...prices.map((p) => p.cost)) >= cheapestUnlock * 0.5,
  `cheapest rental ${Math.min(...prices.map((p) => p.cost))}g, cheapest unlock ${cheapestUnlock}g`,
)

// --- an existing save survives ---------------------------------------------
//
// Two fields added to a format already sitting in people's browsers. `loadMeta`
// spreads over the defaults so this should hold, but "should" is what the
// check is for.

store.clear()
store.set(
  'pocket_dungeon_meta',
  JSON.stringify({
    v: 1,
    d: {
      gold: 120, unlockedClasses: ['knight', 'scout'], purchasedItems: ['start_sword'],
      bestFloor: 9, totalRuns: 14, totalVictories: 1, runHistory: [],
    },
  }),
)
const old = loadMeta()
check('a save written before this feature still loads', old.gold === 120 && old.bestFloor === 9)
check('with its unlocks intact', old.unlockedClasses.join() === 'knight,scout')
check('and the new fields defaulted', Array.isArray(old.recovered) && old.recovered.length === 0)
check('with nothing held', old.keepsake === null)
check(
  'and taking from an empty slot is harmless',
  takeKeepsake() === null,
)

console.log(ok ? '\nALL CARRY-OVER CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
