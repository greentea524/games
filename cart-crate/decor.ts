// The warehouse round the puzzle (#163).
//
// The hub card's charm is its setting: shelves of boxes, a tool rack, barrels
// and stacked crates round the edges. The game had a room in the dark.
//
// Everything here goes in the space *outside* a level: cells that are wall
// with no floor within a cell of them, which `tiles.ts` leaves undrawn, and
// cells beyond the level's grid. It is drawn darker and greyer than the play
// area, so a stack of boxes out there cannot be taken for a crate that can be
// pushed. Which cell gets what comes from the level's number, so a level
// always looks the same.
//
// No Phaser in this file, so `decor_test.ts` can place every level.
import { PAL } from './constants'
import {
  TILE_PX, drawnBox, isVoid, luma, mix, shade, worldPalette, type Grid, type Painter, type Rgb,
} from './tiles'

// --- where the camera looks --------------------------------------------------

export interface View {
  /** The camera's scroll, in pixels, for a level that does not scroll. */
  scrollX: number
  scrollY: number
  /** True when the level is larger than the screen and scrolls with the fox. */
  follows: boolean
}

/**
 * How a level is framed (#161): what is framed is the part that is drawn.
 *
 * A level that fits between the HUD's two bars is centred there. One that
 * fits the screen but not that gap is centred on the screen, its outer wall
 * under the bars. One larger than the screen scrolls.
 */
export function levelView(
  grid: Grid, screen: { width: number; height: number }, hud: { top: number; bottom: number },
): View {
  const box = drawnBox(grid)
  const width = box.width * TILE_PX
  const height = box.height * TILE_PX
  if (width > screen.width || height > screen.height) return { scrollX: 0, scrollY: 0, follows: true }
  const between = screen.height - hud.top - hud.bottom
  const top = height <= between ? hud.top + (between - height) / 2 : (screen.height - height) / 2
  return {
    scrollX: Math.round(box.x * TILE_PX - (screen.width - width) / 2),
    scrollY: Math.round(box.y * TILE_PX - top),
    follows: false,
  }
}

export interface Cell { x: number; y: number }

/** A cell outside the level: beyond the grid, or wall with no floor near it. */
export const isOutside = (grid: Grid, x: number, y: number): boolean => {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return true
  return grid[y][x] === '#' && isVoid(grid, x, y)
}

/**
 * Every cell outside the level that the camera can show.
 *
 * For a level that sits still, the cells under the screen; they run past the
 * grid's edge on any side the level does not reach. For one that scrolls, the
 * cells the camera's bounds cover.
 */
export function surround(grid: Grid, view: View, screen: { width: number; height: number }): Cell[] {
  const rows = grid.length
  const cols = Math.max(...Array.from({ length: rows }, (_, y) => grid[y].length))
  const x0 = view.follows ? 0 : Math.floor(view.scrollX / TILE_PX)
  const y0 = view.follows ? 0 : Math.floor(view.scrollY / TILE_PX)
  const x1 = view.follows
    ? Math.ceil(Math.max(screen.width, cols * TILE_PX) / TILE_PX) - 1
    : Math.floor((view.scrollX + screen.width - 1) / TILE_PX)
  const y1 = view.follows
    ? Math.ceil(Math.max(screen.height, rows * TILE_PX) / TILE_PX) - 1
    : Math.floor((view.scrollY + screen.height - 1) / TILE_PX)
  const out: Cell[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (isOutside(grid, x, y)) out.push({ x, y })
  }
  return out
}

// --- what goes where ---------------------------------------------------------

/** Frames of the decoration texture. */
export const DECOR = { shelf: 0, rack: 1, barrel: 2, boxes: 3, count: 4 }
export type DecorKind = keyof Omit<typeof DECOR, 'count'>

export interface Placed extends Cell { kind: DecorKind }

/** A small seeded generator (mulberry32): the same level, the same warehouse. */
function rng(seed: number): () => number {
  let a = (seed * 0x9e3779b1) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Decoration for a level: which outside cells hold something, and what.
 *
 * Shelves and the tool rack stand in the row behind the room's back wall, as
 * on the card; barrels and stacked boxes are scattered thinly elsewhere. A
 * level with no cell to spare gets none: nothing is ever squeezed in.
 */
export function placeDecor(grid: Grid, cells: Cell[], seed: number): Placed[] {
  const random = rng(seed)
  const box = drawnBox(grid)
  const out: Placed[] = []
  // Row by row, left to right, so the draw order does not change the result.
  const ordered = [...cells].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const cell of ordered) {
    const roll = random()
    const pick = random()
    const behind = cell.y === box.y - 1 && cell.x >= box.x && cell.x < box.x + box.width
    if (behind) {
      if (roll < 0.75) out.push({ ...cell, kind: pick < 0.5 ? 'shelf' : pick < 0.75 ? 'rack' : 'boxes' })
    } else if (roll < 0.2) {
      out.push({ ...cell, kind: pick < 0.5 ? 'barrel' : 'boxes' })
    }
  }
  return out
}

// --- the pictures ------------------------------------------------------------

export interface DecorPalette {
  floorA: Rgb
  floorB: Rgb
  wood: Rgb
  woodDark: Rgb
  metal: Rgb
  line: Rgb
}

