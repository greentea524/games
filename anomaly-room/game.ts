// The Anomaly Room (#114), on the standalone stage (#118).
//
// You stand in a room and look around. Each round something changes while it
// is out of your view; find it and flag it. There is no simulation here at
// all — no physics, no spawning, no generation — which #114 notes is what
// makes this the cheapest of the 3D games to build correctly and the one where
// the effort goes entirely into atmosphere.
//
// The lighting is doing more work than it looks. #114 called this out when the
// look changed: the four-tone GameBoy palette used to flatten the room and
// make silhouette changes read for free, and in full colour that has to be
// earned. So the value range is deliberately narrow, the key light is hard and
// directional, and objects cast and receive shadows — which means a moved
// object changes its shadow as well as its position, and that second cue is
// most of what makes a small change findable at all.
import * as THREE from 'three'
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'
import {
  CANDIDATES,
  EYE,
  KEY_LIGHT,
  ROOM_HALF,
  SHELL_SOLIDS,
  homePose,
  type Candidate,
  type Pose,
} from './room'
import { MISSES, ROUNDS, pickRound, seeded, type Rng, type Round } from './rounds'

/** How long the room sits unchanged at the start of a round, in seconds. */
const SETTLE = 0.6

export { MISSES, ROUNDS }

export type Phase = 'looking' | 'right' | 'wrong' | 'over' | 'won'

/** Pitch clamp. #114 asks for roughly 80 degrees, which is this in radians. */
const PITCH_LIMIT = (80 * Math.PI) / 180

export interface AnomalyGame {
  stage: Stage3D
  round(): number
  misses(): number
  phase(): Phase
  /**
   * Yaw, pitch and roll of the head, radians.
   *
   * Roll is reported although nothing sets it, because it is the symptom of
   * the one mistake this camera can make: with the default rotation order,
   * pitching after a yaw tips the horizon, and the room slowly rolls as you
   * look around. A number that should always be zero is worth being able to
   * assert on.
   */
  look(): { yaw: number; pitch: number; roll: number }
  /**
   * Turns the head. Positive `dYaw` looks right, positive `dPitch` looks down,
   * and pitch is clamped.
   *
   * The sign convention is stated because the two input paths use opposite
   * ones and both are correct: under pointer lock the mouse *is* the head, so
   * moving it right looks right; a touch drag moves the *room*, so pulling
   * left brings what was off the right edge into view — which is the head
   * turning right.
   */
  turn(dYaw: number, dPitch: number): void
  /**
   * Flags whatever is under a normalised viewport point, 0..1 from the top
   * left. Returns what was hit, or null for nothing.
   */
  flag(nx: number, ny: number): { id: string; correct: boolean } | null
  /**
   * What is under a normalised viewport point, or null for nothing and for the
   * room's own shell.
   *
   * Exactly what `flag` would act on, deliberately: a QA suite that located
   * objects by its own copy of the projection would be checking its own
   * arithmetic, and one that located them by a different rule than the game
   * uses could pass while tapping did the wrong thing.
   */
  probe(nx: number, ny: number): string | null
  /** What the current round changed — for the summary after it is resolved. */
  anomaly(): { id: string; label: string; kind: string } | null
  /** True once the anomaly for this round has actually been applied. */
  armed(): boolean
  next(): void
  restart(): void
  onChange(fn: () => void): void
  dispose(): void
}

const COLOURS = {
  background: 0x07090b,
  fog: 0x0a0d10,
}

