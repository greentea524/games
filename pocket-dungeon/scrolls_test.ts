// Scroll checks (#105).
//
//   npx tsx pocket-dungeon/scrolls_test.ts
//
// Before this issue the four scrolls were pickups that did nothing: no code
// read `scrollEffect`, `ScrollIdentifier.identify` had no callers, and there
// was no action anywhere that used an inventory item. They are 20% of the
// floor drop pool by weight, so a fifth of every floor's loot was inert.
//
// The geometry and the identification are pure, so they run without a
// browser. The scene owns the tweens and the turn; this covers "who does the
// fire scroll hit" and "where can teleport legally put you", which are the
// parts that can quietly be wrong.
import { blastTargets, teleportCandidates, SCROLL_SPECS, FIRE_RADIUS } from './scrolls'
import { ITEMS, ScrollIdentifier, SCROLL_REAL_NAMES } from './items'
import { RNG } from './rng'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- every scroll in the item table has an effect and a spec --------------

const scrolls = Object.values(ITEMS).filter((i) => i.category === 'scroll')
check('there are four scrolls', scrolls.length === 4, scrolls.map((s) => s.scrollEffect).join(', '))
check(
  'each declares an effect with a spec behind it',
  scrolls.every((s) => s.scrollEffect && SCROLL_SPECS[s.scrollEffect]),
)
check(
  'each has a real name to reveal',
  scrolls.every((s) => s.scrollEffect && SCROLL_REAL_NAMES[s.scrollEffect]),
)
// The banner is drawn at 8px on a 160px screen, so 20 characters fill it.
const wide = Object.values(SCROLL_SPECS).filter((s) => s.banner.length > 20)
check('every banner fits the screen', wide.length === 0, wide.map((s) => s.banner).join(', '))

// --- fire: manhattan, not euclidean --------------------------------------

const enemies = [
  { tx: 5, ty: 5, hp: 10 }, // on the player
  { tx: 8, ty: 5, hp: 10 }, // 3 east — just in range
  { tx: 9, ty: 5, hp: 10 }, // 4 east — out
  { tx: 7, ty: 7, hp: 10 }, // 4 away diagonally — out
  { tx: 6, ty: 6, hp: 10 }, // 2 away diagonally — in
  { tx: 5, ty: 6, hp: 0 }, // adjacent but already dead
]
const hit = blastTargets(5, 5, enemies, FIRE_RADIUS)
check('the blast reaches exactly 3 tiles', hit.includes(1) && !hit.includes(2), `hit ${hit.join(',')}`)
check(
  'a diagonal neighbour costs two steps, as it does when walking',
  hit.includes(4) && !hit.includes(3),
  'euclidean would have reached (7,7)',
)
check('the dead are not hit again', !hit.includes(5))
check('an enemy on the player is hit', hit.includes(0))

// --- teleport: never into a wall, an occupant, or where you already are ---

const grid = [
  '#####',
  '#...#',
  '#.#.#',
  '#...#',
  '#####',
]
const blocked = [{ tx: 3, ty: 1 }]
const spots = teleportCandidates(grid, 1, 1, blocked)
const has = (x: number, y: number) => spots.some((s) => s.x === x && s.y === y)
check('walls are never candidates', !spots.some((s) => grid[s.y][s.x] === '#'), `${spots.length} spots`)
check('the inner wall pillar is excluded', !has(2, 2))
check('the tile the player is on is excluded', !has(1, 1))
check('an occupied tile is excluded', !has(3, 1))
check('the remaining open floor is offered', has(2, 1) && has(1, 3) && has(2, 3) && has(3, 3))
check('nothing outside the grid is offered', spots.every((s) => grid[s.y]?.[s.x] !== undefined))

// A sealed room must not produce a candidate rather than throwing.
const sealed = ['###', '#.#', '###']
check('a player with nowhere to go gets no candidates', teleportCandidates(sealed, 1, 1, []).length === 0)

// --- identification: the call that was missing ---------------------------

const ident = new ScrollIdentifier(new RNG(42))
const fire = ITEMS.scroll_fire
const before = ident.getDisplayName(fire)
check('an unused scroll shows a cryptic label', before.includes('"') && before.endsWith('Scroll'), before)
check('and is not identified yet', ident.isIdentified('fire') === false)
ident.identify('fire')
const after = ident.getDisplayName(fire)
check('using it reveals the real name', after === SCROLL_REAL_NAMES.fire, `${before} -> ${after}`)
check('and it now reads as identified', ident.isIdentified('fire') === true)
check('other scrolls stay unknown', ident.getDisplayName(ITEMS.scroll_map).includes('"'))

// Each run shuffles the labels, so two runs disagree about what FROTZ is.
const labelFor = (seed: number) => {
  const id = new ScrollIdentifier(new RNG(seed))
  return ['fire', 'teleport', 'map', 'strength']
    .map((e) => id.getDisplayName(Object.values(ITEMS).find((i) => i.scrollEffect === e)!))
    .join('|')
}
const layouts = new Set(Array.from({ length: 200 }, (_, i) => labelFor(i)))
check(
  'the label shuffle differs between runs',
  layouts.size > 20,
  `${layouts.size} distinct layouts over 200 seeds`,
)

console.log(ok ? '\nALL SCROLL CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
