// The keeper, the lanterns and the things in the forest (#173).
//
// The hub card shows a hooded figure in a cloak with a pack, holding a
// glowing lantern out in front; lanterns of iron and glass; a wooden DANGER
// sign, ferns and hanging moss. The game had a pale block six pixels tall
// and an orange square.
//
// Every sprite is a picture in letters, one a pixel, looked up in `INK`, with
// one dark pixel added round the silhouette, as the other games' are (#157,
// #162, #179). They are drawn at the screen's resolution, two pixels to a
// world unit, and shown at half size under the camera's zoom (#172).
//
// No Phaser in this file, so `sprites_test.ts` can check every picture.
import { ART_SCALE, type Painter } from './forest'

/** Every letter a picture may use, and its colour. */
export const INK: Record<string, number> = {
  h: 0x9a6a36, // the hood and cloak
  H: 0xc89250, // where the lantern lights them
  d: 0x5a3a1c, // their shaded side
  f: 0x24160c, // the face, in the hood's shadow
  s: 0xe8c090, // skin
  e: 0xfff2c0, // an eye, catching the light
  p: 0x74843e, // the pack
  P: 0x44522a, // its shaded side
  b: 0x2c2018, // boots
  Y: 0xffcc66, // lantern light
  W: 0xfff6d0, // its core
  O: 0xe8882c, // flame, oil
  m: 0x9aa89a, // iron
  M: 0x4a5a50, // iron in shadow
  g: 0x1c2c24, // unlit glass
  q: 0x35483c, // a dead wick, a glint on dark glass
  G: 0x6fa83c, // leaf
  L: 0xb4dc5c, // leaf in the light
  D: 0x3c6a2a, // leaf in shadow
  w: 0xa8763c, // wood
  x: 0x6a4622, // wood in shadow
  t: 0xd0a060, // wood in the light
  k: 0x1a120a, // paint on a sign
  r: 0xd85a3a, // a mushroom's cap
  R: 0x9a3422, // its shaded side
  c: 0xf0e8c8, // its stem, its spots
  C: 0xb8ae8c, // the stem in shadow
  v: 0x7a5aa8, // cork, stopper
}

/** The outline's colour: darker than the forest's own dark. */
export const OUTLINE = 0x020403

// --- the keeper --------------------------------------------------------------

/** The keeper's picture: sixteen pixels wide and twenty tall. */
export const KEEPER_W = 16
export const KEEPER_H = 20

/**
 * The keeper's hitbox, in the picture's own pixels: twelve square, at its
 * foot, in the middle. That is six world units square, which is what the
 * keeper has always been (#173): the figure is drawn taller and wider than
 * the box, and the box is what stands on a ledge and fits a gap.
 */
export const KEEPER_BODY = { width: 12, height: 12, offsetX: 2, offsetY: KEEPER_H - 12 } as const

// Hood, face, pack, and the arm out in front with the lantern on it: the
// same in every pose. Facing right; the game flips it.
const KEEPER_TOP = [
  '',
  '.....hhhh',
  '....hHHHhh',
  '...hHHhhhhh',
  '..dhhhfffsh',
  '..dhhffsesh',
  '.pdhhhhfssh',
  '.pPdhhhhhh...m',
  '.pPdhhHhhsss.m',
  '.pPdhhHhhd.sMMM',
  '.pPdhhHhhd..YWY',
  '.pPdhhhhhd..YWY',
  '.pPdhhhhhd..MMM',
  '..ddhhhhhd',
  '...dhhhhhd',
]
const LEGS = {
  idle: ['...dhhhhhd', '...ddhhhdd', '....dd.dd', '....bb.bb', '...bbb.bbb'],
  walk1: ['...dhhhhhd', '...ddhhhdd', '...dd...dd', '..bb.....bb', '.bbb.....bbb'],
  walk2: ['...dhhhhhd', '...ddhhhdd', '....ddddd', '.....bbb', '....bbbb'],
}
// On a wall: knees up, and the free hand flat against the stone.
const KEEPER_CLING = [
  '',
  '.....hhhh',
  '....hHHHhh',
  '...hHHhhhhh',
  '..dhhhfffshss',
  '..dhhffseshss',
  '.pdhhhhfsshh',
  '.pPdhhhhhhh',
  '.pPdhhHhhhd..m',
  '.pPdhhHhhsss.m',
  '.pPdhhHhhd.sMMM',
  '.pPdhhhhhd..YWY',
  '.pPdhhhhhd..YWY',
  '..ddhhhhhd..MMM',
  '...dhhhhhdd',
  '...dhhhhddbb',
  '...ddhhddbbb',
  '....ddd',
  '....bb',
  '...bbb',
]

