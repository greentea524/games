// Tilt Maze's renderer and loop (#112), and the first game on the standalone
// stage (#118).
//
// The stage — a canvas that fills its container at full resolution and keeps
// up with it — is `shared/stage3d.ts`. What is here is this game's camera,
// lighting, board meshes and loop.
//
// The tilt is the one idea worth reading twice. `physics.ts` rotates *gravity*
// so no collider ever moves, and this file leans a group containing the board
// and the ball together by the same angle. Rotating both preserves their
// relative positions exactly, so what the player sees is a board tipping under
// a marble while the simulation stays the trivial static-geometry case.
import * as THREE from 'three'
import {
  BALL_RADIUS,
  CELL,
  FLOOR_THICKNESS,
  MAX_TILT,
  REST_SPEED,
  REST_TIME,
  TILT_RATE,
  TILT_RETURN,
  WALL_HEIGHT,
  cellAt,
  cellCentre,
  createSim,
  type Sim,
} from './physics'
import { LEVELS, type Cell } from './levels'
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'

const COLOURS = {
  background: 0x0b0f14,
  floor: 0x53627a,
  floorAlt: 0x45536a,
  wall: 0x8496ae,
  goal: 0x35d6a4,
  ball: 0xffc94a,
}

/** How far the camera sits from the board, as a multiple of its longest side. */
const CAMERA_REACH = 1.15

export type Phase = 'playing' | 'won' | 'complete'

export interface TiltGame {
  stage: Stage3D
  /** Index into LEVELS. */
  level(): number
  levelName(): string
  phase(): Phase
  /** Board lean, in radians, as the renderer currently has it. */
  tilt(): { x: number; z: number }
  /** Ball position in board space. */
  ball(): { x: number; y: number; z: number }
  /** Ball speed in world units per second. */
  ballSpeed(): number
  /**
   * Ball velocity in board space.
   *
   * Exposed because steering to a stop needs it: a controller that only knows
   * where the ball *is* can only ever be bang-bang, and will roll it wall to
   * wall for ever. Real players read the speed off the screen; anything
   * driving the game has to be given it.
   */
  velocity(): { x: number; z: number }
  /** Times the ball has fallen through a hole this level. */
  drops(): number
  /** Ask for a lean. Components are clamped to +/-1 and scaled by MAX_TILT. */
  steer(x: number, z: number): void
  restart(): void
  /** Jump to a level. Used by the QA suite and the thumbnail hook. */
  goTo(index: number): void
  onChange(fn: () => void): void
  dispose(): void
}