/** A colour pulled most of the way to grey, and darkened. */
export const dim = (c: Rgb): Rgb => {
  const grey = Math.round(luma(c))
  return shade(mix(c, (grey << 16) | (grey << 8) | grey, 0.6), 0.5)
}

/** The surround in colour: the world's own floor and wood, dimmed. */
export function decorPalette(world: number): DecorPalette {
  const pal = worldPalette(world)
  // The outside's floor is the world's own, dimmed, and held at most as bright
  // as the warehouse's: a pale world's floor dimmed is still light enough that
  // the wood lifted clear of it was as bright as a crate (#165).
  const floor = (c: number) => {
    let d = dim(c)
    while (luma(d) > 60) d = shade(d, 0.94)
    return d
  }
  const floorA = floor(pal.floorA)
  const floorB = floor(pal.floorB)
  // Dim wood on a dim floor can be the same grey: in the ice and ruin worlds
  // it was, and the barrels were only their hoops. Lift it clear of the floor.
  let wood = dim(0xb8783c)
  while (luma(wood) < luma(floorA) + 16) wood = shade(wood, 1.08)
  return {
    floorA,
    floorB,
    wood,
    woodDark: dim(0x6a3c18),
    metal: dim(0xa8b4c4),
    line: 0x0c0c10,
  }
}

/**
 * The surround on the green screen: the darkest tone, with things on it in
 * the second-lightest and their detail in the dark one.
 *
 * Nothing on a thing may be the darkest tone, because that is the ground it
 * stands on: the first set gave a shelf a darkest back panel, and
 * `qa:contrast` found 37 pixels of its outline eaten into the floor. Dark on
 * darkest alone is the pair Pocket Dungeon's empty relic pip was lost in
 * (#158), so the bodies are pale and the dark tone is kept for detail.
 */
export const DMG_DECOR: DecorPalette = {
  floorA: PAL.darkest,
  floorB: PAL.darkest,
  wood: PAL.light,
  woodDark: PAL.dark,
  metal: PAL.dark,
  line: PAL.dark,
}

/** The surround's floor: the checker again, two frames. */
export function drawDecorFloor(p: Painter, pal: DecorPalette, dmg = false): void {
  const T = TILE_PX
  for (const [i, c] of [pal.floorA, pal.floorB].entries()) {
    p(i * T, 0, T, T, c)
    if (dmg) {
      // One tone, so the squares are told apart by a dot in every other one.
      if (i === 1) p(i * T + 11, 11, 2, 2, pal.wood)
    } else {
      p(i * T, T - 1, T, 1, shade(c, 0.8))
      p(i * T + T - 1, 0, 1, T, shade(c, 0.8))
    }
  }
}

/** The four things, one frame each, on a clear ground. */
export function drawDecor(p: Painter, pal: DecorPalette): void {
  const T = TILE_PX
  const at = (frame: number) => (x: number, y: number, w: number, h: number, c: Rgb) => p(frame * T + x, y, w, h, c)

  // A shelf unit: two uprights, three boards, boxes and tins on the boards.
  const shelf = at(DECOR.shelf)
  shelf(2, 2, 20, 20, pal.woodDark)
  shelf(2, 2, 2, 20, pal.wood)
  shelf(20, 2, 2, 20, pal.wood)
  for (const y of [2, 9, 16]) shelf(2, y, 20, 2, pal.wood)
  shelf(5, 5, 5, 4, pal.metal)
  shelf(12, 6, 6, 3, pal.wood)
  shelf(6, 12, 4, 4, pal.wood)
  shelf(13, 11, 5, 5, pal.metal)
  shelf(5, 19, 13, 2, pal.metal)
  shelf(2, 21, 20, 1, pal.line)

  // A tool rack: a board on the wall with a wrench, a hammer and a saw on it.
  const rack = at(DECOR.rack)
  rack(2, 3, 20, 17, pal.wood)
  rack(2, 3, 20, 1, pal.line)
  rack(2, 19, 20, 1, pal.line)
  rack(5, 6, 2, 10, pal.metal)
  rack(4, 6, 4, 2, pal.metal)
  rack(11, 6, 2, 10, pal.woodDark)
  rack(9, 6, 6, 3, pal.metal)
  rack(17, 6, 3, 9, pal.metal)
  rack(17, 15, 3, 2, pal.woodDark)

  // A barrel, seen from the front: staves and two hoops.
  const barrel = at(DECOR.barrel)
  barrel(6, 3, 12, 18, pal.wood)
  barrel(5, 6, 14, 12, pal.wood)
  barrel(9, 3, 1, 18, pal.woodDark)
  barrel(14, 3, 1, 18, pal.woodDark)
  barrel(5, 7, 14, 2, pal.metal)
  barrel(5, 15, 14, 2, pal.metal)
  barrel(6, 21, 12, 1, pal.line)

  // Stacked boxes: two below and one on top, none the size or shape of a crate.
  const boxes = at(DECOR.boxes)
  boxes(2, 12, 10, 9, pal.wood)
  boxes(13, 14, 9, 7, pal.wood)
  boxes(7, 4, 10, 8, pal.wood)
  boxes(2, 12, 10, 1, pal.woodDark)
  boxes(13, 14, 9, 1, pal.woodDark)
  boxes(7, 4, 10, 1, pal.woodDark)
  boxes(6, 15, 2, 3, pal.woodDark)
  boxes(11, 7, 2, 3, pal.woodDark)
  boxes(2, 21, 20, 1, pal.line)
}
