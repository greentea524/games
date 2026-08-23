// Auto-play planner checks (#81).
//
//   npx tsx pocket-dungeon/autoplay_test.ts
//
// The planner is pure, so a floor here is a block of text and every decision
// is one call. That matters more than usual for this feature: a pathfinder
// verified by "I turned it on and it seemed to work" is verified on the one
// floor that happened to generate, and the interesting cases — a wall in the
// way, a target behind fog, nothing left to do — are exactly the ones a random
// floor will not hand you.
import { chooseAction, findPath, AUTO_HP_PAUSE, type AutoWorld, type Point } from './autoplay'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * Builds a world from a picture.
 *
 *   #  wall          .  floor          @  player
 *   E  enemy         i  item           C  chest
 *   S  stairs        ?  floor, unexplored
 *
 * Lowercase places the same thing on unexplored ground: `e` is an enemy
 * behind fog, `c` a chest behind fog. Everything else is explored, because
 * fog is the exception worth spelling out rather than the default.
 */
function world(rows: string[], over: Partial<AutoWorld> = {}): AutoWorld {
  const height = rows.length
  const width = rows[0].length
  const grid: string[] = []
  const explored = Array.from({ length: height }, () => Array(width).fill(false))
  let player: Point = { x: 0, y: 0 }
  const enemies: AutoWorld['enemies'] = []
  const items: AutoWorld['items'] = []
  const chests: AutoWorld['chests'] = []
  let stairs: Point | null = null

  for (let y = 0; y < height; y++) {
    let row = ''
    for (let x = 0; x < width; x++) {
      const c = rows[y][x]
      explored[y][x] = !'?ec'.includes(c)
      if (c === '@') player = { x, y }
      if (c === 'E' || c === 'e') enemies.push({ tx: x, ty: y, hp: 5 })
      if (c === 'i') items.push({ tx: x, ty: y })
      if (c === 'C' || c === 'c') chests.push({ tx: x, ty: y, opened: false })
      if (c === 'S') stairs = { x, y }
      row += c === '#' ? '#' : c === 'S' ? 'S' : '.'
    }
    grid.push(row)
  }
  return {
    grid, width, height, explored, player,
    playerHp: 20, maxHp: 20,
    enemies, items, chests, stairs, stairsSealed: false,
    ...over,
  }
}

// --- pathfinding ------------------------------------------------------------

const corridor = world([
  '#######',
  '#@...S#',
  '#######',
])
const p1 = findPath(corridor, corridor.player, corridor.stairs!)
check('a straight path is found', p1 !== null && p1.length === 4, `${p1?.length} steps`)
check('and it does not include the tile we start on', p1?.[0].x === 2, `first step x=${p1?.[0].x}`)

// A wall the pathfinder has to go around. The direct line is 6; around is 8.
const detour = world([
  '#########',
  '#@..#..S#',
  '#...#...#',
  '#.......#',
  '#########',
])
const p2 = findPath(detour, detour.player, detour.stairs!)
// Six across, and the only gap in the wall is two rows down, so the detour
// costs two down and two back up. Ten is the shortest route, not a wide one.
check(
  'a wall is routed around, at the shortest length',
  p2?.length === 10,
  `${p2?.length} steps (the straight line would be 6, but the gap is 2 rows down)`,
)
check(
  'and every step of it is walkable',
  !!p2 && p2.every((s) => detour.grid[s.y][s.x] !== '#'),
)
check(
  'and each step is adjacent to the last',
  !!p2 &&
    p2.every((s, i) => {
      const prev = i === 0 ? detour.player : p2[i - 1]
      return Math.abs(s.x - prev.x) + Math.abs(s.y - prev.y) === 1
    }),
)

const sealed = world([
  '#####',
  '#@#S#',
  '#####',
])
check('an unreachable target returns no path', findPath(sealed, sealed.player, sealed.stairs!) === null)

// --- priorities -------------------------------------------------------------

const adjacent = world([
  '#####',
  '#@E.#',
  '#####',
])
const a1 = chooseAction(adjacent)
check(
  'an enemy already beside us is attacked, not walked around',
  a1.kind === 'attack' && a1.dx === 1 && a1.dy === 0,
  JSON.stringify(a1),
)

const chase = world([
  '#########',
  '#@....E.#',
  '#########',
])
const a2 = chooseAction(chase)
check('a distant enemy is walked toward', a2.kind === 'move' && a2.dx === 1, JSON.stringify(a2))

