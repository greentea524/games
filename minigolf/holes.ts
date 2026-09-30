// Minigolf's nine holes, as data (#113, #141).
//
// Everything is a box. A green is a flat box the ball rolls on, a ramp is the
// same box tilted, a wall is a taller one it bounces off. That is the whole
// vocabulary, and it is deliberate: #113's scope guard says this issue sprawls
// through level authoring rather than through code, so the authoring stays
// cheap enough that a hole is a morning and not a fortnight. #141 grew the
// course from three holes to nine without adding a primitive — the one helper
// it added, `mirrorZ`, reuses `ramp` rather than replacing it.
//
// No heightmaps, no curves, no meshes loaded from files.
//
// The cost of that cheapness is that a hole can be *drawn* correctly and still
// be unplayable, because nothing about a list of boxes says the ball can get
// from the tee to the cup. Every defect this file has had was of that shape —
// a rail too short for the green it guards, a wall laid across the leg it was
// meant to edge, a ramp meeting a plateau's side instead of its top — and all
// three rendered perfectly. `course_test.ts` is what actually holds this file
// honest: it plays every hole and fails if one cannot be finished.

export type Surface = 'green' | 'wall'

export interface Box {
  /** Centre, in world units. */
  x: number
  y: number
  z: number
  /** Full extents. */
  w: number
  h: number
  d: number
  /** Tilt about the x and z axes, radians. A ramp is a green with one set. */
  tiltX?: number
  tiltZ?: number
  surface: Surface
}

export interface Hole {
  name: string
  par: number
  /**
   * Where the ball is teed, on the surface. `y` is the height of the green it
   * sits on, for a hole that starts on a raised one (#141); it defaults to 0.
   */
  tee: { x: number; z: number; y?: number }
  /** Centre of the cup. The ball drops when it is over this and slow. */
  cup: { x: number; y: number; z: number }
  boxes: Box[]
}

/** Thickness of a green slab, and the default height of a boundary wall. */
const GREEN_H = 0.4
const WALL_H = 0.5

/** A flat green slab with its top surface at `y`. */
function green(x: number, z: number, w: number, d: number, y = 0): Box {
  return { x, y: y - GREEN_H / 2, z, w, h: GREEN_H, d, surface: 'green' }
}

/**
 * A wall rising `h` from a floor at `y`.
 *
 * The height is a parameter because a rail that runs alongside a ramp has two
 * floors to guard: `Rise`'s side rails were authored at the default height on
 * the lower green, which left the raised green — a metre above them — with no
 * edge at all, and a ball that drifted wide simply fell off the course.
 */
function wall(x: number, z: number, w: number, d: number, y = 0, h = WALL_H): Box {
  return { x, y: y + h / 2, z, w, h, d, surface: 'wall' }
}

/**
 * The gentlest slope any hole authors, in radians.
 *
 * The at-rest detector's timing is derived from this — see `REST_TIME` in
 * `physics.ts`. A shallower ramp than this would accelerate the ball so slowly
 * that a ball genuinely rolling down it could sit under the rest threshold for
 * longer than the detector waits, and be called stopped while still moving.
 *
 * So this is a constraint on authoring, not a description of it: add a
 * shallower ramp and `rest_test.ts` fails, which is the intended outcome.
 */
export const MIN_SLOPE = 0.14

/** The steepest, for the test that drives a ball down it. */
export const MAX_SLOPE = 0.24

/**
 * How high the raised green on `Rise` sits above the lower one.
 *
 * Set by measurement, not by taste. At 1.2 no stroke could climb it at all; at
 * 1.0 a maximum-power putt struck perfectly straight crested and rolled back,
 * which is worse than impossible — it looks like the player's fault. The hole
 * wants headroom: full power should clear the crest with speed to spare, and
 * about three-quarter power should be the least that gets up at all.
 */
export const RISE_HEIGHT = 0.8

/** The horizontal distance a ramp of `height` covers at `slope`. */
export function rampRun(height: number, slope: number): number {
  return height / Math.tan(slope)
}

