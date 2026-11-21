// Pocket Dungeon's floors and walls (#156).
//
//   npx tsx pocket-dungeon/tiles_test.ts
//
// Two kinds of thing can go wrong with a tileset, and neither shows in a
// functional check: a wall drawn in the wrong piece, and a colour that lands
// on the wrong side of another. Both are checked here against the real
// palettes and the real map generator.
import { MapGenerator } from './MapGenerator'
import {
  CATACOMB,
  CELLAR,
  DMG,
  FRAME,
  TILE_PX,
  VAULT,
  drawTileset,
  floorFrame,
  isSolid,
  paletteFrom,
  wallFrame,
  type Painter,
  type TilePalette,
} from './tiles'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- the walls ----------------------------------------------------------------

{
  const room = [
    '#######',
    '#######',
    '##...##',
    '##...##',
    '#######',
    '#######',
  ]
  check('a wall with the room below it is a brick face', wallFrame(room, 3, 1) === FRAME.face)
  check(
    'and its corner, with the room only diagonally below, is a rim',
    wallFrame(room, 1, 1) === FRAME.cap,
  )
  check('a wall beside the room is a rim with a lip on that side', wallFrame(room, 1, 2) === FRAME.cap + 2)
  check('a wall below the room is a rim with a lip on top', wallFrame(room, 3, 4) === FRAME.cap + 1)
  check('rock with no room next to it is not drawn', wallFrame(room, 0, 0) === -1 && wallFrame(room, 3, 5) === -1)
}

/** Every floor 1 to 12, under several seeds: the maps a player actually gets. */
function* maps() {
  for (const seed of [1, 42, 1234, 99991]) {
    for (let depth = 1; depth <= 12; depth++) {
      yield { seed, depth, ...new MapGenerator(32, 32, seed + depth).generate(depth) }
    }
  }
}

{
  let gaps = 0
  let undrawn = 0
  let where = ''
  for (const { grid, seed, depth } of maps()) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] !== '#') continue
        const f = wallFrame(grid, x, y)
        if (f === -1) undrawn++
        // A wall that touches the room, even at a corner, must be drawn, or
        // there is a hole in the rim that shows the black behind it.
        const touches = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => !isSolid(grid, x + dx, y + dy)))
        if (touches && f === -1) {
          gaps++
          where ||= `seed ${seed} floor ${depth} at ${x},${y}`
        }
      }
    }
  }
  check('no wall touching a room is left undrawn', gaps === 0, gaps ? where : '48 maps')
  check('and the rock beyond the rooms is left black', undrawn > 1000, `${undrawn} cells`)
}

// --- the floors ---------------------------------------------------------------

{
  const seen = new Set<number>()
  let stable = true
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const f = floorFrame(x, y, 7)
      seen.add(f)
      if (floorFrame(x, y, 7) !== f) stable = false
    }
  }
  check('a floor uses every flagstone pattern', seen.size === 4, `${seen.size} patterns`)
  check('and the same floor always looks the same', stable)
  let differs = 0
  for (let i = 0; i < 64; i++) if (floorFrame(i, 3, 7) !== floorFrame(i, 3, 8)) differs++
  check('while two floors do not', differs > 10, `${differs} of 64 cells differ`)
}

// --- the colours ----------------------------------------------------------------

/** Records every colour painted into each frame. */
function paint(pal: TilePalette, dmg: boolean) {
  const frames = new Map<number, Set<string>>()
  let style = ''
  const painter: Painter = {
    set fillStyle(v: string) {
      style = v
    },
    get fillStyle() {
      return style
    },
    fillRect(x: number) {
      const f = Math.floor(x / TILE_PX)
      if (!frames.has(f)) frames.set(f, new Set())
      frames.get(f)!.add(style)
    },
    clearRect() {},
  }
  drawTileset(painter, pal, dmg)
  return frames
}

const luma = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)

{
  const tones = new Set(['#9bbc0f', '#8bac0f', '#306230', '#0f380f'])
  const used = new Set<string>()
  for (const set of paint(DMG, true).values()) for (const c of set) used.add(c)
  const stray = [...used].filter((c) => !tones.has(c))
  check('the green-screen tiles use only its four tones', stray.length === 0, stray.join(', ') || `${used.size} tones`)
  check(
    'and the room floor there is still the lightest, which every sprite was checked against',
    DMG.floor === 0x9bbc0f && [...(paint(DMG, true).get(FRAME.floor) ?? [])][0] === '#9bbc0f',
  )
}

{
  // The rim is the top of the wall seen from above, so it must sit darker than
  // the floor it surrounds. Drawn lighter the first time, it read as more
  // floor and the rooms lost their edges.
  const darker = (p: TilePalette) => luma(p.cap) < luma(p.floor) * 0.9
  const all = { CELLAR, CATACOMB, VAULT }
  check(
    'in every biome the rim is darker than the floor',
    Object.values(all).every(darker),
    Object.entries(all).map(([k, p]) => `${k} ${luma(p.cap).toFixed(0)} < ${luma(p.floor).toFixed(0)}`).join(', '),
  )
  const firstTry = { ...paletteFrom(0x56634a, 0x5e5c4e) }
  firstTry.cap = 0x6a6858
  check('and the first palette, whose rim was lighter, is caught', !darker(firstTry))
  check(
    'on the green screen too, where a rim in a floor tone vanished',
    luma(DMG.cap) < luma(DMG.floorDark),
  )
}

console.log(ok ? '\nALL POCKET DUNGEON TILE CHECKS PASS' : '\nPOCKET DUNGEON TILE CHECKS FAILED')
process.exit(ok ? 0 : 1)
