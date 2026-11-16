// The title and the endings fit the screen, in both palettes (#181).
//
//   npx tsx static/screens_test.ts
import { GBC_HEIGHT as H, GBC_WIDTH as W, LEGACY_WIDTH, PAL, TILE } from './constants'
import { CHAR, onScreen, overlap, type Box } from './hud'
import {
  ENDINGS, ENDING_COLS, ENDING_THEME, SUBTITLE, TITLE_THEME, endingHeight, endingLines, endingPrompt, summaryPalette, titleLayout, type Ending,
} from './screens'
import { ENTITY_ROWS } from './sprites'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

// --- the title
const clash = (boxes: [string, Box][]) => {
  for (let i = 0; i < boxes.length; i++) {
    if (!onScreen(boxes[i][1], W, H)) return `${boxes[i][0]} leaves the screen`
    for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i][1], boxes[j][1])) return `${boxes[i][0]} is over ${boxes[j][0]}`
  }
  return null
}
const named = (labels: string[], w = W): [string, Box][] => {
  const t = titleLayout(w, labels, TILE, ENTITY_ROWS)
  return [['the title', t.title], ['the subtitle', t.subtitle], ['the stage', t.stage], ...t.options.map((o, i): [string, Box] => [labels[i], o])]
}
for (const labels of [['New Game'], ['Continue', 'New Game']]) {
  const hit = clash(named(labels))
  check(`the title with ${labels.length} option${labels.length > 1 ? 's' : ''}: nothing overlaps or leaves the screen`, hit === null, hit ?? 'clean')
}
// The control: the sprites over the words is what the old title did.
const t = titleLayout(W, ['New Game'], TILE, ENTITY_ROWS)
const lifted: [string, Box][] = [['the subtitle', t.subtitle], ['the kid', { ...t.kid, y: t.subtitle.y - 4 }]]
check('and the check can fail: a figure moved up is over the subtitle', clash(lifted) !== null)
check('the subtitle did not fit the old screen, and does this one', SUBTITLE.length * CHAR > LEGACY_WIDTH && SUBTITLE.length * CHAR <= W - 16)
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height
check('both figures are on the lawn, and apart', inside(t.kid, t.stage) && inside(t.entity, t.stage) && !overlap(t.kid, t.entity))
check('the two figures stand on one line', t.kid.y + t.kid.height === t.entity.y + t.entity.height)
// Clear of the shell's rounded bottom corners.
const last = titleLayout(W, ['Continue', 'New Game'], TILE, ENTITY_ROWS).options[1]
check('the last option is clear of the bottom of the screen', last.y + last.height <= H - 12, `ends at ${last.y + last.height}`)

// --- the endings
for (const which of Object.keys(ENDINGS) as Ending[]) {
  const lines = endingLines(which)
  const widest = Math.max(...lines.map((l) => l.length))
  check(`${which}: every line fits`, widest <= ENDING_COLS && widest * CHAR <= W - 24, `${widest} characters`)
  // The prompt is a line at the bottom; the text is centred above the middle.
  check(`${which}: and the card fits over its prompt`, endingHeight(which) <= H - 56, `${endingHeight(which)} of ${H} pixels`)
  check(`${which}: no word was lost in the wrapping`, lines.filter(Boolean).join(' ') === ENDINGS[which].join(' '))
}
check('a phone is told A and a desktop Z', endingPrompt(false) === 'A: on' && endingPrompt(true) === 'Z: on')

// --- the green screen
const tones: number[] = Object.values(PAL)
check('the title is four tones on the green screen', Object.values(TITLE_THEME.dmg).every((c) => tones.includes(c)))
check('and so is each ending', Object.values(ENDING_THEME.dmg).every((e) => tones.includes(e.background) && tones.includes(e.text)))
check('and the tally after it', Object.values(summaryPalette('dmg')).every((c) => tones.includes(c)) && !Object.values(summaryPalette('gbc')).every((c) => tones.includes(c)))
check('and the check can fail: the colour title is not', !Object.values(TITLE_THEME.gbc).every((c) => tones.includes(c)))
for (const mode of ['gbc', 'dmg'] as const) {
  const th = TITLE_THEME[mode]
  // The entity is dark and the kid's outline is: the lawn must not be.
  check(`${mode}: the lawn is not the screen's colour`, th.stage !== th.background && th.stageEdge !== th.stage)
  check(`${mode}: nothing on the title is its background's colour`, [th.title, th.subtitle, th.option, th.selected, th.ghost].every((c) => c !== th.background))
  check(`${mode}: the chosen option is not the colour of the others`, mode === 'dmg' ? th.selected !== th.option : th.selected !== th.option)
  for (const e of Object.values(ENDING_THEME[mode])) if (e.background === e.text) check(`${mode}: an ending can be read`, false)
}

console.log(failed ? `\n${failed} FAILED` : '\nALL SCREEN CHECKS PASS')
process.exit(failed ? 1 : 0)
