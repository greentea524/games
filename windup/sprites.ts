// The toy, its key, the energy orb, the winding station and the goal (#168).
//
// The hub card has an orange and teal robot with a round head, an antenna
// and a wind-up key in its back, mid-jump. The game had a blue box with a
// face, the same whichever way it moved, and a key of three bars.
//
// Each sprite is a picture in text, one character a pixel, looked up in
// `INK`, as Pocket Dungeon's and Cart & Crate's are. No picture draws its own
// outline; `pixels` puts one dark pixel round the silhouette, so a pale head
// stays a head on the green screen's pale stone. Every picture is drawn at 24
// pixels a tile and shown at two thirds, like the factory (#167).
//
// No Phaser in this file, so `sprites_test.ts` can check every picture.

import { PAL } from './constants'

export const SPRITE_PX = 24

export type Mode = 'gbc' | 'dmg'

/** The green screen's four tones, lightest to darkest. */
export const DMG_TONES = { L: PAL.lightest, l: PAL.light, d: PAL.dark, D: PAL.darkest } as const
type Tone = keyof typeof DMG_TONES

/** Every letter a picture may use: its colour, and its green-screen tone. */
export const INK: Record<string, [number, Tone]> = {
  H: [0xdce6ee, 'L'], // head: polished tin
  h: [0x8a9cac, 'l'], // head in shadow
  V: [0x15464c, 'D'], // the visor
  E: [0xf8f490, 'L'], // eyes, lit
  A: [0x6a7a88, 'd'], // the antenna's stem
  R: [0xf85a30, 'L'], // its bulb
  O: [0xf08a30, 'l'], // orange body
  o: [0xb0501a, 'l'], // body in shadow
  Y: [0xf8d448, 'L'], // brass: the chest plate, the key
  y: [0xa8781a, 'd'], // brass in shadow
  // The limbs a tone below the body on the green screen, so the toy is
  // three tones top to bottom and not one shape.
  T: [0x3cbcb0, 'd'], // teal limbs
  t: [0x1c6e6a, 'D'], // limbs in shadow
  S: [0x3a4856, 'D'], // steel joints
  // The orb.
  G: [0xfff6c0, 'L'], // its white-hot core
  g: [0xf8d048, 'l'], // its glow
  n: [0xd88a18, 'd'], // its rim
  // The station.
  M: [0x5a6a74, 'd'], // its casing
  m: [0x8a9aa4, 'l'], // casing, lit
  k: [0x262e36, 'D'], // the window's frame, a dark socket
  C: [0x6cf07a, 'L'], // a charged coil, glowing
  c: [0x2a9a48, 'l'], // the coil's glow
  // The goal.
  P: [0x9aa6b0, 'l'], // pole
  W: [0xf4f8fa, 'L'], // the flag's white
  B: [0x1a2026, 'D'], // the flag's black
  L: [0x6cf07a, 'L'], // the exit lamp
}

/** The outline's colour in each mode. */
export const OUTLINE: Record<Mode, number> = { gbc: 0x0a0c10, dmg: DMG_TONES.D }

/** A picture with some rows replaced, counted from the top. */
function withRows(rows: string[], from: number, replacement: string[]): string[] {
  const out = [...rows]
  replacement.forEach((row, i) => { out[from + i] = row })
  return out
}

// --- the toy ------------------------------------------------------------------

// Facing right. The key is not in these: it is a sprite of its own, on the
// toy's back, because it turns at a speed set by the energy left whatever the
// toy's pose. The body is the old hitbox scaled, ten units by twelve at the
// foot of the picture (`ROBOT_BODY`); the head and antenna stand above it, as
// the keeper's hood does over its box in Lantern Keeper (#173).
const HEAD = [
  '........................',
  '..............RR........',
  '...............A........',
  '...........HHHHHH.......',
  '.........HHHHHHHHHh.....',
  '........HHHHHHHHHHhh....',
  '........HHHVVVVVVVVh....',
  '........HHVVVEVVEVVh....',
  '........HHVVVEVVEVVh....',
  '........hHHVVVVVVVhh....',
  '.........hhhhhhhhhh.....',
  '............SSSS........',
]
const TORSO = [
  '.........OOOOOOOOOo.....',
  '........OOOOOOOOOOoo....',
  '........OOOYYYOOOOoT....',
  '........OOOYyYOOOOoT....',
  '........ooOOOOOOOOoT....',
  '.........oooooooootT....',
]
const STAND = [
  '..........SS....SS......',
  '..........tt....tt......',
  '..........TT....TT......',
  '..........TT....TT......',
  '.........TTTT..TTTT.....',
  '........................',
]

export const ROBOT_IDLE = [...HEAD, ...TORSO, ...STAND]