export function createGame(parent: HTMLElement, seed = Date.now()): AnomalyGame {
  const stage = createStage3D({ parent, background: COLOURS.background })
  // Shadows are off by default and are not a flourish here: a moved object
  // that takes its shadow with it is the second cue, and on a small change it
  // is the one the eye actually catches. Soft, because a hard-edged 1024px map
  // in a ten-metre room shows its own stair-stepping.
  stage.renderer.shadowMap.enabled = true
  stage.renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOURS.background)
  // Fog, but barely. It is not for distance — the far wall is ten metres away
  // — it is to take the last of the contrast out of the far corners so the
  // room feels deeper than it is. The first pass started it at six metres,
  // which crushed the whole far half of a ten-metre room to black: atmospheric
  // in a screenshot, unplayable in a game about noticing small changes.
  scene.fog = new THREE.Fog(COLOURS.fog, 11, 34)

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60)
  camera.position.set(EYE.x, EYE.y, EYE.z)
  // YXZ so yaw is applied before pitch. With the default XYZ order, pitching
  // after a yaw rolls the horizon, and the room tips as you look around.
  camera.rotation.order = 'YXZ'
  stage.track(camera)

  // A hard, directional key with a low ambient. The ratio between them is the
  // atmosphere: raise the ambient and the room turns into a diagram.
  scene.add(new THREE.AmbientLight(0x6b7d8c, lambertIntensity(0.34)))
  const key = new THREE.DirectionalLight(0xffe6c4, lambertIntensity(0.78))
  // From `room.ts`, because the round picker projects shadows along this same
  // vector to decide what is safe to change. Two copies of it would drift.
  key.position.set(KEY_LIGHT.position.x, KEY_LIGHT.position.y, KEY_LIGHT.position.z)
  key.target.position.set(KEY_LIGHT.target.x, KEY_LIGHT.target.y, KEY_LIGHT.target.z)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  const shadowCam = key.shadow.camera
  shadowCam.left = -ROOM_HALF - 1
  shadowCam.right = ROOM_HALF + 1
  shadowCam.top = ROOM_HALF + 1
  shadowCam.bottom = -ROOM_HALF - 1
  shadowCam.near = 0.5
  shadowCam.far = 22
  key.shadow.bias = -0.0015
  scene.add(key)
  scene.add(key.target)
  // A cold bounce from the opposite corner, so the shadowed side of an object
  // is dim rather than black — a silhouette with no interior reads as a hole.
  const bounce = new THREE.DirectionalLight(0x3d6180, lambertIntensity(0.2))
  bounce.position.set(4.5, 1.6, 4)
  scene.add(bounce)

  const room = new THREE.Group()
  scene.add(room)

  const shellMaterials = new Map<string, THREE.Material>()
  for (const solid of SHELL_SOLIDS) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(solid.size.x, solid.size.y, solid.size.z),
      new THREE.MeshLambertMaterial({ color: solid.colour }),
    )
    mesh.position.set(solid.position.x, solid.position.y, solid.position.z)
    mesh.receiveShadow = true
    mesh.name = solid.id
    room.add(mesh)
    shellMaterials.set(solid.id, mesh.material as THREE.Material)
  }

  /** One candidate's meshes: the object, and the copy a `twin` round makes. */
  interface Piece {
    candidate: Candidate
    mesh: THREE.Mesh
    twin: THREE.Mesh
  }

  const pieces: Piece[] = []
  for (const candidate of CANDIDATES) {
    const material = new THREE.MeshLambertMaterial({ color: candidate.colour })
    const build = () => {
      // Unit geometry, posed by `scale`. A mutation that changes size would
      // otherwise mean rebuilding geometry every round, and three.js does not
      // dispose the old one for you.
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.name = candidate.id
      room.add(mesh)
      return mesh
    }
    const mesh = build()
    const twin = build()
    twin.visible = false
    pieces.push({ candidate, mesh, twin })
  }

  function pose(piece: Piece, p: Pose) {
    piece.mesh.visible = p.visible
    piece.mesh.position.set(p.position.x, p.position.y, p.position.z)
    piece.mesh.scale.set(p.size.x, p.size.y, p.size.z)
    piece.mesh.rotation.y = p.yaw
    piece.twin.visible = p.twin !== null
    if (p.twin) {
      piece.twin.position.set(p.twin.x, p.twin.y, p.twin.z)
      piece.twin.scale.set(p.size.x, p.size.y, p.size.z)
      piece.twin.rotation.y = p.yaw
    }
  }

  let stopped = false
  let rng: Rng = seeded(seed)
  let roundNo = 0
  let misses = 0
  let phase: Phase = 'looking'
  let current: Round | null = null
  let settleLeft = SETTLE
  const used = new Set<string>()
  /** Where each candidate is now. Only `restart` puts the room back. */
  const poses = new Map<string, Pose>()
  const listeners: (() => void)[] = []
  const notify = () => listeners.forEach((fn) => fn())

  function resetRoom() {
    poses.clear()
    for (const piece of pieces) pose(piece, homePose(piece.candidate))
  }

  function beginRound() {
    current = null
    settleLeft = SETTLE
    phase = 'looking'
    notify()
  }

  /**
   * Tries to arm this round's anomaly.
   *
   * Called every frame until it succeeds, because whether anything is eligible
   * depends on where the player is looking *now* — the room only changes
   * behind their back, so a player who stands perfectly still staring at the
   * one wall everything is against simply waits.
   */
  function tryArm(dt: number) {
    if (current || phase !== 'looking') return
    settleLeft -= dt
    if (settleLeft > 0) return
    const round = pickRound(camera, rng, { used, poses })
    if (!round) return
    current = round
    used.add(round.candidate.id)
    poses.set(round.candidate.id, round.pose)
    const piece = pieces.find((p) => p.candidate.id === round.candidate.id)
    if (piece) pose(piece, round.pose)
    notify()
  }

  const raycaster = new THREE.Raycaster()
  raycaster.far = 60
  const point = new THREE.Vector2()

  const game: AnomalyGame = {
    stage,
    round: () => roundNo,
    misses: () => misses,
    phase: () => phase,
    look: () => ({ yaw: camera.rotation.y, pitch: camera.rotation.x, roll: camera.rotation.z }),
    turn(dYaw, dPitch) {
      camera.rotation.y -= dYaw
      camera.rotation.x = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, camera.rotation.x - dPitch),
      )
      camera.updateMatrixWorld()
    },
    probe(nx, ny) {
      // #114 asks for the tap point itself rather than a fixed reticle: with
      // no d-pad there is no reason to make the player line something up
      // before they can name it.
      point.set(nx * 2 - 1, -(ny * 2 - 1))
      raycaster.setFromCamera(point, camera)
      const hit = raycaster.intersectObjects(room.children, false)[0]
      if (!hit) return null
      const id = hit.object.name
      // The shell is not an answer. Flagging a wall is neither right nor
      // wrong — it is a missed tap, and charging a life for it would make
      // looking around feel dangerous.
      return shellMaterials.has(id) ? null : id
    },
    flag(nx, ny) {
      if (phase !== 'looking' || !current) return null
      const id = game.probe(nx, ny)
      if (!id) return null
      const correct = id === current.candidate.id
      if (correct) {
        phase = roundNo + 1 >= ROUNDS ? 'won' : 'right'
        roundNo++
      } else {
        misses++
        phase = misses >= MISSES ? 'over' : 'wrong'
      }
      notify()
      return { id, correct }
    },
    anomaly: () =>
      current
        ? { id: current.candidate.id, label: current.candidate.label, kind: current.mutation.kind }
        : null,
    armed: () => current !== null,
    next() {
      // A wrong flag does not hand out a fresh anomaly. It costs a guess and
      // puts the player back in the same room looking for the same thing,
      // which is what makes a guess worth thinking about — the first version
      // started a new round on a miss, so guessing wildly was very nearly
      // free.
      if (phase === 'wrong') {
        phase = 'looking'
        notify()
        return
      }
      if (phase !== 'right') return
      beginRound()
    },
    restart() {
      rng = seeded(Date.now())
      roundNo = 0
      misses = 0
      used.clear()
      beginRound()
    },
    onChange(fn) {
      listeners.push(fn)
    },
    dispose() {
      stopped = true
      stage.dispose()
    },
  }

  let last = performance.now()
  function frame(now: number) {
    if (stopped) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    tryArm(dt)
    stage.render(scene, camera)
    requestAnimationFrame(frame)
  }

  resetRoom()
  requestAnimationFrame(frame)
  return game
}
