/**
 * Auto-play (#81).
 *
 * A hands-free mode: the game plays itself a turn at a time until something
 * happens that a player should see.
 *
 * Everything that decides *what to do* lives here rather than in the scene,
 * and it is pure. That is not tidiness for its own sake — a planner buried in
 * `DungeonScene.update()` can only be tested by running the game and watching,
 * which is exactly how you end up with a feature that works on the floor you
 * happened to try. Here a floor is eleven lines of string and every decision
 * is a function call.
 *
 * ## What it knows
 *
 * Only what the player knows. Targets are ignored unless their tile is in
 * `explored`, so auto-play cannot walk straight to a chest behind fog that a
 * human would have to find. A convenience feature that quietly plays better
 * than the rules allow is not a convenience, it is a different game.
 */

/** A row-indexable map: `grid[y][x]`. Row strings and char arrays both work. */
export type Grid = ArrayLike<ArrayLike<string>>

export interface Point {
  x: number
  y: number
}

export interface AutoWorld {
  grid: Grid
  width: number
  height: number
  /** Tiles the player has seen. Auto-play may not target anything outside it. */
  explored: boolean[][]
  player: Point
  playerHp: number
  maxHp: number
  enemies: { tx: number; ty: number; hp: number }[]
  /** Floor pickups worth walking to. */
  items: { tx: number; ty: number }[]
  /** Unopened chests. Opened ones are not targets. */
  chests: { tx: number; ty: number; opened: boolean }[]
  stairs: Point | null
  /** #84: a boss floor's stairs do not work until its boss is down. */
  stairsSealed: boolean
}

export type AutoAction =
  | { kind: 'attack'; dx: number; dy: number }
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'halt'; reason: HaltReason }

/**
 * Why auto-play gave the controls back. These are shown to the player, so
 * they are a closed set rather than free text — `autoplay_test.ts` checks
 * each one fits the 160px screen.
 */
export type HaltReason = 'LOW HP' | 'NOWHERE TO GO'

/**
 * Fraction of max HP at or below which auto-play stops.
 *
 * The issue suggests 20% and 20% is right, but the reason is worth writing
 * down: the check runs *before* each auto turn, so this is the health the
 * player is handed back with, not the health they die at. At 20% of a
 * Knight's 20 HP that is 4 — one hit from a floor-8 enemy. Lower would hand
 * back a corpse.
 */
export const AUTO_HP_PAUSE = 0.2

const WALL = new Set(['#', ' '])

function walkable(w: AutoWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return false
  return !WALL.has(w.grid[y]?.[x] as string)
}

function seen(w: AutoWorld, x: number, y: number): boolean {
  return w.explored[y]?.[x] === true
}

const manhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

/**
 * A* from `from` to `to`, returning the steps *after* `from`, or null.
 *
 * Four-neighbour and uniform cost, so Manhattan is admissible and the result
 * is a shortest path. `blocked` holds tiles occupied by something living; the
 * goal itself is exempt, because walking into an enemy is how you attack it.
 */
export function findPath(
  w: AutoWorld,
  from: Point,
  to: Point,
  blocked: ReadonlySet<number> = new Set(),
): Point[] | null {
  if (from.x === to.x && from.y === to.y) return []
  const key = (x: number, y: number) => y * w.width + x
  const goal = key(to.x, to.y)

  const open: { p: Point; f: number }[] = [{ p: from, f: manhattan(from, to) }]
  const cameFrom = new Map<number, number>()
  const gScore = new Map<number, number>([[key(from.x, from.y), 0]])
  const closed = new Set<number>()

  while (open.length) {
    // A linear scan for the lowest f. The maps here are at most a few hundred
    // tiles, so a heap would be more code for no measurable gain.
    let best = 0
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i
    const { p } = open.splice(best, 1)[0]
    const pk = key(p.x, p.y)
    if (pk === goal) {
      const path: Point[] = []
      let cur = pk
      while (cur !== key(from.x, from.y)) {
        path.push({ x: cur % w.width, y: Math.floor(cur / w.width) })
        const prev = cameFrom.get(cur)
        if (prev === undefined) return null
        cur = prev
      }
      return path.reverse()
    }
    if (closed.has(pk)) continue
    closed.add(pk)

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx
      const ny = p.y + dy
      const nk = key(nx, ny)
      if (!walkable(w, nx, ny)) continue
      if (blocked.has(nk) && nk !== goal) continue
      const tentative = (gScore.get(pk) ?? Infinity) + 1
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue
      cameFrom.set(nk, pk)
      gScore.set(nk, tentative)
      open.push({ p: { x: nx, y: ny }, f: tentative + manhattan({ x: nx, y: ny }, to) })
    }
  }
  return null
}

