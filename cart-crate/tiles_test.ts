// The floor, walls and targets are three different things, in every world
// and on the green screen (#161).
//
//   npx tsx cart-crate/tiles_test.ts
import { PAL } from './constants'
import { CAMPAIGN_LEVELS } from './levels'
import {
  CORNER, DMG, FLOOR, LIT_PX, OPEN, TILE_PX, WALL_FRAMES, cornerFrames, drawCorners, drawCracked, drawFloor,
  drawHole, drawIce, drawTarget, drawTargetLit, drawWalls, floorFrame, isVoid, luma, sealUnreachable, wallFrame, worldPalette,
  type Painter, type TilePalette,
} from './tiles'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

/** Draws into an array: -1 where nothing was painted. */
function raster(width: number, height: number, draw: (p: Painter) => void): number[][] {
  const px = Array.from({ length: height }, () => Array<number>(width).fill(-1))
  draw((x, y, w, h, colour) => {
    for (let j = Math.max(0, y); j < Math.min(height, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(width, x + w); i++) px[j][i] = colour
    }
  })
  return px
}
const frame = (px: number[][], i: number) => px.map((row) => row.slice(i * TILE_PX, (i + 1) * TILE_PX))
const flat = (px: number[][]) => px.flat()
const mean = (px: number[][]) => {
  const all = flat(px).filter((c) => c >= 0)
  return all.reduce((a, c) => a + luma(c), 0) / all.length
}
const same = (a: number[][], b: number[][]) => flat(a).every((c, i) => c === flat(b)[i])

const everything = (pal: TilePalette, dmg: boolean) => [
  raster(FLOOR.count * TILE_PX, TILE_PX, (p) => drawFloor(p, pal, dmg)),
  raster(WALL_FRAMES * TILE_PX, TILE_PX, (p) => drawWalls(p, pal)),
  raster(CORNER.count * TILE_PX, TILE_PX, (p) => drawCorners(p, pal)),
  raster(TILE_PX, TILE_PX, (p) => drawTarget(p, pal, dmg)),
  raster(LIT_PX, LIT_PX, (p) => drawTargetLit(p, pal, dmg)),
  raster(TILE_PX, TILE_PX, (p) => drawIce(p, pal)),
  raster(TILE_PX, TILE_PX, (p) => drawCracked(p, pal, dmg)),
  raster(TILE_PX, TILE_PX, (p) => drawHole(p, pal, dmg)),
]

// --- the green screen
const tones: number[] = Object.values(PAL)
const stray = everything(DMG, true).flatMap(flat).filter((c) => c >= 0 && !tones.includes(c))
check('the green screen uses only its four tones', stray.length === 0, `${stray.length} stray pixels`)
// The control: the colour set is not four tones, so the check above can fail.
const colourful = everything(worldPalette(1), false).flatMap(flat).filter((c) => c >= 0 && !tones.includes(c))
check('and the check can fail: the colour set is not four tones', colourful.length > 0)

