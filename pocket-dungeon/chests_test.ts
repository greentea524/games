// Chest and loot-table checks (#83).
//
//   npx tsx pocket-dungeon/chests_test.ts
//
// The tables are pure data and the roll is pure, so none of this needs a
// browser. The checks worth having here are the ones about what a chest is
// *allowed* to contain — "golden is better" is the entire reason for two
// tiers, and it is a property of the tables rather than of any one roll, so
// it can be asserted exactly rather than sampled.
import {
  rollChestLoot,
  rollChests,
  chestLootIds,
  keysForFloor,
  GOLDEN_CHANCE_BASE,
  GOLDEN_CHANCE_PER_DEPTH,
  LOCKED_MIN_DEPTH,
  LOOT_PER_CHEST,
  type ChestTier,
} from './chests'
import { ITEMS } from './items'
import { getBiome } from './enemies'
import { RNG } from './rng'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// Two wooden, plus at most one golden and one locked. The ceiling went from
// three to four when locked chests landed (#59); it is asserted rather than
// assumed because chest count is what competes with floor items for room
// tiles.
const MAX_CHESTS_PER_FLOOR = 4

const wooden = chestLootIds('wooden')
const golden = chestLootIds('golden')
const locked = chestLootIds('locked')

// --- the tables refer to items that exist -------------------------------

const unknown = [...wooden, ...golden, ...locked].filter((id) => !ITEMS[id])
check('every loot id names a real item', unknown.length === 0, unknown.join(', ') || 'all resolve')

// --- no dead items in a reward ------------------------------------------
//
// There is no action that uses an inventory item, so a scroll can be picked
// up and never spent, and ScrollIdentifier.identify has no callers so its
// label never resolves. They are in the floor drop pool; they must not also
// be what a chest hands back. Remove this check when #105 lands.
const scrolls = [...wooden, ...golden, ...locked].filter((id) => ITEMS[id].category === 'scroll')
check('no scrolls in either table, while scrolls remain unusable', scrolls.length === 0, scrolls.join(', '))

const hourglass = [...wooden, ...golden, ...locked].filter((id) => ITEMS[id].category === 'rewind')
check('no hourglass either — one per floor is placed directly', hourglass.length === 0)

// --- golden is meaningfully better, not statistically better -------------

const best = (ids: string[], field: 'atkBonus' | 'defBonus' | 'healAmount') =>
  Math.max(0, ...ids.map((id) => ITEMS[id][field] ?? 0))
const worstNonZero = (ids: string[], field: 'atkBonus' | 'defBonus' | 'healAmount') => {
  const vals = ids.map((id) => ITEMS[id][field] ?? 0).filter((v) => v > 0)
  return vals.length ? Math.min(...vals) : 0
}

for (const field of ['atkBonus', 'defBonus', 'healAmount'] as const) {
  const gMin = worstNonZero(golden, field)
  const wMax = best(wooden, field)
  check(
    `the weakest golden ${field} beats the best wooden one`,
    gMin > wMax,
    `golden min ${gMin} vs wooden max ${wMax}`,
  )
}

const overlap = golden.filter((id) => wooden.includes(id))
check('the two tables share no items at all', overlap.length === 0, overlap.join(', '))

// --- a roll only ever produces something from its own table -------------

for (const tier of ['wooden', 'golden', 'locked'] as ChestTier[]) {
  const allowed = new Set(chestLootIds(tier))
  const seen = new Set<string>()
  let strayed = false
  let wrongCount = 0
  for (let seed = 0; seed < 2000; seed++) {
    const loot = rollChestLoot(tier, new RNG(seed))
    if (loot.length !== LOOT_PER_CHEST[tier]) wrongCount++
    for (const item of loot) {
      seen.add(item.id)
      if (!allowed.has(item.id)) strayed = true
    }
  }
  check(
    `a ${tier} chest yields exactly ${LOOT_PER_CHEST[tier]} item(s)`,
    wrongCount === 0,
    `${wrongCount} rolls of the wrong size`,
  )
  check(`a ${tier} chest never produces an item from outside its table`, !strayed)
  check(
    `every ${tier} entry is actually reachable`,
    seen.size === allowed.size,
    `${seen.size}/${allowed.size} seen`,
  )
}

// --- loot is a copy, not the shared item object --------------------------
//
// Floor items are mutated in place when picked up. Handing out the ITEMS
// entry itself would let one pickup edit the item database for the whole run.
const [sample] = rollChestLoot('golden', new RNG(1))
sample.name = 'MUTATED'
check('loot is a copy of the item, not the database entry', ITEMS[sample.id].name !== 'MUTATED')

