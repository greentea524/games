// The floor, the walls and the targets, drawn at 24 pixels (#161).
//
// The hub card shows a grey-blue checkered floor, dark red-brown walls that
// stand up off it — a top with a brick face below — and targets that are a
// bright ✕ in a lit square. The game had flat sand, flat tan brick and a pale
// orange cross that was easy to miss.
//
// Everything here is drawn through a `Painter`, one filled rectangle at a
// time, so it has no Phaser and no canvas in it: `BootScene` hands it a canvas
// and `tiles_test.ts` hands it an array, and both get the same pixels.
import { PAL, WORLD_PALS, GBC_PAL } from './constants'

export const TILE_PX = 24
/** The lit target is drawn larger than its tile, so its glow shows round a crate. */
export const LIT_PX = 32

export type Rgb = number
/** Fills a rectangle. Coordinates are in pixels from the texture's top-left. */
export type Painter = (x: number, y: number, w: number, h: number, colour: Rgb) => void

export interface TilePalette {
  floorA: Rgb
  floorB: Rgb
  /** The seam at a flagstone's lower and right edge. */
  seam: Rgb
  /** The floor in the shade of a wall above it. */
  shadeA: Rgb
  shadeB: Rgb
  /** The top of a wall. */
  cap: Rgb
  /** The line just inside a wall's edge. */
  rim: Rgb
  /** The outline round a wall. */
  line: Rgb
  brick: Rgb
  mortar: Rgb
  /** The lit square under a target's ✕. */
  pad: Rgb
  /** The square's border, and the glow of a filled target. */
  glow: Rgb
  cross: Rgb
  ice: Rgb
  iceMark: Rgb
  crack: Rgb
  pit: Rgb
  pitEdge: Rgb
}

const channels = (c: Rgb): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const pack = (r: number, g: number, b: number): Rgb =>
  (Math.round(Math.max(0, Math.min(255, r))) << 16) |
  (Math.round(Math.max(0, Math.min(255, g))) << 8) |
  Math.round(Math.max(0, Math.min(255, b)))