// --- lanterns and what is picked up ------------------------------------------

// Iron and glass, with a ring to hang by. The two are one shape: what tells
// them apart is that one is dark and one is the brightest thing on screen.
const lantern = (lit: boolean): string[] => {
  const glass = lit
    ? ['.MYYYYYYYYM', '.MYYWWWWYYM', '.MYWWWWWWYM', '.MYWWWWWWYM', '.MYYWWWWYYM', '.MOYYYYYYOM']
    : ['.MggggggggM', '.MgqgggggqM', '.MggggqgggM', '.MgggqqgggM', '.MggggggggM', '.MggggggggM']
  return ['', '....mmmm', '...m....m', '...m....m', '..MMMMMMMM', '.MmmmmmmmmM', ...glass, '.MmmmmmmmmM', '..MMMMMMMM', '....MMMM']
}

// A flask of oil. Not lantern-shaped on purpose (#70): a lantern is a place
// and a flask is a pickup, and outline is what separates them at a glance.
const FLASK = [
  '',
  '....vv',
  '....vv',
  '....mm',
  '....mm',
  '...mmmm',
  '..mOOOOm',
  '.mOOYOOOm',
  '.mOYOOOOm',
  '.mOOOOOOm',
  '..mOOOOm',
  '...mmmm',
]

// --- the forest floor --------------------------------------------------------

const GRASS = [
  '',
  '...L......L',
  '...G..L...G..L',
  '.L.G..G.L.G..G',
  '.G.GL.G.G.GL.G',
  '.G.GG.G.G.GG.G',
  '.GDGGDGDGDGGDGD',
  '.DDDDDDDDDDDDDD',
]
const FERN = [
  '',
  '.......L',
  '..L....G....L',
  '..GL...G...LG',
  '...GL..G..LG',
  '.L..GL.G.LG..L',
  '.GL..GLGLG..LG',
  '..GL..GGG..LG',
  '...GGL.G.LGG',
  '.....GGGGG',
  '......DGD',
  '......DDD',
]
const SHROOM = ['', '..rrrrr', '.rrcrrrR', '.rrrrcrR', '.RRRRRRR', '...cC', '...cC', '...cC']
// A length of vine: a stem with a leaf either side. Two hang end to end.
const VINE = [
  '..D', '..G', '..GL', '..GGL', '..G', '..D', '..G', 'LLG', '.LG', '..G', '..D', '..G', '..GL', '..GGL', '..G', '..D',
]
// The mushroom that throws the keeper: a broad cap, far bigger than the ones
// that only grow there.
const BOUNCY = [
  '',
  '........rrrrrrr',
  '.....rrrrrrrrrrrrr',
  '...rrrrccrrrrrrrrrrr',
  '..rrrrrccrrrrrcccrrrr',
  '.rrrrrrrrrrrrrcccrrrrR',
  '.rrccrrrrrrrrrrrrrrrRR',
  '.rrccrrrrrcrrrrrrrRRRR',
  '.RRRRRRRRRRRRRRRRRRRRR',
  '..RRRRRRRRRRRRRRRRRRR',
  '.........ccccC',
  '.........ccccC',
  '.........ccccC',
  '........cccccCC',
  '........cccccCC',
  '.......ccccccCCC',
]
// A plank of a bridge that gives way. Repeated along the bridge's length.
const PLANK = [
  'tttttttttttttttx',
  'wwwwwwwwwwwwwwwx',
  'wwwxwwwwwwwwxwwx',
  'wwwwwwwwxwwwwwwx',
  'wwwwwwwwwwwwwwwx',
  'xxxxxxxxxxxxxxxx',
  '..x..........x',
  '..x..........x',
]
const ARROW = [
  '',
  '..OO',
  '..OYOO',
  '..OYYYOO',
  '..OYWWYYOO',
  '..OYWWWWYYOO',
  '..OYWWWWWWYYO',
  '..OYWWWWWWYYO',
  '..OYWWWWYYOO',
  '..OYWWYYOO',
  '..OYYYOO',
  '..OYOO',
  '..OO',
]