// --- each palette
const sets: [string, TilePalette, boolean][] = [
  ['green screen', DMG, true],
  ...[1, 2, 3, 4, 5].map((w): [string, TilePalette, boolean] => [`world ${w}`, worldPalette(w), false]),
]
for (const [name, pal, dmg] of sets) {
  const floor = raster(FLOOR.count * TILE_PX, TILE_PX, (p) => drawFloor(p, pal, dmg))
  const walls = raster(WALL_FRAMES * TILE_PX, TILE_PX, (p) => drawWalls(p, pal))
  const a = frame(floor, FLOOR.a)
  const b = frame(floor, FLOOR.b)
  check(`${name}: every floor and wall pixel is painted`, [...flat(floor), ...flat(walls)].every((c) => c >= 0))
  check(`${name}: the two floor squares differ`, !same(a, b))
  // A wall top lighter than the floor reads as more floor (Pocket Dungeon, #156).
  const floorTone = Math.min(mean(a), mean(b))
  const darkest = Math.max(...Array.from({ length: WALL_FRAMES }, (_, i) => mean(frame(walls, i))))
  check(`${name}: every wall piece is darker than the floor`, darkest < floorTone - 30, `${darkest.toFixed(0)} against ${floorTone.toFixed(0)}`)
  check(`${name}: the rim is darker than the floor`, luma(pal.rim) < floorTone - 20, `${luma(pal.rim).toFixed(0)} against ${floorTone.toFixed(0)}`)

  if (!dmg) {
    check(`${name}: a wall above shades the floor`, mean(frame(floor, FLOOR.aShaded)) < mean(a) - 2)
  }

  // A wall with floor below it shows a brick face; one without does not.
  const faced = frame(walls, OPEN.s)
  const top = frame(walls, 0)
  const bricks = (px: number[][]) => flat(px.slice(TILE_PX - 8)).filter((c) => c === pal.mortar).length
  check(`${name}: a wall over floor has a brick face`, bricks(faced) > 20 && bricks(top) === 0, `${bricks(faced)} mortar pixels`)
  const distinct = new Set(Array.from({ length: WALL_FRAMES }, (_, i) => flat(frame(walls, i)).join(','))).size
  // On the green screen the rim is the top's own tone, so pieces differ by outline alone; still all 16.
  check(`${name}: all ${WALL_FRAMES} wall pieces are different`, distinct === WALL_FRAMES, `${distinct}`)

  // The target: a ✕ that stands off the floor, and a filled one that is not the empty one.
  const target = raster(TILE_PX, TILE_PX, (p) => drawTarget(p, pal, dmg))
  const cross = flat(target).filter((c) => c === pal.cross).length
  const gap = Math.abs(luma(pal.cross) - mean(a))
  check(`${name}: the target's ✕ stands off the floor`, cross >= 40 && gap > 80, `${cross} pixels, ${gap.toFixed(0)} apart`)
  const lit = raster(LIT_PX, LIT_PX, (p) => drawTargetLit(p, pal, dmg))
  const band = (LIT_PX - TILE_PX) / 2
  const ring = lit.flatMap((row, y) => row.filter((_, x) => Math.min(x, y, LIT_PX - 1 - x, LIT_PX - 1 - y) < band))
  const glowing = ring.filter((c) => c >= 0 && Math.abs(luma(c) - mean(a)) > 60).length
  check(`${name}: a filled target shows past the crate on it`, glowing > 120, `${glowing} glow pixels outside the tile`)
}

// --- the five worlds are five places (#165)
// Each was the warehouse tinted toward an old ground colour. Held apart by
// floor colour, wall colour and what the floor is made of.
const dist = (x: number, y: number) => Math.hypot(((x >> 16) & 255) - ((y >> 16) & 255), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255))
const worlds = [1, 2, 3, 4, 5].map((w) => worldPalette(w))
let nearFloor = Infinity
let nearWall = Infinity
worlds.forEach((a, i) => worlds.slice(i + 1).forEach((b) => {
  nearFloor = Math.min(nearFloor, dist(a.floorA, b.floorA))
  nearWall = Math.min(nearWall, dist(a.rim, b.rim))
}))
check('no two worlds share a floor colour', nearFloor > 30, `the closest are ${nearFloor.toFixed(0)} apart`)
check('or a wall colour', nearWall > 30, `the closest are ${nearWall.toFixed(0)} apart`)
check('and each floor is made of something different', new Set(worlds.map((w) => w.style)).size === worlds.length)
const squares = worlds.map((w) => flat(frame(raster(FLOOR.count * TILE_PX, TILE_PX, (p) => drawFloor(p, w)), FLOOR.b)).map((c) => (c === w.floorB ? 0 : 1)).join(''))
check('which can be seen: no two floors have the same marks', new Set(squares).size === worlds.length)
// The control: the old tinted worlds had one floor's marks between them.
check('and the check can fail: one world against itself has the same', squares[0] === flat(frame(raster(FLOOR.count * TILE_PX, TILE_PX, (p) => drawFloor(p, worlds[0])), FLOOR.b)).map((c) => (c === worlds[0].floorB ? 0 : 1)).join(''))

