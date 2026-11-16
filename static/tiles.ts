// The village, drawn at 24 pixels (#178).
//
// The hub card shows cottages with pitched red roofs and timbered walls,
// round layered trees, worn dirt paths with soft edges and grass in several
// greens. The game had a striped block on a slab of grey brick, a green disc
// on a stem, hard-edged tan strips and one green.
//
// The maps are not touched. They still hold the twelve tile kinds the game
// collides with and reasons about, and that layer still does the colliding;
// it is just no longer what is drawn. What is drawn is chosen here, per cell,
// from the cell's kind and its neighbours: which sides of a path meet grass,
// where a roof's edge is, whether a wall is a cottage's front or a room's.
// So nothing that blocks the kid changes, and no map needs redrawing.
//
// Everything is drawn through a `Painter`, one filled rectangle at a time, so
// there is no Phaser and no canvas in this file: `BootScene` hands it a canvas
// and `tiles_test.ts` hands it an array.
import { PAL, TILES } from './constants'

export const TILE_PX = 24

export type Rgb = number
/** Fills a rectangle. Coordinates are in pixels from the texture's top-left. */
export type Painter = (x: number, y: number, w: number, h: number, colour: Rgb) => void

export interface VillagePalette {
  grass: Rgb
  grassDark: Rgb
  grassLight: Rgb
  flower: Rgb
  flower2: Rgb
  flowerCore: Rgb
  path: Rgb
  pathDark: Rgb
  pathLight: Rgb
  canopy: Rgb
  canopyLight: Rgb
  canopyDark: Rgb
  outline: Rgb
  trunk: Rgb
  roof: Rgb
  roofLight: Rgb
  roofDark: Rgb
  plaster: Rgb
  plasterShade: Rgb
  timber: Rgb
  stone: Rgb
  stoneDark: Rgb
  glass: Rgb
  door: Rgb
  doorDark: Rgb
  knob: Rgb
  water: Rgb
  waterLight: Rgb
  waterDeep: Rgb
  floor: Rgb
  floorLine: Rgb
  floorLight: Rgb
  panel: Rgb
  cap: Rgb
  capLight: Rgb
}

/** The card's colours. */
export const VILLAGE: VillagePalette = {
  grass: 0x5cb043,
  grassDark: 0x3f8f2e,
  grassLight: 0x7ccb52,
  flower: 0xf4f0e0,
  flower2: 0xf08aa8,
  flowerCore: 0xf2c838,
  path: 0xc79a5b,
  pathDark: 0xa87a42,
  pathLight: 0xd8b377,
  canopy: 0x2f7d32,
  canopyLight: 0x4ea64a,
  canopyDark: 0x1b5a26,
  outline: 0x103a18,
  trunk: 0x6b4423,
  roof: 0xb8433a,
  roofLight: 0xd4614f,
  roofDark: 0x7e2a26,
  plaster: 0xe6d3a6,
  plasterShade: 0xc9b58a,
  timber: 0x6b4a2b,
  stone: 0x8a8f98,
  stoneDark: 0x5a5f68,
  glass: 0x6fa8d8,
  door: 0x8a5426,
  doorDark: 0x4a2c12,
  knob: 0xf8d038,
  water: 0x4a8fd8,
  waterLight: 0x9cc8f4,
  waterDeep: 0x2a5cae,
  floor: 0xc08a50,
  floorLine: 0x8a5c2e,
  floorLight: 0xd3a064,
  panel: 0x9a6a38,
  cap: 0x4a3626,
  capLight: 0x6e5238,
}

/**
 * The green screen. Four tones and no more.
 *
 * The grass is the lightest tone, as it always was: everyone who walks on it
 * is drawn to stand off that. A path is the next tone down, so a path is
 * still a different place from a lawn.
 */
