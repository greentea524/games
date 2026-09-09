// How much of the world the camera has to show (#110, #119).
//
// Its own module, with no three.js in it, because the number it produces is
// the one that decides whether the game is playable on a shape of screen — and
// a number like that should be derived and checked rather than tuned until the
// window you happen to have looks right.
//
// The GameBoy build never needed this: one aspect ratio, one frustum, sized by
// eye and correct for ever. On a canvas that is whatever shape the window is,
// sizing the frustum in one dimension gets the other one wrong. Holding the
// height — which is what `shared/stage3d.ts`'s `track` does, and the right
// answer for a game whose action is vertical — gives a frustum 1.66 world
// units wide on a 390x844 phone, against a slide that needs 3.04. The block
// would leave the screen at both ends of every pass.
import { SLIDE_RANGE } from './stack'

/** Camera direction from its target. Sees the +X, +Y and +Z faces. */
export const VIEW_DIR = { x: 1, y: 0.867, z: 1 }

/** Half the base block, which is the widest slab a tower ever has. */
const BASE_HALF = 0.5

/**
 * The half-width, in world units along the camera's right axis, that the
 * sliding block reaches at the far end of its travel.
 *
 * Under an orthographic camera the screen-x of a point is its dot product with
 * the camera's right vector, and that vector is horizontal — the cross product
 * of the view direction with world up — so the block's height does not enter
 * into it. What is left is the widest of the base block's corners at either
 * end of either axis of slide.
 */
export function neededHalfWidth(viewDir = VIEW_DIR, slide = SLIDE_RANGE, half = BASE_HALF): number {
  // right = normalize(forward x up), with forward = -viewDir and up = +Y.
  // Written out rather than done with a vector library: it is four lines, and
  // the test that checks the result should not share a bug with it.
  const rx = viewDir.z
  const rz = -viewDir.x
  const length = Math.hypot(rx, rz)
  if (length === 0) return Infinity
  const ux = rx / length
  const uz = rz / length

  let widest = 0
  for (const along of ['x', 'z'] as const) {
    for (const end of [-1, 1]) {
      for (const cx of [-half, half]) {
        for (const cz of [-half, half]) {
          const px = (along === 'x' ? end * slide : 0) + cx
          const pz = (along === 'z' ? end * slide : 0) + cz
          widest = Math.max(widest, Math.abs(px * ux + pz * uz))
        }
      }
    }
  }
  return widest
}

/**
 * What the camera actually shows, as half-extents in world units.
 *
 * The width carries a margin over `neededHalfWidth` so a block at the far end
 * of its travel is not flush against the edge of the frame — a decision made
 * at the exact instant the thing you are deciding about touches the bezel is a
 * decision made half blind.
 */
export const HALF_WIDTH = neededHalfWidth() * 1.06
export const HALF_HEIGHT = 1.8

/**
 * The frustum for a canvas of this shape: whichever half-extent is binding
 * wins, so a narrow window shows more sky and a wide one shows more to the
 * sides, and neither ever crops the slide.
 */
export function frustumFor(width: number, height: number): { halfWidth: number; halfHeight: number } {
  const aspect = height > 0 ? width / height : 1
  return {
    halfWidth: Math.max(HALF_WIDTH, HALF_HEIGHT * aspect),
    halfHeight: Math.max(HALF_HEIGHT, HALF_WIDTH / Math.max(aspect, 1e-6)),
  }
}
