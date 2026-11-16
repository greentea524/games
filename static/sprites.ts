// The kid, the townsfolk, the static and the things you pick up (#179).
//
// The hub card shows a child in a blue cap with a backpack, townsfolk who are
// plainly different people, and the game's namesake as a jagged patch of
// black-and-white noise with sparks. The game had one small body for everyone,
// told apart by shirt colour, and a dark swirl that read as a tornado.
//
// Every sprite here is a picture in letters, one a pixel, looked up in `INK`,
// with one dark pixel added round the silhouette — as Pocket Dungeon's and
// Cart & Crate's are (#157, #162). The people are not typed out by hand: they
// are *built*, from a description of each one, so that all six can face four
// ways without twenty-four drawings that have to agree with each other.
//
// No Phaser in this file, so `sprites_test.ts` can check every picture.

export const SPRITE_PX = 24

export type Mode = 'gbc' | 'dmg'
export type Facing = 'down' | 'up' | 'left' | 'right'

/** The green screen's four tones, lightest to darkest. */
export const DMG_TONES = { L: 0x9bbc0f, l: 0x8bac0f, d: 0x306230, D: 0x0f380f } as const
type Tone = keyof typeof DMG_TONES

/** Every letter a picture may use: its colour, and its green-screen tone. */
export const INK: Record<string, [number, Tone]> = {
  K: [0x1a1410, 'D'], // near-black: eyes, boots
  S: [0xf6cfa0, 'L'], // skin
  s: [0xd9a878, 'l'], // skin in shadow
  h: [0x3a2618, 'D'], // dark hair
  y: [0xe8a828, 'd'], // golden hair
  g: [0xa4abb4, 'l'], // grey hair, a beard
  R: [0xe03838, 'd'], // red
  r: [0x9c2020, 'D'], // dark red
  U: [0x3a6ad0, 'd'], // blue
  u: [0x7fa8f0, 'l'], // light blue
  N: [0x24346c, 'D'], // navy
  V: [0xb858a8, 'd'], // violet
  v: [0x7a3470, 'D'], // dark violet
  G: [0x487050, 'd'], // forest green
  e: [0x2c4a34, 'D'], // dark green
  W: [0xf4f4ec, 'L'], // white
  w: [0xc4c8cc, 'l'], // off-white
  B: [0x6b4a2b, 'D'], // brown
  b: [0xa87a42, 'd'], // tan
  Y: [0xf8d038, 'L'], // brass, a glow
  M: [0x505860, 'd'], // metal
  m: [0x2c3038, 'D'], // dark metal
  C: [0xaaf0ff, 'L'], // the static's bright edge
  c: [0x5a9cc0, 'l'], // the static's glow
  X: [0xe8ecf4, 'L'], // noise, light
  x: [0x10141c, 'D'], // noise, dark
  n: [0x6a7488, 'd'], // noise, mid
  T: [0xf2e6c4, 'L'], // paper
  P: [0xd83848, 'd'], // a petal
}

/** The outline's colour in each mode. */
export const OUTLINE: Record<Mode, number> = { gbc: 0x14100c, dmg: DMG_TONES.D }

// --- people ------------------------------------------------------------------

export interface Person {
  /** Hair: its ink, and how it is worn. */
  hair: string
  style: 'short' | 'long' | 'bald'
  /** What is on their head, if anything. */
  hat?: { kind: 'cap' | 'flat' | 'toque'; ink: string; trim: string }
  beard?: string
  /** The top they wear, and its shaded edge. */
  top: string
  topDark: string
  /** Trousers, or a dress that covers the legs. */
  legs: string
  dress?: boolean
  apron?: string
  /** A pack on the back, and its straps. */
  pack?: { ink: string; strap: string }
  /** Broad in the shoulder. */
  stocky?: boolean
}

/** A blank picture to draw into. */
const blank = (): string[][] => Array.from({ length: SPRITE_PX }, () => Array<string>(SPRITE_PX).fill('.'))
const rect = (g: string[][], x: number, y: number, w: number, h: number, ch: string) => {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (j >= 0 && j < SPRITE_PX && i >= 0 && i < SPRITE_PX) g[j][i] = ch
    }
  }
}

/**
 * One person, facing one way, standing or mid-step.
 *
 * The same skeleton for everyone: a head ten pixels wide, a body under it,
 * two legs. What differs is what the description says — a cap, long hair, a
 * beard, an apron, a pack, broad shoulders — which is what lets someone be
 * told from someone else by their outline.
 */