export const DMG_VILLAGE: VillagePalette = {
  grass: PAL.lightest,
  grassDark: PAL.light,
  grassLight: PAL.lightest,
  flower: PAL.dark,
  flower2: PAL.dark,
  flowerCore: PAL.light,
  path: PAL.light,
  pathDark: PAL.dark,
  pathLight: PAL.light,
  canopy: PAL.dark,
  canopyLight: PAL.light,
  canopyDark: PAL.darkest,
  outline: PAL.darkest,
  trunk: PAL.darkest,
  roof: PAL.dark,
  roofLight: PAL.light,
  roofDark: PAL.darkest,
  plaster: PAL.light,
  plasterShade: PAL.light,
  timber: PAL.darkest,
  stone: PAL.dark,
  stoneDark: PAL.darkest,
  glass: PAL.darkest,
  door: PAL.dark,
  doorDark: PAL.darkest,
  knob: PAL.lightest,
  water: PAL.dark,
  waterLight: PAL.light,
  waterDeep: PAL.darkest,
  floor: PAL.light,
  floorLine: PAL.dark,
  floorLight: PAL.lightest,
  panel: PAL.dark,
  cap: PAL.darkest,
  capLight: PAL.dark,
}

// --- frames ------------------------------------------------------------------

/** Which sides of a cell meet something else. A frame group is these as bits. */
export const SIDE = { n: 1, e: 2, s: 4, w: 8 }

const GRASS_VARIANTS = 6
const ROOF_ROWS = ['top', 'bottom', 'single'] as const
const ROOF_COLS = ['left', 'mid', 'right', 'single'] as const
const FRONT_COLS = ['left', 'mid', 'right', 'single'] as const

let next = 0
const take = (n = 1) => {
  const at = next
  next += n
  return at
}

/** Where each picture is in the tileset. A group is its first frame. */
export const FRAME = {
  grass: take(GRASS_VARIANTS),
  crackedGrass: take(),
  path: take(16),
  water: take(16),
  tree: take(),
  deadTree: take(),
  roof: take(ROOF_ROWS.length * ROOF_COLS.length),
  frontWindow: take(),
  frontUpper: take(FRONT_COLS.length),
  frontBase: take(FRONT_COLS.length),
  frontDoor: take(),
  frontCracked: take(),
  stoneWall: take(),
  floor: take(2),
  rottedFloor: take(),
  roomFace: take(),
  roomFaceCracked: take(),
  roomCap: take(),
  roomDoor: take(),
  // Drawn above the kid, on a clear ground.
  canopyTop: take(),
  deadTop: take(),
  chimney: take(),
}
export const FRAME_COUNT = next

// --- small tools -------------------------------------------------------------

/** A filled disc, as rows. */
function disc(p: Painter, cx: number, cy: number, r: number, colour: Rgb, clip: [number, number, number, number]) {
  const [x0, y0, x1, y1] = clip
  for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
    if (y < y0 || y >= y1) continue
    const half = Math.floor(Math.sqrt(r * r - (y - cy) * (y - cy)))
    const left = Math.max(x0, cx - half)
    const right = Math.min(x1, cx + half + 1)
    if (right > left) p(left, y, right - left, 1, colour)
  }
}

/** A small repeatable scatter: the same cell always gets the same number. */
export const hash = (x: number, y: number): number => {
  let h = (x * 374761393 + y * 668265263) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

// --- grass, paths, water -----------------------------------------------------

function drawGrass(p: Painter, ox: number, pal: VillagePalette, variant: number) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.grass)
  // Tufts: a blade and its shadow, in different places on each variant.
  const tufts: [number, number][][] = [
    [[4, 6], [15, 14], [9, 19]],
    [[17, 5], [6, 13], [13, 20]],
    [[10, 4], [19, 12], [4, 17]],
    [[6, 9], [16, 18]],
    [[5, 5], [17, 16]],
    [[15, 6], [6, 18]],
  ]
  for (const [x, y] of tufts[variant]) {
    p(ox + x, y, 1, 3, pal.grassDark)
    p(ox + x + 2, y + 1, 1, 2, pal.grassDark)
    p(ox + x + 1, y - 1, 1, 2, pal.grassLight)
  }
  // The last two carry flowers.
  if (variant >= 4) {
    const petal = variant === 4 ? pal.flower : pal.flower2
    for (const [x, y] of variant === 4 ? [[11, 10], [18, 7]] : [[10, 12], [17, 19]]) {
      p(ox + x - 1, y, 3, 1, petal)
      p(ox + x, y - 1, 1, 3, petal)
      p(ox + x, y, 1, 1, pal.flowerCore)
      p(ox + x, y + 2, 1, 2, pal.grassDark)
    }
  }
}

