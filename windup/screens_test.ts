// Checks on Windup's title, info pages and pause panel (#170).
// Run with `npx tsx windup/screens_test.ts`.

import { SCREEN_W, SCREEN_H, CHAR, overlap, type Box } from './hud'
import {
  TITLE, TITLE_PX, LINE, LEDGE_Y, INFO_COLS, titleLayout, infoLayout, pauseLayout, panelFor, wrap, howToPlay, ABOUT,
} from './screens'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const onScreen = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.width <= SCREEN_W && b.y + b.height <= SCREEN_H
const within = (inner: Box, outer: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

console.log('\n### windup screens ###\n')

// --- the title ------------------------------------------------------------------

const titleBox: Box = { x: (SCREEN_W - TITLE.length * TITLE_PX) / 2, y: 18, width: TITLE.length * TITLE_PX, height: TITLE_PX }
/** The toy and the station stand on the ledge at twice their size: 48 pixels of picture. */
const figures = (l: ReturnType<typeof titleLayout>): Box => ({ x: l.toy.x - 30, y: LEDGE_Y - 46, width: l.station.x - l.toy.x + 60, height: 46 })

for (const items of [['NEW GAME', 'HOW TO PLAY', 'ABOUT'], ['CONTINUE', 'NEW GAME', 'HOW TO PLAY', 'ABOUT']]) {
  const l = titleLayout(items)
  const texts = items.map((s, i) => ({ x: l.items[i].x, y: l.items[i].y, width: s.length * CHAR, height: CHAR }))
  check(`with ${items.length} choices: every choice is inside the panel, with its cursor`,
    texts.every((t) => within(t, l.panel)) && l.items.every((it) => it.cursor.x - 4 > l.panel.x))
  check(`with ${items.length} choices: title, panel and figures are on the screen and clear of each other`,
    onScreen(titleBox) && onScreen(l.panel) && onScreen(figures(l)) &&
    !overlap(titleBox, l.panel) && !overlap(l.panel, figures(l)),
    `panel ${l.panel.y}-${l.panel.y + l.panel.height}, figures from ${LEDGE_Y - 46}`)
  check(`with ${items.length} choices: a tap's row is one choice's`, l.items.every((it, i) => i === 0 || it.y - l.items[i - 1].y === LINE))
}

// --- the info pages ----------------------------------------------------------------

for (const [name, text] of [['controls on a phone', howToPlay(false)], ['controls on a desktop', howToPlay(true)], ['about', ABOUT]] as const) {
  const lines = wrap(text, INFO_COLS)
  const l = infoLayout(lines)
  check(`${name}: every line fits ${INFO_COLS} characters`, lines.every((s) => s.length <= INFO_COLS), `${lines.length} lines`)
  check(`${name}: the page is on the screen, under the title and above the ledge`,
    onScreen(l.panel) && !overlap(l.panel, titleBox) && l.panel.y + l.panel.height <= LEDGE_Y,
    `${l.panel.y}-${l.panel.y + l.panel.height}`)
}
check('a phone is told about buttons and a desktop about keys',
  /D-PAD/.test(howToPlay(false)) && !/\bZ\b/.test(howToPlay(false)) && /ARROWS/.test(howToPlay(true)) && /\bZ\b/.test(howToPlay(true)))

{
  // Control: the pages as they were wrapped for the old screen, 140 pixels,
  // are seventeen characters a line, and at 26 a line of them is too long.
  const old = wrap(howToPlay(false), 17)
  const l = infoLayout(old)
  check('control: wrapped for the old screen, the page runs into the ledge', l.panel.y + l.panel.height > LEDGE_Y, `${old.length} lines`)
}

// --- the pause panel ------------------------------------------------------------------

{
  const items = ['RESUME', 'SOUND: OFF', 'QUIT TO MENU']
  const l = pauseLayout(items)
  const heading = { x: SCREEN_W / 2 - 6 * 8, y: l.heading.y, width: 6 * 16, height: 16 }
  const texts = items.map((s, i) => ({ x: l.items[i].x, y: l.items[i].y, width: s.length * CHAR, height: CHAR }))
  check('pause: PAUSED and every choice are inside the panel, on the screen',
    onScreen(l.panel) && within(heading, l.panel) && texts.every((t) => within(t, l.panel)))
  check('pause: PAUSED is clear of the first choice', heading.y + heading.height <= texts[0].y - 2)
  // Control: a panel sized to the shortest label would cut the longest.
  const narrow = panelFor(6, items.length + 2, 48)
  check('control: a panel sized for RESUME does not hold QUIT TO MENU', !within({ ...texts[2], x: narrow.x + 20 }, narrow))
}

console.log(failed ? `\n${failed} FAILED\n` : '\nALL SCREEN CHECKS PASS\n')
process.exit(failed ? 1 : 0)
