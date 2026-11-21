// Minigolf's renderer and loop (#113), on the standalone stage (#118).
//
// The camera is fixed per hole and frames the whole thing. #113 is explicit
// that it should be: a camera the player also has to control doubles the input
// surface for no gain, and this game already asks them to judge a slope and a
// power in one gesture.
import * as THREE from 'three'
import {
  BALL_RADIUS,
  COURSE,
  MAX_PUTT_SPEED,
  createSim,
  type Sim,
} from './physics'
import type { Hole } from './holes'
import { createGrassMaterials, createGreenGeometry } from './grass'
import { prefersReducedMotion } from '../shared/motion'
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'

const COLOURS = {
  background: 0x0d1a14,
  wall: 0xc9d6cd,
  cup: 0x101a14,
  flag: 0xe4573d,
  ball: 0xf7f7f2,
  aim: 0xffd166,
  aimStrong: 0xef476f,
}

/** How far above the cup the flag reaches, for drawing and for framing. */
const FLAG_TOP = 1.6

/** Aim shaft length at full power, in world units. */
const AIM_LENGTH = 3.2
/** Below this a release is a cancel, not a stroke. */
export const MIN_POWER = 0.06

export type Phase = 'aiming' | 'rolling' | 'holed' | 'card'
export type ViewMode = 'follow' | 'overview'

export interface MinigolfGame {
  stage: Stage3D
  hole(): number
  holeName(): string
  par(): number
  strokes(): number
  /** Strokes taken on each hole so far. */
  card(): number[]
  phase(): Phase
  viewMode(): ViewMode
  toggleView(): void
  /** Camera's horizontal forward and right unit vectors, for screen-aligned aiming. */
  cameraBasis(): { forwardX: number; forwardZ: number; rightX: number; rightZ: number }
  /** True when a stroke may be taken — the ball has genuinely stopped. */
  canPutt(): boolean
  ball(): { x: number; y: number; z: number }
  ballSpeed(): number
  /** Current aim, as a unit vector in the board plane, and 0..1 power. */
  aim(): { x: number; z: number; power: number }
  /** Set the aim while dragging. `x`/`z` need not be normalised. */
  setAim(x: number, z: number, power: number): void
  /** Strike with the current aim. Ignored below `MIN_POWER` or while rolling. */
  strike(): boolean
  /** Abandon the current aim without striking. */
  cancelAim(): void
  nextHole(): void
  restartCourse(): void
  goTo(index: number): void
  onChange(fn: () => void): void
  dispose(): void
}