/** How far the grass comes in over a path's edge at each step along it. */
const ragged = (i: number, side: number): number => 2 + ((i * 7 + side * 5 + ((i >> 2) & 1)) % 3)

/** Ground with another ground coming in over its open sides. */
function drawEdged(
  p: Painter, ox: number, open: number, rim: Rgb, over: Rgb, overDark: Rgb,
) {
  const T = TILE_PX
  const sides: [number, (i: number, d: number) => [number, number, number, number]][] = [
    [SIDE.n, (i, d) => [i, 0, 1, d]],
    [SIDE.s, (i, d) => [i, T - d, 1, d]],
    [SIDE.w, (i, d) => [0, i, d, 1]],
    [SIDE.e, (i, d) => [T - d, i, d, 1]],
  ]
  sides.forEach(([bit, at], side) => {
    if (!(open & bit)) return
    for (let i = 0; i < T; i++) {
      const d = ragged(i, side)
      // The worn rim first, one pixel deeper than the grass will reach.
      const [rx, ry, rw, rh] = at(i, d + 1)
      p(ox + rx, ry, rw, rh, rim)
      const [x, y, w, h] = at(i, d)
      p(ox + x, y, w, h, over)
      // A darker blade every few pixels, so the edge is tufted, not ruled.
      if (i % 4 === 1) {
        const [bx, by, bw, bh] = at(i, 1)
        p(ox + bx, by, bw, bh, overDark)
      }
    }
  })
}

function drawPath(p: Painter, ox: number, pal: VillagePalette, open: number) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.path)
  // Wear: pale scuffs and dark pebbles.
  for (const [x, y, w] of [[5, 6, 3], [14, 11, 4], [8, 17, 3]]) p(ox + x, y, w, 1, pal.pathLight)
  for (const [x, y] of [[16, 5], [6, 12], [18, 18], [11, 21]]) p(ox + x, y, 2, 1, pal.pathDark)
  drawEdged(p, ox, open, pal.pathDark, pal.grass, pal.grassDark)
}

function drawWater(p: Painter, ox: number, pal: VillagePalette, open: number) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.water)
  for (const [x, y, w] of [[3, 6, 6], [13, 11, 7], [5, 17, 6]]) {
    p(ox + x, y, w, 1, pal.waterLight)
    p(ox + x + 1, y + 1, w - 2, 1, pal.waterDeep)
  }
  // A bank: the deep rim of the pond, with the lawn coming over it.
  drawEdged(p, ox, open, pal.waterDeep, pal.grass, pal.grassDark)
}

// --- trees -------------------------------------------------------------------

/** The canopy's centre and size. It stands seven pixels into the tile above. */
const CANOPY = { cx: 12, cy: 4, r: 11 }

function drawCanopy(p: Painter, ox: number, oy: number, pal: VillagePalette, clip: [number, number, number, number]) {
  const { cx, cy, r } = CANOPY
  disc(p, ox + cx, oy + cy, r, pal.outline, clip)
  disc(p, ox + cx, oy + cy, r - 1, pal.canopyDark, clip)
  // Three layers of leaf, each up and to the left of the last: lit from there.
  disc(p, ox + cx - 1, oy + cy - 1, r - 3, pal.canopy, clip)
  disc(p, ox + cx - 3, oy + cy - 3, r - 6, pal.canopyLight, clip)
  disc(p, ox + cx + 4, oy + cy + 3, 3, pal.canopy, clip)
  disc(p, ox + cx - 5, oy + cy + 4, 2, pal.canopy, clip)
}