/** A colour made darker (k below 1) or lighter (k above 1). */
export const shade = (c: Rgb, k: number): Rgb => {
  const [r, g, b] = channels(c)
  return pack(r * k, g * k, b * k)
}
/** `t` of the way from `a` to `b`. */
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  return pack(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}
export const luma = (c: Rgb): number => {
  const [r, g, b] = channels(c)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** The card's own colours: the first world, the warehouse. */
const WAREHOUSE: TilePalette = {
  floorA: 0x6a798e,
  floorB: 0x59677c,
  seam: 0x4c596c,
  shadeA: 0x4f5b6d,
  shadeB: 0x444f60,
  cap: 0x4a2c2a,
  rim: 0x6c4138,
  line: 0x1f1214,
  brick: 0x5e3b35,
  mortar: 0x2c1a1c,
  pad: 0x8e9cae,
  glow: 0xfff2b0,
  cross: 0xffffff,
  ice: 0xa8dcf0,
  iceMark: 0x5a9cc0,
  crack: 0x333c4a,
  pit: 0x0c0a10,
  pitEdge: 0x2a3140,
}

/**
 * A world's tiles, in colour.
 *
 * World 1 is the card. The other four keep the wall colours they had and a
 * floor leaning toward their old ground colour, so each is still its own
 * place; #165 gives them palettes of their own.
 *
 * A wall's rim is held darker than the floor beside it. Pocket Dungeon's rim
 * was first drawn lighter than its floor and read as more floor (#156), and a
 * derived palette can land there by accident — the ice world's wall colour is
 * as light as its floor.
 */
export function worldPalette(world: number): TilePalette {
  if (world <= 1) return WAREHOUSE
  const old = WORLD_PALS[world - 1] ?? GBC_PAL
  const floorA = mix(WAREHOUSE.floorA, old.bgGrass, 0.3)
  const floorB = shade(floorA, 0.85)
  let rim = old.wallBg
  while (luma(rim) > luma(floorB) - 24) rim = shade(rim, 0.92)
  const cap = shade(rim, 0.62)
  return {
    ...WAREHOUSE,
    floorA,
    floorB,
    seam: shade(floorB, 0.85),
    shadeA: shade(floorA, 0.76),
    shadeB: shade(floorB, 0.76),
    cap,
    rim,
    line: shade(cap, 0.42),
    brick: shade(rim, 0.8),
    mortar: shade(cap, 0.6),
    pad: mix(floorA, 0xffffff, 0.3),
    crack: shade(floorB, 0.55),
    pitEdge: shade(floorB, 0.45),
  }
}

/**
 * The green screen. Four tones and no more.
 *
 * Both floor squares are the lightest tone, so everything standing on the
 * floor answers to one surface; the checker is carried by the seam instead.
 */
export const DMG: TilePalette = {
  floorA: PAL.lightest,
  floorB: PAL.lightest,
  seam: PAL.light,
  shadeA: PAL.lightest,
  shadeB: PAL.lightest,
  cap: PAL.dark,
  rim: PAL.dark,
  line: PAL.darkest,
  brick: PAL.dark,
  mortar: PAL.darkest,
  pad: PAL.lightest,
  glow: PAL.darkest,
  cross: PAL.darkest,
  ice: PAL.lightest,
  iceMark: PAL.dark,
  crack: PAL.dark,
  pit: PAL.darkest,
  pitEdge: PAL.dark,
}

// --- floor -------------------------------------------------------------------

/** Frames of the floor texture: the two squares, plain and in a wall's shade. */
export const FLOOR = { a: 0, b: 1, aShaded: 2, bShaded: 3, count: 4 }

/** Which floor frame a cell takes. `shaded` when the cell above is a wall. */
export const floorFrame = (x: number, y: number, shaded: boolean): number =>
  ((x + y) % 2 === 0 ? FLOOR.a : FLOOR.b) + (shaded ? 2 : 0)

/** How far down a wall's shadow falls on the floor under it. */
const SHADOW = 5

function drawFloorTile(p: Painter, ox: number, pal: TilePalette, b: boolean, shaded: boolean, dmg: boolean) {
  const T = TILE_PX
  const base = b ? pal.floorB : pal.floorA
  p(ox, 0, T, T, base)
  if (dmg) {
    // One surface tone; the checker is every other square carrying a seam.
    if (b) {
      p(ox, T - 1, T, 1, pal.seam)
      p(ox + T - 1, 0, 1, T, pal.seam)
      p(ox, 0, T, 1, pal.seam)
      p(ox, 0, 1, T, pal.seam)
    }
    p(ox + 6, 7, 1, 1, pal.seam)
    p(ox + 16, 15, 1, 1, pal.seam)
    return
  }
  p(ox, T - 1, T, 1, pal.seam)
  p(ox + T - 1, 0, 1, T, pal.seam)
  // Wear: two flecks a shade off, in different places on the two squares.
  const fleck = shade(base, b ? 1.1 : 0.92)
  p(ox + (b ? 15 : 5), b ? 6 : 8, 2, 1, fleck)
  p(ox + (b ? 6 : 16), b ? 16 : 17, 1, 1, fleck)
  if (shaded) {
    p(ox, 0, T - 1, SHADOW - 2, b ? pal.shadeB : pal.shadeA)
    // The shadow's edge is broken up, so it reads as shade and not a stripe.
    const soft = mix(base, b ? pal.shadeB : pal.shadeA, 0.5)
    p(ox, SHADOW - 2, T - 1, 2, soft)
  }
}

export function drawFloor(p: Painter, pal: TilePalette, dmg = false): void {
  drawFloorTile(p, FLOOR.a * TILE_PX, pal, false, false, dmg)
  drawFloorTile(p, FLOOR.b * TILE_PX, pal, true, false, dmg)
  drawFloorTile(p, FLOOR.aShaded * TILE_PX, pal, false, true, dmg)
  drawFloorTile(p, FLOOR.bShaded * TILE_PX, pal, true, true, dmg)
}

// --- walls -------------------------------------------------------------------

/** Which sides of a wall cell face open floor. A wall frame is these as bits. */
export const OPEN = { n: 1, e: 2, s: 4, w: 8 }
export const WALL_FRAMES = 16
/** The brick face under a wall's top, where floor is below it. */
const FACE = 9

function drawWallTile(p: Painter, ox: number, pal: TilePalette, open: number) {
  const T = TILE_PX
  const n = (open & OPEN.n) !== 0
  const e = (open & OPEN.e) !== 0
  const s = (open & OPEN.s) !== 0
  const w = (open & OPEN.w) !== 0
  const capH = s ? T - FACE : T

  p(ox, 0, T, capH, pal.cap)
  // The rim: a line of the lighter colour one pixel inside each open edge,
  // with the outline outside it. This is what makes the top look like a top.
  if (n) p(ox, 1, T, 1, pal.rim)
  if (w) p(ox + 1, 0, 1, capH, pal.rim)
  if (e) p(ox + T - 2, 0, 1, capH, pal.rim)
  if (s) p(ox, capH - 2, T, 1, pal.rim)
  if (n) p(ox, 0, T, 1, pal.line)
  if (w) p(ox, 0, 1, capH, pal.line)
  if (e) p(ox + T - 1, 0, 1, capH, pal.line)

  if (s) {
    // The face: the top's lower edge, then three courses of brick.
    p(ox, capH - 1, T, 1, pal.line)
    p(ox, capH, T, FACE, pal.mortar)
    for (let course = 0; course < 3; course++) {
      const y = capH + course * 3
      const shift = course % 2 === 0 ? 0 : 6
      for (let x = -6 + shift; x < T; x += 12) {
        const left = Math.max(0, x)
        const right = Math.min(T, x + 11)
        if (right > left) p(ox + left, y, right - left, 2, pal.brick)
      }
    }
    if (w) p(ox, capH, 1, FACE, pal.line)
    if (e) p(ox + T - 1, capH, 1, FACE, pal.line)
  }
}

export function drawWalls(p: Painter, pal: TilePalette): void {
  for (let open = 0; open < WALL_FRAMES; open++) drawWallTile(p, open * TILE_PX, pal, open)
}

/**
 * The notch in a wall's top where two runs meet at an inside corner.
 *
 * Neither run has an open side there, so the 16 frames above draw nothing;
 * but floor touches the cell diagonally, and without this the rim stops one
 * pixel short of turning the corner. Four frames: floor to the NE, SE, SW, NW.
 */
export const CORNER = { ne: 0, se: 1, sw: 2, nw: 3, count: 4 }

export function drawCorners(p: Painter, pal: TilePalette): void {
  const T = TILE_PX
  const at = (frame: number, x: number, y: number) => {
    const ox = frame * T
    const rx = x === 0 ? 1 : T - 2
    const ry = y === 0 ? 1 : T - 2
    p(ox + rx, y === 0 ? 0 : T - 2, 1, 2, pal.rim)
    p(ox + (x === 0 ? 0 : T - 2), ry, 2, 1, pal.rim)
    p(ox + (x === 0 ? 0 : T - 1), y === 0 ? 0 : T - 1, 1, 1, pal.line)
  }
  at(CORNER.ne, 1, 0)
  at(CORNER.se, 1, 1)
  at(CORNER.sw, 0, 1)
  at(CORNER.nw, 0, 0)
}

export type Grid = ArrayLike<ArrayLike<string>>

/** Outside the grid counts as wall: a level's edge is solid. */
export const isWall = (grid: Grid, x: number, y: number): boolean => {
  if (y < 0 || y >= grid.length) return true
  const row = grid[y]
  if (x < 0 || x >= row.length) return true
  return row[x] === '#'
}

/** The wall frame for a cell: one bit for each side with floor beyond it. */
export function wallFrame(grid: Grid, x: number, y: number): number {
  return (
    (isWall(grid, x, y - 1) ? 0 : OPEN.n) |
    (isWall(grid, x + 1, y) ? 0 : OPEN.e) |
    (isWall(grid, x, y + 1) ? 0 : OPEN.s) |
    (isWall(grid, x - 1, y) ? 0 : OPEN.w)
  )
}

/** The inside corners a wall cell needs notched: see `drawCorners`. */
export function cornerFrames(grid: Grid, x: number, y: number): number[] {
  const out: number[] = []
  const inside = (dx: number, dy: number) =>
    isWall(grid, x + dx, y) && isWall(grid, x, y + dy) && !isWall(grid, x + dx, y + dy)
  if (inside(1, -1)) out.push(CORNER.ne)
  // A cell with floor to its south-east or south-west is the top of a wall
  // whose face is on its neighbour, not on itself; the notch sits on the top.
  if (inside(1, 1)) out.push(CORNER.se)
  if (inside(-1, 1)) out.push(CORNER.sw)
  if (inside(-1, -1)) out.push(CORNER.nw)
  return out
}

/**
 * Whether a wall cell is drawn at all.
 *
 * A wall with no floor within a cell of it, diagonals included, is not part
 * of any room's edge. Levels are padded with whole rows of it, and drawn as
 * wall-top they are a slab of red-brown the size of the room.
 */
export function isVoid(grid: Grid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!isWall(grid, x + dx, y + dy)) return false
    }
  }
  return true
}