export function person(who: Person, facing: Exclude<Facing, 'right'>, step = 0): string[] {
  const g = blank()
  const bw = who.stocky ? 12 : 10
  const bx = 12 - bw / 2
  const side = facing === 'left'

  // --- legs and feet, drawn first so the body overlaps them
  if (who.dress) {
    rect(g, bx - 1, 17, bw + 2, 4, who.top)
    rect(g, bx - 1, 20, bw + 2, 1, who.topDark)
    rect(g, 9, 21, 2, 1, 'S')
    rect(g, 13, 21, 2, 1, 'S')
    rect(g, 8 + (side ? -1 : 0), 22, 3, 1, 'K')
    rect(g, 13 + (side ? -1 : 0), 22, 3, 1, 'K')
  } else if (side) {
    // Seen from the side: together when standing, apart mid-stride.
    const spread = step ? 3 : 0
    rect(g, 9 - spread, 17, 3, 5, who.legs)
    rect(g, 12 + spread, 17, 3, 5 - step, who.legs)
    rect(g, 8 - spread, 22, 4, 1, 'K')
    rect(g, 11 + spread, 22 - step, 4, 1, 'K')
  } else {
    // Seen from the front or back: one foot lifted mid-step.
    rect(g, 8, 17, 3, 5 - step, who.legs)
    rect(g, 13, 17, 3, 5, who.legs)
    rect(g, 8, 22 - step, 3, 1, 'K')
    rect(g, 13, 22, 3, 1, 'K')
  }

  // --- body and arms
  if (side) {
    rect(g, bx + 1, 11, bw - 2, 7, who.top)
    rect(g, bx + bw - 3, 11, 2, 7, who.topDark)
    // The near arm, swung forward mid-step.
    rect(g, 10 - step, 12, 3, 5, who.topDark)
    rect(g, 10 - step, 16, 3, 2, 'S')
    if (who.pack) {
      rect(g, bx + bw - 2, 11, 4, 6, who.pack.ink)
      rect(g, bx + bw - 2, 14, 4, 1, who.pack.strap)
    }
    // An apron hangs to the shin, over the legs.
    if (who.apron) rect(g, bx + 1, 12, 3, 9, who.apron)
  } else {
    rect(g, bx, 11, bw, 7, who.top)
    rect(g, bx - 1, 12, 1, 4, who.top)
    rect(g, bx + bw, 12, 1, 4, who.top)
    rect(g, bx - 1, 16, 1, 2, 'S')
    rect(g, bx + bw, 16, 1, 2, 'S')
    rect(g, bx, 17, bw, 1, who.topDark)
    if (facing === 'down') {
      if (who.apron) rect(g, 9, 12, 6, 9, who.apron)
      if (who.pack) {
        // Seen from the front, a pack is its two straps.
        rect(g, bx + 1, 11, 1, 5, who.pack.strap)
        rect(g, bx + bw - 2, 11, 1, 5, who.pack.strap)
      }
    } else if (who.pack) {
      rect(g, bx + 1, 11, bw - 2, 6, who.pack.ink)
      rect(g, bx + 1, 14, bw - 2, 1, who.pack.strap)
      rect(g, 11, 15, 2, 1, who.pack.strap)
    }
  }

  // --- head
  rect(g, 7, 3, 10, 8, 'S')
  const hair = who.style === 'bald' ? 's' : who.hair
  if (facing === 'down') {
    rect(g, 7, 3, 10, 3, hair)
    rect(g, 9, 7, 1, 2, 'K')
    rect(g, 14, 7, 1, 2, 'K')
    rect(g, 7, 10, 10, 1, 's')
    if (who.beard) {
      rect(g, 8, 9, 8, 3, who.beard)
      rect(g, 11, 9, 2, 1, 's')
    }
  } else if (facing === 'up') {
    rect(g, 7, 3, 10, 7, hair)
    rect(g, 8, 10, 8, 1, 's')
  } else {
    // Facing left: the face is the front half, the hair the back.
    rect(g, 7, 3, 10, 3, hair)
    rect(g, 12, 3, 5, 7, hair)
    rect(g, 6, 7, 1, 2, 'S')
    rect(g, 8, 7, 1, 2, 'K')
    rect(g, 7, 10, 10, 1, 's')
    if (who.beard) rect(g, 7, 9, 5, 3, who.beard)
  }
  if (who.style === 'long') {
    // To the shoulders, down both sides — or right across, from behind.
    if (facing === 'up') rect(g, 6, 4, 12, 9, who.hair)
    else if (side) rect(g, 13, 4, 5, 9, who.hair)
    else {
      rect(g, 6, 4, 1, 9, who.hair)
      rect(g, 17, 4, 1, 9, who.hair)
    }
  }

  // --- hat
  const hat = who.hat
  if (hat?.kind === 'cap') {
    rect(g, 7, 1, 10, 4, hat.ink)
    rect(g, 8, 1, 8, 1, hat.trim)
    // The peak: across the brow from the front, out past the nose from the
    // side, and not seen at all from behind.
    if (facing === 'down') rect(g, 6, 5, 12, 1, hat.trim)
    else if (side) rect(g, 3, 5, 9, 1, hat.trim)
  } else if (hat?.kind === 'flat') {
    rect(g, 6, 2, 12, 3, hat.ink)
    rect(g, 7, 1, 10, 1, hat.ink)
    rect(g, 6, 4, 12, 1, hat.trim)
    if (side) rect(g, 4, 4, 3, 1, hat.trim)
  } else if (hat?.kind === 'toque') {
    // A baker's hat: a tall puff over a band.
    rect(g, 5, 1, 14, 3, hat.ink)
    rect(g, 7, 4, 10, 1, hat.trim)
  }

  return g.map((row) => row.join(''))
}

