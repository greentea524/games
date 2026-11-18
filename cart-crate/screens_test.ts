// The title and the level select fit the real screen (#165).
//
//   npx tsx cart-crate/screens_test.ts
import { GBC_HEIGHT as H, GBC_WIDTH as W, LEGACY_HEIGHT, LEGACY_WIDTH, TILE } from './constants'
import { CAMPAIGN_LEVELS } from './levels'
import { CHAR, PER_PAGE, WORLD_NAMES, pageOf, selectHint, selectLayout, startPrompt, titleLayout, type Box } from './screens'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (a: Box, w: number, h: number) => a.x >= 0 && a.y >= 0 && a.x + a.width <= w && a.y + a.height <= h
const clash = (named: [string, Box][], w: number, h: number) => {
  for (let i = 0; i < named.length; i++) {
    if (!inside(named[i][1], w, h)) return `${named[i][0]} leaves the screen`
    for (let j = i + 1; j < named.length; j++) if (overlap(named[i][1], named[j][1])) return `${named[i][0]} is over ${named[j][0]}`
  }
  return null
}

// --- the title
for (const desktop of [false, true]) {
  const t = titleLayout(W, H, TILE, desktop)
  const strip: Box = { x: 0, y: t.wallRow, width: W, height: TILE * 2 }
  const hit = clash([['the title', t.title], ['the subtitle', t.subtitle], ['the warehouse', strip], ['the prompt', t.prompt]], W, H)
  check(`the title on a ${desktop ? 'desktop' : 'phone'}: nothing overlaps or leaves the screen`, hit === null, hit ?? 'clean')
  check('the prompt keeps clear of the rounded corner', t.prompt.y + t.prompt.height <= H - 16)
}
const t = titleLayout(W, H, TILE, false)
check('the title is on one line now, where 160 wide split it in two', t.title.width <= W - 16)
check('the fox, the crate and the target stand in that order, a gap before the target', t.fox + 1 === t.crate && t.target === t.crate + 2)
const old = titleLayout(LEGACY_WIDTH, LEGACY_HEIGHT, 16, false)
check('and the check can fail: the title does not fit 160 wide', !inside(old.title, LEGACY_WIDTH, LEGACY_HEIGHT))
check('a phone is told START and a desktop ENTER', startPrompt(false) === 'PRESS START' && startPrompt(true) === 'PRESS ENTER')

// --- the level select
const worlds = [...new Set(CAMPAIGN_LEVELS.map((l) => l.world))]
check('every world has a name', worlds.every((w) => !!WORLD_NAMES[w - 1]), worlds.join(','))
const pageWorlds = CAMPAIGN_LEVELS.map((l, i) => [pageOf(i), l.world])
check('a page is a world: every level on a page is in the same one', pageWorlds.every(([p, w]) => pageWorlds.every(([q, v]) => p !== q || w === v)))
check('and every world is ten levels, one page', worlds.every((w) => CAMPAIGN_LEVELS.filter((l) => l.world === w).length === PER_PAGE))
for (const desktop of [false, true]) {
  for (const name of WORLD_NAMES) {
    const s = selectLayout(W, H, name, desktop)
    const named: [string, Box][] = [['the heading', s.heading], ['the world', s.world], ['the left arrow', s.left], ['the right arrow', s.right], ['the hint', s.hint], ...s.cells.map((c, i): [string, Box] => [`stage ${i + 1}`, c])]
    const hit = clash(named, W, H)
    if (hit) check(`the ${name} page on a ${desktop ? 'desktop' : 'phone'} fits`, false, hit)
  }
  check(`every page fits on a ${desktop ? 'desktop' : 'phone'}`, true)
  check('and its hint fits a line', selectHint(desktop).length * CHAR <= W - 16)
}
const s = selectLayout(W, H, 'MASTER CLASS', false)
check('a stage\'s cell holds two digits and three stars', s.cells[0].width >= 3 * CHAR + 4)
check('and the check can fail: the page does not fit 160×144', clash(selectLayout(LEGACY_WIDTH, LEGACY_HEIGHT, 'MASTER CLASS', false).cells.map((c, i) => [`stage ${i + 1}`, c] as [string, Box]), LEGACY_WIDTH, LEGACY_HEIGHT) !== null)

console.log(failed ? `\n${failed} FAILED` : '\nALL SCREEN CHECKS PASS')
process.exit(failed ? 1 : 0)
