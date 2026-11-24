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
import { fitDistance, reachableCorners, FOV, VIEW_DIR } from './framing'
import { createTiltScenery, DESK_BG_COLOR } from './scenery'

const COLOURS = {
  background: DESK_BG_COLOR,
  floor: 0x53627a,
  floorAlt: 0x45536a,
  wall: 0x8496ae,
  goal: 0x35d6a4,
  ball: 0xffc94a,
}


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
  /**
   * Where the real camera puts every corner the board can reach, in
   * normalised device coordinates (#186). For checks: the framing is worked
   * out by `framing.ts`'s own projection, and this is three's.
   */
  cornersOnScreen(): { x: number; y: number }[]
  dispose(): void
}

export function createGame(parent: HTMLElement): TiltGame {
  // Reframed whenever the canvas changes shape (#186): a phone turned on its
  // side, or a window resized, kept the framing of the shape it loaded in.
  // The first resize comes before a board exists, so it is let pass.
  let framed = false
  const stage = createStage3D({ parent, background: COLOURS.background, onResize: () => framed && frameCamera() })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOURS.background)

  stage.renderer.shadowMap.enabled = true
  stage.renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400)
  stage.track(camera)

  // Intensities are the brightness wanted in the image; `lambertIntensity`
  // carries the 1/PI factor three's Lambert BRDF applies. Without it the whole
  // board renders at a third of this and reads as unlit.
  scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(0.55)))
  const key = new THREE.DirectionalLight(0xfff7eb, lambertIntensity(0.9))
  key.position.set(6, 14, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)
  // A cool bounce from the opposite side, so the far walls are not black
  // silhouettes and the board reads as an object rather than a cut-out.
  const fill = new THREE.DirectionalLight(0x88aaff, lambertIntensity(0.35))
  fill.position.set(-7, 4, -6)
  scene.add(fill)

  const scenery = createTiltScenery(scene, stage.renderer)

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
  ballMesh.castShadow = true
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
        floor.receiveShadow = true
        board.add(floor)
        built.push(floor)

        if (cell === '#') {
          const wall = new THREE.Mesh(wallGeometry, materials.wall)
          wall.position.set(x, WALL_HEIGHT / 2, z)
          wall.castShadow = true
          wall.receiveShadow = true
          board.add(wall)
          built.push(wall)
        }
      }
    }

    // Fit directional shadows tightly over the board, wooden housing, and desk props.
    const span = Math.max(grid[0].length, grid.length) * CELL * 0.85 + 5
    key.shadow.camera.left = -span
    key.shadow.camera.right = span
    key.shadow.camera.top = span
    key.shadow.camera.bottom = -span
    key.shadow.camera.near = 2
    key.shadow.camera.far = 36
    key.shadow.camera.updateProjectionMatrix()
  }

  /**
   * Frames the whole board, leaned any way it can be, on the canvas as it is
   * now (#186): `fitDistance` in `framing.ts` finds how far back that is.
   */
  function frameCamera() {
    const { width, height } = stage.size()
    const distance = fitDistance(grid[0].length, grid.length, width, height)
    const length = Math.hypot(VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z)
    camera.position.set((VIEW_DIR.x / length) * distance, (VIEW_DIR.y / length) * distance, (VIEW_DIR.z / length) * distance)
    camera.lookAt(0, 0, 0)
    framed = true
  }

  function load(index: number) {
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index))
    grid = LEVELS[levelIndex].grid
    sim = createSim(grid)
    buildBoard()
    scenery.rebuild(grid[0].length, grid.length, levelIndex, LEVELS[levelIndex].name)
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
            board.updateMatrixWorld()
            const winPos = new THREE.Vector3(
              sim.ball.position.x,
              sim.ball.position.y,
              sim.ball.position.z,
            ).applyMatrix4(board.matrixWorld)
            scenery.burstWin(winPos.x, winPos.y, winPos.z)
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

    scenery.update(dt, tiltX, tiltZ)
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
    cornersOnScreen() {
      camera.updateMatrixWorld()
      return reachableCorners(grid[0].length, grid.length).map((c) => {
        const v = new THREE.Vector3(c.x, c.y, c.z).project(camera)
        return { x: v.x, y: v.y }
      })
    },
    dispose() {
      running = false
      scenery.dispose()
      floorGeometry.dispose()
      wallGeometry.dispose()
      materials.floor.dispose()
      materials.floorAlt.dispose()
      materials.wall.dispose()
      materials.goal.dispose()
      ballMesh.geometry.dispose()
      ;(ballMesh.material as THREE.Material).dispose()
      stage.dispose()
    },
  }
}

/** Advance to the next level. Separate so the HUD owns when it happens. */
export function nextLevel(game: TiltGame): void {
  game.goTo(game.level() + 1)
}
