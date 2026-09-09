// The two rules the Anomaly Room cannot be played without (#114).
//
//   npx tsx anomaly-room/anomaly_test.ts
//
// Both are pure logic and both are about things you cannot see by reading the
// room file.
//
//   1. Nothing is ever mutated while it is on screen. Break this and the game
//      stops being "something is different" and becomes "I watched a chair
//      jump".
//   2. Every mutation is *detectable* from where the player stands. The player
//      never moves, so there is exactly one eye point, and a change that only
//      shows from somewhere else is a round that cannot be won. #114 names the
//      case: a scale change on an object flush against a wall.
//
// The second is checked by raycasting rather than by inspecting the numbers.
// Reading the numbers only ever catches the case you thought of; casting rays
// from the eye and comparing what they hit catches the ones nobody did —
// including an object hidden behind a larger one, which no rule about wall
// normals would have found.
import * as THREE from 'three'
import { CANDIDATES, EYE, SHELL_SOLIDS, applyMutation, homePose, type Candidate, type Mutation, type Pose } from './room'
import { MISSES, ROUNDS, boundsOf, frustumOf, onScreen, pickRound, seeded } from './rounds'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- rule one: never mutate something on screen -----------------------------

/** A camera at the eye, looking along `yaw`/`pitch`, as the game builds it. */
function look(yaw: number, pitch: number, aspect = 390 / 844): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(72, aspect, 0.05, 60)
  camera.position.set(EYE.x, EYE.y, EYE.z)
  camera.rotation.order = 'YXZ'
  camera.rotation.set(pitch, yaw, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  return camera
}

{
  const rng = seeded(20260908)
  let rounds = 0
  let onScreenPicks = 0
  // Portrait and landscape both: the frustum is wider in landscape, so a
  // filter that happened to hold on a phone can leak on a laptop.
  for (const aspect of [390 / 844, 1440 / 900]) {
    for (let i = 0; i < 400; i++) {
      const camera = look(rng() * Math.PI * 2, (rng() - 0.5) * 2.4, aspect)
      const round = pickRound(camera, rng)
      if (!round) continue
      rounds++
      const before = homePose(round.candidate)
      if (onScreen(frustumOf(camera), before, round.pose)) onScreenPicks++
    }
  }
  check('rounds are drawn at all', rounds > 700, `${rounds} rounds over two aspect ratios`)
  check(
    'nothing is ever mutated while it is on screen',
    onScreenPicks === 0,
    `${onScreenPicks} of ${rounds}`,
  )
}

{
  // The same sampling with the filter removed. If this does not fire, the
  // sample is too small or the camera never faces anything — either way the
  // check above proves nothing.
  const rng = seeded(20260908)
  let onScreenPicks = 0
  let rounds = 0
  for (let i = 0; i < 400; i++) {
    const camera = look(rng() * Math.PI * 2, (rng() - 0.5) * 2.4)
    const round = pickRound(camera, rng, { frustumFilter: false })
    if (!round) continue
    rounds++
    if (onScreen(frustumOf(camera), homePose(round.candidate), round.pose)) onScreenPicks++
  }
  check(
    'and without the frustum filter the check catches it',
    onScreenPicks > 20,
    `${onScreenPicks} of ${rounds} picks were in view`,
  )
}

{
  // And the weaker version of the rule, which is the one that shipped first:
  // cull the object but not the shadow it throws. The room has a single hard
  // key light, so an object standing behind the player can lay its shadow
  // across the floor in front of them — and a change to it is then perfectly
  // visible, as a shadow that jumps while nothing appears to move.
  const rng = seeded(41)
  let shadowsSeen = 0
  let rounds = 0
  for (let i = 0; i < 600; i++) {
    const camera = look(rng() * Math.PI * 2, (rng() - 0.5) * 1.2)
    const round = pickRound(camera, rng, { shadowFilter: false })
    if (!round) continue
    rounds++
    if (onScreen(frustumOf(camera), homePose(round.candidate), round.pose)) shadowsSeen++
  }
  check(
    'culling the object but not its shadow is not enough',
    shadowsSeen > 5,
    `${shadowsSeen} of ${rounds} picks would have thrown a visible shadow`,
  )
}

{
  // The run never has to reuse a candidate, which is what lets the check below
  // measure every mutation from the object's home pose and have that be the
  // state the game is actually in when the round fires.
  check(
    'a run never has to mutate the same thing twice',
    ROUNDS <= CANDIDATES.length,
    `${ROUNDS} rounds, ${CANDIDATES.length} candidates, ${MISSES} guesses`,
  )
}

// --- rule two: every mutation is visible from the eye ------------------------