// --- the sign ----------------------------------------------------------------

/** Letters three pixels wide and five tall: enough for one word on a board. */
const FONT: Record<string, string[]> = {
  D: ['kk.', 'k.k', 'k.k', 'k.k', 'kk.'],
  A: ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'],
  N: ['k.k', 'kkk', 'kkk', 'k.k', 'k.k'],
  G: ['.kk', 'k..', 'k.k', 'k.k', '.kk'],
  E: ['kkk', 'k..', 'kk.', 'k..', 'kkk'],
  R: ['kk.', 'k.k', 'kk.', 'k.k', 'k.k'],
}

export const SIGN_W = 28
export const SIGN_H = 24

/**
 * The sign: a board with a word on it, on a post. The card's says DANGER and
 * so does this one. It was an exclamation mark, "the only mark legible at
 * 8px"; at twice the pixels a word fits.
 */
export function sign(word: string): string[] {
  const g = Array.from({ length: SIGN_H }, () => Array<string>(SIGN_W).fill('.'))
  const put = (x: number, y: number, w: number, h: number, ch: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = ch
  }
  // The post, then the board over it.
  put(12, 11, 4, 13, 'w')
  put(15, 11, 1, 13, 'x')
  put(1, 1, 26, 11, 'w')
  put(1, 1, 26, 1, 't')
  put(1, 11, 26, 1, 'x')
  put(26, 1, 1, 11, 'x')
  // A nail at each end.
  put(2, 3, 1, 1, 'x')
  put(25, 3, 1, 1, 'x')
  const width = word.length * 4 - 1
  let x = Math.floor((SIGN_W - width) / 2)
  for (const letter of word) {
    FONT[letter]?.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'k') g[4 + j][x + i] = 'k' }))
    x += 4
  }
  return g.map((row) => row.join(''))
}

// --- every sprite ------------------------------------------------------------

export const SPRITES: Record<string, string[]> = {
  player_idle: [...KEEPER_TOP, ...LEGS.idle],
  player_walk1: [...KEEPER_TOP, ...LEGS.walk1],
  player_walk2: [...KEEPER_TOP, ...LEGS.walk2],
  player_cling: KEEPER_CLING,
  lanternUnlit: lantern(false),
  lanternLit: lantern(true),
  oil_flask: FLASK,
  deco_grass: GRASS,
  deco_fern: FERN,
  deco_shroom: SHROOM,
  deco_vine: VINE,
  bouncy_shroom: BOUNCY,
  crumble_plank: PLANK,
  guidance_arrow: ARROW,
  signpost: sign('DANGER'),
}

/** The size each picture is drawn at, in pixels. Twice its size in the world. */
export const SIZE: Record<string, [number, number]> = {
  player_idle: [KEEPER_W, KEEPER_H],
  player_walk1: [KEEPER_W, KEEPER_H],
  player_walk2: [KEEPER_W, KEEPER_H],
  player_cling: [KEEPER_W, KEEPER_H],
  lanternUnlit: [12, 16],
  lanternLit: [12, 16],
  oil_flask: [10, 14],
  deco_grass: [16, 8],
  deco_fern: [16, 12],
  deco_shroom: [10, 8],
  deco_vine: [6, 16],
  bouncy_shroom: [24, 16],
  crumble_plank: [16, 8],
  guidance_arrow: [16, 14],
  signpost: [SIGN_W, SIGN_H],
}

/** A picture's size in the world: half what it is drawn at. */
export const worldSize = (name: string): [number, number] => [SIZE[name][0] / ART_SCALE, SIZE[name][1] / ART_SCALE]