/** A stride, legs apart, the front arm swung back. */
export const ROBOT_RUN_A = withRows([...HEAD, ...TORSO], 12, [
  '.........OOOOOOOOOo.....',
  '........OOOOOOOOOOoo....',
  '........OOOYYYOOOOoo....',
  '........OOOYyYOOOOoo....',
  '.......TooOOOOOOOOoo....',
  '.......Ttoooooooooo.....',
  '..........SS....SS......',
  '.........tt......tt.....',
  '........TT........TT....',
  '.......TT..........TT...',
  '......TTT..........TTT..',
  '........................',
])

/** The passing step, legs together, the arm swung forward. */
export const ROBOT_RUN_B = [
  ...withRows(HEAD, 0, []),
  '.........OOOOOOOOOo.....',
  '........OOOOOOOOOOoo....',
  '........OOOYYYOOOOooTT..',
  '........OOOYyYOOOOootT..',
  '........ooOOOOOOOOoo....',
  '.........oooooooooo.....',
  '...........SSSS.........',
  '...........tttt.........',
  '............TT..........',
  '............TT..........',
  '...........TTTTT........',
  '........................',
]

/** Going up: an arm thrown up, the legs tucked. */
export const ROBOT_JUMP = withRows([...HEAD, ...TORSO], 10, [
  '.........hhhhhhhhhh.TT..',
  '............SSSS....TT..',
  '.........OOOOOOOOOotT...',
  '........OOOOOOOOOOoo....',
  '........OOOYYYOOOOoo....',
  '........OOOYyYOOOOoo....',
  '........ooOOOOOOOOoo....',
  '.........oooooooooo.....',
  '..........SS..SS........',
  '.........ttt..ttt.......',
  '.........TTT...TTT......',
  '........................',
  '........................',
  '........................',
])

/** Coming down: both arms up and out, the legs reaching for the floor. */
export const ROBOT_FALL = withRows([...HEAD, ...TORSO], 10, [
  '.....TT..hhhhhhhhhh.TT..',
  '......TT...SSSS....TT...',
  '.......TOOOOOOOOOoT.....',
  '........OOOOOOOOOOoo....',
  '........OOOYYYOOOOoo....',
  '........OOOYyYOOOOoo....',
  '........ooOOOOOOOOoo....',
  '.........oooooooooo.....',
  '..........SS....SS......',
  '..........tt....tt......',
  '..........TT....TT......',
  '.........TTT....TTT.....',
  '........................',
  '........................',
])

/**
 * Sliding down a wall on the side it faces: the front hand flat on the wall
 * above, the front foot braced against it.
 */
export const ROBOT_SLIDE = withRows(ROBOT_IDLE, 10, [
  '.........hhhhhhhhhh..T..',
  '............SSSS....TT..',
  '.........OOOOOOOOOotT...',
  '........OOOOOOOOOOoo....',
  '........OOOYYYOOOOoo....',
  '........OOOYyYOOOOoo....',
  '........ooOOOOOOOOoo....',
  '.........oooooooooo.....',
  '..........SS....SS......',
  '..........tt.....tt.....',
  '..........TT......TT....',
  '..........TT.......TT...',
  '.........TTTT......TTT..',
  '........................',
])

/** The poses, in frame order of `robot_<mode>`. */
export const POSES = ['idle', 'runA', 'runB', 'jump', 'fall', 'slide'] as const
export type Pose = (typeof POSES)[number]
export const POSE_ROWS: Record<Pose, string[]> = {
  idle: ROBOT_IDLE, runA: ROBOT_RUN_A, runB: ROBOT_RUN_B, jump: ROBOT_JUMP, fall: ROBOT_FALL, slide: ROBOT_SLIDE,
}

/**
 * The hitbox, in the picture's pixels: the old 10 by 12 units at 3, 4 in a
 * 16-unit frame (#68), times 1.5. At two thirds it is the old box exactly.
 */
export const ROBOT_BODY = { width: 15, height: 18, x: 4.5, y: 6 } as const

/** Where the head is in a pose, for the HUD's portrait: the box round it. */
export const HEAD_BOX = { x: 7, y: 0, width: 14, height: 12 } as const

// --- the key ------------------------------------------------------------------

/**
 * The wind-up key, seen side on as it turns: the bow face on, then at an
 * angle, then edge on, then at the other angle. The bow is the same both
 * ways up, so four pictures are half a turn. The shaft goes into the toy's
 * back, on the right of the picture.
 */
