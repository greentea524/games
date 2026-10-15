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
 * Damping used to stand in for rolling resistance, which cannon-es does not
 * model, and it stood in badly (#146): damping takes a *fraction* of the
 * speed each second, so a ball never stops, it creeps. Every putt, at any
 * power, ended in about 3.5 s of a ball barely moving before the game would
 * let you strike again. `ROLLING_DECEL` below is the real thing — a constant
 * deceleration that brings the ball to an actual stop — and these are now
 * lowered to keep the range the holes were built around.
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
 * the game becomes unaimable. With `ROLLING_DECEL` these settle at 12.2
 * units at full power — 12.0 before #146 — which clears the longest authored
 * line with enough left over that no hole needs a maximum stroke.
 *
 * Measure with an unbounded green if you change them. A 14-unit hole clips a
 * ball that would have rolled further, and the wall reads as the ball's range.
 */
const LINEAR_DAMPING = 0.08
const ANGULAR_DAMPING = 0.55

/**
 * Rolling resistance: a constant deceleration, in world units per second
 * squared, applied while the ball is touching a green (#146).
 *
 * Constant is the point. It takes the same speed off a slow ball as a fast
 * one, so the last metre ends in a stop instead of the ever-slower creep that
 * damping alone produced: measured on a flat green, the wait from 1 u/s to
 * "you can putt again" fell from 3.56 s to about 1.7 s, at every power.
 * Raising the green's contact friction was the obvious idea and does nothing
 * at all — cannon-es applies friction to a sliding ball, and these roll.
 *
 * **It applies on level greens only.** The at-rest detector is right only if
 * a ball on the gentlest authored ramp keeps accelerating, and resistance
 * takes away from that. Applied everywhere, it broke the detector at the
 * values #146 proposed: released from a dead stop on a `MIN_SLOPE` ramp, a
 * ball under 0.4 sat "still" for 0.45 s against a 0.35 s window and was called
 * at rest halfway down — and 0.3 failed too. A ball can never rest on a ramp,
 * so the creep this removes only ever happened on the flat anyway.
 * `rest_test.ts` releases a ball on that ramp, and stages resistance on ramps
 * to watch the detector break.
 */
export const ROLLING_DECEL = 0.4

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
 * author gathers speed at `ROLL_ACCEL`, so it climbs from a dead stop past
 * the still thresholds in `STILL_SPEED / ROLL_ACCEL` seconds. Wait longer
 * than that and a ball on any authored slope is guaranteed to break a
 * threshold before the timer completes — so the detector cannot mistake
 * "rolling slowly downhill" for "stopped".
 *
 * Until #146 this used the full `GRAVITY * sin(MIN_SLOPE)` and `REST_SPEED`,
 * which describes a sliding block. A rolling ball gets 5/7 of that
 * acceleration — the rest goes into spin — and crosses the spin threshold
 * (`REST_SPIN * BALL_RADIUS`, 0.176 u/s) before the speed one. Measured, the
 * stated 2.2x margin was really 1.6x: a ball stopped dead on the gentlest
 * ramp stayed still for 0.217 s against a 0.353 s window. The window is 0.395 s
 * now, and the margin is what it says.
 *
 * The margin is what makes it robust rather than exactly-just-barely: damping
 * shaves the real acceleration slightly below the ideal, and a ball can be
 * moving *uphill* and genuinely pause at the top.
 *
 * `rest_test.ts` asserts the relationship rather than the number, so changing
 * `MIN_SLOPE`, `REST_SPEED` or gravity moves this and stays correct.
 */
export const REST_MARGIN = 2.2
/** How fast a rolling ball gathers speed on the gentlest authored slope. */
export const ROLL_ACCEL = (5 / 7) * GRAVITY * Math.sin(MIN_SLOPE)
/** The speed a rolling ball reaches when the first still threshold breaks. */
export const STILL_SPEED = Math.min(REST_SPEED, REST_SPIN * BALL_RADIUS)
export const REST_TIME = (STILL_SPEED / ROLL_ACCEL) * REST_MARGIN

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
  /** Overridable so the tests can compare with and without it (#146). */
  rollingDecel?: number
  /** Apply it on ramps too — the defect `rest_test.ts` stages, never the game. */
  rollingOnRamps?: boolean
}

export function createSim(hole: Hole, options: SimOptions = {}): Sim {
  const {
    restSpeed = REST_SPEED,
    restSpin = REST_SPIN,
    restTime = REST_TIME,
    rollingDecel = ROLLING_DECEL,
    rollingOnRamps = false,
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

  /** The level greens: the only surfaces that apply rolling resistance. */
  const flatGreens = new Set<Body>()
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
    if (box.surface === 'green' && (rollingOnRamps || !(box.tiltX || box.tiltZ))) {
      flatGreens.add(body)
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

  // Rolling resistance, after every fixed physics step rather than every
  // rendered frame, so it takes the same speed off at 10 frames a second as at
  // 60. Spin is scaled with speed, so the ball keeps rolling rather than
  // skidding as it slows.
  //
  // **Level greens only.** A ball can never come to rest on a ramp — that is
  // what the at-rest detector is built on — so the creep #146 is about only
  // ever happens on the flat. On a ramp, resistance would only eat into the
  // acceleration the detector depends on: released from a dead stop on the
  // gentlest one, a ball under 0.4 u/s^2 stayed "still" for 0.45 s against a
  // 0.35 s window, and was called at rest halfway down the slope.
  world.addEventListener('postStep', () => {
    if (rollingDecel <= 0) return
    const onFlat = world.contacts.some(
      (c) => (c.bi === ball && flatGreens.has(c.bj)) || (c.bj === ball && flatGreens.has(c.bi)),
    )
    if (!onFlat) return
    const speed = ball.velocity.length()
    if (speed < 1e-6) return
    const k = Math.max(0, 1 - (rollingDecel * FIXED_STEP) / speed)
    ball.velocity.scale(k, ball.velocity)
    ball.angularVelocity.scale(k, ball.angularVelocity)
  })

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
      ball.position.set(hole.tee.x, (hole.tee.y ?? 0) + BALL_RADIUS + 0.02, hole.tee.z)
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
