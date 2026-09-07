// Tilt Maze's boards, as data (#112).
//
// Grids of characters, the way `cart-crate/levels.ts` does it, because a maze
// is a grid and anything richer would be authoring tooling for a game with
// eight levels in it.
//
//   #  wall      a solid block standing on the floor
//   .  floor     open, safe
//   o  hole      no floor; the ball falls through and the level restarts
//   S  start     where the ball is placed. Floor.
//   G  goal      where it has to come to rest. Floor.
//
// Every grid is walled around its edge, so the ball can only leave through a
// hole. That is a rule rather than a habit: without it the ball rolls off the
// board and the failure reads as the game losing track of it.

export interface Level {
  name: string
  /** Rows of cells, indexed [row][column]. All rows the same length. */
  grid: string[]
}

export const LEVELS: Level[] = [
  {
    name: 'Roll',
    // Nothing to avoid. It teaches that the board leans and the ball keeps
    // going after you let go, which is the whole of the game's feel.
    grid: [
      '#########',
      '#.......#',
      '#.S...G.#',
      '#.......#',
      '#########',
    ],
  },
  {
    name: 'Gap',
    // One hole, directly on the obvious line. The first thing to go around.
    grid: [
      '#########',
      '#.......#',
      '#.S.o.G.#',
      '#.......#',
      '#########',
    ],
  },
  {
    name: 'Corridor',
    // A turn. Momentum carries you past it if you lean too long.
    grid: [
      '#########',
      '#S......#',
      '#####.###',
      '#...#...#',
      '#.#...#.#',
      '###...###',
      '#...G...#',
      '#########',
    ],
  },
  {
    name: 'Rim',
    // Holes along the walls, so hugging one is punished.
    grid: [
      '#########',
      '#S.o...o#',
      '#.......#',
      '#o.....o#',
      '#.......#',
      '#o...o.G#',
      '#########',
    ],
  },
  {
    name: 'Sieve',
    // A field of holes with a safe lattice through it. Rewards small leans.
    grid: [
      '#########',
      '#S.o.o..#',
      '#.......#',
      '#o.o.o.o#',
      '#.......#',
      '#.o.o.oG#',
      '#########',
    ],
  },
  {
    name: 'Spiral',
    // Long, with no holes at all. The hazard is the walls and your own speed.
    grid: [
      '###########',
      '#S........#',
      '#.#######.#',
      '#.#.....#.#',
      '#.#.###.#.#',
      '#.#.#G#.#.#',
      '#.#.#.#.#.#',
      '#.#...#...#',
      '#.#####.###',
      '#.........#',
      '###########',
    ],
  },
  {
    name: 'Bridge',
    // Two narrow crossings over a void, offset from each other so the route
    // has to double back. The first version of this board was unwinnable — the
    // goal was sealed behind holes — and the flood fill in `tilt_test.ts`
    // caught it the moment that check was written.
    grid: [
      '#########',
      '#S......#',
      '#.oooooo#',
      '#.......#',
      '#oooooo.#',
      '#.......#',
      '#...G...#',
      '#########',
    ],
  },
  {
    name: 'Needle',
    // The last one. A thread through staggered holes, with the route changing
    // column twice. Also caught unwinnable by the flood fill on its first
    // draft.
    grid: [
      '###########',
      '#S...o....#',
      '#.o.o.o.o.#',
      '#.........#',
      '#o.ooooo.o#',
      '#.........#',
      '#.o.ooo.o.#',
      '#....G....#',
      '###########',
    ],
  },
]

/** Cell characters, for anything that needs to switch on one. */
export type Cell = '#' | '.' | 'o' | 'S' | 'G'

/** The first cell matching `what`, scanning rows top to bottom. */
export function findCell(grid: string[], what: Cell): { col: number; row: number } | null {
  for (let row = 0; row < grid.length; row++) {
    const col = grid[row].indexOf(what)
    if (col >= 0) return { col, row }
  }
  return null
}
