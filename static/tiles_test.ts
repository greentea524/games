// The drawn village follows the maps, and changes nothing the kid can touch (#178).
//
//   npx tsx static/tiles_test.ts
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PAL, SOLID_TILES, TILES } from './constants'
import {
  DMG_VILLAGE, FRAME, FRAME_COUNT, SIDE, TILE_PX, VILLAGE, baseFrame, drawTileset, isFront, overFrame,
  type Kinds, type Painter, type VillagePalette,
} from './tiles'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const T = TILE_PX
function raster(pal: VillagePalette): number[][] {
  const px = Array.from({ length: T }, () => Array<number>(FRAME_COUNT * T).fill(-1))
  const p: Painter = (x, y, w, h, colour) => {
    for (let j = Math.max(0, y); j < Math.min(T, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(FRAME_COUNT * T, x + w); i++) px[j][i] = colour
    }
  }
  drawTileset(p, pal)
  return px
}
const frame = (px: number[][], f: number) => px.map((row) => row.slice(f * T, (f + 1) * T))
const luma = (c: number) => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
const mean = (px: number[][]) => {
  const all = px.flat().filter((c) => c >= 0)
  return all.reduce((a, c) => a + luma(c), 0) / all.length
}
const painted = (px: number[][]) => px.flat().filter((c) => c >= 0).length

// --- the pictures
const colour = raster(VILLAGE)
const green = raster(DMG_VILLAGE)
const tones: number[] = Object.values(PAL)
check('the green screen uses only its four tones', green.flat().every((c) => c < 0 || tones.includes(c)))
check('and the check can fail: the colour set is not four tones', colour.flat().some((c) => c >= 0 && !tones.includes(c)))

// A picture drawn in a neighbour's frame is a picture in the wrong place.
const OVER = [FRAME.canopyTop, FRAME.deadTop, FRAME.chimney]
for (const [name, px] of [['colour', colour], ['green', green]] as const) {
  const holes = Array.from({ length: FRAME_COUNT }, (_, f) => f).filter((f) => !OVER.includes(f) && painted(frame(px, f)) !== T * T)
  check(`${name}: every ground picture fills its tile`, holes.length === 0, holes.join(', '))
  check(`${name}: the three drawn over the kid are mostly clear`, OVER.every((f) => { const n = painted(frame(px, f)); return n > 10 && n < (T * T) / 2 }))
}
// The canopy's top meets the canopy below it: its lowest row is its widest.
const top = frame(colour, FRAME.canopyTop)
const width = (row: number[]) => row.filter((c) => c >= 0).length
check('a canopy widens down to the tile it stands on', width(top[T - 1]) > width(top[T - 4]) && width(top[0]) === 0, `${width(top[T - 4])} then ${width(top[T - 1])}`)

// Sprites stand on the green screen's grass, which must stay its lightest tone.
const lightest = frame(green, FRAME.grass).flat().filter((c) => c === PAL.lightest).length
check('the green screen\'s grass is still its lightest tone', lightest > T * T * 0.9, `${lightest} of ${T * T}`)
check('and a path there is a different tone from a lawn', mean(frame(green, FRAME.path)) < mean(frame(green, FRAME.grass)) - 5)
check('a roof is darker than the wall under it', mean(frame(colour, FRAME.roof + 1)) < mean(frame(colour, FRAME.frontUpper + 1)) - 30)

// A path's edge: grass comes in over an open side and not over a closed one.
const edge = (f: number, side: 'n' | 's') => frame(colour, f)[side === 'n' ? 0 : T - 1].filter((c) => c === VILLAGE.grass || c === VILLAGE.grassDark).length
check('grass comes over a path\'s open side', edge(FRAME.path + SIDE.n, 'n') === T && edge(FRAME.path + SIDE.n, 's') === 0)
check('and a path with no lawn beside it is all path', edge(FRAME.path, 'n') === 0 && edge(FRAME.path, 's') === 0)

