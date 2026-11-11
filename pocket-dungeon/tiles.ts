// Pocket Dungeon's floors and walls, drawn at 24 pixels (#156).
//
// The hub card shows mossy green-grey flagstones inside a stone-brick rim,
// with black beyond the rooms. The game drew a flat purple floor and purple
// bevelled squares for every wall cell, so a room and the rock around it were
// the same colour and the map read as a grid of squares.
//
// Two halves, both free of Phaser so `tiles_test.ts` can run them:
//
//   - `drawTileset` paints every frame into a canvas strip.
//   - `floorFrame` and `wallFrame` say which frame a map cell gets. A wall is
//     drawn by what is next to it: a brick face where the room is below it, a
//     capstone rim where the room is beside or above it, and nothing at all
//     where there is no room within one cell — that is the black around the
//     rooms.

export const TILE_PX = 24

/** Frame numbers in the strip. 0 to 8 keep the meaning they always had. */
export const FRAME = {
  floor: 0,
  /** A plain brick face; kept so an old frame number still draws a wall. */
  wall: 1,
  stairs: 2,
  path: 3,
  cracked: 4,
  torch: 5,
  banner: 6,
  rug: 7,
  bones: 8,
  /** Three more flagstone patterns, so a floor does not visibly repeat. */
  floorVariants: [9, 10, 11],
  /** Brick faces, by which of their sides is open: none, left, right, both. */
  face: 12,
  /** Capstone rims, plus a four-bit mask of open sides: N 1, E 2, S 4, W 8. */
  cap: 16,
  /** One past the last frame. */
  count: 32,
} as const

export type Rgb = number

export interface TilePalette {
  floor: Rgb
  floorLight: Rgb
  floorDark: Rgb
  mortar: Rgb
  moss: Rgb
  brick: Rgb
  brickLight: Rgb
  brickMortar: Rgb
  cap: Rgb
  capLight: Rgb
  capDark: Rgb
  rug: Rgb
  trim: Rgb
  bone: Rgb
  flame: Rgb
  flameCore: Rgb
  iron: Rgb
  banner: Rgb
}

/** Moves a colour toward black (k < 1) or white (k > 1), channel by channel. */
export function shade(c: Rgb, k: number): Rgb {
  const ch = (shift: number) => {
    const v = (c >> shift) & 0xff
    const out = k >= 1 ? v + (255 - v) * (k - 1) : v * k
    return Math.max(0, Math.min(255, Math.round(out)))
  }
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const luma = (c: Rgb) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)

/** A palette built from a floor colour and a wall colour. */
export function paletteFrom(floor: Rgb, wall: Rgb, accents: Partial<TilePalette> = {}): TilePalette {
  // The rim is the top of the wall seen from above, so it sits darker than
  // the floor it surrounds. Drawn lighter first, it read as more floor; and a
  // fixed fraction of the wall colour was not enough for the catacomb and the
  // vault, whose walls are lighter than their floors. So it is darkened until
  // it is clearly below the floor, whatever the wall colour.
  let rim = shade(wall, 0.62)
  while (luma(rim) > luma(floor) * 0.8) rim = shade(rim, 0.9)
  return {
    floor,
    floorLight: shade(floor, 1.18),
    floorDark: shade(floor, 0.78),
    mortar: shade(floor, 0.5),
    moss: 0x4d6b38,
    brick: wall,
    brickLight: shade(wall, 1.2),
    brickMortar: shade(wall, 0.45),
    cap: rim,
    capLight: shade(rim, 1.3),
    capDark: shade(rim, 0.5),
    rug: 0x7a2a2e,
    trim: 0xc8a040,
    bone: 0xd8d0b8,
    flame: 0xff9a20,
    flameCore: 0xffe070,
    iron: 0x2a2620,
    banner: 0x8a2030,
    ...accents,
  }
}

/**
 * The first biome, in the card's colours: green-grey stone with moss in the
 * joints, under a grey brick rim. It was purple (#156).
 */
export const CELLAR = paletteFrom(0x56634a, 0x5e5c4e, { moss: 0x4f6e38 })

/** The catacomb and the vault keep their hues and gain the same structure. */
export const CATACOMB = paletteFrom(0x584430, 0x886848, { moss: 0x5a5a30 })
export const VAULT = paletteFrom(0x284658, 0x4a7f9c, { moss: 0x2f6a6a, rug: 0x205a78 })

