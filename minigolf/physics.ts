// Minigolf's simulation and its at-rest detector (#113).
//
// cannon-es, settled in #112 with measurements and unchanged here: a rolling
// sphere on static geometry is the same simulation, and the reasons — 23 kB
// gzipped against Rapier's 1059 kB, and no `'wasm-unsafe-eval'` in the CSP —
// do not depend on which game is asking.
//
// The interesting part is `atRest`. #113 calls stopping the hard part, and it
// is: real golf balls settle, simulated ones creep for ever because rolling
// resistance is not modelled and a solver never quite reaches zero. Worse, the
// obvious fix is wrong in a way that is hard to see — "speed below a
// threshold" is also true of a ball rolling *slowly down a ramp*, which has
// not stopped and is about to speed up.
import { Body, Box, ContactMaterial, GSSolver, Material, Quaternion, Sphere, Vec3, World } from 'cannon-es'
import { HOLES, MIN_SLOPE, type Hole } from './holes'

export const GRAVITY = 9.82
export const BALL_RADIUS = 0.16

/**
 * Damping stands in for rolling resistance, which cannon-es does not model.
 *
 * Both numbers are calibrated against one measurement — how far a full-power
 * putt rolls on an unbounded flat green — because that distance is what
 * decides whether a hole is playable, and the first draft's (0.5, 0.7) stopped
 * the ball after 7.2 units on a course whose shortest hole is 9. Every stroke
 * on `Rise` died halfway to the ramp.
 *
 * Angular damping is the stronger lever of the two, and the fragile one: the
 * ball rolls, so spin is where most of its energy lives. Below about 0.5 it
 * stops rolling cleanly and starts hopping, at which point distance is no
 * longer monotonic in power — a three-quarter putt outruns a full one — and
 * the game becomes unaimable. These settle at 12.0 units at full power, which
 * clears the longest authored line with enough left over that no hole needs a
 * maximum stroke.
 *
 * Measure with an unbounded green if you change them. A 14-unit hole clips a
 * ball that would have rolled further, and the wall reads as the ball's range.
 */
const LINEAR_DAMPING = 0.25
const ANGULAR_DAMPING = 0.6

/** The hardest a putt can be struck, in world units per second. */
export const MAX_PUTT_SPEED = 11

/**
 * Below this speed the ball counts as a candidate for having stopped.
 *
 * Only a candidate: see `REST_TIME`. On its own this number says nothing,
 * because a ball easing down a gentle ramp passes under it every time.
 */
export const REST_SPEED = 0.22
/** And the same for spin, so a ball rotating on the spot is not called still. */
export const REST_SPIN = 1.1

/**
 * How long the ball must stay slow before it counts as stopped.
 *
 * **Derived, not chosen.** A ball released on the gentlest slope the holes
 * author accelerates at `GRAVITY * sin(MIN_SLOPE)`, so it climbs from a dead
 * stop through `REST_SPEED` in `REST_SPEED / (GRAVITY * sin(MIN_SLOPE))`
 * seconds. Wait longer than that and a ball on any authored slope is
 * guaranteed to break the threshold before the timer completes — so the
 * detector cannot mistake "rolling slowly downhill" for "stopped".
 *
 * The margin is what makes it robust rather than exactly-just-barely: damping
 * shaves the real acceleration slightly below the ideal, and a ball can be
 * moving *uphill* and genuinely pause at the top.
 *
 * `rest_test.ts` asserts the relationship rather than the number, so changing
 * `MIN_SLOPE`, `REST_SPEED` or gravity moves this and stays correct.
 */
export const REST_MARGIN = 2.2
export const REST_TIME = (REST_SPEED / (GRAVITY * Math.sin(MIN_SLOPE))) * REST_MARGIN

/** Horizontal distance within which a slow ball drops into the cup. */
export const CUP_RADIUS = 0.3
/** And the speed it has to be under. Faster than this and it laps the rim. */
export const CUP_SPEED = 2.4