// --- targets -----------------------------------------------------------------

/** The ✕: two diagonal strokes, inside the square. */
const inCross = (x: number, y: number, size: number, inset: number): boolean => {
  if (x < inset || y < inset || x >= size - inset || y >= size - inset) return false
  const d1 = Math.abs(x - y)
  const d2 = Math.abs(x + y - (size - 1))
  // Five pixels across. At three the ✕ was a hairline on a phone.
  return d1 <= 2 || d2 <= 2
}

/**
 * An empty target: a lit square with a bright ✕ in it.
 *
 * In colour the square is lighter than the floor and bordered in the glow
 * colour. On the green screen the floor is already the lightest tone, so the
 * square is an outline and the ✕ is the darkest tone: denser, not lighter.
 */
export function drawTarget(p: Painter, pal: TilePalette, dmg = false): void {
  const T = TILE_PX
  if (dmg) {
    p(2, 2, T - 4, 1, pal.rim)
    p(2, T - 3, T - 4, 1, pal.rim)
    p(2, 2, 1, T - 4, pal.rim)
    p(T - 3, 2, 1, T - 4, pal.rim)
  } else {
    p(2, 2, T - 4, T - 4, pal.glow)
    p(3, 3, T - 6, T - 6, pal.pad)
  }
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (inCross(x, y, T, 5)) p(x, y, 1, 1, pal.cross)
    }
  }
}

