// Tube Runner's renderer and loop (#111, #120).
//
// Built first inside the GameBoy shell — a 160x144 target, a four-tone post
// pass, a composited 8px HUD — because #109 assumed that was where a 3D game
// belonged. #118 settled that it is not, and #120 moved this onto
// `shared/stage3d.ts`: the display's own resolution, full colour, and the fog
// doing the depth work with nothing quantised on top of it.
//
// `track.ts` and its test are untouched. The reachability bound is the heart
// of the game and never knew about the palette, and a rework that also
// rewrote the rules would have made any regression impossible to attribute.
//
// What is here is the tube, the ring pool, the fog, and the loop that moves
// the player down it.
//
// Two things #111 asks for shape almost every decision below:
//
//   - **Nothing is allocated mid-run.** The rings are a fixed pool that is
//     recycled behind the camera, and a ring changes which gap it presents by
//     *rotating*, not by having its geometry rebuilt. So one `RingGeometry`
//     serves the whole run.
//   - **Fog is tuned before anything else**, because it is the thing that
//     makes a gap resolve late, and resolving late is the entire reason this
//     game earns a third dimension.
import * as THREE from 'three'
import {
  GAP_HALF,
  PLAYER_FOOT_RADIUS,
  PLAYER_HEIGHT,
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  RING_SPACING,
  ROTATE_SPEED,
  TUBE_RADIUS,
  clearsRing,
  generateGaps,
  nextGap,
  normaliseAngle,
  seededRandom,
  speedAt,
} from './track'
import { OUTLINE } from './constants'
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'
import type { Screen } from './hud'
import { loadTubeSave, recordRun } from './save'
import { playBlip, playClear, playCrash, ensureCtx } from './audio'
import { prefersReducedMotion } from '../shared/motion'

/**
 * The lighting rig, and the whole of this game's tone separation.
 *
 * The light points straight down the tube, which is what makes the three
 * surfaces land in three different tones *by their orientation alone* rather
 * than by anyone eyeballing colours:
 *
 *   - an **obstacle ring** is a flat annulus facing the camera, so its normal
 *     is the light direction exactly: `n.l = 1`
 *   - the **tube wall** and the **ribs** are cylinders about that same axis,
 *     so their normals are radial and perpendicular to it: `n.l = 0`
 *
 * With `AMBIENT = 0.55` and `DIRECTIONAL = 0.85`, and each surface's base
 * luminance chosen against that:
 *
 *   surface   base   luma = base * (AMBIENT + DIRECTIONAL * n.l)
 *   ring      0.62   0.62 * 1.40 = 0.868
 *   rib       1.00   1.00 * 0.55 = 0.550
 *   wall      0.60   0.60 * 0.55 = 0.330
 *   sky       —      the scene clears to black
 *
 * Nothing clips — the brightest value in the table is 0.868 — so the ordering
 * is real and not an artefact of rounding.
 *
 * #120 removed the four-tone quantiser this was originally written against,
 * and was explicit that the *principle* had to survive it: the thing that can
 * end a run must be separable from its background by more than hue alone. It
 * does survive, because none of the reasoning above was about the palette —
 * it is about which way each surface faces. A ring is nearly three times the
 * wall's luminance, before any colour is chosen.
 *
 * Fog then walks each of those down with distance, which is how a ring
 * resolves: it emerges from the sky, brightens through the wall's value, and
 * is only unambiguously an obstacle once it is near the top of the range.
 */
const AMBIENT = 0.55
const DIRECTIONAL = 0.85
const WALL_LUMA = 0.6
const RIB_LUMA = 1
const RING_LUMA = 0.62

/**
 * Where the fog starts and ends, in world units ahead of the player.
 *
 * Tuned first, as #111 says to. The numbers matter to fairness as much as to
 * looks: `FOG_FAR` is how far the player can see at all, and it has to leave
 * more than the one ring the reachability bound assumes they are reacting to.
 * At 34 units that is about five and a half ring spacings of warning, and a
 * ring is already `light` two spacings out — comfortably before the point
 * where they have to commit to a direction.
 */
