// Pocket Dungeon's hero, monsters and props, drawn at 24 pixels (#157).
//
// Each sprite is a picture in text: one character a pixel, looked up in
// `INK`. That is deliberate. The old sprites were a few dozen `fillRect`
// calls each, which nobody can read as a drawing, and a mistake in one is
// invisible until it is on screen. A grid of letters can be reviewed.
//
// Three conventions keep the pictures short:
//
//   - A row may stop early; the rest is empty.
//   - `mirror` takes the left half of a symmetrical sprite.
//   - No sprite draws its own outline. `outline` adds one dark pixel round
//     the silhouette, which is what lets a pale thing — a skeleton, a potion's
//     shine — sit on the pale floor of the green-screen mode. CLAUDE.md's
//     rule is "outline it, do not retone it", and here it is automatic.
//
// No Phaser in this file, so `sprites_test.ts` can check every picture.

export const SPRITE_PX = 24

export type Mode = 'gbc' | 'dmg'
/** The green screen's four tones, lightest to darkest. */
export const DMG_TONES = { L: 0x9bbc0f, l: 0x8bac0f, d: 0x306230, D: 0x0f380f } as const
type Tone = keyof typeof DMG_TONES

/** Every letter a picture may use: its colour, and its green-screen tone. */
export const INK: Record<string, [number, Tone]> = {
  K: [0x1a1410, 'D'], // near-black
  W: [0xf4f4ec, 'L'], // white
  w: [0xb8c0c8, 'l'], // light grey
  g: [0x7a8490, 'd'], // grey
  S: [0xf0c8a0, 'L'], // skin
  B: [0x5a3a20, 'D'], // dark brown
  b: [0x96602e, 'd'], // brown
  n: [0xc89858, 'l'], // tan
  R: [0xc02c38, 'd'], // red
  r: [0x7c1c28, 'D'], // dark red
  O: [0xf08a20, 'l'], // orange
  Y: [0xf0c838, 'L'], // yellow
  y: [0xb88820, 'd'], // dark gold
  U: [0x2f58b8, 'd'], // blue
  u: [0x6f9af0, 'l'], // light blue
  N: [0x1a2a5a, 'D'], // navy
  G: [0x4a9a3a, 'd'], // green
  e: [0x8ad060, 'l'], // light green
  E: [0x24582a, 'D'], // dark green
  P: [0x7a3ca8, 'd'], // purple
  p: [0xb07ae0, 'l'], // light purple
  M: [0x3a1a5a, 'D'], // dark purple
  C: [0x58c8e0, 'l'], // cyan
  T: [0xe8e0c8, 'L'], // bone
  t: [0xa8a088, 'd'], // bone in shadow
  X: [0xff3030, 'L'], // a glowing eye
}

/** The outline's colour in each mode. */
export const OUTLINE: Record<Mode, number> = { gbc: 0x14100c, dmg: DMG_TONES.D }

/** The left half of a symmetrical picture, reflected to make the whole. */
function mirror(half: string[]): string[] {
  const w = SPRITE_PX / 2
  return half.map((row) => {
    const left = row.padEnd(w, '.').slice(0, w)
    return left + [...left].reverse().join('')
  })
}

/** A picture flipped left to right. */
function flip(rows: string[]): string[] {
  return rows.map((row) => [...row.padEnd(SPRITE_PX, '.')].reverse().join(''))
}

const HERO_DOWN = [
  '',
  '..........RR',
  '.........RRRR',
  '........uUUUUUU',
  '.......uUUUUUUUU',
  '.......UUUUUUUUU',
  '.......UNNNNNNNU',
  '.......UNSSNSSNU',
  '.......UUNNNNNUU',
  '........UUUUUUU',
  '......uuUUUUUUUuu..W',
  '.....uUUUUUUUUUUUu.W',
  '....RRYUUUuuUUUUUU.W',
  '...RRRRYUUUUUUUUUS.W',
  '...RYYRYUUUUUUUUUS.W',
  '...RRRRYBBBYYBBBB.yYy',
  '...RRRRYUUUUUUUU...y',
  '....RRY.UUU..UUU',
  '........UUU..UUU',
  '........NNN..NNN',
  '........BBB..BBB',
  '.......BBBB..BBBB',
]

