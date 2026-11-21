// The fox and the crates, drawn at 24 pixels (#162).
//
// The hub card has a fox in a blue cap and uniform, with a tail, leaning into
// a slatted wooden crate. The game had a fox's head on a blue block, the same
// whichever way it moved, pushing an orange square.
//
// Each sprite is a picture in text, one character a pixel, looked up in `INK`
// — the way Pocket Dungeon's are since #157, and for the same reason: a grid
// of letters can be read as a drawing, and a list of rectangles cannot. No
// sprite draws its own outline; `pixels` adds one dark pixel round the
// silhouette, which is what keeps the fox's white muzzle on the pale floor of
// the green screen (#107 lost it there once).
//
// No Phaser in this file, so `sprites_test.ts` can check every picture.

export const SPRITE_PX = 24

export type Mode = 'gbc' | 'dmg'
export type Facing = 'down' | 'up' | 'left' | 'right'
/** Standing, mid-step, or leaning into a crate. */
export type Pose = 'idle' | 'step' | 'push'

/** The green screen's four tones, lightest to darkest. */
export const DMG_TONES = { L: 0x9bbc0f, l: 0x8bac0f, d: 0x306230, D: 0x0f380f } as const
type Tone = keyof typeof DMG_TONES

/** Every letter a picture may use: its colour, and its green-screen tone. */
export const INK: Record<string, [number, Tone]> = {
  K: [0x1a1410, 'D'], // near-black: eyes, nose
  W: [0xf8f4ea, 'L'], // white fur
  O: [0xe8702a, 'd'], // orange fur
  o: [0xb04c18, 'D'], // fur in shadow
  // The uniform is pale on the green screen. With it dark, as the trousers
  // and cap are, the fox was one dark shape from the neck down.
  U: [0x3a6ad0, 'l'], // uniform blue
  u: [0x6f9af0, 'L'], // uniform, lit
  N: [0x1f2f66, 'D'], // navy: cap, trousers
  Y: [0xf6cc3c, 'L'], // brass: badge, buttons
  B: [0x4a2c18, 'D'], // boots
  n: [0xd9a05a, 'l'], // pale wood: a crate's frame
  b: [0xa8682c, 'd'], // wood: slats
  d: [0x6a3c18, 'D'], // dark wood: the gaps between slats
  T: [0xf2e6c4, 'L'], // a label
  G: [0x3fae4a, 'd'], // green: a crate that is home
  g: [0x23702c, 'D'], // dark green
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

/** A picture with some rows replaced, counted from the top. */
function withRows(rows: string[], from: number, replacement: string[]): string[] {
  const out = [...rows]
  replacement.forEach((row, i) => { out[from + i] = row })
  return out
}

/** A picture with `text` written over it at one place. Dots leave what is there. */
function stamp(rows: string[], x: number, y: number, text: string[]): string[] {
  const out = rows.map((row) => [...row.padEnd(SPRITE_PX, '.')])
  text.forEach((line, j) => {
    ;[...line].forEach((ch, i) => { if (ch !== '.') out[y + j][x + i] = ch })
  })
  return out.map((row) => row.join(''))
}

// --- the fox -----------------------------------------------------------------

// Facing the player: cap with a brass badge, white muzzle, buttoned uniform.
// The tail shows at one side, which is the only thing not mirrored.
const FOX_DOWN_BODY = mirror([
  '',
  '.......NNNNN',
  '..OO..NNNNNN',
  '.OOOO.NNNNNN',
  '.OWOONUUUUUY',
  '.OWONNNNNNNN',
  '..OOOOOOOOOO',
  '..OOOOOOOOOO',
  '..OOOOKKOOOO',
  '..OWOOKKOOOO',
  '..WWWWOOOWWW',
  '...WWWWWWWKK',
  '....WWWWWWWW',
  '.....UUUUUUU',
  '....UuUUUUUY',
  '...OUuUUUUUU',
  '...OUUUUUUUY',
  '....UUUUUUUU',
  '....NNNNNNNN',
  '.....NNNNNNN',
  '......NNNN',
  '......NNNN',
  '......BBBB',
  '',
])
const TAIL_SIDE = ['..OO', '.OOO', 'OOOW', 'OOWW', '.WW']
const FOX_DOWN = stamp(FOX_DOWN_BODY, 19, 14, TAIL_SIDE)
// One boot lifted: the leg on the left is a row short.
const FOX_DOWN_STEP = withRows(FOX_DOWN, 20, [
  '......NNNN....NNNN',
  '......BBBB....NNNN',
  '..............BBBB',
])
// Leaning into a crate below: both paws out in front, at the bottom edge.
const FOX_DOWN_PUSH = stamp(
  withRows(FOX_DOWN, 15, [
    '....UuUUUUUUUUUUUUUU',
    '....UUUUUUUYYUUUUUUU',
  ]),
  3, 17, ['OO................OO', 'OO................OO', 'OO................OO'],
)

// From behind: the cap's crown, the back of the head, the tail hanging.
const FOX_UP_BODY = mirror([
  '',
  '.......NNNNN',
  '..OO..NNNNNN',
  '.OOOO.NNNNNN',
  '.OoOONNNNNNN',
  '.OoONNNNNNNN',
  '..OOOOOOOOOO',
  '..OOOOOOOOOO',
  '..OOOOOOOOOO',
  '..OOOOOOOOOO',
  '..OOOOOOOOOO',
  '...OOOOOOOOO',
  '....oooooooo',
  '.....UUUUUUU',
  '....UUUUUUUU',
  '...OUUUUUUUU',
  '...OUUUUUUUU',
  '....UUUUUUUU',
  '....NNNNNNNN',
  '.....NNNNNNN',
  '......NNNN',
  '......NNNN',
  '......BBBB',
  '',
])
const TAIL_BACK = ['.OO.', 'OOOO', 'OOOO', 'OOOO', 'OWWO', '.WW.']
const FOX_UP = stamp(FOX_UP_BODY, 10, 15, TAIL_BACK)
const FOX_UP_STEP = stamp(
  withRows(FOX_UP_BODY, 20, [
    '......NNNN....NNNN',
    '......BBBB....NNNN',
    '..............BBBB',
  ]),
  10, 15, TAIL_BACK,
)
// Leaning into a crate above: both paws up at the shoulders.
const FOX_UP_PUSH = stamp(FOX_UP, 1, 11, ['OO..................OO', 'OO..................OO', 'OOO................OOO'])

// Side on, facing left: the cap's peak and the muzzle lead, the tail trails.
const FOX_LEFT = [
  '',
  '.......NNNNNNN',
  '......NNNNNNNNN.OO',
  '......NUUUUUUNNOOO',
  '...NNNNNNNNNNNNOoO',
  '.....OOOOOOOOOOOO',
  '....OOOKOOOOOOOO',
  '..WWWWOKOOOOOOOO',
  '.KKWWWWWOOOOOOO',
  '..WWWWWWWOOOOOO',
  '....WWWWWWOOOO',
  '......UUUUUUUU',
  '.....UuUUUUUUUU.....OO',
  '.....UuOOUUUUUU...OOOO',
  '.....UUOOUUUUUU.OOOOOW',
  '.....UUUUUUUUUUOOOOWWW',
  '.....UUUYUUUUUUOOOWWW',
  '.....NNNNNNNNNN.OO',
  '.....NNNNNNNNNN',
  '......NNNN.NNNN',
  '......NNNN.NNNN',
  '......NNNN.NNNN',
  '.....BBBBB.BBBB',
  '',
]
// Mid-stride: the legs apart, one boot off the ground.
const FOX_LEFT_STEP = withRows(FOX_LEFT, 19, [
  '.....NNNN...NNNN',
  '....NNNN.....NNNN',
  '...BBBBB.....NNNN',
  '.............BBBB',
])
// Leaning into a crate: both arms straight out in front, legs braced behind.
const FOX_LEFT_PUSH = withRows(FOX_LEFT, 12, [
  '.OOOOuUUUUUUUUU.....OO',
  '.OOOOuUUUUUUUUU...OOOO',
  '.....UUUUUUUUUU.OOOOOW',
  '.....UUUUUUUUUUOOOOWWW',
  '.....UUUYUUUUUUOOOWWW',
  '.....NNNNNNNNNN.OO',
  '......NNNNNNNNNN',
  '.......NNNN.NNNNN',
  '........NNNN..NNNN',
  '.........NNNN..NNNN',
  '........BBBBB.BBBBB',
])

// --- the crates --------------------------------------------------------------

/**
 * A wooden crate: a pale frame, slats across, and a label.
 *
 * `home` is the crate on its target. It must not be mistaken for one that is
 * not, so it differs in three ways at once: a brass frame, green slats and a
 * tick on its label where the other has a C.
 */
function crate(home: boolean): string[] {
  const frame = home ? 'Y' : 'n'
  const slat = home ? 'G' : 'b'
  const gap = home ? 'g' : 'd'
  const rows: string[] = ['']
  for (let y = 1; y <= 22; y++) {
    let row = '.'
    for (let x = 1; x <= 22; x++) {
      const edge = Math.min(x - 1, y - 1, 22 - x, 22 - y)
      if (edge < 2) row += frame
      else if (edge === 2) row += gap
      // Slats five pixels deep with a one-pixel gap between them.
      else row += (y - 4) % 6 === 5 ? gap : slat
    }
    rows.push(row)
  }
  rows.push('')
  const label = home
    ? ['TTTTTTTT', 'TTTTTTgT', 'TTTTTgTT', 'TgTTgTTT', 'TTggTTTT', 'TTTTTTTT']
    : ['TTTTTTTT', 'TTTddTTT', 'TTdTTTTT', 'TTdTTTTT', 'TTTddTTT', 'TTTTTTTT']
  return stamp(rows, 8, 11, label)
}

export const SPRITES: Record<string, string[]> = {
  player_down: FOX_DOWN,
  player_down_step: FOX_DOWN_STEP,
  player_down_push: FOX_DOWN_PUSH,
  player_up: FOX_UP,
  player_up_step: FOX_UP_STEP,
  player_up_push: FOX_UP_PUSH,
  player_left: FOX_LEFT,
  player_left_step: FOX_LEFT_STEP,
  player_left_push: FOX_LEFT_PUSH,
  player_right: flip(FOX_LEFT),
  player_right_step: flip(FOX_LEFT_STEP),
  player_right_push: flip(FOX_LEFT_PUSH),
  crate: crate(false),
  crate_on: crate(true),
}

/** The fox's texture for a facing and a pose: `player_gbc_left_push`. */
export function playerKey(mode: Mode, facing: Facing, pose: Pose = 'idle'): string {
  return `player_${mode}_${facing}${pose === 'idle' ? '' : `_${pose}`}`
}

/**
 * Where each sprite's texture key puts the mode. The fox has one set for all
 * worlds; a crate's key carries the world, as every tile's does.
 */
export function textureKey(name: string, mode: Mode, world = 1): string {
  const player = name.match(/^player_(.+)$/)
  if (player) return `player_${mode}_${player[1]}`
  return mode === 'gbc' ? `${name}_gbc_w${world}` : `${name}_dmg`
}

/**
 * Green-screen tones that differ from an ink's usual one, per sprite.
 *
 * A crate that is home is the other crate turned inside out: the darkest tone
 * where that one is mid, and a pale frame, so the two cannot be confused on a
 * screen with no green to tell them apart.
 */
const DMG_SWAP: Record<string, Record<string, Tone>> = {
  crate_on: { G: 'D', g: 'd', Y: 'L', T: 'L' },
}

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