export const PEOPLE: Record<string, Person> = {
  // The card's child: a blue cap and a backpack, in the red shirt the game
  // has always given them.
  kid: {
    hair: 'h', style: 'short', hat: { kind: 'cap', ink: 'U', trim: 'N' },
    top: 'R', topDark: 'r', legs: 'N', pack: { ink: 'b', strap: 'B' },
  },
  mom: { hair: 'h', style: 'long', top: 'V', topDark: 'v', legs: 'V', dress: true },
  ren: { hair: 'y', style: 'short', top: 'u', topDark: 'U', legs: 'N' },
  gus: {
    hair: 'g', style: 'short', hat: { kind: 'flat', ink: 'G', trim: 'e' }, beard: 'g',
    top: 'G', topDark: 'e', legs: 'B', stocky: true,
  },
  baker: {
    hair: 'g', style: 'short', hat: { kind: 'toque', ink: 'W', trim: 'w' },
    top: 'w', topDark: 'M', legs: 'B', apron: 'W', stocky: true,
  },
}

// --- the static --------------------------------------------------------------

/** A repeatable scatter: the same pixel of the same frame is always the same. */
const noise = (x: number, y: number, frame: number): number => {
  let h = (x * 374761393 + y * 668265263 + frame * 2147483647) >>> 0
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) % 100
}

/** The tear's ragged outline, row by row: where it starts and how wide it is. */
const TEAR: [number, number][] = [
  [9, 5], [7, 9], [5, 13], [6, 12], [4, 15], [3, 17], [5, 14], [4, 16], [2, 19], [3, 18],
  [5, 15], [4, 16], [6, 13], [5, 14], [3, 17], [4, 15], [6, 12], [7, 10], [9, 7], [10, 4],
]

/**
 * A corruption patch: a jagged tear full of crackling noise, with a bright
 * edge. `sealed` is the normal town's, dense and solid; open is the Static
 * side's, the same tear with the noise thinned to sparks, so it reads as a way
 * through. `frame` is which of two scatters of noise: the game swaps between
 * them, which is the crackle.
 */
export function tear(sealed: boolean, frame: number): string[] {
  const g = blank()
  const inside = (x: number, i: number) => {
    const row = TEAR[i]
    return row !== undefined && x >= row[0] && x < row[0] + row[1]
  }
  TEAR.forEach(([x0, w], i) => {
    const y = 2 + i
    for (let x = x0; x < x0 + w; x++) {
      // The edge is every cell with open air beside it, which makes it an
      // unbroken ring: `pixels` outlines from the outside in, and a gap in
      // the ring would let the outline in round every spark.
      const edge = !inside(x - 1, i) || !inside(x + 1, i) || !inside(x, i - 1) || !inside(x, i + 1)
      const n = noise(x, y, frame)
      if (edge) g[y][x] = n < 70 ? 'C' : 'c'
      else if (sealed) g[y][x] = n < 42 ? 'x' : n < 80 ? 'X' : 'n'
      // Open: mostly clear, with sparks drifting in it.
      else if (n < 9) g[y][x] = 'X'
      else if (n < 14) g[y][x] = 'c'
    }
  })
  // Sparks thrown off the edge.
  for (const [x, y] of frame ? [[2, 4], [21, 9], [4, 20], [19, 21]] : [[3, 6], [22, 12], [2, 17], [20, 3]]) g[y][x] = 'C'
  return g.map((row) => row.join(''))
}