const HERO_UP = [
  '',
  '..........RR',
  '.........RRRR',
  '........uUUUUUU',
  '.......uUUUUUUUU',
  '.......UUUUUUUUU',
  '.......UUUUUUUUU',
  '.......UUUNNNUUU',
  '.......UUUUUUUUU',
  '........UUUUUUU',
  '..W...rRRRRRRRRRr',
  '..W..uRRRRRRRRRRRu',
  '..W..URRRRRRRRRRRU',
  '..W..SRRRRRRRRRRRS',
  '..W...RRRRRRRRRRR',
  '.yYy..rRRRRRRRRRr',
  '..y...rRRRRRRRRRr',
  '.......rRRRRRRRr',
  '........UUU..UUU',
  '........NNN..NNN',
  '........BBB..BBB',
  '.......BBBB..BBBB',
]

const HERO_LEFT = [
  '',
  '...........RR',
  '..........RRRR',
  '........uUUUUUU',
  '.......uUUUUUUUU',
  '.......UUUUUUUUU',
  '.......NNNNNUUUU',
  '.......NSSNNUUUU',
  '.......UNNNUUUUU',
  '........UUUUUUU',
  '.......uUUUUUUUrr',
  '..W...RRRRUUUUUrRr',
  '..W..RRYYRRUUUUrRR',
  '..W..RYRRYRUUUUrRR',
  '..WS.RYRRYRUUUUrRR',
  '.yYy.RRYYRRBBBBrRR',
  '..y...RRRRUUUUUrRr',
  '.......UUUUUUUU.r',
  '........UUU.UUU',
  '........NNN.NNN',
  '........BBB.BBB',
  '.......BBBB.BBBB',
]

const RAT = [
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '....b.b',
  '...bSbSb.........S',
  '...bbbbbbbbb.....S',
  '..bbbXbbbbbbbbb..S',
  '.SbbbbbnnbbbbbbbbS',
  '..Kbbbnnnnnbbbbbb',
  '...bbbnnnnnnbbbbb',
  '....bbbnnnnnbbbb',
  '....bb.bb..bb.bb',
  '....SS.SS..SS.SS',
]

const BAT = mirror([
  '',
  '',
  '',
  '',
  '',
  '',
  '.........M.M',
  '..M......MMM',
  '.MMM....MMMM',
  '.MPMM..MMPPP',
  'MMPPMMMMPPPP',
  'MPPPPMMPPXPP',
  'MPPPPPPPPPPP',
  'MPPMPPPPPPWP',
  'MPM.MPPPPPPP',
  'MM...MPPPPPP',
  'M.....MPPPPP',
  '.......MMPPP',
  '.........MMM',
])

const SPIDER = mirror([
  '',
  '',
  '',
  '',
  '',
  '..K',
  '.K.K....KKKK',
  'K...K..KMMMM',
  'K....KKMMMMM',
  '..KK..KMMPMM',
  '.K..KKKMMMMM',
  'K.....KMMMMM',
  '...KKKKMXMMX',
  '..K...KMMMMM',
  '.K.....KMMWM',
  'K...KKK.KKKK',
  '...K',
  '..K',
])

const SLIME = mirror([
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '........eeee',
  '......eeGGGG',
  '.....eGGGGGG',
  '....eGeeGGGG',
  '...eGeeGGGGG',
  '...GGGGGGGGG',
  '..eGGGGWKGGG',
  '..GGGGGWKGGG',
  '..GGGGGGGGGG',
  '.GGGGGGGGGEE',
  '.GGGGGGGGGGG',
  '.EGGGGGGGGGG',
  '..EEGGGGGGGG',
  '....EEEEEEEE',
])

const SKELETON = mirror([
  '',
  '',
  '.......TTTTT',
  '......TTTTTT',
  '......TTTTTT',
  '......TKKTTT',
  '......TKKTTT',
  '......TTTTKT',
  '.......TtTtT',
  '........TTTT',
  '..........tT',
  '....TT.TTTTT',
  '...TT..tTtTt',
  '...T...TTTTT',
  '...T...tTtTt',
  '...T....TTTT',
  '..TT......tT',
  '........TTTT',
  '........TT',
  '........TT',
  '........TT',
  '.......TTT',
])

const ARCHER = [
  '',
  '',
  '.......TTTTT.......b',
  '......TTTTTTT.....bw',
  '......TKKTKKT....b.w',
  '......TKKTKKT...b..w',
  '......TTTKTTT...b..w',
  '.......TtTtT...b...w',
  '........TTT....b...w',
  '....GGGGGtGGGG.b...w',
  '...GGGGGGGGGGGTb...w',
  '...GG.GGGGGGG.Tbwwww',
  '...T..GGGyGGG..b...w',
  '...T..GGGGGGG..b...w',
  '...T..BBBBBBB...b..w',
  '..TT...GGGGG....b..w',
  '.......TT.TT.....b.w',
  '.......TT.TT......bw',
  '.......TT.TT.......b',
  '.......TT.TT',
  '......TTT.TTT',
]