/**
 * The room as meshes, with one candidate posed however a round left it.
 *
 * Rebuilt per pose rather than mutated in place: `Raycaster` reads world
 * matrices, and a stale one is a silent wrong answer rather than an error.
 */
function build(posed: Map<string, Pose>): THREE.Object3D {
  const root = new THREE.Object3D()
  const add = (id: string, pose: Pose, at = pose.position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pose.size.x, pose.size.y, pose.size.z))
    mesh.name = id
    mesh.position.set(at.x, at.y, at.z)
    mesh.rotation.y = pose.yaw
    root.add(mesh)
  }
  for (const s of SHELL_SOLIDS) {
    add(s.id, { position: s.position, size: s.size, yaw: 0, visible: true, twin: null })
  }
  for (const c of CANDIDATES) {
    const pose = posed.get(c.id) ?? homePose(c)
    if (pose.visible) add(c.id, pose)
    if (pose.twin) add(c.id, pose, pose.twin)
  }
  root.updateMatrixWorld(true)
  return root
}

/**
 * Angular spacing between sample rays, in radians.
 *
 * Fixed, not a fraction of the object — which is the whole point. The first
 * version gridded a square cone sized to the object and scored a change as a
 * fraction of that cone, which quietly punished anything long and thin: the
 * shelf is two metres of wall and eighteen centimetres tall, so most of its
 * cone is empty, and shortening it by a third scored under two percent while a
 * far smaller change to a compact object scored ten times that. Sampling at a
 * constant angular step instead makes the score a solid angle — how much of
 * what the player sees actually changes — which is the thing being asked.
 *
 * Roughly five pixels at the game's field of view on a tall phone.
 */
const STEP = 0.008
/** Cap on the grid, so a near object cannot make this run for ever. */
const MAX_RAYS = 110

/**
 * What the eye sees across the cone this object occupies: one name per ray,
 * `''` for nothing, and the ray spacing that produced it.
 *
 * The grid is built in a frame around the object rather than in yaw and pitch,
 * which keeps it away from the wrap at the back of the room and away from the
 * pole overhead — both of which would distort sampling for exactly the objects
 * most likely to be badly authored.
 */
function silhouette(root: THREE.Object3D, centre: THREE.Vector3, spread: number) {
  const eye = new THREE.Vector3(EYE.x, EYE.y, EYE.z)
  const forward = centre.clone().sub(eye).normalize()
  const up = Math.abs(forward.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(forward, up).normalize()
  const localUp = new THREE.Vector3().crossVectors(right, forward)

  const n = Math.min(MAX_RAYS, Math.max(8, Math.ceil((2 * spread) / STEP)))
  const step = (2 * spread) / n
  const raycaster = new THREE.Raycaster()
  raycaster.far = 60
  const hits: string[] = []
  const dir = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = (i + 0.5) * step - spread
      const w = (j + 0.5) * step - spread
      dir.copy(forward).addScaledVector(right, u).addScaledVector(localUp, w).normalize()
      raycaster.set(eye, dir)
      const hit = raycaster.intersectObject(root, true)[0]
      hits.push(hit ? hit.object.name : '')
    }
  }
  // `step` is a tangent step, so the solid angle it subtends shrinks toward
  // the edge of the cone. Every object here subtends well under a radian, so
  // `step^2` is within a few percent across the grid and the difference does
  // not decide anything.
  return { hits, cell: step * step }
}

/** How wide the sampling cone has to be to cover both poses, plus a margin. */
function spreadFor(before: THREE.Box3, after: THREE.Box3): number {
  const eye = new THREE.Vector3(EYE.x, EYE.y, EYE.z)
  const union = before.clone()
  if (!after.isEmpty()) union.union(after)
  const forward = union.getCenter(new THREE.Vector3()).sub(eye).normalize()
  let widest = 0
  const corner = new THREE.Vector3()
  for (const sx of ['min', 'max'] as const) {
    for (const sy of ['min', 'max'] as const) {
      for (const sz of ['min', 'max'] as const) {
        corner.set(union[sx].x, union[sy].y, union[sz].z).sub(eye)
        const along = corner.dot(forward)
        if (along <= 0) return 1.4
        widest = Math.max(widest, corner.clone().addScaledVector(forward, -along).length() / along)
      }
    }
  }
  return Math.max(0.04, widest * 1.3)
}

/**
 * The solid angle of the player's view that this mutation changes, in
 * steradians. Zero means the round is unwinnable.
 */