/**
 * A filled target, drawn `LIT_PX` square so it stands out past the crate.
 *
 * A crate covers its whole tile, so a target with a crate on it used to show
 * nothing of itself: the only sign was the crate's tint. This is a frame of
 * glow four pixels wide all round, which a crate cannot cover. The middle is
 * only seen in the flash as a crate lands.
 */
export function drawTargetLit(p: Painter, pal: TilePalette, dmg = false): void {
  const S = LIT_PX
  const band = (S - TILE_PX) / 2
  if (dmg) {
    // A dithered frame in the darkest tone: glow, on a screen with no light.
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const edge = Math.min(x, y, S - 1 - x, S - 1 - y)
        if (edge >= band) continue
        if (edge >= band - 2 || (x + y) % 2 === 0) p(x, y, 1, 1, pal.glow)
      }
    }
    // The middle is left unpainted: the floor under it is already the
    // lightest tone, and a painted square of it is a square of floor.
  } else {
    p(1, 1, S - 2, S - 2, mix(pal.glow, pal.floorA, 0.45))
    p(2, 2, S - 4, S - 4, pal.glow)
    p(band, band, TILE_PX, TILE_PX, mix(pal.glow, 0xffffff, 0.5))
  }
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (inCross(x, y, TILE_PX, 5)) p(band + x, band + y, 1, 1, pal.cross)
    }
  }
}

// --- special floor -----------------------------------------------------------

/** Ice: pale, with three skate marks. */
export function drawIce(p: Painter, pal: TilePalette): void {
  const T = TILE_PX
  p(0, 0, T, T, pal.ice)
  p(0, T - 1, T, 1, pal.iceMark)
  p(T - 1, 0, 1, T, pal.iceMark)
  p(4, 6, 14, 1, pal.iceMark)
  p(3, 13, 11, 1, pal.iceMark)
  p(9, 19, 10, 1, pal.iceMark)
}

/** Cracked floor: the plain square with a crack through it. */
export function drawCracked(p: Painter, pal: TilePalette, dmg = false): void {
  drawFloorTile(p, 0, pal, false, false, dmg)
  const steps: [number, number, number, number][] = [
    [6, 3, 2, 5], [8, 7, 3, 2], [10, 9, 2, 5], [12, 13, 5, 2], [16, 15, 2, 5], [5, 12, 4, 1], [14, 8, 4, 1],
  ]
  for (const [x, y, w, h] of steps) p(x, y, w, h, pal.crack)
}

/** A hole: dark, with a lip so it reads as a drop and not a black square. */
export function drawHole(p: Painter, pal: TilePalette, dmg = false): void {
  const T = TILE_PX
  p(0, 0, T, T, pal.pitEdge)
  p(2, 2, T - 4, T - 4, pal.pit)
  // The far wall of the drop, a shade between. The green screen has no tone
  // between its two darkest, so there the lip alone carries it.
  if (!dmg) p(2, 2, T - 4, 2, shade(pal.pitEdge, 0.6))
}

// --- framing -----------------------------------------------------------------

/**
 * The part of a level that is drawn: the box round every cell that is not
 * void, in cells. Levels are padded to ten by nine with rows of wall, so the
 * room in `First Delivery` is the top five rows of nine and used to sit
 * against the top of the screen, its upper wall under the HUD.
 */
export function drawnBox(grid: Grid): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === '#' && isVoid(grid, x, y)) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  if (x1 < 0) return { x: 0, y: 0, width: grid[0]?.length ?? 0, height: grid.length }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