export function createGame(parent: HTMLElement): MinigolfGame {
  // Set once the first hole is loaded, so the resize callback below — which a
  // ResizeObserver fires as soon as the canvas is measured — cannot try to
  // frame a hole that does not exist yet.
  let ready = false
  const stage = createStage3D({
    parent,
    background: COLOURS.background,
    // The framing is computed against the viewport's aspect ratio, so it has
    // to be recomputed when that changes. Without this, rotating a phone
    // reframes the canvas and crops the hole.
    onResize: () => {
      if (ready) {
        computeOverviewFrame()
        if (viewMode === 'overview') {
          camPos.copy(overviewPos)
          camLook.copy(overviewLook)
          applyCamera()
        }
      }
    },
  })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOURS.background)

  stage.renderer.shadowMap.enabled = true
  stage.renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300)
  stage.track(camera)

  scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(0.5)))
  const key = new THREE.DirectionalLight(0xfffdf6, lambertIntensity(0.85))
  key.position.set(5, 14, 6)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)
  scene.add(key.target)
  const fill = new THREE.DirectionalLight(0xbfe3ff, lambertIntensity(0.3))
  fill.position.set(-8, 5, -7)
  scene.add(fill)

  const course = new THREE.Group()
  scene.add(course)

  const grass = createGrassMaterials(stage.renderer)
  const wallMaterial = new THREE.MeshLambertMaterial({ color: COLOURS.wall })

  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: COLOURS.ball }),
  )
  ballMesh.castShadow = true
  scene.add(ballMesh)

  // The aim indicator is a stretched box rather than a `Line`. A line is one
  // device pixel wide whatever the resolution, which on a phone is a thread
  // you cannot see against a green.
  const aimMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.02, 1),
    new THREE.MeshBasicMaterial({ color: COLOURS.aim }),
  )
  aimMesh.visible = false
  scene.add(aimMesh)

  let sim: Sim
  let hole: Hole
  let holeIndex = 0
  let phase: Phase = 'aiming'
  let viewMode: ViewMode = 'follow'
  let strokes = 0
  const scores: number[] = []
  let aimX = 0
  let aimZ = -1
  let aimPower = 0
  let holedFor = 0
  const listeners: (() => void)[] = []
  const notify = () => listeners.forEach((fn) => fn())

  // Dynamic 3D camera state: smoothed position, look-at target, and yaw angle
  // behind the ball. Overview targets are cached on hole load / resize.
  let camYaw = Math.PI
  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()
  const desiredPos = new THREE.Vector3()
  const desiredLook = new THREE.Vector3()
  const overviewPos = new THREE.Vector3()
  const overviewLook = new THREE.Vector3()
  const camForward = new THREE.Vector3()

  let built: THREE.Mesh[] = []

  function buildHole() {
    for (const mesh of built) {
      course.remove(mesh)
      mesh.geometry.dispose()
    }
    built = []

    for (const box of hole.boxes) {
      const isGreen = box.surface === 'green'
      const geometry = isGreen
        ? createGreenGeometry(box)
        : new THREE.BoxGeometry(box.w, box.h, box.d)
      // Slopes get the second green, so a ramp reads as a ramp before the ball
      // has been anywhere near it. This used to alternate on the box's index,
      // which happened to tone `Rise`'s ramp correctly and only because the
      // ramp happened to be authored second — inserting a box ahead of it
      // would have silently swapped the two greens over.
      const sloped = Boolean(box.tiltX || box.tiltZ)
      const material = isGreen ? (sloped ? grass.slope : grass.flat) : wallMaterial
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(box.x, box.y, box.z)
      if (box.tiltX || box.tiltZ) mesh.rotation.set(box.tiltX ?? 0, 0, box.tiltZ ?? 0)
      mesh.castShadow = true
      mesh.receiveShadow = true
      course.add(mesh)
      built.push(mesh)
    }

    // Fit the directional shadow frustum tightly around the current hole so
    // shadows cast onto the turf stay crisp on every layout.
    const bounds = new THREE.Box3()
    for (const c of holeCorners()) bounds.expandByPoint(c)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3())
    const halfSpan = Math.max(size.x, size.z) * 0.65 + 2
    key.target.position.copy(center)
    key.position.set(center.x + 5, center.y + 14, center.z + 6)
    key.shadow.camera.left = -halfSpan
    key.shadow.camera.right = halfSpan
    key.shadow.camera.top = halfSpan
    key.shadow.camera.bottom = -halfSpan
    key.shadow.camera.near = 2
    key.shadow.camera.far = 40
    key.shadow.camera.updateProjectionMatrix()

    // A trimmed turf collar sits around the dark cup disc so the hole reads as
    // cut into the grass rather than pasted on top of it.
    const cupCollar = new THREE.Mesh(
      new THREE.RingGeometry(0.29, 0.37, 24),
      grass.cupCollar,
    )
    cupCollar.rotation.x = -Math.PI / 2
    cupCollar.position.set(hole.cup.x, hole.cup.y + 0.008, hole.cup.z)
    cupCollar.receiveShadow = true
    course.add(cupCollar)
    built.push(cupCollar)

    // The cup, as a dark disc laid on the surface, and a flag so it is findable
    // from across the hole. A real hole in the mesh would mean cutting geometry
    // for a target the ball is tested against by distance anyway.
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20),
      new THREE.MeshBasicMaterial({ color: COLOURS.cup }),
    )
    cup.position.set(hole.cup.x, hole.cup.y + 0.02, hole.cup.z)
    course.add(cup)
    built.push(cup)

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8),
      new THREE.MeshLambertMaterial({ color: COLOURS.wall }),
    )
    pole.position.set(hole.cup.x, hole.cup.y + 0.8, hole.cup.z)
    pole.castShadow = true
    course.add(pole)
    built.push(pole)

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.32, 0.02),
      new THREE.MeshLambertMaterial({ color: COLOURS.flag }),
    )
    flag.position.set(hole.cup.x + 0.27, hole.cup.y + 1.4, hole.cup.z)
    flag.castShadow = true
    course.add(flag)
    built.push(flag)
  }

  /**
   * The direction the camera sits in from the hole, and how much of the frame
   * the hole is allowed to fill.
   *
   * The lens is wide and the angle is low because these holes are long and
   * narrow: framing the depth from far enough back to see all of it leaves the
   * width a ribbon, so the camera comes in and drops instead, letting the far
   * end foreshorten rather than shrinking the near end.
   */
  const VIEW_DIR = new THREE.Vector3(0, 0.7, 0.82).normalize()
  const FILL = 0.86

  const corner = new THREE.Vector3()

  /** Every corner of every box, in world space — what the frame has to hold. */
  function holeCorners(): THREE.Vector3[] {
    const out: THREE.Vector3[] = []
    for (const b of hole.boxes) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(b.tiltX ?? 0, 0, b.tiltZ ?? 0),
      )
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            out.push(
              corner
                .set((sx * b.w) / 2, (sy * b.h) / 2, (sz * b.d) / 2)
                .applyQuaternion(q)
                .add(new THREE.Vector3(b.x, b.y, b.z))
                .clone(),
            )
          }
        }
      }
    }
    // The flagstick, which is not a box in the hole but is drawn above the cup
    // and was being cropped off the top of the frame by a fit that had never
    // heard of it.
    out.push(new THREE.Vector3(hole.cup.x, hole.cup.y + FLAG_TOP, hole.cup.z))
    return out
  }

  /**
   * Frames the whole hole, whatever shape it is.
   *
   * Measured rather than guessed. The first version placed the camera at a
   * multiple of the hole's longest side and hoped, which held for the straight
   * hole it was tuned on and cropped the near end off both of the others — an
   * L is wide where a corridor is not, and a raised green puts geometry a
   * metre above the plane the estimate was made in. Worse, the right multiple
   * depends on the viewport's aspect ratio, so a framing that fits on a laptop
   * crops on a phone.
   *
   * So: project the hole's corners, and pull back until they fit. Two passes
   * settle it because the projected size is very nearly inversely proportional
   * to the distance, so the first correction is almost exact and the second
   * only cleans up the perspective error. Then slide the camera sideways and
   * up to centre what it can actually see, which is not the hole's centroid —
   * the near end is closer, so it projects larger and sits lower in frame than
   * a symmetric fit would suggest.
   */
  function applyCamera() {
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    camera.updateMatrixWorld()
  }

  /** Horizontal yaw angle (radians) from (bx, bz) toward the cup. */
  function angleToCup(bx: number, bz: number): number {
    const dx = hole.cup.x - bx
    const dz = hole.cup.z - bz
    if (Math.hypot(dx, dz) < 0.15) return camYaw
    return Math.atan2(dx, dz)
  }

  /** Shortest-path angular interpolation. */
  function lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
    if (diff < -Math.PI) diff += Math.PI * 2
    return a + diff * t
  }

  function computeOverviewFrame() {
    const savedPos = camera.position.clone()
    const savedQuat = camera.quaternion.clone()

    const box = new THREE.Box3()
    const corners = holeCorners()
    for (const c of corners) box.expandByPoint(c)
    const centre = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    const pan = new THREE.Vector3()
    let distance = Math.max(size.x, size.z, 1) * 1.1

    /** Projected half-extents of the hole, in NDC. */
    function measure(): { x: number; y: number; cx: number; cy: number } {
      camera.position.copy(centre).addScaledVector(VIEW_DIR, distance).add(pan)
      camera.lookAt(centre.x + pan.x, centre.y + pan.y, centre.z + pan.z)
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const c of corners) {
        const p = corner.copy(c).project(camera)
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      }
      return {
        x: (maxX - minX) / 2,
        y: (maxY - minY) / 2,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
      }
    }

    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    for (let i = 0; i < 3; i++) {
      const m = measure()
      distance *= Math.max(m.x, m.y) / FILL
      const halfHeight = distance * Math.tan((camera.fov * Math.PI) / 360)
      camera.getWorldDirection(forward)
      right.crossVectors(forward, camera.up).normalize()
      up.crossVectors(right, forward)
      pan.addScaledVector(right, m.cx * halfHeight * camera.aspect)
      pan.addScaledVector(up, m.cy * halfHeight)
    }
    measure()

    overviewPos.copy(camera.position)
    overviewLook.set(centre.x + pan.x, centre.y + pan.y, centre.z + pan.z)

    camera.position.copy(savedPos)
    camera.quaternion.copy(savedQuat)
    camera.updateMatrixWorld()
  }

  function updateCamera(dt: number, snap = false) {
    const immediate = snap || prefersReducedMotion()

    if (viewMode === 'overview') {
      desiredPos.copy(overviewPos)
      desiredLook.copy(overviewLook)
    } else {
      const bx = sim.ball.position.x
      const by = sim.ball.position.y
      const bz = sim.ball.position.z

      // Slightly widen the follow distance on narrow portrait viewports so
      // the walls and fairway ahead stay comfortably in frame.
      const aspectScale = Math.max(1, 0.9 / Math.max(0.45, camera.aspect))

      if (phase === 'holed') {
        const fx = Math.sin(camYaw)
        const fz = Math.cos(camYaw)
        desiredPos.set(
          hole.cup.x - fx * 3.4 * aspectScale,
          hole.cup.y + 2.5 * aspectScale,
          hole.cup.z - fz * 3.4 * aspectScale,
        )
        desiredLook.set(hole.cup.x, hole.cup.y + 0.35, hole.cup.z)
      } else {
        const targetYaw = angleToCup(bx, bz)
        if (immediate) {
          camYaw = targetYaw
        } else {
          // While rolling, turn gently so wall bounces never whip-pan; once
          // stopped, settle cleanly behind the ball facing the cup.
          const yawRate = phase === 'rolling' ? 1.8 : 4.5
          camYaw = lerpAngle(camYaw, targetYaw, 1 - Math.exp(-yawRate * dt))
        }

        const fx = Math.sin(camYaw)
        const fz = Math.cos(camYaw)

        const rolling = phase === 'rolling'
        const backDist = (rolling ? 5.2 : 4.5) * aspectScale
        const height = (rolling ? 4.0 : 3.3) * aspectScale
        const lookAhead = rolling ? 1.5 : 2.5

        desiredPos.set(bx - fx * backDist, by + height, bz - fz * backDist)
        desiredLook.set(bx + fx * lookAhead, by + 0.25, bz + fz * lookAhead)
      }
    }

    if (immediate) {
      camPos.copy(desiredPos)
      camLook.copy(desiredLook)
    } else {
      const posRate = phase === 'rolling' ? 4.8 : 5.5
      const lookRate = phase === 'rolling' ? 7.0 : 6.5
      camPos.lerp(desiredPos, 1 - Math.exp(-posRate * dt))
      camLook.lerp(desiredLook, 1 - Math.exp(-lookRate * dt))
    }

    applyCamera()
  }

  function cameraBasis() {
    camera.getWorldDirection(camForward)
    const len = Math.hypot(camForward.x, camForward.z)
    const forwardX = len > 1e-6 ? camForward.x / len : 0
    const forwardZ = len > 1e-6 ? camForward.z / len : -1
    // Right-handed horizontal right vector: forward × up(0, 1, 0).
    return {
      forwardX,
      forwardZ,
      rightX: -forwardZ,
      rightZ: forwardX,
    }
  }

  function load(index: number) {
    holeIndex = Math.max(0, Math.min(COURSE.length - 1, index))
    hole = COURSE[holeIndex]
    sim = createSim(hole)
    buildHole()
    viewMode = 'follow'
    computeOverviewFrame()
    camYaw = angleToCup(sim.ball.position.x, sim.ball.position.z)
    strokes = 0
    aimX = Math.sin(camYaw)
    aimZ = Math.cos(camYaw)
    aimPower = 0
    holedFor = 0
    phase = 'aiming'
    updateCamera(0, true)
    ready = true
    notify()
  }

  load(0)

  let last = performance.now()
  let running = true

  function frame(now: number) {
    if (!running) return
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now

    if (phase === 'rolling' || phase === 'aiming') {
      sim.step(dt)

      if (sim.offCourse()) {
        // Off the course costs a stroke and a re-tee, which is the usual rule
        // and cheaper to understand than a drop point.
        strokes++
        sim.tee()
        phase = 'aiming'
        notify()
      } else if (sim.holed()) {
        phase = 'holed'
        scores[holeIndex] = strokes
        holedFor = 0
        notify()
      } else if (phase === 'rolling' && sim.atRest()) {
        // The gate #113 asks for. Until the detector says the ball has
        // genuinely stopped — not merely slowed — the next stroke is not
        // available, because the turn boundary would otherwise be ambiguous.
        phase = 'aiming'
        notify()
      }
    } else if (phase === 'holed') {
      holedFor += dt
    }

    ballMesh.position.set(sim.ball.position.x, sim.ball.position.y, sim.ball.position.z)
    ballMesh.quaternion.set(
      sim.ball.quaternion.x,
      sim.ball.quaternion.y,
      sim.ball.quaternion.z,
      sim.ball.quaternion.w,
    )

    // The aim shaft lies along the aim direction, scaled by power, starting at
    // the ball. Only while aiming and only when there is a stroke to take.
    const showAim = phase === 'aiming' && aimPower >= MIN_POWER
    aimMesh.visible = showAim
    if (showAim) {
      const length = AIM_LENGTH * aimPower
      aimMesh.scale.set(1, 1, length)
      aimMesh.position.set(
        sim.ball.position.x + aimX * (length / 2),
        sim.ball.position.y,
        sim.ball.position.z + aimZ * (length / 2),
      )
      aimMesh.rotation.y = Math.atan2(aimX, aimZ)
      // Colour carries the power as well as length, so it reads at a glance
      // on a small screen where a few units of shaft is a few pixels.
      const material = aimMesh.material as THREE.MeshBasicMaterial
      material.color.setHex(aimPower > 0.75 ? COLOURS.aimStrong : COLOURS.aim)
    }

    updateCamera(dt)

    stage.render(scene, camera)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  return {
    stage,
    hole: () => holeIndex,
    holeName: () => hole.name,
    par: () => hole.par,
    strokes: () => strokes,
    card: () => scores.slice(),
    phase: () => phase,
    viewMode: () => viewMode,
    toggleView() {
      viewMode = viewMode === 'follow' ? 'overview' : 'follow'
      if (viewMode === 'overview') computeOverviewFrame()
      notify()
    },
    cameraBasis,
    canPutt: () => phase === 'aiming' && sim.atRest(),
    ball: () => ({ x: sim.ball.position.x, y: sim.ball.position.y, z: sim.ball.position.z }),
    ballSpeed: () => sim.ball.velocity.length(),
    aim: () => ({ x: aimX, z: aimZ, power: aimPower }),
    setAim(x, z, power) {
      if (phase !== 'aiming') return
      const length = Math.hypot(x, z)
      if (length > 1e-6) {
        aimX = x / length
        aimZ = z / length
      }
      aimPower = Math.max(0, Math.min(1, power))
      notify()
    },
    strike() {
      if (phase !== 'aiming' || !sim.atRest() || aimPower < MIN_POWER) return false
      strokes++
      sim.putt(aimX, aimZ, aimPower)
      aimPower = 0
      phase = 'rolling'
      viewMode = 'follow'
      notify()
      return true
    },
    cancelAim() {
      aimPower = 0
      notify()
    },
    nextHole() {
      if (holeIndex >= COURSE.length - 1) {
        phase = 'card'
        notify()
        return
      }
      load(holeIndex + 1)
    },
    restartCourse() {
      scores.length = 0
      load(0)
    },
    goTo: (index) => load(index),
    onChange: (fn) => void listeners.push(fn),
    dispose() {
      running = false
      for (const mesh of built) mesh.geometry.dispose()
      grass.dispose()
      wallMaterial.dispose()
      stage.dispose()
    },
  }
}

export { COURSE, MAX_PUTT_SPEED }