export interface Sim {
  world: World
  ball: Body
  /** Advances by `dt`, substepping at a fixed rate. */
  step(dt: number): void
  /** Strikes the ball. `dirX`/`dirZ` need not be normalised. */
  putt(dirX: number, dirZ: number, power: number): void
  /** Places the ball at the tee with no motion. */
  tee(): void
  /** True once the ball has been slow for `REST_TIME` without interruption. */
  atRest(): boolean
  /** Seconds the ball has been continuously below the rest thresholds. */
  stillFor(): number
  /** True when the ball is over the cup and slow enough to drop. */
  holed(): boolean
  /** True when the ball has fallen off the course. */
  offCourse(): boolean
}

const FIXED_STEP = 1 / 120
const MAX_SUBSTEPS = 8

export interface SimOptions {
  /**
   * Overridable so `rest_test.ts` can degrade the detector and watch it
   * misfire. Nothing in the game passes these.
   */
  restSpeed?: number
  restSpin?: number
  restTime?: number
}

export function createSim(hole: Hole, options: SimOptions = {}): Sim {
  const {
    restSpeed = REST_SPEED,
    restSpin = REST_SPIN,
    restTime = REST_TIME,
  } = options

  const world = new World({ gravity: new Vec3(0, -GRAVITY, 0) })
  const solver = new GSSolver()
  solver.iterations = 12
  world.solver = solver

  const ballMaterial = new Material('ball')
  const greenMaterial = new Material('green')
  const wallMaterial = new Material('wall')
  world.addContactMaterial(
    new ContactMaterial(ballMaterial, greenMaterial, { friction: 0.28, restitution: 0.16 }),
  )
  world.addContactMaterial(
    // Walls are there to be banked off, so they keep more of the ball's speed
    // than the green does. Much above this and the Elbow's corner becomes a
    // pinball table.
    new ContactMaterial(ballMaterial, wallMaterial, { friction: 0.06, restitution: 0.5 }),
  )

  for (const box of hole.boxes) {
    const body = new Body({
      mass: 0,
      material: box.surface === 'wall' ? wallMaterial : greenMaterial,
      shape: new Box(new Vec3(box.w / 2, box.h / 2, box.d / 2)),
      position: new Vec3(box.x, box.y, box.z),
    })
    if (box.tiltX || box.tiltZ) {
      const q = new Quaternion()
      q.setFromEuler(box.tiltX ?? 0, 0, box.tiltZ ?? 0)
      body.quaternion.copy(q)
    }
    world.addBody(body)
  }

  const ball = new Body({
    mass: 0.045,
    material: ballMaterial,
    shape: new Sphere(BALL_RADIUS),
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
  })
  world.addBody(ball)

  let still = 0

  const sim: Sim = {
    world,
    ball,
    step(dt) {
      world.step(FIXED_STEP, dt, MAX_SUBSTEPS)
      // The timer is the detector. It counts *consecutive* slow time and is
      // reset by a single fast frame, which is what makes a ball that dips
      // under the threshold on its way down a ramp fail to qualify.
      if (ball.velocity.length() < restSpeed && ball.angularVelocity.length() < restSpin) {
        still += dt
      } else {
        still = 0
      }
    },
    putt(dirX, dirZ, power) {
      const length = Math.hypot(dirX, dirZ)
      if (length < 1e-6) return
      const speed = Math.max(0, Math.min(1, power)) * MAX_PUTT_SPEED
      ball.wakeUp()
      ball.velocity.set((dirX / length) * speed, 0, (dirZ / length) * speed)
      still = 0
    },
    tee() {
      ball.position.set(hole.tee.x, BALL_RADIUS + 0.02, hole.tee.z)
      ball.velocity.setZero()
      ball.angularVelocity.setZero()
      ball.force.setZero()
      ball.torque.setZero()
      ball.wakeUp()
      still = 0
    },
    atRest: () => still >= restTime,
    stillFor: () => still,
    holed() {
      const dx = ball.position.x - hole.cup.x
      const dz = ball.position.z - hole.cup.z
      // Height matters: on the Rise, the cup is on the upper green and a ball
      // still on the lower one can be directly beneath it.
      const dy = Math.abs(ball.position.y - (hole.cup.y + BALL_RADIUS))
      return (
        Math.hypot(dx, dz) < CUP_RADIUS && dy < 0.5 && ball.velocity.length() < CUP_SPEED
      )
    },
    offCourse: () => ball.position.y < -3,
  }

  sim.tee()
  return sim
}

/** Every hole, for the scorecard and the tests. */
export const COURSE = HOLES