function drawTree(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  drawGrass(p, ox, pal, 3)
  const clip: [number, number, number, number] = [ox, 0, ox + T, T]
  // The shadow on the ground, then the trunk standing in it.
  disc(p, ox + 12, 21, 3, pal.grassDark, clip)
  p(ox + 5, 20, 14, 3, pal.grassDark)
  p(ox + 10, 15, 4, 7, pal.outline)
  p(ox + 11, 15, 2, 6, pal.trunk)
  drawCanopy(p, ox, 0, pal, clip)
}

/** The part of a canopy that stands over the tile above. Clear elsewhere. */
function drawCanopyTop(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  drawCanopy(p, ox, T, pal, [ox, 0, ox + T, T])
}

function drawDeadTree(p: Painter, ox: number, pal: VillagePalette, crackedGround: boolean) {
  if (crackedGround) drawCrackedGrass(p, ox, pal)
  else drawGrass(p, ox, pal, 3)
  p(ox + 6, 21, 12, 2, pal.grassDark)
  // A bare trunk and five branches.
  p(ox + 10, 6, 4, 16, pal.outline)
  p(ox + 11, 6, 2, 15, pal.trunk)
  for (const [x, y, w, h] of [[4, 8, 6, 2], [4, 4, 2, 5], [14, 11, 6, 2], [18, 6, 2, 6], [7, 14, 3, 2], [14, 3, 2, 4]]) {
    p(ox + x, y, w, h, pal.outline)
  }
}

function drawDeadTop(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  for (const [x, y, w, h] of [[11, T - 6, 2, 6], [8, T - 4, 3, 2], [14, T - 5, 2, 2]]) p(ox + x, y, w, h, pal.outline)
}

function drawCrackedGrass(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.grass)
  for (const [x, y, w, h] of [[3, 6, 9, 1], [11, 7, 1, 6], [15, 15, 6, 1], [18, 10, 1, 5], [5, 18, 4, 1], [8, 13, 1, 5]]) {
    p(ox + x, y, w, h, pal.outline)
  }
  p(ox + 6, 9, 2, 1, pal.grassDark)
  p(ox + 14, 19, 3, 1, pal.grassDark)
}

// --- cottages ----------------------------------------------------------------

type RoofRow = (typeof ROOF_ROWS)[number]
type Col = (typeof ROOF_COLS)[number]

/**
 * A piece of pitched roof. The slope comes from the courses of tile getting
 * closer together toward the ridge, a lit ridge along the top and a shadowed
 * eave along the bottom, with a bargeboard down each open end.
 */
function drawRoof(p: Painter, ox: number, pal: VillagePalette, row: RoofRow, col: Col) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.roof)
  const top = row === 'top' || row === 'single'
  const bottom = row === 'bottom' || row === 'single'
  // Courses: four in the upper row, three deeper ones in the lower.
  const courses = top && !bottom ? [5, 11, 17, 23] : bottom && !top ? [6, 14, 22] : [5, 11, 17, 22]
  let last = 0
  courses.forEach((y, i) => {
    p(ox, y, T, 1, pal.roofDark)
    p(ox, y - 1, T, 1, pal.roofLight)
    // The tiles in a course, staggered against the one above.
    for (let x = (i % 2) * 4; x < T; x += 8) p(ox + x, last + 1, 1, y - last - 1, pal.roofDark)
    last = y
  })
  if (top) {
    p(ox, 0, T, 1, pal.outline)
    p(ox, 1, T, 2, pal.roofLight)
  }
  if (bottom) {
    p(ox, T - 3, T, 2, pal.roofDark)
    p(ox, T - 1, T, 1, pal.outline)
  }
  if (col === 'left' || col === 'single') {
    p(ox, 0, 1, T, pal.outline)
    p(ox + 1, 0, 2, T, pal.plaster)
    p(ox + 3, 0, 1, T, pal.roofDark)
  }
  if (col === 'right' || col === 'single') {
    p(ox + T - 1, 0, 1, T, pal.outline)
    p(ox + T - 3, 0, 2, T, pal.plaster)
    p(ox + T - 4, 0, 1, T, pal.roofDark)
  }
}