/**
 * The classic green screen. The floor stays the lightest of the four tones —
 * every DMG sprite was checked against exactly that by `qa:contrast` — and
 * every other colour is one of the other three.
 */
export const DMG = {
  floor: 0x9bbc0f,
  floorLight: 0x9bbc0f,
  floorDark: 0x8bac0f,
  mortar: 0x8bac0f,
  moss: 0x8bac0f,
  brick: 0x306230,
  brickLight: 0x306230,
  brickMortar: 0x0f380f,
  // The rim must not be a floor tone: in `light` it vanished into the room.
  cap: 0x306230,
  capLight: 0x8bac0f,
  capDark: 0x0f380f,
  rug: 0x8bac0f,
  trim: 0x306230,
  bone: 0x306230,
  flame: 0x9bbc0f,
  flameCore: 0x8bac0f,
  iron: 0x0f380f,
  banner: 0x0f380f,
} satisfies TilePalette

/** A small integer hash, for speckle that is the same every time it is drawn. */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const css = (c: Rgb) => `#${c.toString(16).padStart(6, '0')}`

/** The drawing surface `drawTileset` needs; a canvas 2D context satisfies it. */
export interface Painter {
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  clearRect(x: number, y: number, w: number, h: number): void
}

/**
 * Paints every frame into a strip `FRAME.count` tiles wide.
 *
 * `dmg` keeps the speckle out: on the green screen a floor of mixed tones is
 * noise behind every sprite, and four tones cannot shade a flagstone anyway.
 */