// --- locked chests (#59) -------------------------------------------------
//
// A locked chest costs a key, so it has to be worth one. There is nothing
// rarer than a Flame Brand to hand out, so it pays in quantity instead.
check(
  'a locked chest is worth the key it costs',
  LOOT_PER_CHEST.locked > LOOT_PER_CHEST.golden,
  `${LOOT_PER_CHEST.locked} draws vs ${LOOT_PER_CHEST.golden}`,
)
check(
  'and it draws from the golden table, not a weaker one',
  locked.join() === golden.join(),
)

let lockedEarly = 0
let lockedLate = 0
let keyMismatch = 0
for (let depth = 1; depth <= 12; depth++) {
  for (let seed = 0; seed < 2000; seed++) {
    const chests = rollChests(depth, new RNG(seed * 17 + depth))
    const lockedHere = chests.filter((c) => c === 'locked').length
    // Measured against the biome, not against LOCKED_MIN_DEPTH. Comparing to
    // the same constant the implementation uses makes the check move with the
    // bug: dropping LOCKED_MIN_DEPTH to 1 put locked chests on floor 1 and
    // this still passed. The actual rule is "not in the cellar".
    if (getBiome(depth) === 'cellar' && lockedHere > 0) lockedEarly++
    if (getBiome(depth) !== 'cellar' && lockedHere > 0) lockedLate++
    // The rule the whole feature rests on: a locked chest never appears
    // without a key to go with it.
    if (keysForFloor(chests) !== lockedHere) keyMismatch++
  }
}
check(
  'no locked chest anywhere in the cellar, where the game is still being learned',
  lockedEarly === 0,
  `${lockedEarly} in cellar floors`,
)
check('locked chests do appear from the catacombs on', lockedLate > 0, `${lockedLate} beyond the cellar`)
check(
  'and the declared minimum depth agrees with the biome boundary',
  getBiome(LOCKED_MIN_DEPTH) !== 'cellar' && getBiome(LOCKED_MIN_DEPTH - 1) === 'cellar',
  `LOCKED_MIN_DEPTH ${LOCKED_MIN_DEPTH} is the first ${getBiome(LOCKED_MIN_DEPTH)} floor`,
)
check(
  'every locked chest is matched by exactly one key',
  keyMismatch === 0,
  `${keyMismatch} floors mismatched`,
)
check('a floor with no locked chest places no keys', keysForFloor(['wooden', 'golden']) === 0)

// --- how many chests a floor gets ---------------------------------------

let noWooden = 0
let tooMany = 0
const goldenByDepth: number[] = []
const TRIALS = 4000
for (let depth = 1; depth <= 12; depth++) {
  let goldenHits = 0
  for (let seed = 0; seed < TRIALS; seed++) {
    const chests = rollChests(depth, new RNG(seed * 31 + depth))
    if (!chests.includes('wooden')) noWooden++
    if (chests.length > MAX_CHESTS_PER_FLOOR) tooMany++
    if (chests.includes('golden')) goldenHits++
  }
  goldenByDepth.push(goldenHits / TRIALS)
}
check('every floor gets at least one wooden chest', noWooden === 0, `${noWooden} floors without`)
check(`no floor gets more than ${MAX_CHESTS_PER_FLOOR} chests`, tooMany === 0)

const f1 = goldenByDepth[0]
const f12 = goldenByDepth[11]
check(
  'golden chests get commoner with depth',
  f12 > f1 * 1.5,
  `floor 1 ${(f1 * 100).toFixed(0)}%  ->  floor 12 ${(f12 * 100).toFixed(0)}%`,
)
check(
  'and the curve matches the declared constants',
  Math.abs(f1 - (GOLDEN_CHANCE_BASE + GOLDEN_CHANCE_PER_DEPTH)) < 0.03 &&
    Math.abs(f12 - (GOLDEN_CHANCE_BASE + GOLDEN_CHANCE_PER_DEPTH * 12)) < 0.03,
  `expected ~${((GOLDEN_CHANCE_BASE + GOLDEN_CHANCE_PER_DEPTH) * 100).toFixed(0)}% and ~${((GOLDEN_CHANCE_BASE + GOLDEN_CHANCE_PER_DEPTH * 12) * 100).toFixed(0)}%`,
)

// Treasury (#69) guarantees one.
let treasuryMisses = 0
for (let seed = 0; seed < 2000; seed++) {
  if (!rollChests(3, new RNG(seed), true).includes('golden')) treasuryMisses++
}
check('the Treasury modifier always yields a golden chest', treasuryMisses === 0, `${treasuryMisses} misses`)

// A floor 1 chest run should still mostly be wooden-only, or the golden tier
// stops being an event.
const f1GoldenPct = goldenByDepth[0] * 100
check(
  'a golden chest stays an event on floor 1',
  f1GoldenPct < 25,
  `${f1GoldenPct.toFixed(0)}% of floor-1 runs`,
)

console.log(ok ? '\nALL CHEST CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