/** A stone chimney on a clear ground, to stand on a roof. */
function drawChimney(p: Painter, ox: number, pal: VillagePalette) {
  p(ox + 8, 3, 9, 14, pal.outline)
  p(ox + 9, 4, 7, 12, pal.stone)
  p(ox + 9, 8, 7, 1, pal.stoneDark)
  p(ox + 9, 12, 7, 1, pal.stoneDark)
  p(ox + 12, 4, 1, 4, pal.stoneDark)
  p(ox + 11, 9, 1, 3, pal.stoneDark)
  p(ox + 7, 2, 11, 3, pal.outline)
  p(ox + 8, 3, 9, 1, pal.stoneDark)
}

/** The timber frame common to every piece of a cottage's front. */
function drawFront(p: Painter, ox: number, pal: VillagePalette, col: Col, base: boolean) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.plaster)
  p(ox, 0, T, 2, pal.plasterShade)
  if (base) {
    // A stone footing under the plaster.
    p(ox, T - 7, T, 7, pal.stone)
    p(ox, T - 7, T, 1, pal.stoneDark)
    p(ox, T - 4, T, 1, pal.stoneDark)
    for (let x = 3; x < T; x += 8) p(ox + x, T - 6, 1, 2, pal.stoneDark)
    for (let x = 7; x < T; x += 8) p(ox + x, T - 3, 1, 3, pal.stoneDark)
    p(ox, T - 1, T, 1, pal.outline)
  } else {
    // A beam across, where one storey meets the next.
    p(ox, T - 3, T, 3, pal.timber)
  }
  if (col === 'left' || col === 'single') {
    p(ox, 0, 1, T, pal.outline)
    p(ox + 1, 0, 3, T, pal.timber)
  }
  if (col === 'right' || col === 'single') {
    p(ox + T - 1, 0, 1, T, pal.outline)
    p(ox + T - 4, 0, 3, T, pal.timber)
  }
}

function drawFrontWindow(p: Painter, ox: number, pal: VillagePalette) {
  drawFront(p, ox, pal, 'mid', false)
  p(ox + 5, 4, 14, 14, pal.timber)
  p(ox + 7, 6, 10, 10, pal.glass)
  p(ox + 11, 6, 2, 10, pal.timber)
  p(ox + 7, 10, 10, 2, pal.timber)
  // A sill, and the glint that says glass.
  p(ox + 4, 18, 16, 2, pal.timber)
  p(ox + 8, 7, 2, 1, pal.plaster)
}

function drawFrontDoor(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  drawFront(p, ox, pal, 'mid', true)
  p(ox + 4, 2, 16, T - 2, pal.timber)
  p(ox + 6, 4, 12, T - 4, pal.door)
  p(ox + 11, 4, 2, T - 4, pal.doorDark)
  p(ox + 6, 13, 12, 1, pal.doorDark)
  p(ox + 15, 14, 2, 2, pal.knob)
  // The step.
  p(ox + 3, T - 2, 18, 2, pal.stoneDark)
}

function drawFrontCracked(p: Painter, ox: number, pal: VillagePalette) {
  drawFront(p, ox, pal, 'mid', false)
  // Cracks through the plaster, and a window boarded over.
  for (const [x, y, w, h] of [[4, 1, 1, 8], [5, 8, 1, 5], [17, 11, 1, 9], [16, 4, 1, 5], [18, 3, 3, 1]]) {
    p(ox + x, y, w, h, pal.outline)
  }
  p(ox + 7, 9, 10, 8, pal.outline)
  p(ox + 6, 11, 12, 2, pal.timber)
  p(ox + 6, 14, 12, 2, pal.timber)
}

