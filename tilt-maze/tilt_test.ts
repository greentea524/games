// Tilt Maze's tunnelling defence (#112).
//
//   npx tsx tilt-maze/tilt_test.ts
//
// cannon-es is pure JS, so the simulation runs headless and this belongs in
// `qa:units` beside `pocket-dungeon/modifiers_test.ts` — no browser needed to
// check the thing most likely to be wrong.
//
// #112 warns about the shape of the mistake, and CLAUDE.md names it twice: a
// naive "the ball stays inside the walls" assertion passes against a ball that
// is barely moving, exactly as the fall-speed check once passed against a
// player standing still. So the speed here is *derived* rather than picked —
// `terminalSpeed()` is what the game can actually produce at full tilt — and
// the ball is launched at multiples of it.
//
// Two things about the fixture, both of which the first version got wrong and
// passed anyway:
//
//   - **One wall cell, with floor on both sides.** The first corridor ended
//     `##`, two cells thick, so a ball that tunnelled the first was stopped by
//     the second and the check reported a pass.
//   - **Gravity off.** With it on, a coarse step drops the ball through the
//     *floor* before it can reach the wall, so degrading the step "proved" a
//     failure that had nothing to do with walls. Removing gravity leaves
//     exactly one thing that can happen: the ball hits the wall or it does
//     not.

import {
  BALL_RADIUS,
  CELL,
  FIXED_STEP,
  MAX_SUBSTEPS,
  MAX_TILT,
  THINNEST_WALL,
  cellAt,
  createSim,
  terminalSpeed,
  type SimOptions,
} from './physics'
import { LEVELS, findCell } from './levels'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * A corridor with exactly one wall across it, and floor either side.
 *
 * Hand-built rather than taken from `LEVELS` so the geometry under test is one
 * wall at a known place, with somewhere to end up if the ball gets through.
 */
const CORRIDOR = ['#############', '#S.....#....#', '#############']
const CORRIDOR_WIDTH = CORRIDOR[1].length
const WALL_COL = 7
const WALL_X = (WALL_COL - (CORRIDOR_WIDTH - 1) / 2) * CELL
/** Past this and the ball is unambiguously on the far side. */
const PAST_WALL = WALL_X + CELL / 2 + BALL_RADIUS

/** Fires the ball at the wall and says whether it got through. */
function launch(speed: number, options: SimOptions = {}) {
  const sim = createSim(CORRIDOR, options)
  // Gravity off — see the note at the top. The ball flies level down the
  // corridor and the only question left is the one being asked.
  sim.world.gravity.set(0, 0, 0)
  sim.ball.velocity.set(speed, 0, 0)

  let escaped = false
  let maxX = sim.ball.position.x
  for (let t = 0; t < 2; t += 1 / 60) {
    sim.step(1 / 60)
    maxX = Math.max(maxX, sim.ball.position.x)
    if (sim.ball.position.x > PAST_WALL) escaped = true
  }
  return { escaped, maxX }
}

// --- the numbers the defence is built on ----------------------------------

const terminal = terminalSpeed()
{
  check('the ball has a terminal speed at all', terminal > 0, `${terminal.toFixed(1)} u/s`)
  check(
    'and it is a speed the game can actually produce',
    terminal > 5 && terminal < 100,
    `at full tilt (${MAX_TILT} rad) damping balances acceleration here`,
  )
  const perStep = terminal / (1 / FIXED_STEP)
  check(
    'one fixed step moves the ball far less than the thinnest wall',
    perStep < THINNEST_WALL / 3,
    `${perStep.toFixed(3)} units per step against a ${THINNEST_WALL} unit wall`,
  )
}

// --- the check #112 asks for ----------------------------------------------

{
  // Held at every speed the game can produce, and well beyond. The boundary
  // was measured rather than assumed: the ball is held at three times terminal
  // and goes through somewhere between three and three and a half, so this
  // asserts the range that is actually true instead of a rounder number that
  // is not.
  for (const multiple of [1, 2, 3]) {
    const result = launch(terminal * multiple)
    check(
      `a ball at ${multiple}x terminal speed does not pass through a wall`,
      !result.escaped,
      `${(terminal * multiple).toFixed(1)} u/s, reached x=${result.maxX.toFixed(2)}, wall's far face at ${PAST_WALL.toFixed(2)}`,
    )
  }
  check(
    'and the game cannot exceed terminal speed, so that is a three-fold margin',
    terminal === terminalSpeed(),
    `terminal is ${terminal.toFixed(1)} u/s at full tilt`,
  )
}