/**
 * Pictures that repeat edge to edge, or that are a length of something, get
 * no outline: a plank's would be a dark line between every pair of planks,
 * and a vine's would break where two lengths join.
 */
const BARE = new Set(['crumble_plank', 'deco_vine'])

/**
 * A sprite as colours: rows of values, null for clear, with the outline
 * added one pixel round the outside of the silhouette wherever there is room.
 */
export function pixels(name: string): (number | null)[][] {
  const rows = SPRITES[name]
  if (!rows) throw new Error(`no sprite called ${name}`)
  const [W, H] = SIZE[name]
  const grid: (number | null)[][] = []
  for (let y = 0; y < H; y++) {
    const row = (rows[y] ?? '').padEnd(W, '.')
    grid.push(
      [...row].slice(0, W).map((ch) => {
        if (ch === '.') return null
        const ink = INK[ch]
        if (ink === undefined) throw new Error(`${name} uses "${ch}", which is not an ink`)
        return ink
      }),
    )
  }
  if (BARE.has(name)) return grid
  // From the outside in only: a lantern's ring is open, and outlining the
  // inside of it would fill it (#179).
  const outside = grid.map((row) => row.map(() => false))
  const queue: [number, number][] = []
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || outside[y][x] || grid[y][x] !== null) return
    outside[y][x] = true
    queue.push([x, y])
  }
  for (let x = 0; x < W; x++) { visit(x, 0); visit(x, H - 1) }
  for (let y = 0; y < H; y++) { visit(0, y); visit(W - 1, y) }
  while (queue.length) {
    const [x, y] = queue.pop()!
    visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1)
  }
  const out = grid.map((row) => [...row])
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!outside[y][x]) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy]?.[x + dx] ?? null) !== null)
      if (near) out[y][x] = OUTLINE
    }
  }
  return out
}

// --- the Heart Tree ----------------------------------------------------------

export const HEART_TREE_PX = 128

/**
 * The Heart Tree, the last thing lit: a trunk with roots, under a crown the
 * shape of a heart. Too large to type; drawn through a painter, at the size
 * and shape it always was, with bark, and leaves where there was one colour.
 */
export function drawHeartTree(p: Painter) {
  const disc = (cx: number, cy: number, r: number, colour: number) => {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy))
      p(cx - half, cy + dy, half * 2 + 1, 1, colour)
    }
  }
  // The crown is a heart: two lobes and a point. Drawn once larger in the
  // outline's colour, then in leaf.
  const heart = (grow: number, colour: number, dx = 0, dy = 0) => {
    disc(40 + dx, 40 + dy, 32 + grow, colour)
    disc(88 + dx, 40 + dy, 32 + grow, colour)
    for (let y = 0; y <= 52 + grow; y++) {
      const half = Math.round((56 + grow) * (1 - y / (52 + grow)))
      p(64 - half + dx, 40 + y + dy, half * 2, 1, colour)
    }
  }
  // Trunk and roots first, so the crown sits over the top of the trunk.
  p(54, 60, 20, 68, OUTLINE)
  p(56, 60, 16, 68, INK.x)
  p(58, 60, 6, 68, INK.w)
  p(60, 70, 2, 40, INK.t)
  for (let y = 66; y < 126; y += 9) p(66, y, 3, 4, INK.d)
  p(44, 120, 40, 8, OUTLINE)
  p(46, 122, 36, 6, INK.x)
  p(50, 122, 12, 3, INK.w)

  heart(2, OUTLINE)
  heart(0, INK.O)
  heart(-5, INK.Y, -1, -2)
  // Leaves of light, where it glows.
  for (const [x, y, r] of [[36, 28, 7], [92, 28, 7], [64, 56, 6], [48, 44, 4], [80, 44, 4], [30, 46, 3], [98, 46, 3], [64, 30, 4]]) {
    disc(x, y, r, INK.W)
  }
  // And shade under each lobe, so it is a crown and not a badge.
  for (const [x, y, r] of [[40, 62, 5], [88, 62, 5], [64, 80, 4]]) disc(x, y, r, INK.O)
}