function drawStoneWall(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.stone)
  for (let y = 0, row = 0; y < T; y += 6, row++) {
    p(ox, y + 5, T, 1, pal.stoneDark)
    for (let x = row % 2 ? 6 : 0; x < T; x += 12) p(ox + x, y, 1, 5, pal.stoneDark)
  }
}

// --- rooms -------------------------------------------------------------------

function drawFloor(p: Painter, ox: number, pal: VillagePalette, variant: number) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.floor)
  // Boards six pixels wide, with their ends in a different place on each.
  for (let x = 0; x < T; x += 6) p(ox + x, 0, 1, T, pal.floorLine)
  const ends = variant === 0 ? [[0, 9], [6, 19], [12, 5], [18, 14]] : [[0, 16], [6, 6], [12, 20], [18, 10]]
  for (const [x, y] of ends) {
    p(ox + x + 1, y, 5, 1, pal.floorLine)
    p(ox + x + 2, y + 2, 1, 1, pal.floorLine)
    p(ox + x + 4, y - 2 < 0 ? 0 : y - 2, 1, 1, pal.floorLight)
  }
}

function drawRottedFloor(p: Painter, ox: number, pal: VillagePalette) {
  drawFloor(p, ox, pal, 0)
  for (const [x, y, w, h] of [[4, 4, 6, 3], [15, 13, 5, 5], [3, 18, 3, 2]]) p(ox + x, y, w, h, pal.outline)
  p(ox + 5, 5, 3, 1, pal.floorLine)
}

/** A room's wall, seen face on: plaster over wooden panelling. */
function drawRoomFace(p: Painter, ox: number, pal: VillagePalette, cracked: boolean) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.plaster)
  p(ox, 0, T, 3, pal.cap)
  p(ox, 3, T, 1, pal.capLight)
  p(ox, T - 9, T, 9, pal.panel)
  p(ox, T - 9, T, 1, pal.timber)
  for (let x = 5; x < T; x += 6) p(ox + x, T - 8, 1, 8, pal.timber)
  p(ox, T - 1, T, 1, pal.outline)
  if (cracked) {
    for (const [x, y, w, h] of [[5, 4, 1, 7], [6, 10, 1, 4], [16, 6, 1, 8], [17, 5, 3, 1], [9, 15, 6, 3]]) {
      p(ox + x, y, w, h, pal.outline)
    }
  }
}

/** The top of a room's wall, where there is no face to see. */
function drawRoomCap(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  p(ox, 0, T, T, pal.cap)
  p(ox, 0, T, 1, pal.capLight)
  p(ox, 12, T, 1, pal.capLight)
  for (const [x, y] of [[7, 1], [19, 1], [1, 13], [13, 13]]) p(ox + x, y, 1, 11, pal.capLight)
}

function drawRoomDoor(p: Painter, ox: number, pal: VillagePalette) {
  const T = TILE_PX
  drawRoomCap(p, ox, pal)
  p(ox + 4, 1, 16, T - 1, pal.timber)
  p(ox + 6, 3, 12, T - 3, pal.door)
  p(ox + 11, 3, 2, T - 3, pal.doorDark)
  p(ox + 15, 13, 2, 2, pal.knob)
}

// --- the tileset -------------------------------------------------------------

