// Stage-registry checks (#88).
//
//   npx tsx lantern-keeper/stages_test.ts
//
// Adding a stage to this game used to mean editing five files, and twice in
// one sitting a stage went in half-registered — once the advance never fired,
// so the level existed and was unreachable in normal play. The list is shared
// now; these are the invariants that make sharing it worth anything.
import { STAGES, STAGE_KEYS, stageFor, stageIndex } from './stages'
import { DARKNESS_ALPHA } from './constants'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

check('there are stages at all', STAGES.length > 0, `${STAGES.length} stages`)
check(
  'every key is unique',
  new Set(STAGE_KEYS).size === STAGE_KEYS.length,
  STAGE_KEYS.join(', '),
)
check('STAGE_KEYS is in the same order as STAGES', STAGE_KEYS.every((k, i) => STAGES[i].key === k))

// Every stage needs a darkness level. Falling through to the 0.85 default is
// survivable but means the stage was never actually tuned, which is the sort
// of omission this file exists to surface.
const undarkened = STAGES.filter((s) => DARKNESS_ALPHA[s.key] === undefined)
check(
  'every stage has a tuned darkness level',
  undarkened.length === 0,
  undarkened.map((s) => s.key).join(', ') || 'all set',
)
const outOfRange = STAGES.filter((s) => {
  const a = DARKNESS_ALPHA[s.key]
  return a !== undefined && (a <= 0 || a >= 1)
})
check('and none of them is fully lit or fully black', outOfRange.length === 0,
  outOfRange.map((s) => s.key).join(', '))

// The title is drawn as a toast at 8px on a 160px screen, so 20 characters
// fill it exactly. Measured in a browser when the modifier banners were built.
const tooWide = STAGES.filter((s) => s.title.length > 20)
check(
  'every title fits the screen',
  tooWide.length === 0,
  tooWide.map((s) => `${s.title} (${s.title.length})`).join(', ') || 'all within 20 chars',
)
check('titles are unique', new Set(STAGES.map((s) => s.title)).size === STAGES.length)

// Spawn points have to be inside a plausible map. A negative or zero spawn is
// always a mistake; the upper bound is loose on purpose, because the vertical
// stages are genuinely tall.
const badSpawn = STAGES.filter((s) => s.spawnX <= 0 || s.spawnY <= 0 || s.spawnY > 2000)
check('every spawn point is on the map', badSpawn.length === 0, badSpawn.map((s) => s.key).join(', '))

// Lookups must not silently succeed on a key that does not exist — the whole
// point is that a typo is caught rather than quietly starting level 1.
check('a known key resolves to itself', stageFor('grove').key === 'grove')
check('stageIndex agrees with the array', STAGES.every((s, i) => stageIndex(s.key) === i))
check('an unknown key falls back to the first stage', stageFor('nope').key === STAGES[0].key)
check('and an unknown index falls back to zero', stageIndex('nope') === 0)

console.log(ok ? '\nALL STAGE CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