export function createGame(parent: HTMLElement): TiltGame {
  const stage = createStage3D({ parent, background: COLOURS.background })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOURS.background)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  stage.track(camera)

  // Intensities are the brightness wanted in the image; `lambertIntensity`
  // carries the 1/PI factor three's Lambert BRDF applies. Without it the whole
  // board renders at a third of this and reads as unlit.
  scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(0.55)))
  const key = new THREE.DirectionalLight(0xffffff, lambertIntensity(0.9))
  key.position.set(6, 12, 5)
  scene.add(key)
  // A cool bounce from the opposite side, so the far walls are not black
  // silhouettes and the board reads as an object rather than a cut-out.
  const fill = new THREE.DirectionalLight(0x88aaff, lambertIntensity(0.35))
  fill.position.set(-7, 4, -6)
  scene.add(fill)

  // Everything that leans. The ball is a child of this too, which is what makes
  // rotating gravity and rotating the view the same tilt rather than two.
  const board = new THREE.Group()
  scene.add(board)

  const floorGeometry = new THREE.BoxGeometry(CELL, FLOOR_THICKNESS, CELL)
  const wallGeometry = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL)
  const materials = {
    floor: new THREE.MeshLambertMaterial({ color: COLOURS.floor }),
    floorAlt: new THREE.MeshLambertMaterial({ color: COLOURS.floorAlt }),
    wall: new THREE.MeshLambertMaterial({ color: COLOURS.wall }),
    goal: new THREE.MeshLambertMaterial({ color: COLOURS.goal, emissive: COLOURS.goal, emissiveIntensity: 0.5 }),
  }

  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshLambertMaterial({ color: COLOURS.ball, emissive: COLOURS.ball, emissiveIntensity: 0.12 }),
  )
  board.add(ballMesh)

  let sim: Sim
  let grid: string[]
  let levelIndex = 0
  let phase: Phase = 'playing'
  let tiltX = 0
  let tiltZ = 0
  let wantX = 0
  let wantZ = 0
  let restFor = 0
  let dropCount = 0
  const listeners: (() => void)[] = []
  const notify = () => listeners.forEach((fn) => fn())

  /** Meshes belonging to the current board, so a level change can drop them. */
  let built: THREE.Mesh[] = []

  function clearBoard() {
    for (const mesh of built) board.remove(mesh)
    built = []
  }

  function buildBoard() {
    clearBoard()
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        const cell = grid[row][col] as Cell
        if (cell === 'o') continue // a hole is the absence of floor
        const { x, z } = cellCentre(col, row, grid)

        // A checker on the floor. Without it a large board is one flat slab and
        // there is no way to judge how far the ball has travelled or how fast.
        const isGoal = cell === 'G'
        const material = isGoal
          ? materials.goal
          : (col + row) % 2 === 0
            ? materials.floor
            : materials.floorAlt
        const floor = new THREE.Mesh(floorGeometry, material)
        floor.position.set(x, -FLOOR_THICKNESS / 2, z)
        board.add(floor)
        built.push(floor)

        if (cell === '#') {
          const wall = new THREE.Mesh(wallGeometry, materials.wall)
          wall.position.set(x, WALL_HEIGHT / 2, z)
          board.add(wall)
          built.push(wall)
        }
      }
    }
  }

  /** Frames the whole board, whatever its size. */
  function frameCamera() {
    const wide = grid[0].length * CELL
    const deep = grid.length * CELL
    const reach = Math.max(wide, deep) * CAMERA_REACH
    camera.position.set(0, reach * 0.95, reach * 0.75)
    camera.lookAt(0, 0, 0)
  }

  function load(index: number) {
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index))
    grid = LEVELS[levelIndex].grid
    sim = createSim(grid)
    buildBoard()
    frameCamera()
    tiltX = 0
    tiltZ = 0
    wantX = 0
    wantZ = 0
    restFor = 0
    dropCount = 0
    phase = 'playing'
    notify()
  }

  load(0)

  let last = performance.now()
  let running = true

  function frame(now: number) {
    if (!running) return
    // Clamped: a backgrounded tab hands back a delta of seconds, which the
    // substep cap would then refuse to catch up on — the ball would jump
    // through a wall on the frame the player came back to.
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now

    if (phase === 'playing') {
      // Ease toward the requested lean rather than snapping. Instant tilt makes
      // the ball jerk, and a player cannot feel their way to a small correction
      // if every press is a full deflection.
      const rate = wantX === 0 && wantZ === 0 ? TILT_RETURN : TILT_RATE
      tiltX += (wantX * MAX_TILT - tiltX) * Math.min(1, dt * rate)
      tiltZ += (wantZ * MAX_TILT - tiltZ) * Math.min(1, dt * rate)

      sim.setTilt(tiltX, tiltZ)
      sim.step(dt)

      if (sim.fallen()) {
        dropCount++
        sim.reset()
        tiltX = 0
        tiltZ = 0
        notify()
      } else {
        // The goal wants the ball *at rest* on it, not merely over it: a
        // trigger would clear the level for a ball about to roll off the far
        // side, which is the difference between arriving and passing through.
        const over = cellAt(sim.ball.position.x, sim.ball.position.z, grid)
        const speed = sim.ball.velocity.length()
        if (over === 'G' && speed < REST_SPEED) {
          restFor += dt
          if (restFor >= REST_TIME) {
            phase = levelIndex >= LEVELS.length - 1 ? 'complete' : 'won'
            notify()
          }
        } else {
          restFor = 0
        }
      }
    }

    ballMesh.position.set(sim.ball.position.x, sim.ball.position.y, sim.ball.position.z)
    ballMesh.quaternion.set(
      sim.ball.quaternion.x,
      sim.ball.quaternion.y,
      sim.ball.quaternion.z,
      sim.ball.quaternion.w,
    )

    // The lean, as a view. Same angle as the gravity vector, applied to the
    // board and the ball together so their relationship is untouched.
    board.rotation.z = -tiltX
    board.rotation.x = tiltZ

    stage.render(scene, camera)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  return {
    stage,
    level: () => levelIndex,
    levelName: () => LEVELS[levelIndex].name,
    phase: () => phase,
    tilt: () => ({ x: tiltX, z: tiltZ }),
    ball: () => ({ x: sim.ball.position.x, y: sim.ball.position.y, z: sim.ball.position.z }),
    ballSpeed: () => sim.ball.velocity.length(),
    velocity: () => ({ x: sim.ball.velocity.x, z: sim.ball.velocity.z }),
    drops: () => dropCount,
    /**
     * Ask for a lean.
     *
     * Nothing here consults `prefers-reduced-motion`, deliberately. The
     * board's lean and the marble's roll *are* the game, and
     * `shared/motion.ts` is explicit that the preference takes decoration and
     * never the information a player acts on — a board that would not tip
     * would not be a gentler game, it would be no game.
     */
    steer(x, z) {
      wantX = Math.max(-1, Math.min(1, x))
      wantZ = Math.max(-1, Math.min(1, z))
    },
    restart: () => load(levelIndex),
    goTo: (index) => load(index),
    onChange: (fn) => void listeners.push(fn),
    dispose() {
      running = false
      stage.dispose()
    },
  }
}

/** Advance to the next level. Separate so the HUD owns when it happens. */
export function nextLevel(game: TiltGame): void {
  game.goTo(game.level() + 1)
}