/**
 * A ramp climbing `height` at `slope`, in the -z direction, from a foot at
 * (`zFoot`, `yFoot`) to a crest at (`zFoot - rampRun(...)`, `yFoot + height`).
 *
 * **The crest lands exactly on the plateau's near edge, and that is the whole
 * point of computing this rather than eyeballing it.** A ramp authored by eye
 * gets one of two things wrong, and both are invisible until you drive a ball
 * at them:
 *
 *   - too short, and it stops below the plateau, leaving a gap in the course;
 *   - too long, and it reaches the plateau's *height* before it reaches the
 *     plateau's *edge* — so the plateau's 0.4-unit side face is left standing
 *     in the ball's path as an unmarked wall, part-way up the climb.
 *
 * The second is what shipped. The hole rendered as a clean ramp to a raised
 * green, and the ball bounced backwards off thin air.
 *
 * `skirt` extends the box *downhill only*, burying its foot under the lower
 * green so the two overlap instead of meeting at a seam. It cannot be applied
 * at the crest: uphill, extra length is extra height, which rebuilds exactly
 * the lip this is here to avoid.
 */
function ramp(
  x: number,
  w: number,
  zFoot: number,
  yFoot: number,
  height: number,
  slope: number,
  skirt = 1.4,
): Box {
  const run = rampRun(height, slope)
  const c = Math.cos(slope)
  const s = Math.sin(slope)
  const footZ = zFoot + skirt * c
  const footY = yFoot - skirt * s
  const crestZ = zFoot - run
  const crestY = yFoot + height
  const midZ = (footZ + crestZ) / 2
  const midY = (footY + crestY) / 2
  return {
    x,
    // The box centre sits half a slab below the surface, along the surface
    // normal — which tilts with the ramp, so this is not just `midY - h/2`.
    y: midY - (GREEN_H / 2) * c,
    z: midZ - (GREEN_H / 2) * s,
    w,
    h: GREEN_H,
    d: skirt + Math.hypot(run, height),
    tiltX: slope,
    surface: 'green',
  }
}

/**
 * Rails alongside a ramp, as a staircase of ordinary upright boxes.
 *
 * A single rail tall enough to guard both ends of a ramp is correct and looks
 * wrong: it is a flat-topped wall a metre and a half high running the length
 * of the hole, and it hides the one thing the hole is about. With the rails
 * stepping up beside the ramp, the climb is legible from the camera's angle
 * before the ball has moved — which matters, because reading the slope *is*
 * the skill this hole tests.
 *
 * Upright boxes rather than tilted ones, so the ball never meets a sloped
 * wall: each step is based at the height of its own lower end and stands
 * `WALL_H` clear of its upper one, so no part of the ramp it covers is
 * unguarded. Steps overlap slightly for the same reason the ramp has a skirt.
 */
function rampRails(
  x: number,
  w: number,
  zFoot: number,
  yFoot: number,
  height: number,
  slope: number,
  steps = 4,
): Box[] {
  const run = rampRun(height, slope)
  const out: Box[] = []
  for (let i = 0; i < steps; i++) {
    const zNear = zFoot - (i * run) / steps
    const zFar = zFoot - ((i + 1) * run) / steps
    out.push(
      wall(
        x,
        (zNear + zFar) / 2,
        w,
        zNear - zFar + 0.02,
        yFoot + (i * height) / steps,
        WALL_H + height / steps,
      ),
    )
  }
  return out
}

/**
 * Reflects a piece of a hole through z = 0.
 *
 * `ramp` climbs toward -z and nothing else, and every hole before #141 needed
 * no other direction. A hole that *descends* from the tee, or climbs back
 * toward the camera, needs the opposite, and a second ramp builder would be a
 * second place for the crest-meets-the-plateau arithmetic to go wrong. So a
 * piece is authored climbing the usual way and mirrored: z is negated, and so
 * is the tilt, because reflecting in z reverses a rotation about x.
 */
function mirrorZ(box: Box): Box {
  return { ...box, z: -box.z, tiltX: box.tiltX === undefined ? undefined : -box.tiltX }
}

/**
 * `Drop`: the tee is on a raised green and the course falls away from it.
 * Gentler than `Rise`'s ramp, because going down the danger is too much speed
 * rather than too little.
 */
export const DROP_HEIGHT = 0.8
const DROP_SLOPE = 0.2
const DROP_RUN = rampRun(DROP_HEIGHT, DROP_SLOPE)

/** `Shelf` and `Summit`: a lower step than `Rise`, reached by a narrower ramp. */
export const SHELF_HEIGHT = 0.6
const SHELF_RUN = rampRun(SHELF_HEIGHT, MAX_SLOPE)

/** Where `Rise`'s ramp crests, and so where its raised green has to begin. */
const RISE_CREST_Z = -rampRun(RISE_HEIGHT, MAX_SLOPE)