const FOG_NEAR = 4
const FOG_FAR = 30

/**
 * Where the camera sits relative to the runner.
 *
 * It used to sit at 0.35 from the axis — near the middle of the tube, looking
 * straight down it — because the player had no body and the camera *was* the
 * player. That is what made the hitbox wrong: the ring is solid only between
 * `RING_INNER_RADIUS` and `RING_OUTER_RADIUS`, so a camera at 0.35 passed
 * through the open middle of every ring while the game decided crashes from an
 * angle nothing had physically tested.
 *
 * Now the camera trails a runner who is genuinely inside that band. It sits
 * inward of them (so they appear low in the frame, running on the floor) and
 * behind them, which is also what makes a run cycle worth animating: from the
 * middle of the tube there was nobody to watch.
 */
// Inward of the runner's head, so they read as standing on a floor below the
// lens rather than hanging beside it, and far enough back that they occupy the
// lower third instead of the middle of the frame.
const CAM_RADIUS = (PLAYER_FOOT_RADIUS - PLAYER_HEIGHT) * 0.62
const CAM_BACK = 4.4
const CAM_LOOK_AHEAD = 13
/** How far toward the axis the camera aims, so the runner sits below centre. */
const CAM_LOOK_RADIUS = CAM_RADIUS * 0.35

/**
 * The height the runner is modelled at, before scaling.
 *
 * The parts below are laid out at a comfortable size to read and edit; the
 * group is then scaled so its real height is exactly `PLAYER_HEIGHT`. That
 * keeps the one number the collision check depends on in charge of the mesh,
 * rather than the two being set independently and drifting — which is the
 * mistake that produced the original hitbox.
 */
const RUNNER_MESH_HEIGHT = 0.8

/** Leg swing amplitude, and how fast the cycle runs per unit of speed. */
const STRIDE = 0.62
const CADENCE = 1.15

/**
 * How many rings exist. Never more, never fewer, never reallocated.
 *
 * Seven spacings is 42 units, comfortably past `FOG_FAR`, so a ring is always
 * recycled into place while it is still invisible inside the fog.
 */
const RING_POOL = 7

/** Ribs, for the sense of travel. Same recycling rule as the rings. */
const RIB_POOL = 14
const RIB_SPACING = 3

/** How far behind the player a ring or rib may fall before it is recycled. */
const BEHIND = 4

/**
 * Clear distance before the first ring of a run, in world units.
 *
 * Without it the first ring arrives 0.85 seconds after the A button, which is
 * long enough to clear it — the opening gap is directly ahead — but not long
 * enough to have looked at the tube first. Two seconds of empty tube is the
 * difference between a run that starts and one that ambushes.
 */
const OPENING_RUNWAY = RING_SPACING * 2.5

/** Seconds the end screen ignores input, matching shared/runSummary. */
const OVER_LOCK = 0.5

/** The handle `exposeForQA` publishes. */
export interface TubeGame {
  screen(): Screen
  /** Rings cleared this run. */
  rings(): number
  best(): number
  /** The player's angle around the tube, in radians. */
  angle(): number
  /** The gap angle of the next ring the player has not passed, or null. */
  nextGapAngle(): number | null
  /** Distance to that ring, in world units. */
  nextGapDistance(): number | null
  /** Forward speed right now, in world units per second. */
  speed(): number
  /**
   * The run cycle's phase, in radians.
   *
   * Advances with distance travelled rather than with time, so it is also the
   * check that the legs are driven by the run and not by a clock.
   */
  stridePhase(): number
  /** The run that just ended beat the stored best. */
  isRecord(): boolean
  /** 1 just after a ring is cleared, decaying. */
  clearFlash(): number
  /** Seconds since load, for blinking prompts. */
  clock(): number
  stage: Stage3D
  onChange(fn: () => void): void
  /** Start or retry. */
  press(): void
  /** Hold a direction: -1, 1, or 0 for neither. */
  steer(direction: -1 | 0 | 1): void
}

interface Ring {
  mesh: THREE.Mesh
  z: number
  gap: number
  /** Index in the generated sequence, so the score counts each ring once. */
  index: number
}

