// The Anomaly Room itself, as data (#114).
//
// One room, authored once, and #114's scope guard is explicit that it stays
// one room until the first is genuinely tense. Everything here is a box: the
// shell the player stands in, and a dozen candidate objects that a round can
// change behind their back.
//
// The interesting constraint is not the geometry, it is that **every mutation
// has to be visible from where the player stands**. The player never moves —
// looking around is the whole verb — so there is exactly one eye point, and a
// change that only shows from somewhere else is an unwinnable round. A scale
// change on a picture flush against a wall is the obvious case: grow it along
// the wall's normal and it grows *into* the wall, where nothing can see it.
//
// `anomaly_test.ts` checks that by raycasting rather than by reading the
// numbers, so it catches the cases nobody thought of as well as that one.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

/** Interior half-extents of the room, and where the ceiling sits. */
export const ROOM_HALF = 5
export const ROOM_HEIGHT = 3.2
/** Wall, floor and ceiling thickness. Solid, so raycasts stop at them. */
const SHELL = 0.4

/** Where the player's head is. Fixed: this game is look-only. */
export const EYE: Vec3 = v(0, 1.6, 0)

/**
 * The key light, as data, because two very different things need it and must
 * not disagree: the renderer places it, and the round picker projects each
 * object's shadow along it to decide whether a change would be visible.
 *
 * An object can sit behind the player and still throw its shadow across the
 * floor in front of them. Frustum-culling the object alone is not enough —
 * the player would watch a shadow jump — and the two only stay in step if the
 * light is written down once.
 */
export const KEY_LIGHT = {
  position: v(-3.4, ROOM_HEIGHT + 2.6, -2.2),
  target: v(0.6, 0, 0.4),
}

export type MutationKind = 'move' | 'scale' | 'turn' | 'vanish' | 'twin'

export interface Mutation {
  kind: MutationKind
  /** `move` and `twin`: world-space offset from the object's home. */
  offset?: Vec3
  /** `scale`: multiplier per axis, applied about the object's own centre. */
  factor?: Vec3
  /** `turn`: yaw added, in radians. */
  yaw?: number
}

export interface Solid {
  id: string
  /** Centre of the box, in world units. */
  position: Vec3
  /** Full extents, before any scale mutation. */
  size: Vec3
  yaw?: number
  colour: number
}

export interface Candidate extends Solid {
  /** Named for the round summary, so a miss says what it was. */
  label: string
  mutations: Mutation[]
}

/**
 * The room's shell: floor, ceiling and four walls.
 *
 * Solid boxes rather than planes, because these are the occluders every
 * detectability check raycasts against — a plane is one-sided and a ray that
 * hits its back face passes straight through, which would quietly report a
 * change behind a wall as visible.
 */
export const SHELL_SOLIDS: Solid[] = [
  { id: 'floor', position: v(0, -SHELL / 2, 0), size: v(ROOM_HALF * 2, SHELL, ROOM_HALF * 2), colour: 0x6d6355 },
  { id: 'ceiling', position: v(0, ROOM_HEIGHT + SHELL / 2, 0), size: v(ROOM_HALF * 2, SHELL, ROOM_HALF * 2), colour: 0x453f38 },
  { id: 'wall-n', position: v(0, ROOM_HEIGHT / 2, -ROOM_HALF - SHELL / 2), size: v(ROOM_HALF * 2, ROOM_HEIGHT, SHELL), colour: 0x7b7264 },
  { id: 'wall-s', position: v(0, ROOM_HEIGHT / 2, ROOM_HALF + SHELL / 2), size: v(ROOM_HALF * 2, ROOM_HEIGHT, SHELL), colour: 0x7b7264 },
  { id: 'wall-w', position: v(-ROOM_HALF - SHELL / 2, ROOM_HEIGHT / 2, 0), size: v(SHELL, ROOM_HEIGHT, ROOM_HALF * 2), colour: 0x6f6759 },
  { id: 'wall-e', position: v(ROOM_HALF + SHELL / 2, ROOM_HEIGHT / 2, 0), size: v(SHELL, ROOM_HEIGHT, ROOM_HALF * 2), colour: 0x6f6759 },
]

const move = (x: number, y: number, z: number): Mutation => ({ kind: 'move', offset: v(x, y, z) })
const scale = (x: number, y: number, z: number): Mutation => ({ kind: 'scale', factor: v(x, y, z) })
const turn = (yaw: number): Mutation => ({ kind: 'turn', yaw })
const vanish: Mutation = { kind: 'vanish' }
const twin = (x: number, y: number, z: number): Mutation => ({ kind: 'twin', offset: v(x, y, z) })

/**
 * The dozen things a round can change.
 *
 * Note what the wall-mounted ones do *not* do. `picture` and `clock` scale in
 * the two axes that run along their wall and never in the one that runs into
 * it; `shelf` moves down rather than back. Those are not stylistic choices —
 * the third axis is buried in masonry, and a round that mutated it would be
 * unwinnable. The check exists because that is easy to get wrong and
 * impossible to see by reading.
 */