/** Every frame, in a strip `FRAME_COUNT` tiles wide. */
export function drawTileset(p: Painter, pal: VillagePalette): void {
  const T = TILE_PX
  const at = (frame: number) => frame * T
  for (let v = 0; v < GRASS_VARIANTS; v++) drawGrass(p, at(FRAME.grass + v), pal, v)
  drawCrackedGrass(p, at(FRAME.crackedGrass), pal)
  for (let open = 0; open < 16; open++) {
    drawPath(p, at(FRAME.path + open), pal, open)
    drawWater(p, at(FRAME.water + open), pal, open)
  }
  drawTree(p, at(FRAME.tree), pal)
  drawDeadTree(p, at(FRAME.deadTree), pal, true)
  ROOF_ROWS.forEach((row, r) =>
    ROOF_COLS.forEach((col, c) => drawRoof(p, at(FRAME.roof + r * ROOF_COLS.length + c), pal, row, col)),
  )
  drawFrontWindow(p, at(FRAME.frontWindow), pal)
  FRONT_COLS.forEach((col, c) => {
    drawFront(p, at(FRAME.frontUpper + c), pal, col, false)
    drawFront(p, at(FRAME.frontBase + c), pal, col, true)
  })
  drawFrontDoor(p, at(FRAME.frontDoor), pal)
  drawFrontCracked(p, at(FRAME.frontCracked), pal)
  drawStoneWall(p, at(FRAME.stoneWall), pal)
  drawFloor(p, at(FRAME.floor), pal, 0)
  drawFloor(p, at(FRAME.floor + 1), pal, 1)
  drawRottedFloor(p, at(FRAME.rottedFloor), pal)
  drawRoomFace(p, at(FRAME.roomFace), pal, false)
  drawRoomFace(p, at(FRAME.roomFaceCracked), pal, true)
  drawRoomCap(p, at(FRAME.roomCap), pal)
  drawRoomDoor(p, at(FRAME.roomDoor), pal)
  drawCanopyTop(p, at(FRAME.canopyTop), pal)
  drawDeadTop(p, at(FRAME.deadTop), pal)
  drawChimney(p, at(FRAME.chimney), pal)
}

// --- choosing ----------------------------------------------------------------

/** A map's tile kinds, by row then column: `TILES` values, 0 for none. */
export type Kinds = ArrayLike<ArrayLike<number>>

const kindAt = (g: Kinds, x: number, y: number): number => {
  if (y < 0 || y >= g.length) return -1
  const row = g[y]
  if (x < 0 || x >= row.length) return -1
  return row[x]
}

const isWallish = (k: number) => k === TILES.WALL || k === TILES.CRACKED_WALL || k === TILES.DOOR
const isFloorish = (k: number) => k === TILES.FLOOR || k === TILES.ROTTED_FLOOR
const isGreen = (k: number) =>
  k === TILES.GRASS || k === TILES.CRACKED_GRASS || k === TILES.TREE || k === TILES.DEAD_TREE

/**
 * Whether a wall is part of a cottage's front: the wall under a roof, however
 * many rows down. A wall with no roof over it is a room's wall, or a garden's.
 */
export function isFront(g: Kinds, x: number, y: number): boolean {
  if (!isWallish(kindAt(g, x, y))) return false
  for (let up = y - 1; up >= 0; up--) {
    const k = kindAt(g, x, up)
    if (k === TILES.ROOF) return true
    if (!isWallish(k)) return false
  }
  return false
}

/** Whether a map is a room: it has floorboards in it. */
export const isInterior = (g: Kinds): boolean =>
  Array.from({ length: g.length }, (_, y) => y).some((y) => Array.from(g[y]).some(isFloorish))

/** Which sides of a cell do not hold `same`. */
const openSides = (g: Kinds, x: number, y: number, same: (k: number) => boolean): number =>
  (same(kindAt(g, x, y - 1)) ? 0 : SIDE.n) |
  (same(kindAt(g, x + 1, y)) ? 0 : SIDE.e) |
  (same(kindAt(g, x, y + 1)) ? 0 : SIDE.s) |
  (same(kindAt(g, x - 1, y)) ? 0 : SIDE.w)

const colOf = (left: boolean, right: boolean): number => (left && right ? 3 : left ? 0 : right ? 2 : 1)

