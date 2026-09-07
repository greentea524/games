// Tilt Maze's simulation (#112).
//
// ## Why cannon-es
//
// #112 asked for both candidates to be measured before committing. Bundling a
// minimal "one sphere, two static boxes, one step" program with esbuild:
//
//   cannon-es                    80 kB minified,    23 kB gzipped
//   @dimforge/rapier3d-compat  2786 kB minified,  1059 kB gzipped
//
// Rapier is 46 times larger gzipped, and 94% of that bundle is one inlined
// base64 WASM blob. For scale, the whole Phaser chunk the five 2D games share
// is 1198 kB gzipped: a physics engine for a single rolling marble would have
// cost about as much as the entire 2D game framework.
//
// The second reason would have settled it at equal size. Rapier reaches its
// WASM through `WebAssembly.instantiate`, which under a Content-Security-Policy
// requires `'wasm-unsafe-eval'` in `script-src`. The policy #101 introduced and
// #108 tightened is `'self'` plus a single hash and nothing else, and
// `npm run qa:csp` exists to keep it that way.
//
// cannon-es is adequate here for the reason the issue gives: this is one
// sphere on static boxes, and nothing below needs a solver that could do more.
//
// ## Why tilt is a rotated gravity vector
//
// The choice was between rotating the static world so the board visibly leans,
// and rotating gravity, which is simpler and avoids re-baking colliders.
//
// This does both and keeps the simple physics. Gravity is rotated — so no
// collider ever moves and the simulation stays the trivial static-geometry
// case cannon-es is good at — and the renderer leans a group containing the
// board *and* the ball by the same angle. Rotating both preserves their
// relative positions exactly, so what the player sees is a board tipping under
// a marble. The tilt exists once, as an angle; the physics and the view are
// two readings of it.
import { Body, Box, ContactMaterial, GSSolver, Material, Sphere, Vec3, World } from 'cannon-es'
import { findCell, type Cell } from './levels'

/** A cell is one world unit across. */
export const CELL = 1

export const BALL_RADIUS = 0.22
export const WALL_HEIGHT = 0.55
export const FLOOR_THICKNESS = 0.25

/**
 * The thinnest solid thing the ball can be thrown at.
 *
 * A wall occupies a whole cell, so this is the cell size — and it is the
 * number the tunnelling argument below is measured against. Stated separately
 * from `CELL` because it is a *claim about collision*, and if walls ever stop
 * being full cells this is what has to change with them.
 */
export const THINNEST_WALL = CELL

export const GRAVITY = 20

/**
 * The most the board may lean, in radians.
 *
 * Roughly 20 degrees. Too little and the game is inert; too much and the ball
 * is uncontrollable and fast enough to be a tunnelling risk. This is the one
 * number worth re-tuning by feel, and everything below is derived from it
 * rather than tuned alongside it.
 */
export const MAX_TILT = 0.35

/** How fast the board leans toward the angle being asked for, per second. */
export const TILT_RATE = 2.4
/** And how fast it returns to level when nothing is held. */
export const TILT_RETURN = 3.2

const LINEAR_DAMPING = 0.3
const ANGULAR_DAMPING = 0.35

/**
 * The fastest the ball can go under its own steam, in world units per second.
 *
 * Derived, because the tunnelling argument depends on it and a guessed number
 * would make that argument worthless. At full tilt the ball accelerates at
 * `GRAVITY * sin(MAX_TILT)` and damping removes velocity in proportion to
 * speed, so the two balance at `a / damping`.
 *
 * `tilt_test.ts` launches at a multiple of this, which is the only honest way
 * to test the defence: a ball at a speed the game cannot produce proves the
 * margin, and one at a speed it can barely reach proves nothing.
 */
export function terminalSpeed(): number {
  return (GRAVITY * Math.sin(MAX_TILT)) / LINEAR_DAMPING
}

/**
 * Fixed physics timestep, and the most substeps one frame may spend catching
 * up.
 *
 * This is the *entire* tunnelling defence. cannon-es integrates discretely: a
 * ball moving `v` jumps `v * dt` between collision tests, and if that jump
 * exceeds `THINNEST_WALL` it is on the far side before anything noticed. At
 * 1/120 a ball at terminal speed moves 0.19 of a cell per step, and the
 * substep cap means a slow frame is caught up in fixed steps rather than by
 * taking one enormous one — which is the case that actually tunnels.
 *
 * Measured, in `tilt_test.ts`: a ball fired at a wall is held up to three
 * times terminal speed and goes through somewhere between three and three and
 * a half. The game cannot exceed terminal, so that is a three-fold margin over
 * anything it can produce.
 *
 * There is no second line of defence. cannon-es exposes `ccdSpeedThreshold`
 * and `ccdIterations` on a body and they were set here at first, described as
 * swept-sphere testing that would catch what the step missed. They were
 * measured and they do *nothing*: on and off give bit-identical results at
 * every speed from one to four times terminal, and the boundary sits at the
 * same place either way. They have been removed rather than left in place
 * looking like protection, because the danger of a setting that does nothing
 * is that someone later loosens the timestep trusting it.
 */
export const FIXED_STEP = 1 / 120
export const MAX_SUBSTEPS = 8