// The order that matters. Loot and stairs are both closer than the enemy, and
// the enemy still wins: leaving one alive behind you means being chased while
// you loot, and on a boss floor the stairs will not open until it is down.
// Every map below puts the contenders on *opposite sides* of the player. The
// first draft had them all to the right, so "walked to the enemy" and "walked
// to the stairs" were the same assertion and the check could not tell which
// had happened — it passed while reporting a step toward the wrong thing.
const priority = world([
  '###########',
  '#E..@.S..C#',
  '###########',
])
const a3 = chooseAction(priority)
check(
  'an enemy outranks loot and stairs even when it is further away',
  a3.kind === 'move' && a3.dx === -1,
  `${JSON.stringify(a3)} — enemy 3 west, stairs 1 east, chest 5 east`,
)

const looting = world([
  '###########',
  '#C..@.S...#',
  '###########',
])
const a4 = chooseAction(looting)
check(
  'with no enemies, loot outranks the stairs — descending is irreversible',
  a4.kind === 'move' && a4.dx === -1,
  `${JSON.stringify(a4)} — chest 3 west, stairs 1 east`,
)
// Prove that check means something: without the chest it does take the stairs.
const descending = world([
  '###########',
  '#...@.S...#',
  '###########',
])
const a5 = chooseAction(descending)
check('and with nothing to loot it does take them', a5.kind === 'move' && a5.dx === 1, JSON.stringify(a5))

// #84. A sealed staircase is not a destination. If it were the only thing
// left, auto-play would walk to it and stop dead on a locked door.
const sealedStairs = world(['###########', '#...@.S...#', '###########'], { stairsSealed: true })
const a6 = chooseAction(sealedStairs)
check(
  'a sealed staircase is not walked to',
  a6.kind === 'halt',
  `${JSON.stringify(a6)} — same map as above, which did take the stairs`,
)

// --- fog --------------------------------------------------------------------

// The enemy is west and the item east, so the two outcomes are opposite steps.
const fogged = world([
  '###########',
  '#.e..@...i#',
  '###########',
])
const a7 = chooseAction(fogged)
check(
  'an enemy behind fog is not chased',
  a7.kind === 'move' && a7.dx === 1,
  `${JSON.stringify(a7)} — walked east to the item instead`,
)
const litEnemy = world([
  '###########',
  '#.E..@...i#',
  '###########',
])
const a7b = chooseAction(litEnemy)
check(
  'and the same enemy in the open is chased, so the check above means something',
  a7b.kind === 'move' && a7b.dx === -1,
  `${JSON.stringify(a7b)} — identical map, fog lifted`,
)

// Explores rather than giving up when nothing seen is worth doing.
const unexplored = world([
  '###########',
  '#@...?????#',
  '###########',
])
const a8 = chooseAction(unexplored)
check('with nothing else to do it walks toward unexplored ground', a8.kind === 'move' && a8.dx === 1, JSON.stringify(a8))

const done = world([
  '#####',
  '#@..#',
  '#####',
])
const a9 = chooseAction(done)
check(
  'and halts when the floor is finished',
  a9.kind === 'halt' && a9.reason === 'NOWHERE TO GO',
  JSON.stringify(a9),
)

// --- the safety valve -------------------------------------------------------
//
// The one behaviour the issue asks for by name. Checked at the boundary and
// on both sides of it, because "below 20%" and "at 20%" are different rules
// and only one of them hands the player back a survivable position.

const hurt = (hp: number) =>
  chooseAction(world(['#####', '#@E.#', '#####'], { playerHp: hp, maxHp: 20 }))

check('at full health it plays on', hurt(20).kind === 'attack')
check('just above the threshold it plays on', hurt(5).kind === 'attack', '5/20 = 25%')
check(
  'at the threshold it stops',
  hurt(4).kind === 'halt' && (hurt(4) as { reason: string }).reason === 'LOW HP',
  `4/20 = ${AUTO_HP_PAUSE * 100}%`,
)
check('below it, likewise', hurt(1).kind === 'halt')
// Stopping has to beat everything, including a free hit on an adjacent enemy.
check(
  'and stopping outranks an attack that was there for the taking',
  hurt(3).kind === 'halt',
  'an enemy is adjacent and it still hands back control',
)

// --- the reasons fit the screen ---------------------------------------------
//
// Press Start 2P is a fixed 8px grid on a 160px screen. These are shown as a
// floating banner over a tile, so they have less room than that, not more.
const REASONS = ['LOW HP', 'NOWHERE TO GO']
check(
  'every halt reason fits the 160px screen',
  REASONS.every((r) => r.length <= 16),
  `longest ${Math.max(...REASONS.map((r) => r.length))} of 16`,
)

console.log(ok ? '\nALL AUTO-PLAY CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