/** The picture for a cell. */
export function baseFrame(g: Kinds, x: number, y: number): number {
  const k = kindAt(g, x, y)
  switch (k) {
    case TILES.GRASS: {
      // Mostly plain, a flower one cell in eleven.
      const h = hash(x, y)
      return FRAME.grass + (h % 11 === 0 ? 4 + ((h >> 4) % 2) : h % 4)
    }
    case TILES.CRACKED_GRASS:
      return FRAME.crackedGrass
    case TILES.PATH:
      // Soft only where it meets a lawn: a path runs square up to a wall or a
      // door, and off the map's edge.
      return FRAME.path + openSides(g, x, y, (n) => !isGreen(n))
    case TILES.WATER:
      return FRAME.water + openSides(g, x, y, (n) => !isGreen(n) && n !== TILES.PATH)
    case TILES.TREE:
      return FRAME.tree
    case TILES.DEAD_TREE:
      return FRAME.deadTree
    case TILES.ROOF: {
      const isRoof = (n: number) => n === TILES.ROOF
      const top = !isRoof(kindAt(g, x, y - 1))
      const bottom = !isRoof(kindAt(g, x, y + 1))
      const row = top && bottom ? 2 : top ? 0 : 1
      return FRAME.roof + row * ROOF_COLS.length + colOf(!isRoof(kindAt(g, x - 1, y)), !isRoof(kindAt(g, x + 1, y)))
    }
    case TILES.WALL:
    case TILES.CRACKED_WALL:
    case TILES.DOOR: {
      if (isFront(g, x, y)) {
        if (k === TILES.DOOR) return FRAME.frontDoor
        if (k === TILES.CRACKED_WALL) return FRAME.frontCracked
        const left = !isFront(g, x - 1, y)
        const right = !isFront(g, x + 1, y)
        const base = !isFront(g, x, y + 1)
        // A window under the eaves, in every piece that is not a corner post.
        if (!base && !left && !right && kindAt(g, x, y - 1) === TILES.ROOF) return FRAME.frontWindow
        return (base ? FRAME.frontBase : FRAME.frontUpper) + colOf(left, right)
      }
      if (!isInterior(g)) return k === TILES.DOOR ? FRAME.roomDoor : FRAME.stoneWall
      if (k === TILES.DOOR) return FRAME.roomDoor
      // A wall with floor in front of it shows its face; any other, its top.
      if (isFloorish(kindAt(g, x, y + 1))) return k === TILES.CRACKED_WALL ? FRAME.roomFaceCracked : FRAME.roomFace
      return FRAME.roomCap
    }
    case TILES.FLOOR:
      return FRAME.floor + ((x + y) % 2)
    case TILES.ROTTED_FLOOR:
      return FRAME.rottedFloor
    default:
      return FRAME.grass
  }
}

/**
 * What stands over a cell, above the kid, or null.
 *
 * A canopy reaches into the cell above its trunk, so a kid walking there
 * passes behind the leaves. It never does so over a door. A chimney stands on
 * one cell of each roof's top row, second from its right-hand end.
 */
export function overFrame(g: Kinds, x: number, y: number): number | null {
  const k = kindAt(g, x, y)
  const below = kindAt(g, x, y + 1)
  // Over another tree as well: in a wood the canopies overlap, and without
  // it a column of trees is a stack of flat-topped ones.
  if (k !== TILES.DOOR) {
    if (below === TILES.TREE) return FRAME.canopyTop
    if (below === TILES.DEAD_TREE) return FRAME.deadTop
  }
  if (k === TILES.ROOF) {
    const isRoof = (n: number) => n === TILES.ROOF
    const top = !isRoof(kindAt(g, x, y - 1))
    if (top && isRoof(kindAt(g, x + 1, y)) && !isRoof(kindAt(g, x + 2, y)) && isRoof(kindAt(g, x - 1, y))) {
      return FRAME.chimney
    }
  }
  return null
}
