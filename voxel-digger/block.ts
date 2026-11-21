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
export const SHAPE_SIZE = 7

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
 * (Written when a dig was one cube and the shapes were five on a side. A
 * drill reaches the find in one tap whatever the cover, #152, and the shapes
 * are seven on a side, #153, under three cells of cover: enough to hide what
 * is buried, in a block small enough that the find is most of what you see.)
 */
export const BLOCK = makeBlock(13)

/**
 * The bound the solvability proof works inside, in single cubes.
 *
 * This was the player's dig limit until #152. The game no longer stops anyone
 * digging — the score is the number of digs, and a limit on top of it only
 * ever ended rounds before the find had been seen. It stays as the bound
 * `dig_test.ts` proves every layout solvable within, one cube at a time, which
 * is a stricter question than anything a drill asks.
 */
export const PROOF_BUDGET = 40

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
 * Drawn seven cubes on a side (#153). At five they were blobs that shared
 * their top two layers — a cap added so the first dig told nothing — and none
 * of them looked like its name: the skull's eye sockets were sealed inside it.
 * At seven there is room for the features a name promises, and each is drawn
 * to be recognised from its front, which faces +z: the bottom row of every
 * layer below.
 *
 * What matters for play is not that they look different but that every pair
 * disagrees somewhere the player can *get to*. A difference sealed inside a
 * shape is invisible for ever: rock cannot be dug through the buried object,
 * so a pocket enclosed on all six faces is unreachable. None of these has
 * one, and `dig_test.ts` stages one to check it would be caught.
 */
export const SHAPES: Shape[] = [
  {
    id: 'skull',
    name: 'Skull',
    // A domed cranium over two open sockets, a nose hole, and a narrower jaw
    // with a row of teeth.
    layers: [
      ['.......', '.......', '..###..', '.#####.', '.#####.', '.#####.', '.#.#.#.'],
      ['.......', '..###..', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.'],
      ['..###..', '.#####.', '#######', '#######', '#######', '###.###', '.##.##.'],
      ['..###..', '.#####.', '#######', '#######', '#######', '#..#..#', '...#...'],
      ['..###..', '.#####.', '#######', '#######', '#######', '#..#..#', '...#...'],
      ['..###..', '.#####.', '#######', '#######', '#######', '#######', '.#####.'],
      ['.......', '..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......'],
    ],
  },
  {
    id: 'fish',
    name: 'Fish',
    // Side-on: a forked tail at the left, a fin above and below, and an eye
    // that goes clean through the head. The body is three cubes thick and the
    // tail and fins one, so it reads as a fish from the side and as a blade
    // from either end.
    layers: [
      ['.......', '.......', '.......', '...##..', '.......', '.......', '.......'],
      ['.......', '.......', '..####.', '#.####.', '..####.', '.......', '.......'],
      ['.......', '.......', '..#####', '#######', '..#####', '.......', '.......'],
      ['.......', '.......', '..#####', '.######', '..#####', '.......', '.......'],
      ['.......', '.......', '..###.#', '#####.#', '..###.#', '.......', '.......'],
      ['.......', '.......', '..####.', '#.####.', '..####.', '.......', '.......'],
      ['.......', '.......', '.......', '...##..', '.......', '.......', '.......'],
    ],
  },
  {
    id: 'coil',
    name: 'Coil',
    // A spring: one continuous strip winding up the outside, half a turn to
    // a layer, around an empty middle.
    layers: [
      ['#######', '......#', '......#', '......#', '......#', '......#', '......#'],
      ['#......', '#......', '#......', '#......', '#......', '#......', '#######'],
      ['#######', '......#', '......#', '......#', '......#', '......#', '......#'],
      ['#......', '#......', '#......', '#......', '#......', '#......', '#######'],
      ['#######', '......#', '......#', '......#', '......#', '......#', '......#'],
      ['#......', '#......', '#......', '#......', '#......', '#......', '#######'],
      ['#######', '......#', '......#', '......#', '......#', '......#', '......#'],
    ],
  },
  {
    id: 'key',
    name: 'Key',
    // Standing on its bit: a ring to hold it by, a shaft, and two teeth.
    layers: [
      ['.......', '.......', '...##..', '...##..', '...##..', '.......', '.......'],
      ['.......', '.......', '...###.', '...###.', '...###.', '.......', '.......'],
      ['.......', '.......', '...#...', '...#...', '...#...', '.......', '.......'],
      ['.......', '.......', '.#####.', '.#####.', '.#####.', '.......', '.......'],
      ['.......', '.......', '.#...#.', '.#...#.', '.#...#.', '.......', '.......'],
      ['.......', '.......', '.#...#.', '.#...#.', '.#...#.', '.......', '.......'],
      ['.......', '.......', '.#####.', '.#####.', '.#####.', '.......', '.......'],
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