/** The television: a wooden set whose screen is the same noise. */
export function television(frame: number): string[] {
  const g = blank()
  rect(g, 2, 5, 20, 15, 'B')
  rect(g, 3, 6, 18, 13, 'b')
  rect(g, 4, 7, 13, 11, 'x')
  for (let y = 8; y < 17; y++) {
    for (let x = 5; x < 16; x++) {
      const n = noise(x, y, frame)
      g[y][x] = n < 40 ? 'x' : n < 78 ? 'X' : 'c'
    }
  }
  // Two dials, the aerial, and the feet.
  rect(g, 18, 8, 2, 2, 'Y')
  rect(g, 18, 12, 2, 2, 'M')
  rect(g, 18, 16, 2, 1, 'm')
  rect(g, 8, 2, 1, 3, 'M')
  rect(g, 7, 1, 1, 1, 'M')
  rect(g, 14, 3, 1, 2, 'M')
  rect(g, 15, 1, 1, 2, 'M')
  rect(g, 4, 20, 3, 2, 'B')
  rect(g, 17, 20, 3, 2, 'B')
  return g.map((row) => row.join(''))
}

// --- things ------------------------------------------------------------------

const FLASHLIGHT = (lit: boolean): string[] => [
  '', '', '', '', '', '',
  '..............mmmm',
  '.............mMMMMm',
  '...mmmmmmmmmmmM' + (lit ? 'YYY' : 'mmm') + 'Mm',
  '..mMMMMMMMMMMMM' + (lit ? 'YWY' : 'mmm') + 'Mm',
  '..mMMmMMMMMMMMM' + (lit ? 'YWY' : 'mmm') + 'Mm',
  '..mMMMMMMMMMMMM' + (lit ? 'YYY' : 'mmm') + 'Mm',
  '...mmmmmmmmmmmM' + (lit ? 'YYY' : 'mmm') + 'Mm',
  '.............mMMMMm',
  '..............mmmm',
]

const FLOWER = (fresh: boolean): string[] =>
  fresh
    ? [
        '', '', '',
        '.........PPP.PPP',
        '........PPPPPPPPP',
        '........PPPYYYPPP',
        '.........PPYYYPP',
        '........PPPYYYPPP',
        '........PPPPPPPPP',
        '.........PPP.PPP',
        '...........GG',
        '...........GG',
        '......GG...GG',
        '.......GGG.GG',
        '.........GGGG',
        '...........GG..GGG',
        '...........GGGGG',
        '...........GG',
        '...........GG',
        '...........GG',
      ]
    : [
        // Wilted: the head hung over, the leaves gone dark.
        '', '', '', '', '', '',
        '...........eee',
        '..........e...e',
        '.........e.....rr',
        '.........e....rrrr',
        '.........e....rrBr',
        '..........e....rr',
        '..........e',
        '......ee..e',
        '.......eeee',
        '..........e..ee',
        '..........eeee',
        '..........e',
        '..........e',
        '..........e',
      ]

const PHOTO = (intact: boolean): string[] => [
  '', '', '',
  '....BBBBBBBBBBBBBBBB',
  '....BTTTTTTTTTTTTTTB',
  '....BTuuuuuuuuuuuuTB',
  '....BTuuuuuuuuuuuuTB',
  intact ? '....BTuuhhuuuuhhuuTB' : '....BTuuhhuuuuKKuuTB',
  intact ? '....BTuuSSuuuuSSuuTB' : '....BTuuSSuuuKuKuuTB',
  intact ? '....BTuuSSuuuuSSuuTB' : '....BTuuSSuuuuKKuuTB',
  intact ? '....BTuRRRRuuVVVVuTB' : '....BTuRRRRuuKuKKuTB',
  intact ? '....BTuRRRRuuVVVVuTB' : '....BTuRRRRuuuKKuuTB',
  intact ? '....BTGGGGGGGGGGGGTB' : '....BTGGGGGGGKGGGGTB',
  '....BTGGGGGGGGGGGGTB',
  '....BTTTTTTTTTTTTTTB',
  '....BBBBBBBBBBBBBBBB',
]