const BOSS = mirror([
  '',
  '..Y',
  '..YY....Y',
  '..YYY..YYYYY',
  '...YYYYYYYYY',
  '...yYYRYYYRY',
  '....PPPPPPPP',
  '...PPPPPPPPP',
  '...PPXXPPPPP',
  '...PPXXPPPPP',
  '...PPPPPPPKK',
  '....PPPKTKTK',
  '..MMMPPPPPPP',
  '.MMMMMMPPPPP',
  'MMMPMMMMPPYP',
  'MMPPMMMMPPPP',
  'MMPPMMMMPPPP',
  'MM.PMMMMPPPP',
  'M...MMMMPPPP',
  '....MMMMMPPP',
  '....MMMMMMMM',
  '....MMM.MMMM',
])

const BRUTE = mirror([
  '',
  '..T......T',
  '..TT....TT',
  '...TTbbbbbbb',
  '....bbbbbbbb',
  '...bbbbbbbbb',
  '...bbXXbbbbb',
  '...bbbbbbbbK',
  '....bbbTbbTb',
  '..bbbbbbbbbb',
  '.bbbbbbbnnnn',
  'bbbbbbbnnnnn',
  'bbbbbbbnnnnn',
  'bbbBbbbbnnnn',
  'bbb.bbbbbbbb',
  'bbb.BBBBBBBB',
  '.SS.bbbbbbbb',
  '.SS.bbbbbbbb',
  '....bbbb.bbb',
  '....bbbb.bbb',
  '....BBBB.BBB',
  '...BBBBB.BBB',
])

const CHOIR = mirror([
  '',
  '',
  '......NNNNNN',
  '.....NNNNNNN',
  '....NNNNNNNN',
  '....NNKKKKKK',
  '...NNKKXKKKK',
  '...NNKKKKKKK',
  '...NNNKKKKWW',
  '...NNNNKKKKK',
  '..NNNNNNNNNN',
  '..NNUNNNNNNY',
  '.NNNUNNNNNNY',
  '.NNUUNNNNNNN',
  '.NNUNNNNNNNN',
  '.SNUNNNNNNNN',
  '.S.UNNNNNNNN',
  '...NNNNNNNNN',
  '...NNNNNNNNN',
  '..NNNNNNNNNN',
  '..NUNNUNNUNN',
  '..N.NN.NN.NN',
])

const COBWEB = [
  'wwwwwwwwwwwwwwwwwwww',
  'ww...w....w....w..w',
  'w.w...w....w...w.w',
  'w..w...w...w..ww',
  'w...ww..w..w.w',
  'ww....w..wwww',
  'w.w....wwww',
  'w..ww.ww.w',
  'w....ww..w',
  'w...w.w.w',
  'ww.w..ww',
  'w.w..ww',
  'w.w.w',
  'w..ww',
  'w.w',
  'www',
  'w',
  'w',
  'w',
  'w',
]

/** A chest: `lid` and `band` change with its tier, `open` with its state. */
function chest(body: string, band: string, open: boolean, lock: string): string[] {
  const rows = open
    ? [
        '', '', '', '',
        '....BBBBBBBB',
        '...BbbbbbbbB',
        '...BbKKKKKKK',
        '...BbKKKKKKK',
        '...BBBBBBBBB',
        '...yYYYYYYYY',
        '...BKKKKKKKK',
        '...BKKYKKYKK',
        '...BBBBBBBBB',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BBBBBBBBB',
      ]
    : [
        '', '', '', '', '', '',
        '....BBBBBBBB',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BBBBBBBBB',
        '...yYYYYYYYL',
        '...BBBBBBBBL',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BbbbbbbbY',
        '...BBBBBBBBB',
      ]
  // One pass, not three: a golden chest's body is the letter its band was.
  const swap: Record<string, string> = { b: body, Y: band, L: lock }
  return mirror(rows).map((row) => [...row].map((ch) => swap[ch] ?? ch).join(''))
}

const WEAPON = [
  '', '', '',
  '.................WW',
  '................WWW',
  '...............WWw',
  '..............WWw',
  '.............WWw',
  '............WWw',
  '...........WWw',
  '..........WWw',
  '.........WWw',
  '....y...WWw',
  '....yy.WWw',
  '.....yyWw',
  '......yyy',
  '.....BByyy',
  '....BB..yy',
  '...yB',
  '...yy',
]

