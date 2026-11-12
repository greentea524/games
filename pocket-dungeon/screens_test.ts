// The title and the shop hold their text at the longest values (#159).
//
//   npx tsx pocket-dungeon/screens_test.ts
import { GBC_HEIGHT, GBC_WIDTH, PAL } from './constants'
import { CLASSES, SHOP_ITEMS } from './meta'
import { ITEMS } from './items'
import { CELL, MARGIN, SHOP, THEME, TITLE, wrappedLines } from './theme'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const fits = (text: string) => text.length * CELL <= GBC_WIDTH - 2 * MARGIN

check('wrapping counts lines as the screen does', wrappedLines('Balanced. Sturdy armor.', 13) === 2)
// The control for everything below that wraps.
check('and a line too long for its room is counted', wrappedLines('one two three four five six seven', 8) > 2)

// --- title
for (const cls of Object.values(CLASSES)) {
  const lines = wrappedLines(cls.description, TITLE.descChars)
  check(`${cls.name}'s description fits its ${TITLE.descLines} lines`, lines <= TITLE.descLines, `${lines}`)
  check(`${cls.name}'s stats fit one line`, fits(`HP ${cls.hp} ATK ${cls.atk} FD ${cls.hunger}`))
}
const descEnd = TITLE.descY + TITLE.descLines * (CELL + 2)
check('the description ends above the menu', descEnd <= TITLE.menuY, `${descEnd} against ${TITLE.menuY}`)
const menuEnd = TITLE.menuY + 2 * TITLE.menuGap + CELL
check('the menu ends above the run record', menuEnd < TITLE.recordY - 7, `${menuEnd} against ${TITLE.recordY}`)
check('the longest run record fits', fits('RUNS 9999 WIN 999 BEST 12'))
check('and the record is on the screen', TITLE.recordY + CELL <= GBC_HEIGHT - MARGIN)

// --- shop
const rowsEnd = SHOP.rowsY + (SHOP.rows - 1) * SHOP.rowGap + CELL
check('the last row ends above the divider', rowsEnd < SHOP.dividerY, `${rowsEnd} against ${SHOP.dividerY}`)
const descriptions = [
  ...Object.values(CLASSES).map((c) => c.description),
  ...SHOP_ITEMS.map((i) => i.description),
  // A recovered item's line: every item can be one.
  ...Object.values(ITEMS).map((d) => `From your last run. ${d.description}`),
]
const worst = descriptions.reduce((a, b) => (wrappedLines(a, SHOP.descChars) >= wrappedLines(b, SHOP.descChars) ? a : b))
check(
  `every description fits its ${SHOP.descLines} lines`,
  wrappedLines(worst, SHOP.descChars) <= SHOP.descLines,
  `"${worst}" takes ${wrappedLines(worst, SHOP.descChars)}`,
)
check('the description ends above the feedback line', SHOP.descY + SHOP.descLines * (CELL + 2) <= SHOP.infoY)
check('and the feedback above BACK', SHOP.infoY + CELL < SHOP.backY)
check('BACK is on the screen', SHOP.backY + CELL <= GBC_HEIGHT - 6)
const names = [...Object.values(CLASSES), ...SHOP_ITEMS, ...Object.values(ITEMS)].map((x) => x.name)
const longest = names.reduce((a, b) => (a.length >= b.length ? a : b))
// A cursor and a space, the name, a clear cell, then the widest cost.
check(`the longest name clears its cost`, fits(`> ${longest} OWNED`), longest)

// --- colours
const tones: number[] = Object.values(PAL)
check('the green screen uses only its four tones', Object.values(THEME.dmg).every((c) => tones.includes(c)))
const luma = (c: number) => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
for (const mode of ['gbc', 'dmg'] as const) {
  const t = THEME[mode]
  for (const role of ['text', 'dim', 'gold', 'good', 'bad'] as const) {
    const gap = luma(t[role]) - luma(t.bg)
    check(`${mode}: ${role} stands out from the background`, gap > 60, `${gap.toFixed(0)}`)
  }
}
// The control: the pair #158's empty pip was lost in must fail this.
check('and the check can fail: dark on darkest does not stand out', luma(PAL.dark) - luma(PAL.darkest) <= 60)

console.log(failed ? `\n${failed} FAILED` : '\nALL SCREEN CHECKS PASS')
process.exit(failed ? 1 : 0)
