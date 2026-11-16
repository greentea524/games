// The forest: its colours, its mossy stone and the trees behind it (#172).
//
// The hub card is a place: stone blocks with a grass cap and roots hanging
// under them, in front of a forest that goes back in layers. The game was a
// flat dotted strip on near-black. Everything here is drawn at the screen's
// resolution, sixteen pixels to a tile, which is twice the world's: the play
// camera magnifies by two (#171), so a picture drawn at two to the unit and
// shown at half size is one drawn pixel to one screen pixel.
//
// No Phaser in this file, so `forest_test.ts` can check every piece.

/** Fills a rectangle. Everything here is drawn through one of these. */
export type Painter = (x: number, y: number, w: number, h: number, colour: number) => void

/** Pixels to a tile as drawn, and how many the world has to one. */
export const TILE_PX = 16
export const WORLD_TILE = 8
/** Drawn pixels to a world unit: what a picture is scaled down by. */
export const ART_SCALE = TILE_PX / WORLD_TILE

export interface ForestPalette {
  /** Behind everything. */
  void: number
  /** The three layers of forest, far to near. */
  far: number
  farLit: number
  mid: number
  midLit: number
  near: number
  /** Stone: a block's face, its joints, its lit edge, and the mass inside. */
  stone: number
  stoneDark: number
  stoneLight: number
  deep: number
  deepLine: number
  /** The cap of moss and grass on anything open to the sky. */
  moss: number
  mossLight: number
  mossDark: number
  /** What the darkness is made of: not black. */
  gloom: number
}

export type Biome = 'forest' | 'marsh' | 'canopy' | 'hollow'

/**
 * One palette to a kind of place. The order within each is the rule
 * `forest_test.ts` holds: the forest behind is darker than any stone, and
 * moss is the brightest thing that is not a light.
 */
export const BIOMES: Record<Biome, ForestPalette> = {
  forest: {
    void: 0x050c08, far: 0x0b1a10, farLit: 0x102418, mid: 0x12301a, midLit: 0x1a4022, near: 0x07140c,
    stone: 0x3a5a44, stoneDark: 0x1c3024, stoneLight: 0x587a58, deep: 0x15261c, deepLine: 0x0d1a12,
    moss: 0x6fa83c, mossLight: 0xb4dc5c, mossDark: 0x3c6a2a, gloom: 0x04100a,
  },
  marsh: {
    void: 0x060b0a, far: 0x0c1a18, farLit: 0x12261f, mid: 0x15302a, midLit: 0x1d4034, near: 0x08130f,
    stone: 0x3c5650, stoneDark: 0x1c2e2a, stoneLight: 0x5a786a, deep: 0x14241f, deepLine: 0x0c1815,
    moss: 0x7a9c3c, mossLight: 0xb8cc5a, mossDark: 0x44602a, gloom: 0x04100d,
  },
  canopy: {
    void: 0x070b06, far: 0x101a0c, farLit: 0x182612, mid: 0x1c3014, midLit: 0x28421a, near: 0x0b1408,
    stone: 0x4a5a38, stoneDark: 0x26301c, stoneLight: 0x6c7c4c, deep: 0x1c2616, deepLine: 0x11190d,
    moss: 0x86b03a, mossLight: 0xc8e060, mossDark: 0x4a7028, gloom: 0x060f06,
  },
  hollow: {
    void: 0x04080a, far: 0x091418, farLit: 0x0e1e22, mid: 0x102a2c, midLit: 0x163838, near: 0x060f11,
    stone: 0x345054, stoneDark: 0x182a2e, stoneLight: 0x4e6e6c, deep: 0x112024, deepLine: 0x0a1518,
    moss: 0x5a9a54, mossLight: 0x9cd070, mossDark: 0x30603a, gloom: 0x030c0e,
  },
}

/** Which kind of place each stage is. */
export const STAGE_BIOME: Record<string, Biome> = {
  level1: 'forest',
  grove: 'forest',
  level2: 'marsh',
  bridge: 'marsh',
  climb: 'canopy',
  level3: 'canopy',
  level4: 'hollow',
}

export const biomeFor = (stage: string): Biome => STAGE_BIOME[stage] ?? 'forest'

/** A repeatable scatter: the same place is always the same number, 0 to 99. */
export const hash = (x: number, y: number, salt = 0): number => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) % 100
}

// --- stone -------------------------------------------------------------------

