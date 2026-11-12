// The HUD's layout holds at the longest values the game reaches (#158).
//
//   npx tsx pocket-dungeon/hud_test.ts
import { GBC_HEIGHT, GBC_WIDTH, LEGACY_HEIGHT, LEGACY_WIDTH } from './constants'
import { FINAL_DEPTH, RELICS } from './relics'
import { BAR_HEIGHT, CELL, ICONS, collision, hpFill, layout, type HudValues } from './hud'
import { ITEMS } from './items'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const best = (pick: (d: (typeof ITEMS)[string]) => number | undefined) =>
  Math.max(...Object.values(ITEMS).map((d) => pick(d) ?? 0))

// The longest of everything at once. Bonuses are read from the item table so
// a longer sword lengthens this with it.
const longest: HudValues = {
  floor: Math.max(FINAL_DEPTH, 99),
  hp: 999,
  maxHp: 999,
  food: 100,
  maxFood: 100,
  gold: 9999,
  atk: 99,
  weapon: best((d) => d.atkBonus),
  armour: best((d) => d.defBonus),
  keys: 9,
  relics: RELICS.length,
}
const cases: [string, HudValues][] = [
  ['the longest values', longest],
  ['the longest values, starving', { ...longest, food: 0 }],
  ['a fresh run', { ...longest, floor: 1, hp: 20, maxHp: 20, gold: 0, atk: 4, weapon: 0, armour: 0, keys: 0 }],
]
for (const [name, values] of cases) {
  const hit = collision(layout(values, GBC_WIDTH, GBC_HEIGHT), GBC_WIDTH, GBC_HEIGHT)
  check(`nothing overlaps or leaves the screen at ${name}`, hit === null, hit ?? 'clean')
}

// The control: the same HUD does not fit the screen it replaced, so the check
// above is measuring something.
const old = collision(layout(longest, LEGACY_WIDTH, LEGACY_HEIGHT), LEGACY_WIDTH, LEGACY_HEIGHT)
check('and the check can fail: this layout does not fit 160×144', old !== null, old ?? 'it fitted')

const boxes = layout(longest, GBC_WIDTH, GBC_HEIGHT)
const inBars = boxes.every((b) => b.y + b.height <= BAR_HEIGHT || b.y >= GBC_HEIGHT - BAR_HEIGHT)
check('everything sits inside the two bars', inBars)
check(
  'every line of text sits on a whole pixel',
  boxes.every((b) => Number.isInteger(b.x) && Number.isInteger(b.y)),
)

check('an empty HP bar is empty', hpFill(0, 20, 58) === 0)
check('a full one is full', hpFill(20, 20, 58) === 58)
check('one point of health still shows', hpFill(1, 999, 58) === 1)
check('and it never overfills', hpFill(30, 20, 58) === 58)

for (const [name, icon] of Object.entries(ICONS)) {
  const square = icon.rows.length === CELL && icon.rows.every((r) => r.length === CELL)
  check(`the ${name} picture is ${CELL} by ${CELL}`, square)
  check(`and is not blank`, icon.rows.some((r) => r.includes('#')))
}

console.log(failed ? `\n${failed} FAILED` : '\nALL HUD CHECKS PASS')
process.exit(failed ? 1 : 0)