export function drawTileset(p: Painter, pal: TilePalette, dmg = false): void {
  const T = TILE_PX
  let ox = 0
  const px = (x: number, y: number, w: number, h: number, c: Rgb) => {
    p.fillStyle = css(c)
    p.fillRect(ox + x, y, w, h)
  }

  /**
   * A floor of flagstones. `splits` are the mortar lines inside the tile, as
   * [x or y, horizontal?]; the tile's own top and left edges are always
   * mortar, so neighbouring tiles join into one grid.
   */
  const flags = (salt: number, splitX: number | null, splitY: number | null, moss: boolean) => {
    px(0, 0, T, T, pal.floor)
    if (!dmg) {
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const n = hash(x, y, salt)
          if (n < 0.09) px(x, y, 1, 1, pal.floorDark)
          else if (n > 0.93) px(x, y, 1, 1, pal.floorLight)
        }
      }
    }
    // Stone edges: lit on the top and left of each stone, dark on its bottom
    // and right, so the stones read as slightly raised.
    const stone = (x0: number, y0: number, x1: number, y1: number) => {
      if (!dmg) {
        px(x0 + 1, y0 + 1, x1 - x0 - 2, 1, pal.floorLight)
        px(x0 + 1, y0 + 1, 1, y1 - y0 - 2, pal.floorLight)
        px(x0 + 1, y1 - 1, x1 - x0 - 1, 1, pal.floorDark)
        px(x1 - 1, y0 + 1, 1, y1 - y0 - 1, pal.floorDark)
      }
    }
    const xs = [0, ...(splitX === null ? [] : [splitX]), T]
    const ys = [0, ...(splitY === null ? [] : [splitY]), T]
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) stone(xs[i], ys[j], xs[i + 1], ys[j + 1])
    px(0, 0, T, 1, pal.mortar)
    px(0, 0, 1, T, pal.mortar)
    if (splitX !== null) px(splitX, 0, 1, T, pal.mortar)
    if (splitY !== null) px(0, splitY, T, 1, pal.mortar)
    if (moss && !dmg) {
      // A tuft where joints meet.
      px(0, 0, 3, 2, pal.moss)
      px(0, 0, 2, 3, pal.moss)
      if (splitX !== null) px(splitX - 1, T - 3, 3, 3, pal.moss)
    }
  }

  const brickFace = (left: boolean, right: boolean) => {
    // Capstone along the top, then brick courses, then a shadow line where the
    // wall meets the floor.
    px(0, 0, T, 6, pal.cap)
    px(0, 0, T, 1, pal.capLight)
    px(0, 5, T, 1, pal.capDark)
    px(0, 6, T, T - 6, pal.brick)
    for (let row = 0; row < 3; row++) {
      const y = 6 + row * 6
      px(0, y + 5, T, 1, pal.brickMortar)
      const offset = row % 2 === 0 ? 0 : 6
      for (let x = offset; x < T; x += 12) px(x, y, 1, 5, pal.brickMortar)
      if (!dmg) {
        for (let x = offset; x < T; x += 12) px(x + 1, y, Math.min(11, T - x - 1), 1, pal.brickLight)
      }
    }
    px(0, T - 1, T, 1, pal.brickMortar)
    if (left) {
      px(0, 0, 1, T, pal.capDark)
      if (!dmg) px(1, 1, 1, 5, pal.capLight)
    }
    if (right) px(T - 1, 0, 1, T, pal.capDark)
  }

  const capstone = (mask: number) => {
    px(0, 0, T, T, pal.cap)
    if (!dmg) {
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const n = hash(x, y, 77)
          if (n < 0.07) px(x, y, 1, 1, pal.capDark)
          else if (n > 0.95) px(x, y, 1, 1, pal.capLight)
        }
      }
      // Joints between the slabs of the rim.
      px(0, 0, T, 1, shade(pal.cap, 0.8))
      px(0, 0, 1, T, shade(pal.cap, 0.8))
    }
    // A lip on each side that faces the room: lit edge, then a dark drop.
    if (mask & 1) {
      px(0, 0, T, 2, pal.capDark)
      px(0, 2, T, 1, pal.capLight)
    }
    if (mask & 4) {
      px(0, T - 3, T, 1, pal.capLight)
      px(0, T - 2, T, 2, pal.capDark)
    }
    if (mask & 8) {
      px(0, 0, 2, T, pal.capDark)
      px(2, 0, 1, T, pal.capLight)
    }
    if (mask & 2) {
      px(T - 3, 0, 1, T, pal.capLight)
      px(T - 2, 0, 2, T, pal.capDark)
    }
  }

  const frame = (index: number, draw: () => void) => {
    ox = index * T
    p.clearRect(ox, 0, T, T)
    draw()
  }

  frame(FRAME.floor, () => flags(1, null, null, false))
  FRAME.floorVariants.forEach((index, i) =>
    frame(index, () => flags(2 + i, i === 0 ? 12 : i === 2 ? 9 : null, i === 1 ? 12 : i === 2 ? 15 : null, i !== 1)),
  )
  frame(FRAME.wall, () => brickFace(false, false))
  for (let m = 0; m < 4; m++) frame(FRAME.face + m, () => brickFace(Boolean(m & 1), Boolean(m & 2)))
  for (let m = 0; m < 16; m++) frame(FRAME.cap + m, () => capstone(m))

  frame(FRAME.stairs, () => {
    // A stairway going down, each step a little darker than the one above.
    px(0, 0, T, T, pal.mortar)
    for (let s = 0; s < 5; s++) {
      const y = 1 + s * 4 + Math.floor(s / 2)
      // On the green screen the steps alternate two tones; it has no others.
      const tone = dmg ? (s % 2 === 0 ? pal.floor : pal.floorDark) : shade(pal.floor, 1 - s * 0.14)
      px(3, y, T - 6, 4, tone)
      px(3, y, T - 6, 1, dmg ? pal.capLight : shade(tone, 1.25))
    }
    px(0, 0, 3, T, pal.brick)
    px(T - 3, 0, 3, T, pal.brick)
    px(2, 0, 1, T, pal.brickMortar)
    px(T - 3, 0, 1, T, pal.brickMortar)
  })

  frame(FRAME.path, () => {
    // A corridor of smaller cobbles, so a passage reads apart from a room.
    px(0, 0, T, T, pal.floorDark)
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const x = i * 8 + (j % 2 === 0 ? 0 : 4)
        const y = j * 8
        const w = Math.min(7, T - x)
        px(x, y, w, 7, pal.floor)
        if (!dmg) {
          px(x, y, w, 1, pal.floorLight)
          px(x, y + 6, w, 1, shade(pal.floor, 0.85))
        }
        if (j % 2 === 1 && i === 0) px(0, y, 3, 7, pal.floor)
      }
    }
  })

  frame(FRAME.cracked, () => {
    flags(5, null, null, false)
    const crack = [[6, 4], [7, 5], [8, 6], [8, 7], [9, 8], [10, 9], [11, 9], [12, 10], [12, 11], [13, 12], [13, 13], [12, 14], [11, 15], [14, 13], [15, 14], [16, 14]]
    for (const [x, y] of crack) px(x, y, 1, 1, pal.mortar)
  })

  frame(FRAME.bones, () => {
    flags(6, null, null, false)
    const bone = (x: number, y: number, len: number) => {
      px(x - 1, y - 1, len + 2, 4, dmg ? pal.floorDark : shade(pal.bone, 0.45))
      px(x, y, len, 2, pal.bone)
      px(x - 1, y - 1, 2, 2, pal.bone)
      px(x - 1, y + 1, 2, 2, pal.bone)
      px(x + len - 1, y - 1, 2, 2, pal.bone)
      px(x + len - 1, y + 1, 2, 2, pal.bone)
    }
    bone(5, 7, 7)
    bone(11, 15, 6)
    // A skull: round top, dark eye holes.
    px(15, 4, 5, 4, dmg ? pal.floorDark : shade(pal.bone, 0.45))
    px(16, 4, 3, 3, pal.bone)
    px(15, 5, 5, 2, pal.bone)
    px(16, 5, 1, 1, pal.mortar)
    px(18, 5, 1, 1, pal.mortar)
  })

  frame(FRAME.rug, () => {
    // Full bleed, so neighbouring rug cells join into one rug rather than a
    // grid of framed squares: a woven stripe near each edge and a small
    // diamond in the middle.
    flags(7, null, null, false)
    px(0, 0, T, T, pal.rug)
    if (!dmg) {
      for (let y = 0; y < T; y += 2) for (let x = (y / 2) % 2; x < T; x += 2) px(x, y, 1, 1, shade(pal.rug, 0.85))
    }
    px(0, 3, T, 1, pal.trim)
    px(0, T - 4, T, 1, pal.trim)
    for (let i = 0; i < 4; i++) {
      px(12 - i, 8 + i, 1 + i * 2 - 0, 1, pal.trim)
      px(12 - i, 15 - i, 1 + i * 2 - 0, 1, pal.trim)
    }
  })

  frame(FRAME.torch, () => {
    brickFace(false, false)
    // Iron bracket, then the flame.
    px(10, 12, 4, 2, pal.iron)
    px(11, 10, 2, 8, pal.iron)
    px(10, 4, 4, 6, pal.flame)
    px(11, 3, 2, 2, pal.flame)
    px(11, 5, 2, 4, pal.flameCore)
  })

  frame(FRAME.banner, () => {
    brickFace(false, false)
    px(7, 6, 10, 14, pal.banner)
    px(7, 6, 10, 1, pal.trim)
    px(11, 9, 2, 7, pal.trim)
    px(9, 11, 6, 2, pal.trim)
    px(7, 20, 3, 2, pal.banner)
    px(14, 20, 3, 2, pal.banner)
  })
}