/** Which of a tile's four neighbours are solid. */
export const SIDE = { up: 1, right: 2, down: 4, left: 8 } as const
/** Two drawings of every piece, so a long floor is not one block repeated. */
export const VARIANTS = 2
export const FRAME_COUNT = 16 * VARIANTS

/** The frame for a tile with these neighbours. */
export const frameFor = (mask: number, variant: number): number => (mask & 15) + 16 * (variant % VARIANTS)

/** The neighbours of a cell, as a mask, from a test of what is solid. */
export function neighbourMask(solid: (x: number, y: number) => boolean, x: number, y: number): number {
  return (
    (solid(x, y - 1) ? SIDE.up : 0) |
    (solid(x + 1, y) ? SIDE.right : 0) |
    (solid(x, y + 1) ? SIDE.down : 0) |
    (solid(x - 1, y) ? SIDE.left : 0)
  )
}

/**
 * One piece of ground, sixteen pixels square, at (`ox`, 0).
 *
 * Stone blocks where a side is open, and a darker mass with faint joints
 * where every side is covered: the inside of a cliff is not what the eye
 * should go to. A side open to the sky gets a cap of moss with grass standing
 * on it and moss running down the face; an open underside gets a dark lip,
 * and an open flank a shaded edge.
 */
export function drawTile(p: Painter, pal: ForestPalette, ox: number, mask: number, variant: number) {
  const T = TILE_PX
  const up = !!(mask & SIDE.up)
  const right = !!(mask & SIDE.right)
  const down = !!(mask & SIDE.down)
  const left = !!(mask & SIDE.left)
  const px = (x: number, y: number, w: number, h: number, c: number) => p(ox + x, y, w, h, c)
  const buried = up && right && down && left

  if (buried) {
    px(0, 0, T, T, pal.deep)
    // Joints only, a tone under the mass: there, and not looked at.
    px(0, 7, T, 1, pal.deepLine)
    px(0, 15, T, 1, pal.deepLine)
    px(variant ? 9 : 5, 0, 1, 7, pal.deepLine)
    px(variant ? 3 : 12, 8, 1, 7, pal.deepLine)
    return
  }

  // Two courses of blocks, their joints staggered.
  px(0, 0, T, T, pal.stone)
  px(0, 7, T, 1, pal.stoneDark)
  px(0, 15, T, 1, pal.stoneDark)
  const jointA = variant ? 10 : 6
  const jointB = variant ? 3 : 13
  px(jointA, 0, 1, 7, pal.stoneDark)
  px(jointB, 8, 1, 7, pal.stoneDark)
  // Lit from above: the top edge of each block, and a chip or two.
  px(0, 0, jointA, 1, pal.stoneLight)
  px(jointA + 1, 0, T - jointA - 1, 1, pal.stoneLight)
  px(0, 8, jointB, 1, pal.stoneLight)
  px(jointB + 1, 8, T - jointB - 1, 1, pal.stoneLight)
  px(variant ? 3 : 9, 3, 2, 1, pal.stoneDark)
  px(variant ? 12 : 4, 11, 2, 1, pal.stoneDark)
  px(variant ? 6 : 14, 12, 1, 1, pal.stoneLight)

  // Covered above: this course is in the shade of the one over it.
  if (up) px(0, 0, T, 1, pal.stoneDark)

  if (!left) {
    px(0, 0, 1, T, pal.stoneDark)
    px(1, 1, 1, 6, pal.stoneLight)
    px(1, 9, 1, 6, pal.stoneLight)
  }
  if (!right) {
    px(T - 1, 0, 1, T, pal.stoneDark)
    px(T - 2, 1, 1, T - 2, pal.stoneDark)
  }
  if (!down) {
    // A dark lip, and the underside in shadow.
    px(0, T - 3, T, 3, pal.stoneDark)
    px(0, T - 1, T, 1, pal.deepLine)
    for (let x = 1; x < T; x += 3) if (hash(x, variant, 3) < 60) px(x, T - 4, 1, 1, pal.stoneDark)
  }

  if (!up) {
    // The cap: moss over the top of the stone, brightest along its edge.
    px(0, 0, T, 4, pal.moss)
    px(0, 0, T, 1, pal.mossLight)
    px(0, 3, T, 1, pal.mossDark)
    // It runs down the face in tongues of different lengths.
    for (let x = 0; x < T; x++) {
      const n = hash(x, variant, 7)
      const drip = n < 22 ? 4 : n < 48 ? 2 : n < 70 ? 1 : 0
      if (drip) {
        px(x, 4, 1, drip, pal.moss)
        px(x, 4 + drip, 1, 1, pal.mossDark)
      }
    }
    // Flecks of light in the moss, so the cap is not a band.
    for (let x = 1; x < T; x += 2) if (hash(x, variant, 11) < 35) px(x, 1 + (hash(x, variant, 13) % 2), 1, 1, pal.mossLight)
    // Moss rounds an open corner: it does not stop square at the edge.
    if (!left) px(0, 0, 1, 7, pal.moss)
    if (!right) px(T - 1, 0, 1, 6, pal.mossDark)
  }
}

