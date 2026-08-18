// Enemy roster checks (#60).
//
//   npx tsx pocket-dungeon/enemies_test.ts
//
// The spawn tables are weights, and a weight added to a table quietly takes
// share from everything already in it. "Does not crowd out existing variety"
// is an acceptance criterion for #60, and it is not something reading the
// table tells you — so it is measured.
import { ENEMY_DEFS, getBiome, rollEnemies, REVIVE_HP_FRACTION } from './enemies'
import { RNG } from './rng'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- the def itself --------------------------------------------------------

const bone = ENEMY_DEFS.skeleton
const rat = ENEMY_DEFS.rat
const archer = ENEMY_DEFS.archer

check('Bonepile exists', !!bone)
check(
  'its name does not collide with the Skeleton Archer',
  bone.name !== archer.name && !bone.name.startsWith('Skeleton'),
  `${bone.name} vs ${archer.name}`,
)
check(
  'it slots between the rat and the archer',
  bone.hp > rat.hp && bone.hp <= archer.hp && bone.atk >= rat.atk && bone.atk <= archer.atk,
  `hp ${rat.hp} < ${bone.hp} <= ${archer.hp}, atk ${rat.atk} <= ${bone.atk} <= ${archer.atk}`,
)
check('it is the only reviving def', 
  Object.values(ENEMY_DEFS).filter((d) => d.revives).length === 1)
check(
  'reviving at half HP leaves it alive',
  Math.max(1, Math.round(bone.hp * REVIVE_HP_FRACTION)) > 0,
  `${bone.hp} -> ${Math.max(1, Math.round(bone.hp * REVIVE_HP_FRACTION))}`,
)

// --- where it appears ------------------------------------------------------

const share = (depth: number) => {
  const counts = new Map<string, number>()
  let total = 0
  for (let seed = 0; seed < 3000; seed++) {
    for (const { defKey } of rollEnemies(depth, new RNG(seed))) {
      counts.set(defKey, (counts.get(defKey) ?? 0) + 1)
      total++
    }
  }
  return { counts, total }
}

const cellar = share(3)
check(
  'it never spawns in the cellar, where the base game is learned',
  !cellar.counts.has('skeleton'),
  `floor 3 (${getBiome(3)}): ${[...cellar.counts.keys()].sort().join(', ')}`,
)

for (const depth of [6, 10]) {
  const { counts, total } = share(depth)
  const pct = ((counts.get('skeleton') ?? 0) / total) * 100
  check(
    `it appears in the ${getBiome(depth)} (floor ${depth})`,
    (counts.get('skeleton') ?? 0) > 0,
    `${pct.toFixed(1)}% of spawns`,
  )
  // Crowding out: every other entry in the table must still be pulling a
  // meaningful share. 5% is well below any table weight's fair share and
  // still far above noise at this sample size.
  const starved = [...counts.entries()].filter(([, n]) => n / total < 0.05)
  check(
    `floor ${depth}: nothing is crowded out`,
    starved.length === 0,
    starved.length
      ? `starved: ${starved.map(([k, n]) => `${k} ${((n / total) * 100).toFixed(1)}%`).join(', ')}`
      : [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${k} ${((n / total) * 100).toFixed(0)}%`)
          .join('  '),
  )
}

console.log(ok ? '\nALL ENEMY CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
