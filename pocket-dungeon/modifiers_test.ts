// Per-floor modifier checks (#69).
//
//   npx tsx pocket-dungeon/modifiers_test.ts
//
// The roll is pure, so this needs no browser. Run it after touching
// `modifiers.ts` or the RNG.
//
// The sequence-diversity check at the bottom is the important one. The first
// implementation seeded the roll `runSeed + depth * stride`, which looks
// perfectly reasonable and produces a textbook distribution — every modifier
// at exactly its table weight. It was still completely broken: `RNG` is a
// linear congruential generator, so its output is affine in its seed, and
// stepping depth by a constant walked a fixed ramp. Every run got the *same
// ordered sequence*, entering it at a different point. Seeds 1, 2 and 3 were
// identical floor for floor, which is the precise opposite of what this
// feature exists to do.
import { rollModifier, modifierSeed, MODIFIER_TABLE, MODIFIER_MIN_DEPTH, BOSS_DEPTH, MAX_BANNER_CHARS } from './modifiers'
import { BOSS_DEPTHS, isBossFloor } from './bosses'
import { rollFloorItems } from './items'
import { RNG } from './rng'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const roll = (seed: number, depth: number) =>
  rollModifier(depth, new RNG(modifierSeed(seed, depth)))

// Boss floors are excluded (#85), not just the last one. Without this the
// list claims two floors are eligible that can never roll anything, and the
// distribution below would be measured against a denominator that is wrong.
const ELIGIBLE = [] as number[]
for (let d = MODIFIER_MIN_DEPTH; d < BOSS_DEPTH; d++) {
  if (!isBossFloor(d)) ELIGIBLE.push(d)
}

// --- suppression -----------------------------------------------------------

let earlyHits = 0
let bossHits = 0
for (let seed = 0; seed < 4000; seed++) {
  for (let d = 1; d < MODIFIER_MIN_DEPTH; d++) if (roll(seed, d)) earlyHits++
  if (roll(seed, BOSS_DEPTH)) bossHits++
}
check('floors below the minimum never roll a modifier', earlyHits === 0, `${earlyHits} hits`)
check('the boss floor never rolls a modifier', bossHits === 0, `${bossHits} hits`)

// Every boss floor, not only the last (#85). A modifier on a boss floor turns
// that fight into a coin flip — Brittle doubles damage both ways, and against
// the Cellar Brute's 22 HP that decides it before it starts.
let bossFloorHits = 0
for (let seed = 0; seed < 4000; seed++) {
  for (const d of BOSS_DEPTHS) if (roll(seed, d)) bossFloorHits++
}
check(
  'no boss floor rolls a modifier',
  bossFloorHits === 0,
  `${bossFloorHits} hits across floors ${BOSS_DEPTHS.join(', ')}`,
)
check(
  'and the eligible list excludes them',
  ELIGIBLE.every((d) => !isBossFloor(d)),
  `eligible: ${ELIGIBLE.join(', ')}`,
)

// --- determinism -----------------------------------------------------------

let stable = true
for (let seed = 0; seed < 500; seed++) {
  if ((roll(seed, 7)?.key ?? null) !== (roll(seed, 7)?.key ?? null)) stable = false
}
check('the same seed and depth always give the same modifier', stable)

// --- distribution ----------------------------------------------------------

const counts = new Map<string, number>()
const SAMPLES = 20000
for (let seed = 0; seed < SAMPLES; seed++) {
  const key = roll(seed, 6)?.key ?? '(none)'
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
const totalWeight = MODIFIER_TABLE.reduce((s, e) => s + e.weight, 0)
let worstDrift = 0
for (const entry of MODIFIER_TABLE) {
  const key = entry.modifier?.key ?? '(none)'
  const got = (counts.get(key) ?? 0) / SAMPLES
  worstDrift = Math.max(worstDrift, Math.abs(got - entry.weight / totalWeight))
}
check(
  'every modifier in the table can come up',
  counts.size === MODIFIER_TABLE.length,
  `${counts.size} of ${MODIFIER_TABLE.length}`,
)
check('the observed weights match the table', worstDrift < 0.03, `worst drift ${(worstDrift * 100).toFixed(1)}pp`)

// --- sequence diversity: the check that catches the affine-seed bug --------

const sequence = (seed: number) => ELIGIBLE.map((d) => roll(seed, d)?.key ?? '-').join(',')
const seqs = new Set<string>()
const SEQ_SAMPLES = 5000
for (let seed = 0; seed < SEQ_SAMPLES; seed++) seqs.add(sequence(seed))
// This is the guard, and it is proven: re-seeding with the original
// `runSeed + depth * 7919` collapses this from 4982 to **63** distinct
// sequences across the same 5000 seeds, well under the threshold.
//
// It is deliberately the only structural check here. A companion check for
// "consecutive seeds are shifts of one another" was written first and
// removed: it reported 0/500 against the *buggy* scheme, because the shift
// structure there relates seeds a stride apart rather than adjacent ones. It
// passed for the wrong reason, which is worse than not existing.
check(
  'different runs get different modifier sequences',
  seqs.size > SEQ_SAMPLES * 0.9,
  `${seqs.size} distinct sequences from ${SEQ_SAMPLES} seeds`,
)

// --- Famine's food suppression --------------------------------------------
//
// Checked over many rolls rather than on one floor. A single floor is not
// evidence: an ordinary floor rolls 2-4 items from a pool where food is only
// part of the weight, so it lands on zero food often enough that "Famine had
// none" says nothing on its own — the first in-browser run of this had a
// *baseline* floor with zero food.
let famineFood = 0
let normalFood = 0
for (let seed = 0; seed < 2000; seed++) {
  famineFood += rollFloorItems(6, new RNG(seed), { suppressFood: true }).filter(
    (i) => i.hungerRestore,
  ).length
  normalFood += rollFloorItems(6, new RNG(seed)).filter((i) => i.hungerRestore).length
}
check('famine suppresses food entirely', famineFood === 0, `${famineFood} food items over 2000 floors`)
check(
  'food does otherwise spawn, so the check above means something',
  normalFood > 200,
  `${normalFood} food items over 2000 unmodified floors`,
)

// --- banner copy fits the screen ------------------------------------------
//
// Press Start 2P is a fixed 8px grid and the screen is 160px, so 20 characters
// fill it exactly. Measured in a browser to confirm the advance really is 8px
// per character rather than assumed.
const tooWide = MODIFIER_TABLE.flatMap((e) =>
  e.modifier
    ? [e.modifier.name, e.modifier.blurb].filter((line) => line.length > MAX_BANNER_CHARS)
    : [],
)
check(
  'every banner line fits the 160px screen',
  tooWide.length === 0,
  tooWide.length ? `over ${MAX_BANNER_CHARS} chars: ${tooWide.join(', ')}` : `all within ${MAX_BANNER_CHARS}`,
)

console.log(ok ? '\nALL MODIFIER CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
