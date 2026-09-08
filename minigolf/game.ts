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
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'

const COLOURS = {
  background: 0x0d1a14,
  green: 0x2f8f5b,
  greenAlt: 0x2a7f51,
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

export interface MinigolfGame {
  stage: Stage3D
  hole(): number
  holeName(): string
  par(): number
  strokes(): number
  /** Strokes taken on each hole so far. */
  card(): number[]
  phase(): Phase
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
      if (ready) frameCamera()
    },
  })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOURS.background)

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300)
  stage.track(camera)

  scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(0.5)))
  const key = new THREE.DirectionalLight(0xffffff, lambertIntensity(0.85))
  key.position.set(5, 14, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbfe3ff, lambertIntensity(0.3))
  fill.position.set(-8, 5, -7)
  scene.add(fill)

  const course = new THREE.Group()
  scene.add(course)

  const materials = {
    green: new THREE.MeshLambertMaterial({ color: COLOURS.green }),
    greenAlt: new THREE.MeshLambertMaterial({ color: COLOURS.greenAlt }),
    wall: new THREE.MeshLambertMaterial({ color: COLOURS.wall }),
  }

  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: COLOURS.ball }),
  )
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
  let strokes = 0
  const scores: number[] = []
  let aimX = 0
  let aimZ = -1
  let aimPower = 0
  let holedFor = 0
  const listeners: (() => void)[] = []
  const notify = () => listeners.forEach((fn) => fn())

  let built: THREE.Object3D[] = []

  function buildHole() {
    for (const mesh of built) course.remove(mesh)
    built = []

    for (const box of hole.boxes) {
      const geometry = new THREE.BoxGeometry(box.w, box.h, box.d)
      // Slopes get the second green, so a ramp reads as a ramp before the ball
      // has been anywhere near it. This used to alternate on the box's index,
      // which happened to tone `Rise`'s ramp correctly and only because the
      // ramp happened to be authored second — inserting a box ahead of it
      // would have silently swapped the two greens over.
      const sloped = Boolean(box.tiltX || box.tiltZ)
      const material =
        box.surface === 'wall' ? materials.wall : sloped ? materials.greenAlt : materials.green
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(box.x, box.y, box.z)
      if (box.tiltX || box.tiltZ) mesh.rotation.set(box.tiltX ?? 0, 0, box.tiltZ ?? 0)
      course.add(mesh)
      built.push(mesh)
    }

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
    course.add(pole)
    built.push(pole)

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.32, 0.02),
      new THREE.MeshLambertMaterial({ color: COLOURS.flag }),
    )
    flag.position.set(hole.cup.x + 0.27, hole.cup.y + 1.4, hole.cup.z)
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
  function frameCamera() {
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

    // Fit and centre together, three times. They interact — pulling back
    // changes what is off-centre, and sliding sideways changes what is
    // furthest from the middle — but both corrections are very nearly exact on
    // the first pass, so this converges immediately rather than oscillating.
    //
    // The pan signs are the part worth stating: moving the camera right moves
    // the image *left*, so a hole sitting right of centre is corrected by
    // moving toward it, not away. Getting that backwards doubles the error
    // instead of cancelling it, and looks like the fit failing.
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
  }

  function load(index: number) {
    holeIndex = Math.max(0, Math.min(COURSE.length - 1, index))
    hole = COURSE[holeIndex]
    sim = createSim(hole)
    buildHole()
    frameCamera()
    strokes = 0
    aimX = 0
    aimZ = -1
    aimPower = 0
    holedFor = 0
    phase = 'aiming'
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
      stage.dispose()
    },
  }
}

export { COURSE, MAX_PUTT_SPEED }