/** Every piece, in a strip: `FRAME_COUNT` tiles wide and one high. */
export function drawTileset(p: Painter, pal: ForestPalette) {
  for (let variant = 0; variant < VARIANTS; variant++) {
    for (let mask = 0; mask < 16; mask++) drawTile(p, pal, frameFor(mask, variant) * TILE_PX, mask, variant)
  }
}

// --- the forest behind -------------------------------------------------------

/** A backdrop layer is this many pixels square, and repeats both ways. */
export const BACKDROP_PX = 256

export type Layer = 'far' | 'mid' | 'near'

/**
 * How much of the camera's movement each layer follows. The far trunks barely
 * move and the near leaves almost keep up, which is what makes the distance
 * between them.
 */
export const PARALLAX: Record<Layer, number> = { far: 0.2, mid: 0.45, near: 0.75 }

/**
 * One layer of forest, `BACKDROP_PX` square.
 *
 * Every rectangle is wrapped at the edges, so the picture can be repeated in
 * both directions with no seam: a climb is many screens tall, and the forest
 * goes all the way up it.
 *
 * - **far**: broad trunks, the full height, a little lighter down one side.
 * - **mid**: thinner trunks, with vines hanging between them and clumps of
 *   leaves.
 * - **near**: leaves and vines in silhouette, darker than everything behind.
 *   It is the dark shapes in front that make the rest read as lit.
 */
export function drawBackdrop(p: Painter, pal: ForestPalette, layer: Layer, biome: Biome) {
  const S = BACKDROP_PX
  const wrap: Painter = (x, y, w, h, c) => {
    const x0 = ((x % S) + S) % S
    const y0 = ((y % S) + S) % S
    const w1 = Math.min(w, S - x0)
    const h1 = Math.min(h, S - y0)
    p(x0, y0, w1, h1, c)
    if (w1 < w) p(0, y0, w - w1, h1, c)
    if (h1 < h) p(x0, 0, w1, h - h1, c)
    if (w1 < w && h1 < h) p(0, 0, w - w1, h - h1, c)
  }
  const blob = (cx: number, cy: number, r: number, c: number) => {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy))
      wrap(cx - half, cy + dy, half * 2 + 1, 1, c)
    }
  }
  const salt = { forest: 1, marsh: 2, canopy: 3, hollow: 4 }[biome]

  if (layer === 'far') {
    // Trunks, the full height of the picture, so they join at the seam.
    let x = 6
    for (let i = 0; x < S - 24; i++) {
      const w = 12 + (hash(i, 0, salt) % 12)
      wrap(x, 0, w, S, pal.far)
      wrap(x + 2, 0, 2, S, pal.farLit)
      // Bark: short strokes down the trunk.
      for (let y = 0; y < S; y += 9) if (hash(i, y, salt) < 55) wrap(x + 5 + (hash(i, y, salt + 1) % (w - 7)), y, 1, 5, pal.farLit)
      x += w + 22 + (hash(i, 1, salt) % 30)
    }
    return
  }

  if (layer === 'mid') {
    let x = 20
    for (let i = 0; x < S - 12; i++) {
      const w = 5 + (hash(i, 2, salt) % 5)
      wrap(x, 0, w, S, pal.mid)
      wrap(x + 1, 0, 1, S, pal.midLit)
      // A branch stub now and then.
      for (let y = 20; y < S; y += 46) if (hash(i, y, salt + 2) < 50) wrap(x + w, y + (hash(i, y, salt) % 20), 6, 2, pal.mid)
      x += w + 34 + (hash(i, 3, salt) % 44)
    }
    // Clumps of leaves, in rows down the picture.
    const clumps = biome === 'hollow' ? 5 : biome === 'canopy' ? 16 : 10
    for (let i = 0; i < clumps; i++) {
      const cx = hash(i, 5, salt) * 2.56
      const cy = hash(i, 6, salt) * 2.56
      const r = 7 + (hash(i, 7, salt) % 8)
      blob(Math.round(cx), Math.round(cy), r, pal.mid)
      blob(Math.round(cx) - 2, Math.round(cy) - 3, Math.max(2, r - 5), pal.midLit)
    }
    // Vines: a line down, with a leaf either side now and then.
    for (let i = 0; i < 9; i++) {
      const vx = Math.round(hash(i, 8, salt) * 2.56)
      const top = Math.round(hash(i, 9, salt) * 2.56)
      const len = 30 + (hash(i, 10, salt) % 70)
      wrap(vx, top, 1, len, pal.midLit)
      for (let y = 6; y < len; y += 11) wrap(vx + (hash(i, y, salt) < 50 ? 1 : -2), top + y, 2, 1, pal.midLit)
    }
    return
  }

  // Near: silhouettes. Big leaves in from the edges, and heavy vines.
  const leaves = biome === 'hollow' ? 4 : 7
  for (let i = 0; i < leaves; i++) {
    const cx = Math.round(hash(i, 12, salt) * 2.56)
    const cy = Math.round(hash(i, 13, salt) * 2.56)
    const r = 12 + (hash(i, 14, salt) % 12)
    blob(cx, cy, r, pal.near)
    blob(cx + r - 4, cy + 5, Math.round(r * 0.6), pal.near)
    blob(cx - r + 3, cy + 7, Math.round(r * 0.5), pal.near)
  }
  for (let i = 0; i < 5; i++) {
    const vx = Math.round(hash(i, 15, salt) * 2.56)
    const top = Math.round(hash(i, 16, salt) * 2.56)
    const len = 60 + (hash(i, 17, salt) % 90)
    wrap(vx, top, 2, len, pal.near)
    for (let y = 8; y < len; y += 14) wrap(vx + (hash(i, y, salt + 3) < 50 ? 2 : -3), top + y, 3, 2, pal.near)
  }
}