/** Tiles a living enemy is standing on. */
function occupied(w: AutoWorld): Set<number> {
  const out = new Set<number>()
  for (const e of w.enemies) if (e.hp > 0) out.add(e.ty * w.width + e.tx)
  return out
}

/** The shortest path to any of `targets`, or null if none is reachable. */
function nearest(w: AutoWorld, targets: Point[], blocked: Set<number>): Point[] | null {
  let best: Point[] | null = null
  for (const t of targets) {
    const path = findPath(w, w.player, t, blocked)
    if (path && path.length && (best === null || path.length < best.length)) best = path
  }
  return best
}

/**
 * Explored floor tiles that touch something unexplored.
 *
 * Without this, auto-play stops the moment nothing it has already seen is
 * worth walking to — which on a fogged map is usually two rooms in. Walking
 * to the edge of what is known is how it finds the rest of the floor, and it
 * is the same rule a player follows.
 */
function frontier(w: AutoWorld): Point[] {
  const out: Point[] = []
  for (let y = 0; y < w.height; y++) {
    for (let x = 0; x < w.width; x++) {
      if (!seen(w, x, y) || !walkable(w, x, y)) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (walkable(w, x + dx, y + dy) && !seen(w, x + dx, y + dy)) {
          out.push({ x, y })
          break
        }
      }
    }
  }
  return out
}

const step = (w: AutoWorld, path: Point[]): AutoAction => ({
  kind: 'move',
  dx: path[0].x - w.player.x,
  dy: path[0].y - w.player.y,
})

/**
 * One turn of auto-play.
 *
 * The order is the whole design. Enemies first because leaving one alive
 * behind you means being chased while looting, and because #84 seals a boss
 * floor's stairs until its boss is down — a planner that went for the stairs
 * first would walk into a locked door and stop. Loot before stairs, because
 * descending is irreversible and anything left behind is gone. Frontier last,
 * because exploring is what you do when there is nothing better.
 */
export function chooseAction(w: AutoWorld): AutoAction {
  if (w.maxHp > 0 && w.playerHp / w.maxHp <= AUTO_HP_PAUSE) {
    return { kind: 'halt', reason: 'LOW HP' }
  }

  const living = w.enemies.filter((e) => e.hp > 0 && seen(w, e.tx, e.ty))

  // Anything already next to us gets hit rather than walked around.
  for (const e of living) {
    const dx = e.tx - w.player.x
    const dy = e.ty - w.player.y
    if (Math.abs(dx) + Math.abs(dy) === 1) return { kind: 'attack', dx, dy }
  }

  const blocked = occupied(w)

  const toEnemy = nearest(w, living.map((e) => ({ x: e.tx, y: e.ty })), blocked)
  if (toEnemy) return step(w, toEnemy)

  const loot: Point[] = [
    ...w.items.filter((i) => seen(w, i.tx, i.ty)).map((i) => ({ x: i.tx, y: i.ty })),
    ...w.chests.filter((c) => !c.opened && seen(w, c.tx, c.ty)).map((c) => ({ x: c.tx, y: c.ty })),
  ]
  const toLoot = nearest(w, loot, blocked)
  if (toLoot) return step(w, toLoot)

  if (w.stairs && !w.stairsSealed && seen(w, w.stairs.x, w.stairs.y)) {
    const toStairs = findPath(w, w.player, w.stairs, blocked)
    if (toStairs && toStairs.length) return step(w, toStairs)
  }

  const toFrontier = nearest(w, frontier(w), blocked)
  if (toFrontier) return step(w, toFrontier)

  return { kind: 'halt', reason: 'NOWHERE TO GO' }
}
