// The title, the story, the controls and the forest path fit the real screen
// (#175).
//
//   npx tsx lantern-keeper/screens_test.ts
import { GBC_HEIGHT as H, GBC_WIDTH as W, LEGACY_HEIGHT, LEGACY_WIDTH } from './constants'
import {
  CHAR, MAP_TITLE, PAGE_COLS, SCREEN_COLOURS, STORY, TITLE, controls, mapLayout, pageLayout, pageLines, titleLayout, type Box,
} from './screens'
import { SIZE } from './sprites'
import { STAGES } from './stages'
import { contrast } from './hud'
import { wrapText } from './text'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height
const screen = (w: number, h: number): Box => ({ x: 0, y: 0, width: w, height: h })

// --- the title
const clash = (named: [string, Box][], w: number, h: number) => {
  for (let i = 0; i < named.length; i++) {
    if (!inside(named[i][1], screen(w, h))) return `${named[i][0]} leaves the screen`
    for (let j = i + 1; j < named.length; j++) if (overlap(named[i][1], named[j][1])) return `${named[i][0]} is over ${named[j][0]}`
  }
  return null
}
const titleBoxes = (labels: string[], w = W, h = H): [string, Box][] => {
  const t = titleLayout(w, h, labels, SIZE.player_idle, SIZE.lanternLit)
  return [['the title', t.title], ['the panel', t.panel], ['the keeper', t.keeper], ['the lantern', t.lantern], ['the ground', t.ground]]
}
for (const labels of [['Start Game', 'Controls', 'About'], ['Continue', 'New Game', 'Controls', 'About']]) {
  const hit = clash(titleBoxes(labels), W, H)
  check(`the title with ${labels.length} choices: nothing overlaps or leaves the screen`, hit === null, hit ?? 'clean')
  const t = titleLayout(W, H, labels, SIZE.player_idle, SIZE.lanternLit)
  check('and every choice is on its panel', t.options.every((o) => inside(o, t.panel)))
}
const old = clash(titleBoxes(['Continue', 'New Game', 'Controls', 'About'], LEGACY_WIDTH, LEGACY_HEIGHT), LEGACY_WIDTH, LEGACY_HEIGHT)
check('and the check can fail: it does not fit 160×144', old !== null, old ?? 'it fitted')
const t = titleLayout(W, H, ['Start Game'], SIZE.player_idle, SIZE.lanternLit)
check('the keeper and the lantern stand on the ground', t.keeper.y + t.keeper.height === t.ground.y && t.lantern.y + t.lantern.height === t.ground.y)
check('the title is the name of the game, not RETRO PAD', TITLE === 'LANTERN KEEPER')
// Only the bottom right corner is rounded by the shell, and the title is at
// the top; it still keeps a margin either side.
check('the title keeps a margin either side', t.title.x >= 8 && t.title.x + t.title.width <= W - 8, `from ${t.title.x}`)

// --- the pages
for (const [name, paragraphs] of [['the story', STORY], ['the desktop controls', controls(true)], ['the phone controls', controls(false)]] as const) {
  const lines = name === 'the story' ? pageLines([...paragraphs]) : [...paragraphs]
  const heading: Box = { x: 0, y: 22, width: W, height: CHAR * 2 }
  const page = pageLayout(W, heading, lines.length)
  const widest = Math.max(...lines.map((l) => l.length))
  check(`${name}: every line fits the panel`, widest <= PAGE_COLS && page.width >= widest * CHAR + 16, `${widest} characters`)
  check(`${name}: the panel is on the screen, with room for the way back under it`, inside(page, screen(W, H)) && page.y + page.height + 30 <= H - 12)
  // The way back sits ten under the panel and is eighteen tall. The menu
  // scene shows the keeper on the controls and hides them on the story.
  const back: Box = { x: 0, y: page.y + page.height + 5, width: W, height: 18 }
  const figure = titleLayout(W, H, ['x'], SIZE.player_idle, SIZE.lanternLit).keeper
  const clear = !overlap(back, figure) && !overlap(page, figure)
  if (name === 'the story') check('the story reaches the keeper, which is why it is shown without them', !clear)
  else check(`${name}: and clear of the keeper on the stone`, clear)
}
check('no word of the story is lost in the wrapping', pageLines(STORY).filter(Boolean).join(' ') === STORY.join(' '))
check('a phone is told about the pad and buttons, not keys', controls(false).every((l) => !/Arrows|Z |X:|Enter|Shift/.test(l)))
check('and a desktop about its keys', controls(true).some((l) => l.startsWith('Arrows')) && controls(true).some((l) => l.startsWith('X:')))
check('wrapping breaks at spaces', wrapText('a bb ccc', 4).join('|') === 'a bb|ccc')

// --- the forest path
const m = mapLayout(W, H, STAGES.length)
const between = m.nodes.every((n) => n.x - 12 >= 0 && n.x + 12 <= W && n.y - 20 > m.title.y + m.title.height && n.y + 12 < m.label.y)
check('every stage is on the path, between the title and the label', between, JSON.stringify(m.nodes))
const close = m.nodes.some((a, i) => m.nodes.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < 30))
check('and no two are closer than a lantern and its marker', !close)
check('the title of the path fits', MAP_TITLE.length * CHAR <= W - 24)
const longest = Math.max(...STAGES.map((s) => s.title.length))
check('every stage\'s name fits its label', longest * CHAR <= m.label.width, `${longest} characters`)
// The control: the layout on the old screen does not keep its nodes apart.
const oldMap = mapLayout(LEGACY_WIDTH, LEGACY_HEIGHT, STAGES.length)
check('and the check can fail: on 160×144 the stages crowd', oldMap.nodes.some((a, i) => oldMap.nodes.some((b, j) => i < j && Math.hypot(a.x - b.x, a.y - b.y) < 30)) || oldMap.nodes.some((n) => n.y + 12 >= oldMap.label.y))

// --- read on a phone
const c = SCREEN_COLOURS
check('the title, choices and text read on their panel', [c.title, c.text, c.selected].every((k) => contrast(k, c.panel) >= 7))
check('the choices not chosen read too, and are told from the one that is', contrast(c.dim, c.panel) >= 4.5 && c.dim !== c.selected)

console.log(failed ? `\n${failed} FAILED` : '\nALL SCREEN CHECKS PASS')
process.exit(failed ? 1 : 0)
