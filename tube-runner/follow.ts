// How Tube Runner's camera follows the runner round the tube (#145, #154).
//
// Pure arithmetic, apart from the game, so `follow_test.ts` can step it at
// any frame rate without a renderer.
//
// The camera trails the runner: they move across the screen the moment you
// steer, and the camera comes round after them. How it comes round is the
// whole feel of steering, because the tube fills the screen and the camera's
// turning is the tube's.
//
// It was an exponential catch-up with a hard cap. The catch-up alone would
// have let the runner get 0.72 rad ahead, so 0.1 s into every turn the cap cut
// in: the runner, crossing the screen at full speed, stopped dead, and the
// tube went from easing to spinning at full rate in one frame — a jump of
// 2.35 rad/s in the camera's speed, and the same again on release. That was
// the roughness players felt.
//
// It is a critically damped spring now. A spring has no cap to hit, so the
// camera's speed is continuous through press, hold and release. None of this
// touches `ROTATE_SPEED`: it moves the camera, never the runner.
import { ROTATE_SPEED } from './track'

/**
 * How far ahead of the camera the runner settles during a held turn, in
 * radians round the tube. On a phone that puts them about 0.44 of the way
 * from the middle of the screen to its edge; 0.45 rad put them under the
 * thumb holding that side.
 */
export const CAM_MAX_LAG = 0.25

/**
 * The spring's stiffness while a direction is held.
 *
 * Derived, not tuned: a critically damped spring trails a target moving at a
 * steady speed by twice that speed over its stiffness, so this is the one
 * value at which a runner turning at `ROTATE_SPEED` settles `CAM_MAX_LAG`
 * ahead.
 */
export const CAM_STIFFNESS = (2 * ROTATE_SPEED) / CAM_MAX_LAG

/**
 * The stiffness once the direction is let go, when the camera only has to
 * coast up to a runner who has stopped. Softer, so the runner drifts back to
 * the middle over about a third of a second rather than snapping there.
 */
export const CAM_RELEASE_STIFFNESS = 14

export interface Follow {
  /** The camera's angle minus the runner's: negative while it trails a positive turn. */
  offset: number
  /** The camera's own speed round the tube, radians per second. */
  velocity: number
}

/**
 * Advances the camera by `dt`, following a runner who moves at
 * `targetVelocity` throughout the step.
 *
 * `state.offset` is where the camera stands relative to the runner at the
 * *start* of the step; the result is relative to where the runner ends it.
 *
 * Stepped in closed form, and for a moving target. Measured against a
 * steadily moving runner the spring's rest point is not zero but
 * `-2 * targetVelocity / stiffness`, and about that point the motion is the
 * plain critically damped one. The first version solved for a runner standing
 * still within each step, which is right only as the step goes to zero: at
 * 12 frames a second the held turn settled 0.109 rad ahead instead of 0.25,
 * so the game felt different on a slow machine. `follow_test.ts` holds it to
 * the same curve from 240 frames a second down to 12.
 */
export function followStep(
  state: Follow,
  stiffness: number,
  dt: number,
  targetVelocity = 0,
): Follow {
  const rest = (-2 * targetVelocity) / stiffness
  const y = state.offset - rest
  const yd = state.velocity - targetVelocity
  const decay = Math.exp(-stiffness * dt)
  const drift = (yd + stiffness * y) * dt
  return {
    offset: (y + drift) * decay + rest,
    velocity: (yd - stiffness * drift) * decay + targetVelocity,
  }
}