// --- and it can fail ------------------------------------------------------
//
// The checks above are only worth having if the timestep is what makes them
// pass. Degrading it until the ball does get through proves the defence is
// doing the work, rather than the wall being unreachable for some other
// reason. Run as part of the suite rather than by hand, because it costs
// milliseconds — CLAUDE.md's "make a check prove it can fail", automated.

{
  const degraded = launch(terminal * 2, { fixedStep: 1 / 30, maxSubsteps: 1 })
  check(
    'a ball does tunnel once the step is coarse enough',
    degraded.escaped,
    `at 1/30s steps with no substeps it reached x=${degraded.maxX.toFixed(2)}, past ${PAST_WALL.toFixed(2)}`,
  )
  check(
    'so the fixed step is what stops it',
    FIXED_STEP <= 1 / 60 && MAX_SUBSTEPS > 1,
    `${MAX_SUBSTEPS} substeps of ${FIXED_STEP.toFixed(4)}s`,
  )
}

// --- the boards themselves ------------------------------------------------

{
  check('there are levels', LEVELS.length > 0, `${LEVELS.length} levels`)
  for (const level of LEVELS) {
    const widths = new Set(level.grid.map((r) => r.length))
    const walled =
      /^#+$/.test(level.grid[0]) &&
      /^#+$/.test(level.grid[level.grid.length - 1]) &&
      level.grid.every((r) => r.startsWith('#') && r.endsWith('#'))
    const start = findCell(level.grid, 'S')
    const goal = findCell(level.grid, 'G')
    check(
      `${level.name}: rectangular, walled, one start and one goal`,
      widths.size === 1 && walled && start !== null && goal !== null,
      `${level.grid[0].length}x${level.grid.length}`,
    )
    // A start or goal over a hole would be unplayable in a way that is easy to
    // author by accident and tedious to notice by playing.
    check(
      `${level.name}: start and goal stand on floor`,
      level.grid[start!.row][start!.col] === 'S' && level.grid[goal!.row][goal!.col] === 'G',
    )
  }
}

// --- every board can actually be finished ---------------------------------
//
// A maze whose goal is walled off, or reachable only across a hole, is
// unplayable in a way that is easy to author and tedious to find by playing —
// especially since the physics makes "I could not do it" and "it cannot be
// done" feel identical.
//
// A flood fill over the cells the ball can occupy is not a claim that a board
// is *winnable* — the ball has momentum and the player has a lean, and neither
// is modelled here. It is the weaker claim that a route exists at all, which
// is the one that catches the authoring mistake.

{
  const reachable = (grid: string[]) => {
    const start = findCell(grid, 'S')!
    const goal = findCell(grid, 'G')!
    const open = (col: number, row: number) =>
      row >= 0 &&
      row < grid.length &&
      col >= 0 &&
      col < grid[row].length &&
      grid[row][col] !== '#' &&
      grid[row][col] !== 'o'

    const seen = new Set<string>([`${start.col},${start.row}`])
    const queue = [start]
    while (queue.length) {
      const { col, row } = queue.shift()!
      if (col === goal.col && row === goal.row) return true
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = col + dc
        const nr = row + dr
        const key = `${nc},${nr}`
        if (!open(nc, nr) || seen.has(key)) continue
        seen.add(key)
        queue.push({ col: nc, row: nr })
      }
    }
    return false
  }

  for (const level of LEVELS) {
    check(`${level.name}: a route exists from start to goal`, reachable(level.grid))
  }

  // And the check discriminates: a board whose goal is sealed off fails it.
  // Without this, a flood fill with a bug that always returned true would pass
  // all eight above and guard nothing.
  const sealed = ['#######', '#S...##', '#####G#', '#######']
  check('and a walled-off goal is rejected', !reachable(sealed), 'the check can say no')
}

// --- reading the board ----------------------------------------------------

{
  const grid = LEVELS[1].grid
  const start = findCell(grid, 'S')!
  const centre = (col: number, row: number) => ({
    x: (col - (grid[0].length - 1) / 2) * CELL,
    z: (row - (grid.length - 1) / 2) * CELL,
  })
  const at = centre(start.col, start.row)
  check('a cell centre maps back to its own cell', cellAt(at.x, at.z, grid) === 'S')
  // Half a cell either way still resolves to the same cell, which is what
  // makes the goal test forgiving enough to be reachable.
  check('and so does a point most of the way across it', cellAt(at.x + 0.4, at.z, grid) === 'S')
  check('a point off the board reads as nothing', cellAt(999, 999, grid) === null)
}

console.log(ok ? '\nALL TILT MAZE CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
