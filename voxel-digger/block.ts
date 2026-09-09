// The block, and the things buried in it (#115).
//
// A cube of rock with something inside. Both are the same grid, and that is
// the whole data model: a cell is either rock, part of the buried shape, or
// empty because it has been dug out.
//
// The shapes are authored as ASCII layers rather than coordinate lists, for
// the reason `tilt-maze/levels.ts` does it: a reviewer has to be able to see
// what the thing looks like. A list of 40 triples is unreadable and a typo in
// it is invisible; a stack of pictures is neither.
//
// Every candidate shape occupies the same anchored box, which matters more
// than it looks. Identifying the buried thing means ruling the others out, and
// that is only about *which cells are filled* — if two candidates sat in
// different places, digging anywhere near one would give it away immediately.

export interface Cell {
  x: number
  y: number
  z: number
}

/**
 * A block: how big it is, and where in it the buried shape sits.
 *
 * The dimensions are a value rather than module constants because how deeply
 * the shape is buried is the thing the dig budget has to cover, and #115 asks
 * for a check that fails when a shape is buried deeper than the budget allows.
 * With the size baked in as a constant there is no way to state that layout,
 * and the check would only ever have seen the one arrangement that works.
 */
export interface Block {
  size: number
  shapeSize: number
  /** Index of the shape box's low corner, on every axis. */
  shapeMin: number
}

/** Every shape is authored in a cube this many cells on a side. */
export const SHAPE_SIZE = 5

export function makeBlock(size: number, shapeSize = SHAPE_SIZE): Block {
  return { size, shapeSize, shapeMin: Math.floor((size - shapeSize) / 2) }
}

/**
 * The block the game is played on.
 *
 * Thirteen for overburden. At nine there are two cells of rock between the
 * surface and the find and the best possible round is three digs, which leaves
 * a score of "how few digs" almost nothing to say. Four cells of cover puts
 * the floor around five and gives a careful player somewhere to be careful.
 */
export const BLOCK = makeBlock(13)

/** Digs a player gets before they have to name what they found. */
export const DIG_BUDGET = 40

/** Cells pack into one integer so they can live in a `Set`. */
export const key = (b: Block, x: number, y: number, z: number): number =>
  (x * b.size + y) * b.size + z
export const unkey = (b: Block, k: number): Cell => ({
  x: Math.floor(k / (b.size * b.size)),
  y: Math.floor(k / b.size) % b.size,
  z: k % b.size,
})
export const inside = (b: Block, x: number, y: number, z: number): boolean =>
  x >= 0 && y >= 0 && z >= 0 && x < b.size && y < b.size && z < b.size

export interface Shape {
  id: string
  name: string
  /**
   * Layers bottom to top, each `SHAPE_SIZE` rows of `SHAPE_SIZE` characters.
   * `#` is the shape, anything else is rock.
   *
   * A row runs along +x and rows run along +z, so a layer reads like a plan
   * view with north at the top.
   */
  layers: string[][]
}

/**
 * Four things that could be down there.
 *
 * What matters is not that they look different. Ruling a candidate out means
 * exposing one cell where it and the truth disagree — so every pair has to
 * disagree somewhere the player can actually *get to*. A difference sealed
 * inside the shape is invisible for ever: rock cannot be dug through the
 * buried object, so a pocket enclosed on all six faces by shape is unreachable
 * whatever the budget. The skull has two such pockets, its eye sockets, and
 * two candidates differing only there would be indistinguishable while
 * rendering as obviously different objects.
 *
 * `dig_test.ts` puts that layout back and checks the solver cannot separate
 * it, because it is not a mistake anyone would catch by reading.
 */
/**
 * The two top layers, which every candidate shares.
 *
 * Without this the puzzle was over on the third dig: the natural first move is
 * straight down, and whatever it uncovered was unique to one shape. Sharing
 * the cap means the first thing you reach tells you only that you have reached
 * it, and the shapes have to be told apart lower down or from the side —
 * which is what makes the digging a decision rather than a formality.
 */
const CAP_TOP = ['.....', '.###.', '.###.', '.###.', '.....']
const CAP_UPPER = ['.###.', '#####', '#####', '#####', '.###.']

export const SHAPES: Shape[] = [
  {
    id: 'skull',
    name: 'Skull',
    layers: [
      ['.....', '.###.', '.#.#.', '.###.', '.....'],
      ['.###.', '#####', '#.#.#', '#####', '.###.'],
      ['.###.', '#####', '#####', '#####', '.###.'],
      CAP_UPPER,
      CAP_TOP,
    ],
  },
  {
    id: 'fish',
    name: 'Fish',
    layers: [
      ['..#..', '.###.', '#####', '.###.', '..#..'],
      ['.###.', '#####', '#####', '#####', '.###.'],
      ['..#..', '.###.', '#####', '.###.', '..#..'],
      CAP_UPPER,
      CAP_TOP,
    ],
  },
  {
    id: 'coil',
    name: 'Coil',
    layers: [
      ['#####', '#...#', '#...#', '#...#', '#####'],
      ['....#', '....#', '....#', '....#', '....#'],
      ['#####', '#....', '#....', '#....', '#####'],
      CAP_UPPER,
      CAP_TOP,
    ],
  },
  {
    id: 'key',
    name: 'Key',
    layers: [
      ['.###.', '.#.#.', '.###.', '..#..', '..#..'],
      ['#####', '##.##', '#####', '.###.', '.#.#.'],
      ['.###.', '.#.#.', '.###.', '..#..', '..#..'],
      CAP_UPPER,
      CAP_TOP,
    ],
  },
]

/** The grid cells a shape fills, in block coordinates. */
export function cellsOf(b: Block, shape: Shape): Set<number> {
  const out = new Set<number>()
  const m = b.shapeMin
  shape.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#') out.add(key(b, m + x, m + y, m + z))
      }
    })
  })
  return out
}

/** Every cell in the block. */
export function allCells(b: Block): number[] {
  const out: number[] = []
  for (let x = 0; x < b.size; x++) {
    for (let y = 0; y < b.size; y++) {
      for (let z = 0; z < b.size; z++) out.push(key(b, x, y, z))
    }
  }
  return out
}

const STEPS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** The six face neighbours of a cell that are still inside the block. */
export function neighbours(b: Block, k: number): number[] {
  const { x, y, z } = unkey(b, k)
  const out: number[] = []
  for (const [dx, dy, dz] of STEPS) {
    if (inside(b, x + dx, y + dy, z + dz)) out.push(key(b, x + dx, y + dy, z + dz))
  }
  return out
}

/** True when a cell touches the outside of the block on at least one face. */
export function onSurface(b: Block, k: number): boolean {
  const { x, y, z } = unkey(b, k)
  const last = b.size - 1
  return x === 0 || y === 0 || z === 0 || x === last || y === last || z === last
}