// --- which frame each cell gets ----------------------------------------------

/** A map: rows of cells, as strings or arrays of one-character strings. */
export type Grid = ArrayLike<ArrayLike<string>>

/** Cells that are rock: drawn as wall, or not drawn at all. */
const SOLID = new Set(['#', 'T', 'B', ' '])

export const isSolid = (grid: Grid, x: number, y: number): boolean => {
  const c = grid[y]?.[x]
  return c === undefined || SOLID.has(c)
}

/**
 * Which flagstone pattern a floor cell gets, from its position and the floor's
 * seed: the same floor always looks the same, and two floors do not.
 */
export function floorFrame(x: number, y: number, seed: number): number {
  const n = hash(x, y, seed)
  if (n < 0.55) return FRAME.floor
  return FRAME.floorVariants[Math.min(2, Math.floor((n - 0.55) / 0.15))]
}

/**
 * Which frame a wall cell gets, or -1 for none.
 *
 * - **Face**: the room is directly below, so the player sees the wall's side.
 *   Its left and right edges are finished where the room also wraps round.
 * - **Cap**: the room is beside, above, or only diagonally next to it, so the
 *   player sees the top of the rim; a lip is drawn on each side the room is.
 * - **None**: no room within one cell. This is the black around the rooms.
 */
export function wallFrame(grid: Grid, x: number, y: number): number {
  const open = (dx: number, dy: number) => !isSolid(grid, x + dx, y + dy)
  if (open(0, 1)) return FRAME.face + (open(-1, 0) ? 1 : 0) + (open(1, 0) ? 2 : 0)
  const mask = (open(0, -1) ? 1 : 0) | (open(1, 0) ? 2 : 0) | (open(-1, 0) ? 8 : 0)
  if (mask) return FRAME.cap + mask
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (open(dx, dy)) return FRAME.cap
  return -1
}
