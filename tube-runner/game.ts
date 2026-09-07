// Tube Runner's renderer and loop (#111).
//
// The pipeline — a 160x144 target, the four-tone post pass, the HUD composite
// — is `shared/gb3d.ts`. What is here is the tube, the ring pool, the fog, and
// the loop that moves the player down it.
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
import { PAL } from './constants'
import { GB_HEIGHT, GB_WIDTH, createGb3d, gbIntensity } from '../shared/gb3d'
import { createHud, type Screen } from './hud'
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
 *   surface   base   luma = base * (AMBIENT + DIRECTIONAL * n.l)   tone
 *   ring      0.62   0.62 * 1.40 = 0.868                           3 lightest
 *   rib       1.00   1.00 * 0.55 = 0.550                           2 light
 *   wall      0.60   0.60 * 0.55 = 0.330                           1 dark
 *   sky       —      the scene clears to black                     0 darkest
 *
 * Nothing clips — the brightest value in the table is 0.868 — so this is what
 * the framebuffer contains, not an approximation of it, and
 * `qa/touch/tube-runner.mjs` reads it back to check.
 *
 * Fog then walks each of those *down* the ramp with distance, which is how a
 * ring resolves: it emerges from the sky's tone, becomes `dark`, then `light`,
 * and is only unambiguously an obstacle once it is `lightest`.
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

/** Camera distance from the tube's axis. */
const CAM_RADIUS = 0.35

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
  mono(): boolean
  setPalette(mono: boolean): void
  readPixels(): Uint8Array
  /** Start or retry. What the A button does. */
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
  const hud = createHud()
  const gb = createGb3d({ parent, hudCanvas: hud.canvas, ramp: PAL })

  const scene = new THREE.Scene()
  // Fog colour matched to the clear colour exactly. Any mismatch shows up as a
  // rectangle of slightly-wrong tone where the tube ends and the sky begins,
  // and at four tones that is a hard edge rather than a soft one.
  scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR)

  // 62 degrees, not the 72 this started at. A wider lens makes the nearest ring
// subtend most of the frame, and with five rings inside the fog that stacked
// into concentric bright bands with almost no wall left between them — the
// gaps were there but the picture was too busy to read one at a glance.
const camera = new THREE.PerspectiveCamera(62, GB_WIDTH / GB_HEIGHT, 0.1, FOG_FAR + 8)

  // Straight down the tube. See the tone table above.
  const light = new THREE.DirectionalLight(0xffffff, gbIntensity(DIRECTIONAL))
  light.position.set(0, 0, -1)
  light.target.position.set(0, 0, 0)
  scene.add(light)
  scene.add(light.target)
  scene.add(new THREE.AmbientLight(0xffffff, gbIntensity(AMBIENT)))

  let mono = true

  const grey = (luma: number) => new THREE.Color(luma, luma, luma)
  /**
   * Surface colours. MONO gets neutral greys so the tone table above holds
   * exactly; COLOR gets hues at the same luminance, so the toggle changes the
   * palette and not the readability.
   */
  function surfaceColour(kind: 'wall' | 'rib' | 'ring'): THREE.Color {
    const luma = kind === 'wall' ? WALL_LUMA : kind === 'rib' ? RIB_LUMA : RING_LUMA
    if (mono) return grey(luma)
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

  // ------------------------------------------------------------- ring pool

  // The gap is cut at angle 0 and the mesh is *rotated* to place it. That is
  // what lets one geometry serve every ring for the whole run: changing which
  // gap a recycled ring presents costs a `rotation.z`, not a rebuild.
  // A hoop rather than a disc with a hole. At 0.72 the annulus was wide enough
  // to hide the wall behind it, and the wall is what carries the sense of
  // travel; 0.8 keeps the ring unmistakably an obstacle while leaving the
  // ribs visible between one ring and the next.
  const ringGeometry = new THREE.RingGeometry(
    TUBE_RADIUS * 0.8,
    TUBE_RADIUS,
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
  }

  function startRun() {
    reset()
    screen = 'run'
  }

  function endRun() {
    screen = 'over'
    overAt = elapsed
    const result = recordRun(cleared)
    best = result.best
    isRecord = result.isRecord
    playCrash()
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
      if (screen === 'title') playerZ += speedAt(0) * dt * 0.45
    }

    tube.position.z = playerZ + tubeLength / 2 - BEHIND

    // The camera rolls with the player rather than orbiting them: `up` points
    // inward, at the tube's axis, so the player's side of the tube is always
    // the bottom of the frame and the HUD marker can be a fixed chevron there.
    const radialX = Math.cos(playerAngle)
    const radialY = Math.sin(playerAngle)
    camera.position.set(radialX * CAM_RADIUS, radialY * CAM_RADIUS, playerZ)
    camera.up.set(-radialX, -radialY, 0)
    lookAt.set(radialX * CAM_RADIUS, radialY * CAM_RADIUS, playerZ + 10)
    camera.lookAt(lookAt)

    hud.draw({
      screen,
      rings: cleared,
      best,
      isRecord,
      mono,
      reducedMotion: prefersReducedMotion(),
      t: elapsed,
      clearFlash,
    })
    gb.needsHudUpdate()
    gb.present(scene, camera)

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
    mono: () => mono,
    setPalette(next) {
      mono = next
      gb.setPalette(next)
      wallMaterial.color.copy(surfaceColour('wall'))
      ribMaterial.color.copy(surfaceColour('rib'))
      ringMaterial.color.copy(surfaceColour('ring'))
    },
    readPixels: gb.readPixels,
    press,
    steer(direction) {
      if (direction !== 0) ensureCtx()
      steering = direction
    },
  }
}