/** Speed below which the ball counts as settled. */
export const REST_SPEED = 0.9
/** Consecutive seconds under `REST_SPEED` before the goal counts as reached. */
export const REST_TIME = 0.25

export interface Sim {
  world: World
  ball: Body
  /** Advances by `dt` seconds, substepping at `FIXED_STEP`. */
  step(dt: number): void
  /** Points gravity as though the board were leaning by these angles. */
  setTilt(tiltX: number, tiltZ: number): void
  /** True once the ball has dropped below the board. */
  fallen(): boolean
  /** Puts the ball back at the level's start with no velocity. */
  reset(): void
}

/** World position of the centre of grid cell (col, row). */
export function cellCentre(col: number, row: number, grid: string[]): { x: number; z: number } {
  return {
    x: (col - (grid[0].length - 1) / 2) * CELL,
    z: (row - (grid.length - 1) / 2) * CELL,
  }
}

/**
 * Which cell a world position is over, or null when it is off the board.
 *
 * Used for the goal test rather than a trigger volume, because the ball has to
 * be *resting* on the goal: a trigger fires the instant it is overlapped, and
 * would clear a level the ball was about to roll straight off the far side of.
 */
export function cellAt(x: number, z: number, grid: string[]): Cell | null {
  const col = Math.round(x / CELL + (grid[0].length - 1) / 2)
  const row = Math.round(z / CELL + (grid.length - 1) / 2)
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[row].length) return null
  return grid[row][col] as Cell
}

export interface SimOptions {
  /** Overridable so `tilt_test.ts` can degrade them and watch a wall fail. */
  fixedStep?: number
  maxSubsteps?: number
}

/**
 * Builds the world for a grid.
 *
 * Every collider here is static and built once. That is the whole reason
 * gravity is what tilts: nothing in this function runs again when the player
 * leans.
 */
export function createSim(grid: string[], options: SimOptions = {}): Sim {
  const { fixedStep = FIXED_STEP, maxSubsteps = MAX_SUBSTEPS } = options

  const world = new World({ gravity: new Vec3(0, -GRAVITY, 0) })
  // A little above the default. One sphere on static boxes is a cheap solve,
  // and the extra iterations buy a ball that does not sink into the corner
  // where two walls meet. Constructed rather than assigned through
  // `world.solver.iterations`: the base `Solver` type has no such property, so
  // that line only typechecks behind a cast that would be hiding the fact that
  // it is a `GSSolver` feature.
  const solver = new GSSolver()
  solver.iterations = 12
  world.solver = solver

  const ballMaterial = new Material('ball')
  const boardMaterial = new Material('board')
  world.addContactMaterial(
    new ContactMaterial(ballMaterial, boardMaterial, {
      // A marble on a wooden board, not a rubber ball. Restitution much above
      // this makes a ball that has rolled into a wall rattle back across the
      // level, which reads as the game fighting the player.
      friction: 0.1,
      restitution: 0.12,
    }),
  )

  const half = CELL / 2
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const cell = grid[row][col] as Cell
      const { x, z } = cellCentre(col, row, grid)

      // A hole is the absence of floor. Everything else has floor under it,
      // the goal included — the goal is somewhere to stop, not to fall
      // through, which is what separates it from a hole.
      if (cell !== 'o') {
        world.addBody(
          new Body({
            mass: 0,
            material: boardMaterial,
            shape: new Box(new Vec3(half, FLOOR_THICKNESS / 2, half)),
            position: new Vec3(x, -FLOOR_THICKNESS / 2, z),
          }),
        )
      }

      if (cell === '#') {
        world.addBody(
          new Body({
            mass: 0,
            material: boardMaterial,
            shape: new Box(new Vec3(half, WALL_HEIGHT / 2, half)),
            position: new Vec3(x, WALL_HEIGHT / 2, z),
          }),
        )
      }
    }
  }

  const ball = new Body({
    mass: 1,
    material: ballMaterial,
    shape: new Sphere(BALL_RADIUS),
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
  })
  world.addBody(ball)

  const start = findCell(grid, 'S')
  const startAt = start ? cellCentre(start.col, start.row, grid) : { x: 0, z: 0 }

  const sim: Sim = {
    world,
    ball,
    step(dt) {
      world.step(fixedStep, dt, maxSubsteps)
    },
    setTilt(tiltX, tiltZ) {
      // Gravity in the board's frame: straight down, rotated by the lean. Not
      // the small-angle shortcut — full tilt is exactly where that is wrong.
      const gx = Math.sin(tiltX) * Math.cos(tiltZ)
      const gz = Math.sin(tiltZ)
      const gy = -Math.cos(tiltX) * Math.cos(tiltZ)
      world.gravity.set(gx * GRAVITY, gy * GRAVITY, gz * GRAVITY)
    },
    fallen() {
      return ball.position.y < -2.5
    },
    reset() {
      ball.position.set(startAt.x, BALL_RADIUS + 0.02, startAt.z)
      ball.velocity.setZero()
      ball.angularVelocity.setZero()
      ball.force.setZero()
      ball.torque.setZero()
      ball.wakeUp()
      world.gravity.set(0, -GRAVITY, 0)
    },
  }

  sim.reset()
  return sim
}