function visibleChange(candidate: Candidate, mutation: Mutation): number {
  const before = homePose(candidate)
  const after = applyMutation(candidate, mutation)
  const boxBefore = boundsOf(before)
  const boxAfter = boundsOf(after)
  const union = boxBefore.clone()
  if (!boxAfter.isEmpty()) union.union(boxAfter)
  const centre = union.getCenter(new THREE.Vector3())
  const spread = spreadFor(boxBefore, boxAfter)

  const a = silhouette(build(new Map()), centre, spread)
  const b = silhouette(build(new Map([[candidate.id, after]])), centre, spread)
  let changed = 0
  for (let i = 0; i < a.hits.length; i++) if (a.hits[i] !== b.hits[i]) changed++
  return changed * a.cell
}

/**
 * The floor a change has to clear, as a solid angle.
 *
 * Derived from what a player could plausibly notice rather than picked: a
 * patch twenty pixels square, in an eight-hundred-pixel-tall view at the
 * game's 72-degree field of view. Below that, the change is a smudge a few
 * pixels across on the far side of the room — technically visible, and not a
 * round anybody could win.
 *
 * Not zero, and that matters: rotating a box moves its silhouette by a sliver
 * at the corners no matter how small the angle, so "some ray differs" would
 * pass a turn of a hundredth of a radian.
 */
const FOV = (72 * Math.PI) / 180
const NOTICEABLE_PX = 20
const DETECTABLE = Math.pow((NOTICEABLE_PX * FOV) / 800, 2)

for (const candidate of CANDIDATES) {
  const weakest = candidate.mutations
    .map((m) => ({ m, seen: visibleChange(candidate, m) }))
    .sort((x, y) => x.seen - y.seen)[0]
  check(
    `${candidate.label}: every change is visible from where the player stands`,
    weakest.seen >= DETECTABLE,
    `weakest is ${weakest.m.kind} at ${(weakest.seen / DETECTABLE).toFixed(1)}x the floor`,
  )
}

{
  // #114's own example, put back: a scale change on an object flush against a
  // wall. The shelf sits hard against the west wall, so growing it along the
  // axis that runs into the masonry buries the change — the player can stare
  // straight at it and see nothing.
  //
  // This control only became real once the wall-mounted objects were actually
  // flush. Authored with an eight-centimetre gap behind them, the same growth
  // pushed a sliver out into the room and scored four times the floor, and the
  // control passed for the wrong reason. Which is the whole argument for
  // measuring this by raycast: the gap was invisible in the room file and
  // invisible on screen, and it silently disarmed the check.
  const shelf = CANDIDATES.find((c) => c.id === 'shelf')
  if (!shelf) throw new Error('the shelf is gone from the room')

  const intoTheWall = visibleChange(shelf, { kind: 'scale', factor: { x: 1.4, y: 1, z: 1 } })
  check(
    'a change that happens inside a wall is caught',
    intoTheWall < DETECTABLE,
    `growing the shelf into the wall shows ${(intoTheWall / DETECTABLE).toFixed(2)}x the floor`,
  )

  const alongTheWall = visibleChange(shelf, { kind: 'scale', factor: { x: 1, y: 1, z: 0.6 } })
  check(
    'while the same growth along the wall is not',
    alongTheWall >= DETECTABLE,
    `${(alongTheWall / DETECTABLE).toFixed(1)}x the floor`,
  )
}

{
  // The case no rule about wall normals would have found, which is why this is
  // measured rather than reasoned about: a change behind something bigger.
  // Nothing in the room is authored this way; it is built here so the check
  // can be seen to notice.
  const hidden: Candidate = {
    id: 'hidden',
    label: 'a box behind the tall crate',
    position: { x: 4.1, y: 0.3, z: -4.5 },
    size: { x: 0.4, y: 0.6, z: 0.4 },
    colour: 0,
    mutations: [],
  }
  CANDIDATES.push(hidden)
  const seen = visibleChange(hidden, { kind: 'move', offset: { x: 0, y: 0, z: 0.35 } })
  CANDIDATES.pop()
  check(
    'and so is a change behind a larger object',
    seen < DETECTABLE,
    `${(seen / DETECTABLE).toFixed(2)}x the floor`,
  )
}

{
  // And the floor is not zero. A rotated box's silhouette shifts by a sliver
  // at the corners for any angle at all, so a threshold of "some ray differs"
  // would call a hundredth of a radian a round.
  const picture = CANDIDATES.find((c) => c.id === 'picture')
  if (!picture) throw new Error('the picture is gone from the room')
  const nudge = visibleChange(picture, { kind: 'turn', yaw: 0.05 })
  check(
    'a turn too small to find is caught',
    nudge > 0 && nudge < DETECTABLE,
    `${(nudge / DETECTABLE).toFixed(2)}x the floor, and not zero`,
  )
}

console.log(ok ? '\nALL ANOMALY ROOM CHECKS PASS' : '\nANOMALY ROOM CHECKS FAILED')
process.exit(ok ? 0 : 1)