export const HOLES: Hole[] = [
  {
    name: 'Opener',
    par: 2,
    // Straight, walled, nothing in the way. It teaches the drag and the
    // distance the ball travels for a given pull, which every later hole
    // assumes you know.
    tee: { x: 0, z: 4.5 },
    cup: { x: 0, y: 0, z: -4.5 },
    boxes: [
      green(0, 0, 4, 12),
      wall(-2.2, 0, 0.4, 12),
      wall(2.2, 0, 0.4, 12),
      wall(0, -6.2, 4.8, 0.4),
      wall(0, 6.2, 4.8, 0.4),
    ],
  },
  {
    name: 'Gate',
    par: 2,
    // The Opener again with one wall across it and a gap a little off the
    // centre line. Straight back no longer works; the second thing a player
    // learns is that aim is a decision and not a default.
    tee: { x: 0, z: 4.5 },
    cup: { x: 0, y: 0, z: -4.5 },
    boxes: [
      green(0, 0, 4, 12),
      wall(-2.2, 0, 0.4, 12),
      wall(2.2, 0, 0.4, 12),
      wall(0, -6.2, 4.8, 0.4),
      wall(0, 6.2, 4.8, 0.4),
      // The gate: a gap from x = 0.1 to 1.1, a metre wide against a ball a
      // third of that. The straight line from tee to cup crosses at x = 0.
      wall(-0.95, 0, 2.1, 0.4),
      wall(1.55, 0, 0.9, 0.4),
    ],
  },
  {
    name: 'Elbow',
    par: 3,
    // An L. The cup is not on any line from the tee, so the first stroke has
    // to be a bank off the far wall or a two-stroke route round the corner.
    //
    // The two legs are x in [-6,-2] running z -6..8, and z in [-6,-2] running
    // x -2..6. Every wall below edges the *outside* of that shape; the one
    // that does not is the inner corner at (-1.8, 3.1). An earlier draft ran
    // the north wall from x=-4.4, which put it across the mouth of the leg the
    // tee shot travels down — a wall directly in front of the tee.
    tee: { x: -4, z: 5 },
    cup: { x: 4, y: 0, z: -4 },
    boxes: [
      green(-4, 1, 4, 14),
      // One slab, not two. The short leg was authored as a pair that
      // overlapped between x=2 and x=4, and two coplanar faces at the same
      // height z-fight: the green flickered in stripes right beside the cup.
      green(2, -4, 8, 4),
      // Outside edge: west, north, south, east.
      wall(-6.2, 1, 0.4, 14),
      wall(-4, 8.2, 4.8, 0.4),
      wall(0, -6.2, 12.8, 0.4),
      wall(6.2, -4, 0.4, 4.8),
      // Inside edge of the L: the long leg's east side, then the short leg's
      // north side, meeting at the corner.
      wall(-1.8, 3.1, 0.4, 9.8),
      wall(2, -1.8, 8.4, 0.4),
    ],
  },
  {
    name: 'Bank',
    par: 3,
    // A baffle across most of the fairway with the cup tucked behind its
    // closed end. The way through is the gap on the far side, and the way to
    // the cup from there is off a wall — the Elbow's lesson, without the
    // corner to hide it.
    tee: { x: -1.5, z: 4.5 },
    cup: { x: -1.5, y: 0, z: -4 },
    boxes: [
      green(0, 0, 6, 12),
      wall(-3.2, 0, 0.4, 12),
      wall(3.2, 0, 0.4, 12),
      wall(0, -6.2, 6.8, 0.4),
      wall(0, 6.2, 6.8, 0.4),
      // x from -3 to 1.5, leaving 1.5 open against the east wall.
      wall(-0.75, 0, 4.5, 0.4),
    ],
  },
  {
    name: 'Rise',
    par: 3,
    // A ramp to a raised green. Reading the slope is the skill, which is the
    // reason this game is in 3D at all — and the reason the at-rest detector
    // has to be able to tell "slow" from "stopped".
    //
    // The ramp's geometry is derived by `ramp()`, and the raised green begins
    // exactly where it crests. Both numbers come from `RISE_CREST_Z`, so
    // neither can drift away from the other.
    tee: { x: 0, z: 3 },
    // Off the straight line on purpose. With the cup dead ahead, the whole
    // hole was "pull straight back as far as it goes" — the one stroke that
    // clears the ramp also holed out, so the climb stopped being a decision.
    // Set to one side, clearing the ramp is stroke one and the putt across the
    // raised green is stroke two, which is what par 3 is describing.
    cup: { x: 1, y: RISE_HEIGHT, z: -5.5 },
    boxes: [
      // Lower green: z from 0 to 4.5, surface at y = 0.
      green(0, 2.25, 4, 4.5),
      ramp(0, 4, 0, 0, RISE_HEIGHT, MAX_SLOPE),
      // Raised green, starting at the crest and running 4 units further on.
      green(0, RISE_CREST_Z - 2, 4, 4, RISE_HEIGHT),
      // Side rails in three parts per side — along the lower green, up the
      // ramp as a staircase, then along the raised green. See `rampRails`.
      ...[-2.2, 2.2].flatMap((x) => [
        wall(x, 2.25, 0.4, 4.9),
        ...rampRails(x, 0.4, 0, 0, RISE_HEIGHT, MAX_SLOPE),
        wall(x, RISE_CREST_Z - 2.25, 0.4, 4.6, RISE_HEIGHT),
      ]),
      wall(0, 4.7, 4.8, 0.4),
      wall(0, RISE_CREST_Z - 4.2, 4.8, 0.4, RISE_HEIGHT),
    ],
  },
  {
    name: 'Drop',
    par: 3,
    // `Rise` run backwards: the tee is on the raised green and the course
    // falls away toward the cup. Authored climbing, the usual way, and then
    // mirrored — see `mirrorZ` — so the ramp's crest still lands on the
    // plateau's edge by construction rather than by eye.
    //
    // The skill inverts too. Climbing, the question was whether the ball
    // would get up; descending, it is whether it will stop.
    tee: { x: 0, z: DROP_RUN + 3, y: DROP_HEIGHT },
    // In the back corner, by measurement. Anywhere mid-green the ramp funnels
    // the ball in: 21 to 28 of 648 tee shots holed out, three to four times
    // the Opener's rate. Against the back wall the ball arrives fast and
    // carries, and it falls to 5 — the Opener's neighbourhood.
    cup: { x: -1.3, y: 0, z: -4.3 },
    boxes: [
      // Climbing frame: lower green z 0..5, ramp from z 0 to -DROP_RUN, the
      // raised green beyond it. Mirrored, the raised green is nearest the
      // camera and the lower one is the far end of the hole.
      green(0, 2.5, 4, 5),
      ramp(0, 4, 0, 0, DROP_HEIGHT, DROP_SLOPE),
      green(0, -DROP_RUN - 2, 4, 4, DROP_HEIGHT),
      ...[-2.2, 2.2].flatMap((x) => [
        wall(x, 2.5, 0.4, 5.4),
        ...rampRails(x, 0.4, 0, 0, DROP_HEIGHT, DROP_SLOPE),
        wall(x, -DROP_RUN - 2.25, 0.4, 4.6, DROP_HEIGHT),
      ]),
      wall(0, 5.2, 4.8, 0.4),
      wall(0, -DROP_RUN - 4.2, 4.8, 0.4, DROP_HEIGHT),
    ].map(mirrorZ),
  },
  {
    name: 'Split',
    par: 3,
    // Two lanes, one choice. A divider runs up the middle from just in front
    // of the tee. The west lane is the direct line and has a narrow gate in
    // it; the east lane is open and long, and costs a stroke to come back
    // across from. Neither is wrong, which is the point.
    tee: { x: 0, z: 5.5 },
    cup: { x: -1.5, y: 0, z: -4.5 },
    boxes: [
      green(0, 0, 6, 12),
      wall(-3.2, 0, 0.4, 12),
      wall(3.2, 0, 0.4, 12),
      wall(0, -6.2, 6.8, 0.4),
      wall(0, 6.2, 6.8, 0.4),
      // The divider, z from -2 to 5.
      wall(0, 1.5, 0.4, 7),
      // The west lane's gate: open from x = -1.7 to -0.8.
      wall(-2.35, 1.5, 1.3, 0.4),
      wall(-0.5, 1.5, 0.6, 0.4),
    ],
  },
  {
    name: 'Shelf',
    par: 3,
    // The cup is on a shelf across the back, reached by a narrow ramp at one
    // side. The shelf has no rail along its front edge: a putt across it that
    // is too firm rolls off and drops back to the lower green. That edge is
    // the hole.
    // Teed in line with the ramp. Teed centrally, the solver — which aims
    // perfectly — needed four strokes on a par 3: one just to line up.
    tee: { x: -2, z: 4 },
    cup: { x: 1.5, y: SHELF_HEIGHT, z: -SHELF_RUN - 1.5 },
    boxes: [
      // Lower green in two slabs that meet rather than overlap — two coplanar
      // faces flicker, which is why the Elbow is one slab. The first spans the
      // width from the tee to the ramp's foot; the second fills the floor
      // beside the ramp, under the shelf's front edge.
      green(0, 2.5, 6, 5),
      green(1, -SHELF_RUN / 2, 4, SHELF_RUN),
      ramp(-2, 2, 0, 0, SHELF_HEIGHT, MAX_SLOPE),
      green(0, -SHELF_RUN - 1.5, 6, 3, SHELF_HEIGHT),
      // A plinth under the shelf, filling it down to the floor. The shelf is
      // a slab like every green, 0.4 thick and raised 0.6, so without this its
      // front edge showed a black strip — the view straight under it — and it
      // read as a plank floating over the course rather than a step up.
      green(0, -SHELF_RUN - 1.5, 6, 3, SHELF_HEIGHT - GREEN_H),
      // The ramp is a lane: railed on both sides, so a ball on it cannot slip
      // off sideways onto the floor beside it.
      ...rampRails(-3.2, 0.4, 0, 0, SHELF_HEIGHT, MAX_SLOPE),
      ...rampRails(-0.8, 0.4, 0, 0, SHELF_HEIGHT, MAX_SLOPE),
      // Lower walls. The east one stops a hair short of the shelf, or it would
      // edge the shelf too, half a metre below its surface.
      wall(-3.2, 2.5, 0.4, 5.4),
      wall(3.2, (5.2 - SHELF_RUN + 0.1) / 2, 0.4, 5.1 + SHELF_RUN),
      wall(0, 5.2, 6.8, 0.4),
      // The shelf's own walls, standing on the floor and clearing the shelf
      // by a wall's height. Based on the shelf instead, they floated over
      // nothing, and the east one left a see-through notch at its corner.
      wall(-3.2, -SHELF_RUN - 1.5, 0.4, 3.4, 0, SHELF_HEIGHT + WALL_H),
      wall(3.2, -SHELF_RUN - 1.5, 0.4, 3.4, 0, SHELF_HEIGHT + WALL_H),
      wall(0, -SHELF_RUN - 3.2, 6.8, 0.4, 0, SHELF_HEIGHT + WALL_H),
    ],
  },
  {
    name: 'Summit',
    par: 4,
    // The closer, and the course's two ideas at once. A U: up the west leg,
    // across the top — a corner to bank or to play round, as on the Elbow —
    // and back down the east leg, which climbs toward the camera to a raised
    // green with the cup on it.
    //
    // The east leg is authored climbing away from the camera, foot at z = 2,
    // and mirrored, so its foot lands at z = -2 on the cross leg's edge.
    tee: { x: -3, z: 5 },
    cup: { x: 3, y: SHELF_HEIGHT, z: SHELF_RUN + 1 },
    boxes: [
      // West leg, x -5..-1, z -2..6; the cross leg, x -5..5, z -6..-2.
      green(-3, 2, 4, 8),
      green(0, -4, 10, 4),
      wall(-5.2, 0, 0.4, 12.4),
      wall(0, -6.2, 10.8, 0.4),
      wall(-3, 6.2, 4.8, 0.4),
      wall(-0.8, 2.1, 0.4, 8.2),
      // Between the legs there is no floor. This closes the cross leg's edge
      // there, or a ball rolling south across it would drop into the gap.
      wall(0, -1.8, 2, 0.4),
      wall(5.2, -4.1, 0.4, 4.2),
      // East leg, x 1..5, authored in the climbing frame and mirrored.
      ...[
        ramp(3, 4, 2, 0, SHELF_HEIGHT, MAX_SLOPE),
        green(3, 2 - SHELF_RUN - 2, 4, 4, SHELF_HEIGHT),
        ...[0.8, 5.2].flatMap((x) => [
          ...rampRails(x, 0.4, 2, 0, SHELF_HEIGHT, MAX_SLOPE),
          wall(x, 2 - SHELF_RUN - 2.25, 0.4, 4.6, SHELF_HEIGHT),
        ]),
        wall(3, 2 - SHELF_RUN - 4.2, 4.8, 0.4, SHELF_HEIGHT),
      ].map(mirrorZ),
    ],
  },
]

/**
 * Which course a score was set on (#141).
 *
 * A round's total only means something against the holes it was played over.
 * The save used to keep a bare number, so when the course grew from three
 * holes (par 8) to nine, a best of 8 from the old course would have beaten
 * every round anyone could play on the new one — for ever, on the game's own
 * screen and on the hub's badge. Both now compare this against the key the
 * best was stored with, and ignore a best from another course.
 *
 * Names and pars, so reordering, renaming, adding or re-parring a hole all
 * start a fresh best. Re-authoring a hole's geometry without touching either
 * does not, which is deliberate: that is a fix, not a new course.
 */
export const COURSE_KEY = HOLES.map((h) => `${h.name}/${h.par}`).join(' ')
