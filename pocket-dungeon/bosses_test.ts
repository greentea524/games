// Boss schedule checks (#85).
//
//   npx tsx pocket-dungeon/bosses_test.ts
//
// One boss already existed — the Vault Guardian on floor 12. What this covers
// is the rest: that there is a boss at the end of each biome, that each one is
// harder than the floor it caps, and that the loot is worth the fight.
import { BOSS_FLOORS, BOSS_DEPTHS, bossForFloor, isBossFloor, biomeFinalFloors } from './bosses'
import { getBiome, getSpawnBudget, ENEMY_DEFS } from './enemies'
import { ITEMS } from './items'
import { chestLootIds } from './chests'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- the schedule ---------------------------------------------------------

check('there is a boss on more than one floor', BOSS_DEPTHS.length > 1, BOSS_DEPTHS.join(', '))
check(
  'one at the end of every biome, derived from the biome boundaries',
  BOSS_DEPTHS.join() === biomeFinalFloors().join(),
  `bosses ${BOSS_DEPTHS.join(', ')} vs biome finals ${biomeFinalFloors().join(', ')}`,
)
check(
  'every boss floor is the last of its biome',
  BOSS_DEPTHS.every((d) => getBiome(d) !== getBiome(d + 1) || d === 12),
)
check('the final floor still has one', isBossFloor(12))
check('ordinary floors do not', [1, 2, 3, 5, 6, 7, 9, 10, 11].every((d) => !isBossFloor(d)))
check('lookups on a non-boss floor return null', bossForFloor(5) === null)

// --- each one is actually a boss ------------------------------------------

const defs = BOSS_DEPTHS.map((d) => BOSS_FLOORS[d])
check('ids and names are unique', new Set(defs.map((b) => b.id)).size === defs.length)
check(
  'every sprite key is distinct, so they are not the same picture',
  new Set(defs.map((b) => b.spriteKey)).size === defs.length,
  defs.map((b) => b.spriteKey).join(', '),
)

// "Higher health" has to mean something. The toughest ordinary enemy is the
// slime at 12 HP; a boss under that is just a big rat.
const toughest = Math.max(...Object.values(ENEMY_DEFS).map((e) => e.hp))
const weakest = Math.min(...defs.map((b) => b.hp))
check(
  'the weakest boss still outlasts the toughest ordinary enemy',
  weakest > toughest,
  `boss min ${weakest} vs enemy max ${toughest}`,
)
const strongestAtk = Math.max(...Object.values(ENEMY_DEFS).map((e) => e.atk))
check(
  'and hits at least as hard as anything else on the floor',
  Math.min(...defs.map((b) => b.atk)) >= strongestAtk,
  `boss min atk ${Math.min(...defs.map((b) => b.atk))} vs enemy max ${strongestAtk}`,
)

// Later bosses must be harder than earlier ones, or the schedule is flat.
for (let i = 1; i < BOSS_DEPTHS.length; i++) {
  const prev = BOSS_FLOORS[BOSS_DEPTHS[i - 1]]
  const cur = BOSS_FLOORS[BOSS_DEPTHS[i]]
  check(
    `the floor ${BOSS_DEPTHS[i]} boss is harder than the floor ${BOSS_DEPTHS[i - 1]} one`,
    cur.hp > prev.hp && cur.atk >= prev.atk,
    `${prev.hp}/${prev.atk} -> ${cur.hp}/${cur.atk}`,
  )
}

// It also has to be harder than the floor around it, or the room is the fight.
for (const d of BOSS_DEPTHS) {
  const b = BOSS_FLOORS[d]
  check(
    `the floor ${d} boss outweighs that floor's whole spawn budget in HP`,
    b.hp > getSpawnBudget(d),
    `${b.hp} hp vs budget ${getSpawnBudget(d)}`,
  )
}

// --- the loot -------------------------------------------------------------

const golden = new Set(chestLootIds('golden'))
for (const b of defs) {
  check(`${b.name} drops a real item`, !!ITEMS[b.drop], b.drop)
  check(
    `and it is top tier, not something a wooden chest hands out`,
    golden.has(b.drop),
    `${b.drop} — golden table: ${[...golden].join(', ')}`,
  )
}
check('drops are distinct, so the three fights do not pay the same', new Set(defs.map((b) => b.drop)).size === defs.length)
check(
  'gold scales with the fight',
  defs.every((b, i) => i === 0 || b.gold > defs[i - 1].gold),
  defs.map((b) => b.gold).join(' -> '),
)
// A normal kill pays 3.
check('and every boss pays more than an ordinary kill', defs.every((b) => b.gold > 3))

console.log(ok ? '\nALL BOSS CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
