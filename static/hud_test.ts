// Static's text fits its boxes, and its boxes stay out of each other's way (#180).
//
//   npx tsx static/hud_test.ts
import { GBC_HEIGHT as H, GBC_WIDTH as W, LEGACY_HEIGHT, LEGACY_WIDTH, TILE } from './constants'
import {
  BODY_LINES, CHAR, COLS, DIALOGUE_HEIGHT, LINE, TOAST_COLS, banner, choices, covers, dialogue, dialogueOnTop, minimap,
  CORNERS, minimapCorner, onScreen, overlap, prompt, promptText, toast, wrap,
} from './hud'
import { ITEMS, TRANSFORMS } from './items'

// `dialogue.ts` reaches the save through `state.ts` as it loads.
;(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
const D = (await import('./dialogue')) as unknown as Record<string, unknown>

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

// Every definition the file exports, and every person in NPCS: found by
// shape, so a conversation added later is measured without being listed here.
interface Line { text: string; choice?: { label: string }[] }
interface Def { name: string; branches: { lines: Line[] }[] }
const isDef = (v: unknown): v is Def => !!v && typeof v === 'object' && Array.isArray((v as Def).branches)
const defs: Def[] = [...Object.values(D).filter(isDef), ...Object.values(D.NPCS as Record<string, Def>)]
const lines = defs.flatMap((d) => d.branches.flatMap((b) => b.lines))
check('the dialogue was found', defs.length >= 30 && lines.length >= 150, `${defs.length} speakers, ${lines.length} lines`)

// --- wrapping
check('a line wraps at a space', wrap('one two three', 7).join('|') === 'one two|three')
check('and keeps a break that was written', wrap('one\ntwo', 20).join('|') === 'one|two')
const tall = lines.filter((l) => wrap(l.text, COLS).length > BODY_LINES)
const tallest = Math.max(...lines.map((l) => wrap(l.text, COLS).length))
check(`every line of dialogue fits ${BODY_LINES} rows of ${COLS}`, tall.length === 0, tall.length ? `"${tall[0].text.slice(0, 30)}…" and ${tall.length - 1} more` : `the tallest is ${tallest}`)
const wide = lines.flatMap((l) => wrap(l.text, COLS)).filter((row) => row.length > COLS)
check('and no word is wider than the box', wide.length === 0, wide[0] ?? '')
// The control: the screen this replaced. Its box held eighteen characters.
const oldCols = Math.floor((LEGACY_WIDTH - 16) / CHAR)
const oldTall = lines.filter((l) => wrap(l.text, oldCols).length > BODY_LINES).length
check('and the check can fail: at the old width, lines run over', oldTall > 0, `${oldTall} lines over ${BODY_LINES} rows at ${oldCols} characters`)

// --- the dialogue box
for (const top of [false, true]) {
  const d = dialogue(W, H, top)
  const where = top ? 'along the top' : 'along the bottom'
  check(`the box is on the screen ${where}`, onScreen(d.box, W, H))
  const bodyRight = d.body.x + COLS * CHAR
  const bodyBottom = d.body.y + (BODY_LINES - 1) * LINE + CHAR
  check(`and holds a full body ${where}`, bodyRight <= d.box.x + d.box.width - 4 && bodyBottom <= d.box.y + d.box.height - 4, `text ends at ${bodyRight}, ${bodyBottom}`)
  const longestName = Math.max(...defs.map((x) => x.name.length))
  check(`and the longest name ${where}`, d.name.x + longestName * CHAR <= d.box.x + d.box.width - 4, `${longestName} characters`)
  // The arrow is drawn from its right edge, under the last line.
  check(`the arrow is clear of the text ${where}`, d.arrow.y >= bodyBottom - CHAR && d.arrow.x <= d.box.x + d.box.width - 4)
  const asked = lines.filter((l) => l.choice)
  for (const l of asked) {
    const c = choices(l.choice!.map((o) => o.label), d, top)
    const ok = onScreen(c.box, W, H) && !overlap(c.box, d.box)
    if (!ok) check(`the answers to "${l.text.slice(0, 20)}…" fit ${where}`, false)
  }
  check(`every set of answers is on the screen, beside the box ${where}`, asked.length > 0, `${asked.length} questions`)
}
check('the box takes under three tenths of the screen', DIALOGUE_HEIGHT / H < 0.3, `${DIALOGUE_HEIGHT} of ${H} pixels`)

// Where it goes. The camera centres the kid in the town; a room does not scroll.
check('the kid mid-screen leaves the box at the bottom', !dialogueOnTop([H / 2], H, TILE))
check('the kid at a room\'s door sends it to the top', dialogueOnTop([H - TILE * 1.5], H, TILE))
check('and so does someone they face there', dialogueOnTop([H / 2, H - TILE], H, TILE))
const topBox = dialogue(W, H, true).box
check('at the top it is clear of anyone that low', topBox.y + topBox.height <= H - TILE * 1.5 - TILE / 2)

// --- the minimap
const town = minimap(24, 22, W, H)
check('the minimap is on the screen', onScreen(town.box, W, H))
const share = (town.box.width * town.box.height) / (W * H)
check('and takes under a twentieth of it', share < 0.05, `${(share * 100).toFixed(1)}%`)
// The control: what it was. Sixty pixels a side whatever the map.
const was = (66 * 66) / (W * H)
check('and the check can fail: the old one took more', was >= 0.05, `${(was * 100).toFixed(1)}%`)
check('a tile is two whole pixels', Number.isInteger(town.scale) && town.scale === 2)
const under = { x: town.box.x + 10, y: town.box.y + 10 }
check('something under the map is covered', covers(town.box, [under], TILE / 2))
check('something whose edge is under it is too', covers(town.box, [{ x: town.box.x - TILE / 2 + 1, y: town.box.y + 10 }], TILE / 2))
check('something a tile clear is not', !covers(town.box, [{ x: town.box.x - TILE, y: town.box.y + town.box.height + TILE }], TILE / 2))
check('and nothing at all is not', !covers(town.box, [], TILE / 2))

// Where it sits. It keeps its corner while that is clear, moves when not.
const corner = (pts: { x: number; y: number }[], cur: (typeof CORNERS)[number] | null) => minimapCorner(24, 22, W, H, pts, TILE / 2, cur)
const inCorner = (c: (typeof CORNERS)[number]) => { const b = minimap(24, 22, W, H, c).box; return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
check('every corner it may take is on the screen', CORNERS.every((c) => onScreen(minimap(24, 22, W, H, c).box, W, H)))
check('with nothing under it, it is in the top right', corner([], 'top-right') === 'top-right')
check('a lamp post under it moves it to the next corner', corner([inCorner('top-right')], 'top-right') === 'bottom-left')
check('and it stays there once the first is clear again', corner([], 'bottom-left') === 'bottom-left')
check('with all three covered it is not drawn', corner(CORNERS.map(inCorner), 'top-right') === null)
check('and comes back when one clears', corner([inCorner('top-right'), inCorner('bottom-left')], null) === 'bottom-right')
check('no corner is where the banner arrives', CORNERS.every((c) => !overlap(minimap(24, 22, W, H, c).box, banner('TOWN / STATIC'))))
// The dialogue box and the minimap are in different scenes; the map is under.

// --- banners, prompts, toasts
// Only the town is larger than the screen, so only the town has a minimap.
const places = ['TOWN', 'TOWN / STATIC', 'NEIGHBOUR HOUSE / STATIC', "REN'S HOUSE / STATIC", "GUS'S HUT / STATIC"]
check('every place\'s banner is on the screen', places.every((p) => onScreen(banner(p), W, H)))
check('the town\'s banners are clear of its minimap', places.slice(0, 2).every((p) => !overlap(banner(p), town.box)))
check('and the check can fail: one long enough runs under it', overlap(banner('X'.repeat(26)), town.box))

check('a phone is told A, a desktop Z', promptText('TALK', false) === 'A TALK' && promptText('LOOK', true) === 'Z LOOK')
const spots: [string, number, number][] = [['mid-screen', W / 2, H / 2], ['the left edge', 4, H / 2], ['the right edge', W - 4, H / 2], ['the top row', W / 2, TILE / 2]]
for (const [where, x, y] of spots) {
  const b = prompt(promptText('TALK', false), x, y, TILE, W)
  check(`the prompt is on the screen at ${where}`, onScreen(b, W, H), `${b.x}, ${b.y}`)
  const sprite = { x: x - TILE / 2, y: y - TILE / 2, width: TILE, height: TILE }
  check(`and off the thing it is about`, !overlap(b, { ...sprite, x: Math.max(0, sprite.x) }) || b.y >= y + TILE / 2 || b.y + b.height <= y - TILE / 2)
}
// With the kid standing over a signpost, a prompt over the signpost is on the kid.
const kid = { x: W / 2 - TILE / 2, y: H / 2 - TILE * 1.5, width: TILE, height: TILE }
check('with the kid above, the prompt goes under', !overlap(prompt('A LOOK', W / 2, H / 2, TILE, W, true), kid))
check('and the check can fail: over it, it is on the kid', overlap(prompt('A LOOK', W / 2, H / 2, TILE, W, false), kid))

const messages = [
  ...Object.values(ITEMS).map((i) => `${i.name}\nadded to bag`),
  ...TRANSFORMS.flatMap((t) => [t.intoStatic, t.intoNormal]),
]
const overlong = messages.filter((m) => wrap(m, TOAST_COLS).some((row) => row.length > TOAST_COLS) || wrap(m, TOAST_COLS).length > 3)
check('every toast fits its card', overlong.length === 0, overlong[0] ?? `${messages.length} messages`)
for (const top of [true, false]) {
  const t = toast(2, W, H, top)
  check(`a toast is on the screen at the ${top ? 'top' : 'bottom'}`, onScreen(t, W, H))
  check('and never over the dialogue box at the other end', !overlap(t, dialogue(W, H, top ? false : true).box))
}

// The control for the screen: none of this fits the one it replaced.
check('and this layout does not fit 160×144', !onScreen(dialogue(LEGACY_WIDTH, LEGACY_HEIGHT, false).box, LEGACY_WIDTH, LEGACY_HEIGHT))

console.log(failed ? `\n${failed} FAILED` : '\nALL HUD CHECKS PASS')
process.exit(failed ? 1 : 0)
