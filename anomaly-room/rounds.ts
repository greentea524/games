// Choosing what changes, and proving it changed out of sight (#114).
//
// The whole illusion rests on one rule: **never mutate something the player is
// currently looking at.** Break it and the game stops being "something is
// different" and becomes "I watched a chair jump", which is not the same game
// and cannot be un-seen.
//
// So a round picks only from candidates whose bounds are entirely outside the
// camera's frustum, using three.js's own `Frustum` against the same projection
// the renderer draws with — not a re-derived cone with its own idea of the
// aspect ratio. `anomaly_test.ts` samples hundreds of rounds at random yaws to
// check it holds, and turns the filter off to watch the check fail.
//
// The object's own bounds are not the whole of what the player can see of it.
// The room is lit by one hard directional key, so everything throws a shadow,
// and an object standing behind the player can lay its shadow across the floor
// in front of them — where a change to it is as visible as the object itself.
// So the test covers the object *and* the shadow it casts.
import * as THREE from 'three'
import {
  CANDIDATES,
  KEY_LIGHT,
  applyMutation,
  homePose,
  type Candidate,
  type Mutation,
  type Pose,
} from './room'

/**
 * Rounds in a run, and wrong flags allowed across the whole run.
 *
 * `ROUNDS` is capped by the number of candidates, and that is load-bearing
 * rather than tidy: a run never reuses a candidate, so every round's "before"
 * state is the object's home pose — which is the state `anomaly_test.ts`
 * measured every mutation's visibility from. Allow more rounds than there are
 * things in the room and rounds start mutating already-mutated objects, from
 * poses nothing has checked.
 */
export const ROUNDS = 8
export const MISSES = 3

/** A repeatable source of randomness, so a failing round can be replayed. */
export type Rng = () => number

/** Mulberry32 — small, seedable, and good enough to pick from a list. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const V = new THREE.Vector3()

/**
 * World-space bounds of a pose, yaw included.
 *
 * A rotated box's axis-aligned bounds are not its own extents — a square
 * turned 45 degrees is wider than its side — and using the unrotated size
 * would under-report the space it occupies, which for the frustum test means
 * calling something out of view when a corner of it is on screen.
 */
export function boundsOf(pose: Pose): THREE.Box3 {
  const box = new THREE.Box3()
  if (!pose.visible) return box.makeEmpty()
  const c = Math.abs(Math.cos(pose.yaw))
  const s = Math.abs(Math.sin(pose.yaw))
  const halfX = (pose.size.x * c + pose.size.z * s) / 2
  const halfZ = (pose.size.x * s + pose.size.z * c) / 2
  box.set(
    new THREE.Vector3(pose.position.x - halfX, pose.position.y - pose.size.y / 2, pose.position.z - halfZ),
    new THREE.Vector3(pose.position.x + halfX, pose.position.y + pose.size.y / 2, pose.position.z + halfZ),
  )
  if (pose.twin) {
    box.expandByPoint(V.set(pose.twin.x - halfX, pose.twin.y - pose.size.y / 2, pose.twin.z - halfZ))
    box.expandByPoint(V.set(pose.twin.x + halfX, pose.twin.y + pose.size.y / 2, pose.twin.z + halfZ))
  }
  return box
}

/** Where the key light's rays travel, as a unit vector. */
const LIGHT_DIR = new THREE.Vector3(
  KEY_LIGHT.target.x - KEY_LIGHT.position.x,
  KEY_LIGHT.target.y - KEY_LIGHT.position.y,
  KEY_LIGHT.target.z - KEY_LIGHT.position.z,
).normalize()

/**
 * Bounds covering a pose *and* the shadow it throws on the floor.
 *
 * Each corner of the object's box is swept along the light until it reaches
 * the floor, and the result is the box containing all of it. Generous rather
 * than exact — the true shadow is a hexagon inside this box — and generous is
 * the right direction to be wrong in: it can only make the picker skip a
 * candidate it might have got away with, never let it change something the
 * player is watching.
 */
export function litBoundsOf(pose: Pose): THREE.Box3 {
  const box = boundsOf(pose)
  if (box.isEmpty() || LIGHT_DIR.y >= 0) return box
  const out = box.clone()
  const corner = new THREE.Vector3()
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).addScaledVector(LIGHT_DIR, y / -LIGHT_DIR.y)
        out.expandByPoint(corner)
      }
    }
  }
  return out
}

/** The camera's frustum, from the matrices it will actually render with. */
export function frustumOf(camera: THREE.PerspectiveCamera): THREE.Frustum {
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  )
}

/**
 * Is any part of `pose` — or the pose the mutation would put it in — on screen?
 *
 * Both, because a `move` sweeps between two places and a `twin` puts a copy
 * somewhere new. Testing only the home pose would let a round drop a duplicate
 * bin into the middle of the player's view.
 */
export function onScreen(
  frustum: THREE.Frustum,
  before: Pose,
  after: Pose,
  shadows = true,
): boolean {
  for (const pose of [before, after]) {
    const box = shadows ? litBoundsOf(pose) : boundsOf(pose)
    if (!box.isEmpty() && frustum.intersectsBox(box)) return true
  }
  return false
}

export interface Round {
  candidate: Candidate
  mutation: Mutation
  pose: Pose
}

export interface PickOptions {
  /** Candidate ids already used this run, so a run does not repeat itself. */
  used?: ReadonlySet<string>
  /**
   * Where each candidate is *now*, for candidates no longer at home.
   *
   * The room accumulates: a round does not put the last round's change back.
   * Snapping an object home between rounds would do it while the player might
   * be looking straight at it, which is the one thing this game must never do
   * — and a room that quietly drifts over eight rounds is better atmosphere
   * than one that resets.
   */
  poses?: ReadonlyMap<string, Pose>
  /**
   * Off, the picker ignores the frustum entirely. Nothing in the game passes
   * this — it exists so `anomaly_test.ts` can degrade the rule and watch the
   * check that guards it go red.
   */
  frustumFilter?: boolean
  /**
   * Off, the picker considers only the object and not the shadow it casts.
   * Also only for the test: it is the weaker rule the first version shipped.
   */
  shadowFilter?: boolean
}

/**
 * Picks a candidate and a mutation for the next round, or null if nothing is
 * eligible — which the caller should treat as "wait and ask again", not as an
 * error. In a room where the player can see maybe a sixth of the space at
 * once, eligible candidates are the overwhelming majority; running out means
 * they are staring at the one wall everything is against.
 */
export function pickRound(
  camera: THREE.PerspectiveCamera,
  rng: Rng,
  options: PickOptions = {},
): Round | null {
  const { used = new Set<string>(), poses, frustumFilter = true, shadowFilter = true } = options
  const frustum = frustumOf(camera)

  const eligible: Round[] = []
  const fallback: Round[] = []
  for (const candidate of CANDIDATES) {
    const before = poses?.get(candidate.id) ?? homePose(candidate)
    for (const mutation of candidate.mutations) {
      const after = applyMutation(candidate, mutation)
      const round = { candidate, mutation, pose: after }
      if (frustumFilter && onScreen(frustum, before, after, shadowFilter)) continue
      ;(used.has(candidate.id) ? fallback : eligible).push(round)
    }
  }

  // Unused candidates first, so a run of eight rounds shows eight different
  // things before it starts repeating itself.
  const pool = eligible.length > 0 ? eligible : fallback
  if (pool.length === 0) return null
  return pool[Math.floor(rng() * pool.length) % pool.length]
}