const ARMOR = mirror([
  '', '', '', '',
  '...ggg..gggg',
  '..gwwwggwwww',
  '..gwwwwwwwww',
  '..gwwwwwwwww',
  '...gwwwwwwww',
  '....gwwwwwwY',
  '....gwwwwwwY',
  '....gwwwwwww',
  '....gwwwwwww',
  '....gwwwwwww',
  '.....gwwwwww',
  '.....gwwwwww',
  '......gwwwww',
  '.......ggwww',
  '.........ggg',
])

const ACCESSORY = mirror([
  '', '', '', '',
  '..........CC',
  '.........CCC',
  '.........uCC',
  '........YYYY',
  '.......YYyyY',
  '......YYy',
  '.....YYy',
  '.....YY',
  '.....YY',
  '.....YY',
  '.....YYy',
  '......YYy',
  '.......YYyyY',
  '........YYYY',
])

const FOOD = [
  '', '', '', '', '',
  '.............TT',
  '............TTTT',
  '.......bbbb.TTT',
  '.....bbnnnbbTT',
  '....bnnnnnnbT',
  '...bnnnnnnnnb',
  '...bnnnnnnnnb',
  '...bnnnnnnnbb',
  '...bbnnnnnbb',
  '....bbbnbbb',
  '..TTT.bbb',
  '.TTTT',
  '..TT',
]

const POTION = mirror([
  '', '', '', '',
  '.........bbb',
  '.........bbb',
  '........wwww',
  '.........www',
  '.........wRR',
  '........wRRR',
  '.......wRRRR',
  '......wRWRRR',
  '......wRWRRR',
  '......wRRRRR',
  '......wRRRRR',
  '......wRRRRR',
  '.......wRRRR',
  '........wwww',
])

const SCROLL = [
  '', '', '', '', '',
  '....yyyyyyyyyyyyyy',
  '...yTTTTTTTTTTTTTTy',
  '...yTTTTTTTTTTTTTTy',
  '....TTKKKKKTKKKKT',
  '....TTTTTTTTTTTTT',
  '....TTKKKTKKKKKKT',
  '....TTTTTTTTTTTTT',
  '....TTKKKKKKTKKKT',
  '....TTTTTTTTTTTTT',
  '....TTKKKKTTTTTTT',
  '...yTTTTTTTTTTTTTTy',
  '...yTTTTTTTTTTTTTTy',
  '....yyyyyyyyyyyyyy',
]

const KEY = [
  '', '', '', '', '', '',
  '....YYYY',
  '...YYyyYY',
  '..YYy..yYY',
  '..YY....YYYYYYYYYYYY',
  '..YY....YYYYYYYYYYYY',
  '..YYy..yYY....YY.YY',
  '...YYyyYY.....YY.YY',
  '....YYYY',
]

const REWIND = mirror([
  '', '', '',
  '.....yyyyyyy',
  '.....yYYYYYY',
  '......wwwwww',
  '......wnnnnn',
  '.......wnnnn',
  '........wnnn',
  '.........wnn',
  '..........wn',
  '..........wn',
  '.........w.n',
  '........w..n',
  '.......w..nn',
  '......w.nnnn',
  '......wnnnnn',
  '.....yYYYYYY',
  '.....yyyyyyy',
])

const RELIC = mirror([
  '', '', '',
  '..........CC',
  '.........CCC',
  '........CCWC',
  '.......CCWCC',
  '......uCCCCC',
  '.....uuCCCCC',
  '.....uuuCCCC',
  '......uuuCCC',
  '.......uuuCC',
  '........uuuC',
  '.........uuu',
  '..........uu',
  '',
  '.......yyyyy',
  '......yYYYYY',
  '......yyyyyy',
])

const PORTAL = mirror([
  '',
  '.......ggggg',
  '.....ggwwwww',
  '....gwwPPPPP',
  '...gwPPPppPP',
  '..gwPPppCCpp',
  '..gwPpCCCCCC',
  '.gwPPpCCWWCC',
  '.gwPpCCWWWWW',
  '.gwPpCCWWWWW',
  '.gwPpCCWWWWW',
  '.gwPpCCWWWWW',
  '.gwPpCCWWWWW',
  '.gwPpCCWWWWW',
  '.gwPPpCCWWCC',
  '.gwPPpCCCCCC',
  '.gwPPPppCCpp',
  '.gwPPPPPppPP',
  '.gwPPPPPPPPP',
  '.ggggggggggg',
  '.ggwwggwwggw',
  '.ggggggggggg',
])

