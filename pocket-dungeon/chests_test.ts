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
  GOLDEN_CHANCE_BASE,
  GOLDEN_CHANCE_PER_DEPTH,
  type ChestTier,
} from './chests'
import { ITEMS } from './items'
import { RNG } from './rng'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const wooden = chestLootIds('wooden')
const golden = chestLootIds('golden')

// --- the tables refer to items that exist -------------------------------

const unknown = [...wooden, ...golden].filter((id) => !ITEMS[id])
check('every loot id names a real item', unknown.length === 0, unknown.join(', ') || 'all resolve')

// --- no dead items in a reward ------------------------------------------
//
// Nothing in the game reads `scrollEffect` or calls ScrollIdentifier.identify,
// so a scroll is an inventory slot that does nothing. They are in the floor
// drop pool; they must not be what a chest hands back.
const scrolls = [...wooden, ...golden].filter((id) => ITEMS[id].category === 'scroll')
check('no scrolls in either table, while scrolls remain unusable', scrolls.length === 0, scrolls.join(', '))

const hourglass = [...wooden, ...golden].filter((id) => ITEMS[id].category === 'rewind')
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

for (const tier of ['wooden', 'golden'] as ChestTier[]) {
  const allowed = new Set(chestLootIds(tier))
  const seen = new Set<string>()
  let strayed = false
  for (let seed = 0; seed < 2000; seed++) {
    const loot = rollChestLoot(tier, new RNG(seed))
    seen.add(loot.id)
    if (!allowed.has(loot.id)) strayed = true
  }
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
const loot = rollChestLoot('golden', new RNG(1))
loot.name = 'MUTATED'
check('loot is a copy of the item, not the database entry', ITEMS[loot.id].name !== 'MUTATED')

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
    if (chests.length > 3) tooMany++
    if (chests.includes('golden')) goldenHits++
  }
  goldenByDepth.push(goldenHits / TRIALS)
}
check('every floor gets at least one wooden chest', noWooden === 0, `${noWooden} floors without`)
check('no floor gets more than three chests', tooMany === 0)

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
