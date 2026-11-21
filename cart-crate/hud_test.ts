// The HUD's layout holds at the longest values, on both kinds of device (#164).
//
//   npx tsx cart-crate/hud_test.ts
import { GBC_HEIGHT, GBC_WIDTH, PAL } from './constants'
import { CAMPAIGN_LEVELS } from './levels'
import { BAR_HEIGHT, CELL, HUD_THEME, collision, controlsLine, layout, type HudValues } from './hud'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const par = Math.max(...CAMPAIGN_LEVELS.map((l) => l.parMoves), 999)
// A three-digit stage, four-digit moves and a three-digit best, all at once.
const longest: HudValues = { stage: 999, moves: 9999, par, best: 999, desktop: true }
const cases: [string, HudValues][] = [
  ['the longest values, with a keyboard', longest],
  ['the longest values, on a phone', { ...longest, desktop: false }],
  ['a first visit', { stage: 1, moves: 0, par: 10, best: 0, desktop: false }],
]
for (const [name, values] of cases) {
  const hit = collision(layout(values, GBC_WIDTH, GBC_HEIGHT), GBC_WIDTH, GBC_HEIGHT)
  check(`nothing crowds or leaves the screen at ${name}`, hit === null, hit ?? 'clean')
}
// The control: the same HUD does not fit the screen it replaced.
const old = collision(layout(longest, 160, 144), 160, 144)
check('and the check can fail: this layout does not fit 160×144', old !== null, old ?? 'it fitted')

const boxes = layout(longest, GBC_WIDTH, GBC_HEIGHT)
check('everything sits inside the two bars', boxes.every((b) => b.y + b.height <= BAR_HEIGHT || b.y >= GBC_HEIGHT - BAR_HEIGHT))
check('every line sits on a whole pixel', boxes.every((b) => Number.isInteger(b.x) && Number.isInteger(b.y)))
check('a level never cleared shows no best', !layout({ ...longest, best: 0 }, GBC_WIDTH, GBC_HEIGHT).some((b) => b.name === 'best'))

// A phone has no Z, H or R: its line must not name a key it does not have.
const phone = controlsLine(false)
const keys = phone.split(' ').filter(Boolean).map((part) => part.split(':')[0])
check('the phone\'s line names only the shell\'s buttons', keys.every((k) => ['A', 'B', 'SEL', 'START'].includes(k)), keys.join(', '))
check('and the keyboard\'s names keys', controlsLine(true).includes('Z:') && controlsLine(true).includes('H:') && controlsLine(true).includes('R:'))
check('both fit the screen', [true, false].every((d) => controlsLine(d).length * CELL <= GBC_WIDTH - 18))

const tones: number[] = Object.values(PAL)
check('the green screen uses only its four tones', Object.values(HUD_THEME.dmg).every((c) => tones.includes(c)))
const luma = (c: number) => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
for (const mode of ['gbc', 'dmg'] as const) {
  const t = HUD_THEME[mode]
  for (const role of ['text', 'dim', 'accent'] as const) {
    const gap = luma(t[role]) - luma(t.bar)
    check(`${mode}: ${role} stands out from the bar`, gap > 60, `${gap.toFixed(0)}`)
  }
}
check('and the check can fail: dark on darkest does not stand out', luma(PAL.dark) - luma(PAL.darkest) <= 60)

console.log(failed ? `\n${failed} FAILED` : '\nALL HUD CHECKS PASS')
process.exit(failed ? 1 : 0)