/** Every sprite, by the part of its texture key before the mode. */
export const SPRITES: Record<string, string[]> = {
  hero_down: HERO_DOWN,
  hero_up: HERO_UP,
  hero_left: HERO_LEFT,
  hero_right: flip(HERO_LEFT),
  rat: RAT,
  bat: BAT,
  archer: ARCHER,
  spider: SPIDER,
  slime: SLIME,
  skeleton: SKELETON,
  boss: BOSS,
  boss_brute: BRUTE,
  boss_choir: CHOIR,
  cobweb: COBWEB,
  item_weapon: WEAPON,
  item_armor: ARMOR,
  item_accessory: ACCESSORY,
  item_food: FOOD,
  item_potion: POTION,
  item_scroll: SCROLL,
  item_key: KEY,
  item_rewind: REWIND,
  chest_wooden_closed: chest('b', 'y', false, 'Y'),
  chest_wooden_open: chest('b', 'y', true, 'Y'),
  chest_golden_closed: chest('Y', 'W', false, 'R'),
  chest_golden_open: chest('Y', 'W', true, 'R'),
  chest_locked_closed: chest('g', 'w', false, 'K'),
  chest_locked_open: chest('g', 'w', true, 'K'),
  relic: RELIC,
  portal: PORTAL,
}

/** Where each sprite's texture key puts the mode: `hero_gbc_down`, `rat_gbc`. */
export function textureKey(name: string, mode: Mode): string {
  const hero = name.match(/^hero_(.+)$/)
  if (hero) return `hero_${mode}_${hero[1]}`
  return `${name}_${mode}`
}

/**
 * Green-screen tones that differ from an ink's usual one, per sprite.
 *
 * The outline keeps a pale sprite's edge on the pale floor, but a sprite that
 * is *all* pale inside is then only an outline — a skeleton drawn as a wire
 * figure. These give such a sprite a darker body there, keeping its lightest
 * tone for the details.
 */
const DMG_SWAP: Record<string, Record<string, Tone>> = {
  skeleton: { T: 'l', t: 'd' },
  archer: { T: 'l', t: 'd' },
  cobweb: { w: 'd' },
  item_weapon: { W: 'l', w: 'd' },
  item_armor: { w: 'd', g: 'D', Y: 'L' },
  item_accessory: { Y: 'd', y: 'D', C: 'L', u: 'l' },
  item_food: { n: 'd', b: 'D', T: 'l' },
  item_potion: { w: 'D', R: 'd', W: 'L' },
  item_scroll: { T: 'l', y: 'D' },
  item_key: { Y: 'd', y: 'D' },
  item_rewind: { Y: 'd', n: 'l', w: 'D' },
  chest_golden_closed: { Y: 'd', W: 'L', R: 'L' },
  chest_golden_open: { Y: 'd', W: 'L', R: 'L' },
  relic: { C: 'd', u: 'D', W: 'L', Y: 'd' },
  portal: { C: 'd', W: 'L', p: 'd', P: 'D', w: 'd', g: 'D' },
}

/** Sprites drawn without an outline: the web is a tracery, not a body. */
const BARE = new Set(['cobweb'])

/**
 * A sprite as colours: `SPRITE_PX` rows of `SPRITE_PX` values, null for clear.
 * The outline is added here, one pixel round the silhouette, wherever the
 * picture leaves room for it.
 */
export function pixels(name: string, mode: Mode): (number | null)[][] {
  const rows = SPRITES[name]
  if (!rows) throw new Error(`no sprite called ${name}`)
  const N = SPRITE_PX
  const grid: (number | null)[][] = []
  for (let y = 0; y < N; y++) {
    const row = (rows[y] ?? '').padEnd(N, '.')
    grid.push(
      [...row].slice(0, N).map((ch) => {
        if (ch === '.') return null
        const ink = INK[ch]
        if (!ink) throw new Error(`${name} uses "${ch}", which is not an ink`)
        return mode === 'gbc' ? ink[0] : DMG_TONES[DMG_SWAP[name]?.[ch] ?? ink[1]]
      }),
    )
  }
  if (BARE.has(name)) return grid
  const out = grid.map((row) => [...row])
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (grid[y][x] !== null) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy]?.[x + dx] ?? null) !== null)
      if (near) out[y][x] = OUTLINE[mode]
    }
  }
  return out
}