// --- light -------------------------------------------------------------------

/**
 * How dark the unlit forest is, 0 to 1.
 *
 * It was 0.76 to 0.82 of black, which left the level as outlines. The
 * darkness is the game's idea and it stays, but as dimness: at these a
 * platform three screens away can be made out, and a lit lantern is still
 * the brightest thing by a long way. The order between stages is the one
 * they had: the grove lightest, the hollow darkest.
 */
export const GLOOM_ALPHA: Record<string, number> = {
  grove: 0.5,
  level1: 0.54,
  climb: 0.56,
  level2: 0.58,
  level3: 0.58,
  bridge: 0.6,
  level4: 0.62,
}

/**
 * A light's edge, as rings: how far out each reaches, and how much of the
 * darkness it lifts. One hard circle was a hole cut in black; three steps
 * are a pool of light with a soft edge, in whole pixels.
 */
export const LIGHT_RINGS: { reach: number; lift: number }[] = [
  { reach: 1, lift: 0.35 },
  { reach: 0.82, lift: 0.5 },
  { reach: 0.62, lift: 1 },
]

/** The warm colour a lit lantern throws, and how strongly, at its middle. */
export const WARM_GLOW = { colour: 0xffc860, alpha: 0.3, keeperAlpha: 0.2 } as const

/**
 * The glow's picture: `size` pixels square, as rows of strengths 0 to 1.
 * Stepped, not smooth, and dithered between steps, as the card's is.
 */
export function glowRows(size: number): number[][] {
  const c = (size - 1) / 2
  const rows: number[][] = []
  for (let y = 0; y < size; y++) {
    const row: number[] = []
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c) / (size / 2)
      let a = d < 0.35 ? 1 : d < 0.6 ? 0.6 : d < 0.82 ? 0.3 : d < 1 ? 0.12 : 0
      // A checker at each step's outer edge: half the pixels a step down.
      const edge = [0.35, 0.6, 0.82, 1].some((e) => d < e && d > e - 0.07)
      if (edge && (x + y) % 2) a = a >= 1 ? 0.6 : a >= 0.6 ? 0.3 : a >= 0.3 ? 0.12 : 0
      row.push(a)
    }
    rows.push(row)
  }
  return rows
}

/** How bright a colour is, 0 to 1, as the eye weighs it. */
export const luminance = (c: number): number =>
  (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255