export const CANDIDATES: Candidate[] = [
  {
    id: 'crate',
    label: 'the crate',
    position: v(-3.2, 0.45, -3.6),
    size: v(0.9, 0.9, 0.9),
    yaw: 0.3,
    colour: 0x6b5a44,
    mutations: [move(0.8, 0, 0.6), turn(0.7), vanish],
  },
  {
    id: 'crate-tall',
    label: 'the tall crate',
    position: v(3.4, 0.7, -3.8),
    size: v(0.7, 1.4, 0.7),
    colour: 0x5f5140,
    mutations: [scale(1, 0.55, 1), move(-1, 0, 0.5), vanish],
  },
  {
    id: 'table',
    label: 'the table',
    position: v(0.6, 0.38, -2.6),
    size: v(1.8, 0.76, 1),
    colour: 0x53483a,
    mutations: [move(0, 0, 0.8), scale(0.65, 1, 1), turn(0.4)],
  },
  {
    id: 'chair',
    label: 'the chair',
    position: v(-1.5, 0.45, -2.1),
    size: v(0.5, 0.9, 0.5),
    yaw: -0.5,
    colour: 0x6d5f4a,
    mutations: [turn(1.2), move(0.8, 0, -0.5), vanish],
  },
  {
    id: 'lamp',
    label: 'the standing lamp',
    position: v(4.2, 0.85, 1.2),
    size: v(0.26, 1.7, 0.26),
    colour: 0x8a7d63,
    mutations: [scale(1, 0.6, 1), move(0, 0, -1.3), vanish],
  },
  {
    id: 'shelf',
    label: 'the shelf',
    position: v(-4.75, 1.6, 0.6),
    size: v(0.5, 0.18, 2.2),
    colour: 0x60533f,
    // Down the wall, and shorter along it. Never out from the wall.
    mutations: [move(0, -0.55, 0), scale(1, 1, 0.6), vanish],
  },
  {
    id: 'picture',
    label: 'the picture',
    position: v(-4.96, 1.95, -2),
    size: v(0.08, 0.8, 1.1),
    colour: 0x7a6a53,
    // Slides along the wall and grows in the wall's plane. `x` is into the
    // masonry and is deliberately never touched.
    mutations: [move(0, 0, 1.2), scale(1, 1.45, 1.45), vanish],
  },
  {
    id: 'rug',
    label: 'the rug',
    position: v(0, 0.02, 1.8),
    size: v(2.6, 0.04, 1.8),
    colour: 0x4a3b34,
    mutations: [scale(1.35, 1, 1.35), move(1, 0, 0.6), vanish],
  },
  {
    id: 'bin',
    label: 'the bin',
    position: v(2, 0.3, 3.4),
    size: v(0.42, 0.6, 0.42),
    colour: 0x4f4a44,
    mutations: [move(-1.2, 0, -0.3), twin(-1.3, 0, 0.2), vanish],
  },
  {
    id: 'plant',
    label: 'the plant',
    position: v(-3.9, 0.62, 3.2),
    size: v(0.55, 1.24, 0.55),
    colour: 0x3f5a42,
    mutations: [scale(1, 1.4, 1), move(1, 0, -0.8), vanish],
  },
  {
    id: 'clock',
    label: 'the clock',
    position: v(1.2, 2.2, -4.96),
    size: v(0.52, 0.52, 0.08),
    colour: 0x8d8474,
    // Along the north wall, and larger in its face. `z` runs into the wall.
    mutations: [move(1.6, 0, 0), scale(1.6, 1.6, 1), vanish],
  },
  {
    id: 'stool',
    label: 'the stool',
    position: v(2.9, 0.28, 1.9),
    size: v(0.42, 0.56, 0.42),
    colour: 0x6a5b46,
    mutations: [twin(1.1, 0, 0.7), move(0, 0, -1.4), scale(1, 1.7, 1)],
  },
]

/** A candidate's state once a mutation has been applied to it. */
export interface Pose {
  position: Vec3
  size: Vec3
  yaw: number
  visible: boolean
  /** Where a `twin` copy sits, if this mutation made one. */
  twin: Vec3 | null
}

export function homePose(c: Candidate): Pose {
  return { position: c.position, size: c.size, yaw: c.yaw ?? 0, visible: true, twin: null }
}

/** The pose a mutation puts a candidate into. Pure: nothing is mutated here. */
export function applyMutation(c: Candidate, m: Mutation): Pose {
  const home = homePose(c)
  switch (m.kind) {
    case 'move':
      return {
        ...home,
        position: v(
          c.position.x + (m.offset?.x ?? 0),
          c.position.y + (m.offset?.y ?? 0),
          c.position.z + (m.offset?.z ?? 0),
        ),
      }
    case 'scale':
      return {
        ...home,
        size: v(
          c.size.x * (m.factor?.x ?? 1),
          c.size.y * (m.factor?.y ?? 1),
          c.size.z * (m.factor?.z ?? 1),
        ),
        // Grown or shrunk about its own centre, except vertically: a box on
        // the floor that scales about its centre sinks into it, which reads as
        // a different change than the one that was made.
        position: v(
          c.position.x,
          c.position.y + (c.size.y * ((m.factor?.y ?? 1) - 1)) / 2,
          c.position.z,
        ),
      }
    case 'turn':
      return { ...home, yaw: (c.yaw ?? 0) + (m.yaw ?? 0) }
    case 'vanish':
      return { ...home, visible: false }
    case 'twin':
      return {
        ...home,
        twin: v(
          c.position.x + (m.offset?.x ?? 0),
          c.position.y + (m.offset?.y ?? 0),
          c.position.z + (m.offset?.z ?? 0),
        ),
      }
  }
}