// The ledger: a page of entries. Redacted, two of them are struck through in
// red, a bar thicker than any line of writing.
const LEDGER = (whole: boolean): string[] => [
  '', '', '',
  '.....BBBBBBBBBBBBBB',
  '.....BbbbbbbbbbbbbB',
  '.....BbTTTTTTTTTTbB',
  '.....BbTKKKKKKKKTbB',
  '.....BbTTTTTTTTTTbB',
  whole ? '.....BbTKKKKKKKKTbB' : '.....BbTRRRRRRRRTbB',
  whole ? '.....BbTTTTTTTTTTbB' : '.....BbTRRRRRRRRTbB',
  '.....BbTKKKKKKTTTbB',
  '.....BbTTTTTTTTTTbB',
  whole ? '.....BbTKKKKKKKKTbB' : '.....BbTRRRRRRRRTbB',
  '.....BbTTTTTTTTTTbB',
  '.....BbbbbbbbbbbbbB',
  '.....BBBBBBBBBBBBBB',
]

const KEY = [
  '', '', '', '', '',
  '....YYYY',
  '...YYYYYY',
  '..YY....YY',
  '..YY....YYYYYYYYYYYY',
  '..YY....YYYYYYYYYYYY',
  '..YY....YY.....YY.YY',
  '...YYYYYY......YY.YY',
  '....YYYY',
]

const SHARD = [
  '', '',
  '...........C',
  '..........CCC',
  '..........CXC',
  '.........CCXCC',
  '.........CXXXC',
  '........CCXcXCC',
  '........CXXcXXC',
  '.......CCXccXXCC',
  '.......CXXcxcXXC',
  '........CXcxcXC',
  '........CCXcXCC',
  '.........CXcXC',
  '.........CCXCC',
  '..........CXC',
  '..........CCC',
  '...........C',
]

// The entity: a dark figure with a screen of static for a face. Taller than a
// tile, as it always was.
export const ENTITY_ROWS = 27
const ENTITY = (frame: number): string[] => {
  const g = Array.from({ length: ENTITY_ROWS }, () => Array<string>(SPRITE_PX).fill('.'))
  const put = (x: number, y: number, w: number, h: number, ch: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = ch
  }
  put(7, 2, 10, 9, 'm')
  put(8, 3, 8, 7, 'x')
  for (let y = 3; y < 10; y++) {
    for (let x = 8; x < 16; x++) {
      const n = noise(x, y, frame)
      g[y][x] = n < 45 ? 'x' : n < 80 ? 'X' : 'c'
    }
  }
  put(5, 11, 14, 11, 'm')
  put(3, 12, 2, 8, 'm')
  put(19, 12, 2, 8, 'm')
  put(7, 13, 10, 1, 'n')
  put(6, 22, 5, 3, 'm')
  put(13, 22, 5, 3, 'm')
  return g.map((row) => row.join(''))
}

const BEACON: string[] = (() => {
  const g = Array.from({ length: ENTITY_ROWS }, () => Array<string>(SPRITE_PX).fill('.'))
  const put = (x: number, y: number, w: number, h: number, ch: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = ch
  }
  // A pale pillar on a dark foot, brightest at its core.
  put(9, 2, 6, 20, 'c')
  put(10, 1, 4, 22, 'C')
  put(11, 3, 2, 18, 'W')
  put(6, 22, 12, 3, 'm')
  put(7, 21, 10, 1, 'n')
  return g.map((row) => row.join(''))
})()

// --- every sprite ------------------------------------------------------------

const flip = (rows: string[]): string[] => rows.map((row) => [...row.padEnd(SPRITE_PX, '.')].reverse().join(''))