// --- choosing, on a small village
const { GRASS: g, PATH: p_, TREE: t, WALL: w, ROOF: r, DOOR: d, WATER: a, FLOOR: f } = TILES
const town: Kinds = [
  [g, g, g, g, g, g, g],
  [g, r, r, r, g, t, g],
  [g, r, r, r, g, g, g],
  [g, w, w, w, g, a, g],
  [g, w, d, w, p_, p_, g],
  [g, g, p_, g, g, g, g],
]
check('a roof\'s corner is its top-left piece', baseFrame(town, 1, 1) === FRAME.roof)
check('its lower middle is the eave', baseFrame(town, 2, 2) === FRAME.roof + 4 + 1)
check('a wall under a roof is a cottage\'s front', isFront(town, 2, 3) && isFront(town, 2, 4))
check('with a window under the eaves', baseFrame(town, 2, 3) === FRAME.frontWindow)
check('a timber post at each end', baseFrame(town, 1, 3) === FRAME.frontUpper && baseFrame(town, 3, 3) === FRAME.frontUpper + 2)
check('a stone footing along the bottom', baseFrame(town, 1, 4) === FRAME.frontBase && baseFrame(town, 3, 4) === FRAME.frontBase + 2)
check('and its door', baseFrame(town, 2, 4) === FRAME.frontDoor)
check('a chimney on one cell of the roof', [1, 2, 3].filter((x) => overFrame(town, x, 1) === FRAME.chimney).length === 1 && overFrame(town, 2, 2) === null)
// Soft to the east and west, where the lawn is; square to the door above
// and to the map's edge below.
check('a path is soft against a lawn', baseFrame(town, 2, 5) === FRAME.path + (SIDE.e | SIDE.w))
check('and square against a door', (baseFrame(town, 2, 5) - FRAME.path) & SIDE.n ? false : true)
check('a pond has a bank all round, beside a path too', baseFrame(town, 5, 3) === FRAME.water + (SIDE.n | SIDE.e | SIDE.s | SIDE.w))
check('a canopy stands over the cell above its trunk', overFrame(town, 5, 0) === FRAME.canopyTop)
check('but never over a door', overFrame([[d], [t]], 0, 0) === null)
check('grass is the same every time, and not all one picture', baseFrame(town, 0, 0) === baseFrame(town, 0, 0) && new Set([0, 1, 2, 3, 4, 5, 6].map((x) => baseFrame(town, x, 0))).size > 1)

const room: Kinds = [
  [w, w, w, w],
  [w, f, f, w],
  [w, w, f, w],
  [w, f, f, w],
  [w, d, w, w],
]
check('a room\'s wall is not a cottage\'s front', !isFront(room, 1, 0))
check('a wall with floor in front shows its face', baseFrame(room, 1, 0) === FRAME.roomFace && baseFrame(room, 1, 2) === FRAME.roomFace)
check('any other shows its top', baseFrame(room, 0, 1) === FRAME.roomCap && baseFrame(room, 2, 4) === FRAME.roomCap)
check('and the way out is a door in it', baseFrame(room, 1, 4) === FRAME.roomDoor)
check('floorboards alternate', baseFrame(room, 1, 1) !== baseFrame(room, 2, 1))

// --- every map: a picture for every cell, and the solid tiles untouched
const dir = fileURLToPath(new URL('./assets/', import.meta.url))
const files = readdirSync(dir).filter((x) => x.endsWith('.json')).sort()
let cells = 0
let bad = 0
let hidden = 0
for (const file of files) {
  const map = JSON.parse(readFileSync(dir + file, 'utf8'))
  const data: number[] = map.layers.find((l: { type: string }) => l.type === 'tilelayer').data
  const before = JSON.stringify(data)
  const kinds = Array.from({ length: map.height }, (_, y) => data.slice(y * map.width, (y + 1) * map.width))
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      cells++
      const b = baseFrame(kinds, x, y)
      if (!(b >= 0 && b < FRAME_COUNT) || OVER.includes(b)) bad++
      const o = overFrame(kinds, x, y)
      if (o !== null && !OVER.includes(o)) bad++
      // Nothing drawn over the kid may cover a door.
      if (o !== null && kinds[y][x] === TILES.DOOR) hidden++
    }
  }
  if (JSON.stringify(data) !== before) bad++
}
check(`every cell of all ${files.length} maps has a picture`, bad === 0, `${cells} cells`)
check('and no door is under a canopy or a chimney', hidden === 0)
// Choosing a picture reads the map and never writes it, so what blocks the
// kid is what the map says, as before.
check('the solid tiles are the six they were', SOLID_TILES.length === 6 && [t, w, r, a].every((k) => (SOLID_TILES as readonly number[]).includes(k)))

console.log(failed ? `\n${failed} FAILED` : '\nALL TILE CHECKS PASS')
process.exit(failed ? 1 : 0)