// A crate must stand out on every floor: its slats are the wood the crate is
// made of, and the floor is never that colour.
const slats = 0xa8682c
for (const [w, pal] of worlds.entries()) {
  check(`world ${w + 1}: a crate is not the floor's colour`, dist(slats, pal.floorA) > 60 && dist(slats, pal.floorB) > 60, `${dist(slats, pal.floorA).toFixed(0)} apart`)
  check(`world ${w + 1}: ice is not floor`, Math.abs(luma(pal.ice) - luma(pal.floorA)) > 40)
}

// --- floor nobody can reach is the outside
const levels = CAMPAIGN_LEVELS.map((l) => {
  const grid = l.grid.map((r) => r.split(''))
  let sx = 0
  let sy = 0
  grid.forEach((r, y) => r.forEach((c, x) => { if (c === 'P' || c === '+') { sx = x; sy = y } }))
  return { id: l.id, grid, sx, sy }
})
const before = levels.filter((l) => l.grid.flat().length > 0)
let sealed = 0
let threw = ''
for (const l of before) {
  try {
    sealed += sealUnreachable(l.grid, l.sx, l.sy)
  } catch (e) {
    threw = `${l.id}: ${(e as Error).message}`
  }
}
check('every level\'s unreachable cells are plain floor, so sealing them changes no puzzle', threw === '', threw)
check('and there were some', sealed > 100, `${sealed} cells in ${CAMPAIGN_LEVELS.length} levels`)
const twice = levels.reduce((n, l) => n + sealUnreachable(l.grid, l.sx, l.sy), 0)
check('after which none are left', twice === 0)
const cratesKept = levels.every((l, i) => l.grid.flat().filter((c) => c === 'C' || c === '*').length === CAMPAIGN_LEVELS[i].grid.join('').split('').filter((c) => c === 'C' || c === '*').length)
check('and every crate and target is where it was', cratesKept)
// The control: a target outside the walls is a level nobody can finish.
let caught = false
try { sealUnreachable([['#', '#', '#', '.', 'T'], ['#', '.', '#', '.', '.'], ['#', '#', '#', '.', '.']], 1, 1) } catch { caught = true }
check('and the check can fail: a target nobody can reach is refused', caught)

// The control for the rim: Pocket Dungeon's mistake, staged.
const pale = { ...worldPalette(1), rim: 0xd0d8e0, cap: 0xb0b8c0 }
const paleWalls = raster(WALL_FRAMES * TILE_PX, TILE_PX, (p) => drawWalls(p, pale))
check('and the check can fail: a pale wall is not darker than the floor', mean(frame(paleWalls, 0)) > luma(worldPalette(1).floorB))

// --- picking pieces
const room = ['#####', '#...#', '#.#.#', '#...#', '#####']
check('a wall above the room faces it with brick', wallFrame(room, 2, 0) === OPEN.s)
check('a wall below the room shows only its top edge', wallFrame(room, 2, 4) === OPEN.n)
check('a pillar is open on all four sides', wallFrame(room, 2, 2) === (OPEN.n | OPEN.e | OPEN.s | OPEN.w))
check('a corner has no open side', wallFrame(room, 0, 0) === 0)
check('but is notched where the room touches it', cornerFrames(room, 0, 0).join() === `${CORNER.se}`)
check('a level\'s edge counts as wall', wallFrame(['.'], 0, 0) === 0)
check('the floor is a checker', floorFrame(0, 0, false) !== floorFrame(1, 0, false) && floorFrame(0, 0, false) === floorFrame(1, 1, false))
const padded = ['#####', '#...#', '#####', '#####', '#####']
check('a wall with no floor beside it is not drawn', isVoid(padded, 2, 4) && isVoid(padded, 2, 3) && !isVoid(padded, 2, 2))

// Every level: each wall cell beside floor gets a piece, and nothing reads off the grid's edge.
let pieces = 0
for (const level of CAMPAIGN_LEVELS) {
  level.grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#' || isVoid(level.grid, x, y)) continue
      const f = wallFrame(level.grid, x, y)
      if (f >= 0 && f < WALL_FRAMES) pieces++
      else failed++
    }
  })
}
check(`every wall in all ${CAMPAIGN_LEVELS.length} levels takes one of the pieces`, pieces > 0, `${pieces} cells`)

console.log(failed ? `\n${failed} FAILED` : '\nALL TILE CHECKS PASS')
process.exit(failed ? 1 : 0)