function buildAll(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  // The kid walks: two frames each way. The townsfolk stand.
  for (const step of [0, 1]) {
    out[`kid_down_${step}`] = person(PEOPLE.kid, 'down', step)
    out[`kid_up_${step}`] = person(PEOPLE.kid, 'up', step)
    out[`kid_left_${step}`] = person(PEOPLE.kid, 'left', step)
    out[`kid_right_${step}`] = flip(out[`kid_left_${step}`])
  }
  for (const id of ['mom', 'ren', 'gus', 'baker']) {
    out[`npc_${id}_down`] = person(PEOPLE[id], 'down')
    out[`npc_${id}_up`] = person(PEOPLE[id], 'up')
    out[`npc_${id}_left`] = person(PEOPLE[id], 'left')
    out[`npc_${id}_right`] = flip(out[`npc_${id}_left`])
  }
  for (const frame of [0, 1]) {
    const suffix = frame ? '_b' : ''
    out[`corruption_sealed${suffix}`] = tear(true, frame)
    out[`corruption_open${suffix}`] = tear(false, frame)
    out[`tv${suffix}`] = television(frame)
    out[`entity${suffix}`] = ENTITY(frame)
  }
  out.beacon = BEACON
  out.item_flashlight = FLASHLIGHT(true)
  out.item_flashlight_dead = FLASHLIGHT(false)
  out.item_flower = FLOWER(false)
  out.item_flower_fresh = FLOWER(true)
  out.item_photo = PHOTO(false)
  out.item_photo_intact = PHOTO(true)
  out.item_ledger = LEDGER(false)
  out.item_ledger_unredacted = LEDGER(true)
  out.item_ren_key = KEY
  out.item_signal_shard = SHARD
  return out
}

export const SPRITES: Record<string, string[]> = buildAll()

/**
 * Where a sprite's texture key puts the palette, matching what the game has
 * always asked for: `kid_gbc_down_0`, `npc_dmg_mom_left`, `item_gbc_photo`,
 * and `corruption_sealed_dmg` with the palette last.
 */
export function textureKey(name: string, mode: Mode): string {
  const lead = name.match(/^(kid|npc|item)_(.+)$/)
  if (lead) return `${lead[1]}_${mode}_${lead[2]}`
  const second = name.match(/^(.+)_b$/)
  if (second) return `${second[1]}_${mode}_b`
  return `${name}_${mode}`
}

/**
 * Green-screen tones that differ from an ink's usual one, per sprite.
 *
 * The static is black and white noise with a bright edge. On the green screen
 * the grass is the lightest tone, so a bright edge is an edge nobody sees:
 * there the edge is the darkest tone and the noise inside is what is pale.
 */
const DMG_SWAP: Record<string, Record<string, Tone>> = {
  corruption_sealed: { C: 'D', c: 'D', X: 'L', x: 'D', n: 'd' },
  corruption_open: { C: 'D', c: 'D', X: 'd' },
  item_signal_shard: { C: 'D', X: 'L', c: 'd', x: 'D' },
  beacon: { C: 'd', c: 'D', W: 'L' },
  // A brass key is the lightest tone, which on grass is an outline round
  // nothing (#106).
  item_ren_key: { Y: 'd' },
}

/** How long a noise frame lasts, in milliseconds. Slower under reduced motion. */
export const crackleMs = (reducedMotion: boolean): number => (reducedMotion ? 640 : 110)

/**
 * A sprite as colours: rows of `SPRITE_PX` values, null for clear, with the
 * outline added one pixel round the silhouette wherever there is room.
 */
export function pixels(name: string, mode: Mode): (number | null)[][] {
  const rows = SPRITES[name]
  if (!rows) throw new Error(`no sprite called ${name}`)
  const N = SPRITE_PX
  const H = Math.max(N, rows.length)
  const swap = DMG_SWAP[name.replace(/_b$/, '')]
  const grid: (number | null)[][] = []
  for (let y = 0; y < H; y++) {
    const row = (rows[y] ?? '').padEnd(N, '.')
    grid.push(
      [...row].slice(0, N).map((ch) => {
        if (ch === '.') return null
        const ink = INK[ch]
        if (!ink) throw new Error(`${name} uses "${ch}", which is not an ink`)
        return mode === 'gbc' ? ink[0] : DMG_TONES[swap?.[ch] ?? ink[1]]
      }),
    )
  }
  // Only the outside is outlined. A clear pixel enclosed by the picture, such
  // as the ground seen through an open tear, is left clear: outlining those
  // put a dark cross round every spark and filled the tear in.
  const outside = grid.map((row) => row.map(() => false))
  const queue: [number, number][] = []
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= N || y >= H || outside[y][x] || grid[y][x] !== null) return
    outside[y][x] = true
    queue.push([x, y])
  }
  for (let x = 0; x < N; x++) { visit(x, 0); visit(x, H - 1) }
  for (let y = 0; y < H; y++) { visit(0, y); visit(N - 1, y) }
  while (queue.length) {
    const [x, y] = queue.pop()!
    visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1)
  }
  const out = grid.map((row) => [...row])
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < N; x++) {
      if (!outside[y][x]) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy]?.[x + dx] ?? null) !== null)
      if (near) out[y][x] = OUTLINE[mode]
    }
  }
  return out
}