export const KEY_W = 10
export const KEY_H = 16
export const KEY_FRAMES = [
  [
    '..........',
    '..YYY.....',
    '.YyyyY....',
    '.Yy.yY....',
    '.YyyyY....',
    '..YYY.....',
    '...Yy.....',
    '...YyYYYYy',
    '...Yy.....',
    '..YYY.....',
    '.YyyyY....',
    '.Yy.yY....',
    '.YyyyY....',
    '..YYY.....',
    '..........',
    '..........',
  ],
  [
    '..........',
    '..........',
    '..........',
    '..YYY.....',
    '.YyyyY....',
    '..YYY.....',
    '...Yy.....',
    '...YyYYYYy',
    '...Yy.....',
    '..YYY.....',
    '.YyyyY....',
    '..YYY.....',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '...YY.....',
    '...YyYYYYy',
    '...yy.....',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  [
    '..........',
    '..........',
    '..........',
    '..yyy.....',
    '.yYYYy....',
    '..yyy.....',
    '...yY.....',
    '...yYYYYYy',
    '...yY.....',
    '..yyy.....',
    '.yYYYy....',
    '..yyy.....',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
]

/**
 * How fast the key turns, in pictures a second, at a charge from 0 to 1.
 * Energy is the game's whole idea, so the key says how much is left: brisk
 * when full, slowing as it runs down, still when it is empty. That makes it
 * information rather than decoration, and it turns under reduced motion too.
 */
export const keyRate = (charge: number) => (charge <= 0 ? 0 : 2 + 14 * Math.min(1, charge))

// --- pickups, the station and the goal ----------------------------------------

/** An energy orb: a white-hot core in a yellow glow, with a rim to hold it on pale stone. */
export const ORB = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..........nnnn..........',
  '........nnggggnn........',
  '.......nggggggggn.......',
  '......ngggGGGgggn.......',
  '......nggGGGGGggn.......',
  '.....nggGGGGGGGggn......',
  '.....nggGGGGGGGggn......',
  '.....nggGGGGGGGggn......',
  '.....nggGGGGGGGggn......',
  '......nggGGGGGggn.......',
  '......ngggGGGgggn.......',
  '.......nggggggggn.......',
  '........nnggggnn........',
  '..........nnnn..........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
]

/** A winding station: a machine with a window on a glowing coil, and a key socket on top. */
export const STATION = [
  '........................',
  '........................',
  '........................',
  '..........kkkk..........',
  '..........kYYk..........',
  '.....mmmmmmmmmmmmmm.....',
  '.....mMMMMMMMMMMMMM.....',
  '.....mMkkkkkkkkkkMM.....',
  '.....mMkccccccccckM.....',
  '.....mMkcCCCCCCCckM.....',
  '.....mMkcCcCcCcCckM.....',
  '.....mMkcCCCCCCCckM.....',
  '.....mMkcCcCcCcCckM.....',
  '.....mMkcCCCCCCCckM.....',
  '.....mMkccccccccckM.....',
  '.....mMkkkkkkkkkkkM.....',
  '.....mMMMMMMMMMMMMM.....',
  '.....mMMYMMMMMMYMMM.....',
  '.....mMMMMMMMMMMMMM.....',
  '....SSSSSSSSSSSSSSSS....',
  '....SSSSSSSSSSSSSSSS....',
  '........................',
  '........................',
  '........................',
]

/** The same machine spent: the window dark and the coil cold. */
export const STATION_EMPTY = STATION.map((row) => row.replace(/[Cc]/g, 'k'))

/** The goal: a chequered flag on a steel pole, with a green exit lamp at its head. */
export const GOAL = [
  '........................',
  '.......LL...............',
  '.......LL...............',
  '.......PPWWWBBBWWWBBB...',
  '.......PPWWWBBBWWWBBB...',
  '.......PPWWWBBBWWWBBB...',
  '.......PPBBBWWWBBBWWW...',
  '.......PPBBBWWWBBBWWW...',
  '.......PPBBBWWWBBBWWW...',
  '.......PPWWWBBBWWWBBB...',
  '.......PPWWWBBBWWWBBB...',
  '.......PPWWWBBBWWWBBB...',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.......PP...............',
  '.....SSSSSS.............',
  '.....SSSSSS.............',
  '........................',
]

/** Every picture by its texture's name, without the palette. */
export const PICTURES: Record<string, string[]> = {
  energy: ORB,
  station: STATION,
  station_empty: STATION_EMPTY,
  goal: GOAL,
}

/** A picture's colours, with its outline added round the silhouette. */
export function pixels(rows: string[], mode: Mode, w = SPRITE_PX, h = SPRITE_PX): (number | null)[][] {
  const grid: (number | null)[][] = []
  for (let y = 0; y < h; y++) {
    const row = (rows[y] ?? '').padEnd(w, '.')
    grid.push(
      [...row].slice(0, w).map((ch) => {
        if (ch === '.') return null
        const ink = INK[ch]
        if (!ink) throw new Error(`"${ch}" is not an ink`)
        return mode === 'gbc' ? ink[0] : DMG_TONES[ink[1]]
      }),
    )
  }
  const out = grid.map((row) => [...row])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== null) continue
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy]?.[x + dx] ?? null) !== null)
      if (near) out[y][x] = OUTLINE[mode]
    }
  }
  return out
}