export function createGame(parent: HTMLElement): TubeGame {
  const stage = createStage3D({ parent, background: 0x000000 })

  const scene = new THREE.Scene()
  // Fog colour matched to the clear colour exactly. Any mismatch shows up as a
  // rectangle of slightly-wrong colour where the tube ends and the sky begins.
  // At four tones that was a hard edge; in full colour it is a soft one, which
  // is worse — a soft wrong edge reads as something in the distance.
  scene.background = new THREE.Color(0x000000)
  scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR)

  // 62 degrees, not the 72 this started at. A wider lens makes the nearest ring
// subtend most of the frame, and with five rings inside the fog that stacked
// into concentric bright bands with almost no wall left between them — the
// gaps were there but the picture was too busy to read one at a glance.
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, FOG_FAR + 8)
  stage.track(camera)

  // Straight down the tube. See the tone table above.
  const light = new THREE.DirectionalLight(0xffffff, lambertIntensity(DIRECTIONAL))
  light.position.set(0, 0, -1)
  light.target.position.set(0, 0, 0)
  scene.add(light)
  scene.add(light.target)
  scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(AMBIENT)))

  /**
   * Surface colours: a hue per surface, normalised to the luminance the table
   * above assigns it.
   *
   * The normalisation is the whole point and is what #120 asked to preserve.
   * Hue is the decoration; the luminance ordering is the information, and it
   * has to survive whatever hues are chosen. Picking colours that merely
   * *looked* different would put a game-ending obstacle and the wall behind it
   * at the same brightness for anyone who cannot separate them by hue.
   */
  function surfaceColour(kind: 'wall' | 'rib' | 'ring'): THREE.Color {
    const luma = kind === 'wall' ? WALL_LUMA : kind === 'rib' ? RIB_LUMA : RING_LUMA
    const hue = kind === 'wall' ? 0.58 : kind === 'rib' ? 0.52 : 0.09
    const c = new THREE.Color().setHSL(hue, 0.45, 0.55)
    const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    return c.multiplyScalar(luma / Math.max(l, 1e-4))
  }

  const wallMaterial = new THREE.MeshLambertMaterial({
    color: surfaceColour('wall'),
    side: THREE.BackSide,
    flatShading: true,
  })
  const ribMaterial = new THREE.MeshLambertMaterial({
    color: surfaceColour('rib'),
    side: THREE.BackSide,
    flatShading: true,
  })
  const ringMaterial = new THREE.MeshLambertMaterial({
    color: surfaceColour('ring'),
    // The player sees the front of a ring approaching and the back of one just
    // passed; a single-sided annulus would blink out of existence at the
    // moment of the crossing, which is the moment it matters most.
    side: THREE.DoubleSide,
    flatShading: true,
  })

  // ------------------------------------------------------------------- tube

  // One long cylinder that travels with the player, rather than a run of them
  // recycled: the wall has no features to mark position, so nothing is gained
  // by segmenting it and a single mesh cannot show a seam.
  const tubeLength = FOG_FAR + 20
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, tubeLength, 18, 1, true),
    wallMaterial,
  )
  tube.rotation.x = Math.PI / 2
  scene.add(tube)

  // Ribs are what actually show speed. The wall is featureless by design —
  // it has to be, or it would compete with the rings for the player's eye —
  // so without these the run reads as standing still in a tunnel.
  // Set against the wall rather than out in the tube: at 0.94 the ribs sat
  // inside the rings' radial band and the two competed, which cost the rings
  // the salience they need as the only thing that can end a run.
  const ribGeometry = new THREE.CylinderGeometry(
    TUBE_RADIUS * 0.97,
    TUBE_RADIUS * 0.97,
    0.35,
    18,
    1,
    true,
  )
  const ribs: { mesh: THREE.Mesh; z: number }[] = []
  for (let i = 0; i < RIB_POOL; i++) {
    const mesh = new THREE.Mesh(ribGeometry, ribMaterial)
    mesh.rotation.x = Math.PI / 2
    scene.add(mesh)
    ribs.push({ mesh, z: i * RIB_SPACING })
  }

  // ---------------------------------------------------------------- runner

  /**
   * The player, as an actual body in the world.
   *
   * Built from boxes rather than loaded: at this size the whole figure is
   * around twenty pixels tall, so a model would be wasted and a silhouette is
   * all that survives. What has to read is the *cycle* — legs alternating —
   * because that is the only thing that says "running" rather than "sliding".
   *
   * Every part carries a `darkest` outline for the reason CLAUDE.md gives:
   * the runner's camera-facing side is lit head-on, exactly like an obstacle
   * ring, so the two land on the same tone. The outline is what keeps the
   * runner readable when a ring passes directly behind them.
   */
  const runner = new THREE.Group()
  const runnerMaterial = new THREE.MeshLambertMaterial({
    color: surfaceColour('ring'),
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const outlineMaterial = new THREE.LineBasicMaterial({ color: OUTLINE })

  function limb(w: number, h: number, d: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(w, h, d)
    const mesh = new THREE.Mesh(geometry, runnerMaterial)
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outlineMaterial))
    return mesh
  }

  /**
   * A limb that swings from a joint.
   *
   * The mesh hangs below an empty group placed at the hip or shoulder, so
   * rotating the group swings the limb about its top end rather than about its
   * middle — which is the difference between a leg and a spinning stick.
   */
  function joint(at: THREE.Vector3, w: number, h: number, d: number): THREE.Group {
    const group = new THREE.Group()
    group.position.copy(at)
    const mesh = limb(w, h, d)
    mesh.position.y = -h / 2
    group.add(mesh)
    return group
  }

  const torso = limb(0.3, 0.34, 0.2)
  torso.position.y = 0.42
  const head = limb(0.21, 0.19, 0.19)
  head.position.y = 0.68
  const legLeft = joint(new THREE.Vector3(-0.08, 0.26, 0), 0.11, 0.28, 0.11)
  const legRight = joint(new THREE.Vector3(0.08, 0.26, 0), 0.11, 0.28, 0.11)
  const armLeft = joint(new THREE.Vector3(-0.19, 0.55, 0), 0.09, 0.24, 0.09)
  const armRight = joint(new THREE.Vector3(0.19, 0.55, 0), 0.09, 0.24, 0.09)
  runner.add(torso, head, legLeft, legRight, armLeft, armRight)
  runner.scale.setScalar(PLAYER_HEIGHT / RUNNER_MESH_HEIGHT)
  scene.add(runner)

  /** Advances the run cycle and places the runner on the tube wall. */
  function poseRunner(phase: number, reduced: boolean) {
    const swing = Math.sin(phase) * STRIDE
    legLeft.rotation.x = swing
    legRight.rotation.x = -swing
    // Arms counter-swing. Without it the figure reads as hopping rather than
    // running, which at twenty pixels is most of what sells the animation.
    armLeft.rotation.x = -swing * 0.75
    armRight.rotation.x = swing * 0.75

    // The bob is the one part that is decoration: the cycle itself is
    // locomotion the player reads as speed, but the vertical bounce carries no
    // information, so shared/motion.ts takes it and leaves the rest.
    const bob = reduced ? 0 : Math.abs(Math.cos(phase)) * 0.04

    // Feet on the wall; the bob lifts them a little toward the axis, which is
    // "up" for someone standing on the inside of a tube.
    const radius = PLAYER_FOOT_RADIUS - bob
    runner.position.set(Math.cos(playerAngle) * radius, Math.sin(playerAngle) * radius, playerZ)
    // Stand the runner on the wall: local +Y points inward at the axis, local
    // +Z stays forward down the tube. A rotation about Z of `angle + PI/2`
    // maps +Y onto -radial, which is exactly that.
    runner.rotation.z = playerAngle + Math.PI / 2
    // Lean into the turn. Decorative, and the only thing here that tells the
    // player the difference between holding a direction and having released it.
    runner.rotation.y = reduced ? 0 : -steering * 0.25
  }

  // ------------------------------------------------------------- ring pool

  // The gap is cut at angle 0 and the mesh is *rotated* to place it. That is
  // what lets one geometry serve every ring for the whole run: changing which
  // gap a recycled ring presents costs a `rotation.z`, not a rebuild.
  // A hoop rather than a disc with a hole, but a much deeper one than it began
  // as. The band has to be wide enough to actually contain the runner — that
  // is what makes the angular collision test true — while still leaving the
  // wall and its ribs visible between one ring and the next. Both radii live
  // in track.ts beside the test that depends on them.
  const ringGeometry = new THREE.RingGeometry(
    RING_INNER_RADIUS,
    RING_OUTER_RADIUS,
    28,
    1,
    GAP_HALF,
    Math.PI * 2 - GAP_HALF * 2,
  )
  const rings: Ring[] = []
  for (let i = 0; i < RING_POOL; i++) {
    const mesh = new THREE.Mesh(ringGeometry, ringMaterial)
    scene.add(mesh)
    rings.push({ mesh, z: 0, gap: 0, index: i })
  }

  // ------------------------------------------------------------- run state

  let screen: Screen = 'title'
  let playerAngle = 0
  let steering: -1 | 0 | 1 = 0
  let playerZ = 0
  let cleared = 0
  let spawned = 0
  let lastGap = 0
  let rand = seededRandom(1)
  let best = loadTubeSave().best
  let isRecord = false
  let overAt = 0
  let elapsed = 0
  let clearFlash = 0
  /** Advances with distance travelled, so the stride matches the speed. */
  let runPhase = 0

  const listeners: (() => void)[] = []
  /**
   * Told when the score, the screen or the record changes — not every frame.
   *
   * The clear flash decays continuously and is polled by the HUD instead.
   * Rebuilding the HUD's DOM sixty times a second to move a counter that
   * changes a few times a run would be the wrong trade.
   */
  const notify = () => listeners.forEach((fn) => fn())

  const speed = () => speedAt(cleared)

  /** Places ring `r` at the far end of the pool with the next generated gap. */
  function recycle(r: Ring, z: number) {
    lastGap = nextGap(lastGap, speedAt(spawned), rand)
    r.z = z
    r.gap = lastGap
    r.index = spawned
    r.mesh.position.z = z
    r.mesh.rotation.z = lastGap
    spawned++
  }

  function reset() {
    playerAngle = 0
    steering = 0
    playerZ = 0
    cleared = 0
    spawned = 0
    clearFlash = 0
    isRecord = false
    // A fresh seed each run, so a track is never memorised — but generated
    // through the same bounded walk, so it is never unfair either.
    rand = seededRandom((Math.random() * 0xffffffff) >>> 0)
    // Seed the first gap directly ahead: the run should not open by demanding
    // a turn before the player has seen anything.
    lastGap = 0
    const opening = generateGaps(RING_POOL, rand)
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i]
      r.z = OPENING_RUNWAY + i * RING_SPACING
      r.gap = opening[i]
      r.index = i
      r.mesh.position.z = r.z
      r.mesh.rotation.z = r.gap
    }
    lastGap = opening[opening.length - 1]
    spawned = RING_POOL
    for (let i = 0; i < ribs.length; i++) ribs[i].z = i * RIB_SPACING
  }

  function showTitle() {
    reset()
    screen = 'title'
    notify()
  }

  function startRun() {
    reset()
    screen = 'run'
    notify()
  }

  function endRun() {
    screen = 'over'
    overAt = elapsed
    const result = recordRun(cleared)
    best = result.best
    isRecord = result.isRecord
    playCrash()
    // After the record is resolved, not before: the HUD reads `best` and
    // `isRecord` when it is told, and telling it first shows the previous
    // run's numbers on the screen announcing this one.
    notify()
  }

  function press() {
    if (screen === 'run') return
    if (screen === 'over' && elapsed - overAt < OVER_LOCK) return
    playBlip()
    startRun()
  }

  // ---------------------------------------------------------------- the loop

  let last = performance.now()
  const lookAt = new THREE.Vector3()

  function frame(now: number) {
    // Clamped: a backgrounded tab hands back a delta of seconds, which would
    // teleport the player through several rings between two frames and end a
    // run they were not present for.
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now
    elapsed += dt
    clearFlash = Math.max(0, clearFlash - dt * 3)

    if (screen === 'run') {
      // Direct angular velocity, not an eased one. The reachability bound in
      // track.ts is derived from ROTATE_SPEED being a rate the player actually
      // achieves; easing into it would make every generated track slightly
      // harder than the bound promises, which is the exact unfairness the
      // bound exists to rule out.
      playerAngle = normaliseAngle(playerAngle + steering * ROTATE_SPEED * dt)

      const previousZ = playerZ
      playerZ += speed() * dt
      // Driven by speed, not by wall-clock time, so the stride keeps pace with
      // the run rather than looking like a treadmill as the tube accelerates.
      runPhase += speed() * CADENCE * dt

      for (const r of rings) {
        // Crossing the plane of a ring is the only moment collision is tested
        // — one angular comparison per ring per run, which is what keeps this
        // game free of a physics dependency.
        if (previousZ < r.z && playerZ >= r.z) {
          if (!clearsRing(playerAngle, r.gap)) {
            endRun()
            break
          }
          cleared++
          notify()
          clearFlash = 1
          playClear(cleared)
        }
      }
    }

    // Recycling runs on every screen so the title has a moving tube behind it.
    if (screen !== 'over') {
      for (const r of rings) {
        if (r.z < playerZ - BEHIND) {
          const furthest = rings.reduce((m, o) => Math.max(m, o.z), -Infinity)
          recycle(r, furthest + RING_SPACING)
        }
      }
      for (const rib of ribs) {
        if (rib.z < playerZ - BEHIND) rib.z += RIB_POOL * RIB_SPACING
        rib.mesh.position.z = rib.z
      }
      if (screen === 'title') {
        playerZ += speedAt(0) * dt * 0.45
        runPhase += speedAt(0) * CADENCE * dt * 0.45
      }
    }

    tube.position.z = playerZ + tubeLength / 2 - BEHIND

    // The camera rolls with the player rather than orbiting them: `up` points
    // inward, at the tube's axis, so the player's side of the tube is always
    // the bottom of the frame and the HUD marker can be a fixed chevron there.
    const reduced = prefersReducedMotion()
    poseRunner(runPhase, reduced)

    const radialX = Math.cos(playerAngle)
    const radialY = Math.sin(playerAngle)
    // Behind the runner and inward of them, so they sit low in the frame with
    // the tube opening out ahead. `up` points at the axis, which is what makes
    // the player's side of the tube read as the floor.
    camera.position.set(radialX * CAM_RADIUS, radialY * CAM_RADIUS, playerZ - CAM_BACK)
    camera.up.set(-radialX, -radialY, 0)
    lookAt.set(
      radialX * CAM_LOOK_RADIUS,
      radialY * CAM_LOOK_RADIUS,
      playerZ + CAM_LOOK_AHEAD,
    )
    camera.lookAt(lookAt)

    stage.render(scene, camera)

    requestAnimationFrame(frame)
  }

  showTitle()
  requestAnimationFrame(frame)

  /** The nearest ring the player has not yet passed. */
  function upcoming(): Ring | null {
    let bestRing: Ring | null = null
    for (const r of rings) {
      if (r.z >= playerZ && (!bestRing || r.z < bestRing.z)) bestRing = r
    }
    return bestRing
  }

  return {
    screen: () => screen,
    rings: () => cleared,
    best: () => best,
    angle: () => playerAngle,
    nextGapAngle: () => upcoming()?.gap ?? null,
    nextGapDistance: () => {
      const r = upcoming()
      return r ? r.z - playerZ : null
    },
    speed,
    stridePhase: () => runPhase,
    isRecord: () => isRecord,
    clearFlash: () => clearFlash,
    clock: () => elapsed,
    stage,
    onChange(fn) {
      listeners.push(fn)
    },
    press,
    steer(direction) {
      if (direction !== 0) ensureCtx()
      steering = direction
    },
  }
}
