// The Relic Hunt (#84).
//
//   npx tsx pocket-dungeon/relics_test.ts
//
// The load-bearing checks here are the two reachability ones. This feature
// replaces an unconditional victory — walk onto the stairs on floor 12 — with
// one that has to be earned, and the whole risk of that trade is that the win
// becomes *unreachable* instead of merely harder. There is no way back up a
// floor in this game, so a relic missed is a relic missed forever, and a run
// that arrives on the last floor one relic short is a softlock with no
// recovery: the player can only starve.
//
// So: every relic must have a guaranteed source, the target must equal what a
// run actually contains, and the boss that carries each one must stand between
// the player and the stairs off its floor.
import { RELICS, RELIC_TARGET, FINAL_DEPTH, RELIC_COPY, relicForBoss, relicById, hasAllRelics } from './relics'
import { BOSS_DEPTHS, BOSS_FLOORS, isBossFloor, biomeFinalFloors } from './bosses'
import { BOSS_DEPTH, MAX_BANNER_CHARS } from './modifiers'
import { getBiome } from './enemies'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- the win is reachable --------------------------------------------------

check(
  'every relic has a boss to come from',
  RELICS.every((r) => BOSS_FLOORS[r.floor]?.id === r.bossId),
  RELICS.map((r) => `${r.name}<-${r.bossId}@${r.floor}`).join(', '),
)
check(
  'and every boss carries one, so none is a dead end',
  BOSS_DEPTHS.every((d) => relicForBoss(BOSS_FLOORS[d].id) !== null),
  `${BOSS_DEPTHS.length} bosses, ${RELICS.length} relics`,
)
// The one that matters. If the target ever exceeds the number of guaranteed
// sources, the game cannot be won at all.
check(
  'the target is exactly what a run contains',
  RELIC_TARGET === BOSS_DEPTHS.length,
  `need ${RELIC_TARGET}, a run offers ${BOSS_DEPTHS.length}`,
)
check(
  'the last relic is on the last floor, so the portal can open',
  Math.max(...RELICS.map((r) => r.floor)) === FINAL_DEPTH,
  `deepest relic on ${Math.max(...RELICS.map((r) => r.floor))}, run ends on ${FINAL_DEPTH}`,
)

// The floors carrying a relic must be exactly the floors whose stairs the
// scene seals. `bossBlocksStairs()` keys off `isBossFloor`, so a relic on a
// floor that is not a boss floor would be skippable — and a boss floor with
// no relic would seal the stairs for nothing.
check(
  'every relic floor is a sealed floor',
  RELICS.every((r) => isBossFloor(r.floor)),
  RELICS.map((r) => r.floor).join(', '),
)
check(
  'and every sealed floor pays a relic',
  BOSS_DEPTHS.every((d) => RELICS.some((r) => r.floor === d)),
)

// --- the schedule is derived, not restated ---------------------------------

check(
  'one relic at the end of every biome',
  JSON.stringify(RELICS.map((r) => r.floor)) === JSON.stringify(biomeFinalFloors(FINAL_DEPTH)),
  `${RELICS.map((r) => r.floor).join(',')} vs ${biomeFinalFloors(FINAL_DEPTH).join(',')}`,
)
check(
  'one per biome, none doubled up',
  new Set(RELICS.map((r) => r.biome)).size === RELICS.length,
  RELICS.map((r) => `${r.biome}:${r.name}`).join(', '),
)
check(
  'each relic names the biome its boss actually stands in',
  RELICS.every((r) => r.biome === getBiome(r.floor)),
)
// `modifiers.ts` holds the same number under a name whose own comment admits
// it means "the end of the run". They are separate constants; this is what
// stops them drifting.
check(
  'FINAL_DEPTH agrees with the modifier table\'s end-of-run depth',
  FINAL_DEPTH === BOSS_DEPTH,
  `${FINAL_DEPTH} vs BOSS_DEPTH ${BOSS_DEPTH}`,
)

// --- identity --------------------------------------------------------------

check('ids are unique', new Set(RELICS.map((r) => r.id)).size === RELICS.length)
check('names are unique', new Set(RELICS.map((r) => r.name)).size === RELICS.length)
check(
  'every relic can be looked up by id',
  RELICS.every((r) => relicById(r.id)?.name === r.name),
)
check('an unknown id resolves to nothing', relicById('not_a_relic') === null)
check('an unknown boss carries nothing', relicForBoss('not_a_boss') === null)

// --- the portal opens exactly when it should -------------------------------

const all = RELICS.map((r) => r.id)
check('no relics does not open the portal', !hasAllRelics([]))
for (let i = 1; i < all.length; i++) {
  check(
    `${i} of ${all.length} does not open the portal`,
    !hasAllRelics(all.slice(0, i)),
    all.slice(0, i).join(', '),
  )
}
check('the full set does', hasAllRelics(all))
// Order is how the run hands them over, but the check must not depend on it.
check('and order does not matter', hasAllRelics([...all].reverse()))
// Junk in the list must not stand in for a real relic.
check(
  'a bag of unrelated ids does not',
  !hasAllRelics(['gold', 'bread', 'flame_brand']),
)
check(
  'nor does padding a short set with junk',
  !hasAllRelics([all[0], 'bread', 'flame_brand', 'gold']),
  'one real relic plus three items',
)

// --- HUD copy fits ---------------------------------------------------------
//
// Press Start 2P is a fixed 8px grid on a 160px screen. These lines are
// centred on a *tile* rather than on the screen, so they have less room than
// the modifier banners, not more — MAX_BANNER_CHARS is the ceiling they hold
// to and this stays under it.
const tooWide = Object.entries(RELIC_COPY).filter(([, line]) => line.length > MAX_BANNER_CHARS)
check(
  'every on-screen line fits the screen',
  tooWide.length === 0,
  tooWide.length
    ? `over ${MAX_BANNER_CHARS}: ${tooWide.map(([k, v]) => `${k}="${v}"`).join(', ')}`
    : `longest ${Math.max(...Object.values(RELIC_COPY).map((l) => l.length))} of ${MAX_BANNER_CHARS}`,
)
// The pickup toast is `${name}\nRELIC n/N`, and the name is the wide line.
const longestName = Math.max(...RELICS.map((r) => r.name.length))
check(
  'and so does the widest relic name in the pickup toast',
  longestName <= MAX_BANNER_CHARS,
  `${longestName} of ${MAX_BANNER_CHARS}`,
)
check(
  'every relic has a blurb',
  RELICS.every((r) => r.blurb.length > 0 && r.blurb.length <= MAX_BANNER_CHARS),
)

console.log(ok ? '\nALL RELIC CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
