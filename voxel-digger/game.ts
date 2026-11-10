// Voxel Digger (#115), on the standalone stage (#118).
//
// A block of rock with something buried in it. Tap a face to drill a 3×3 core
// into it (#152), orbit to look from another side, and name what you found in
// as few digs as you can. What a drill uncovers glows through the rock, so it
// can be seen from any side and not only straight down the hole.
//
// The whole block is one `InstancedMesh` — #115's reason for existing, along
// with instance-aware raycasting — so a thousand-odd cubes cost one draw call
// and a tap resolves to a cube through `intersection.instanceId`. That id is a
// *slot*, not a cube, and the map between them lives in `instances.ts` where
// it can be checked without a renderer.
//
// The rules and the solvability of the layout are in `dig.ts` and its tests.
// Nothing here decides whether a round is winnable.
import * as THREE from 'three'
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'
import { BLOCK, SHAPES, allCells, unkey, type Shape } from './block'
import {
  createState,
  digStroke,
  drillCells,
  isDiggable,
  isVisible,
  removedSet,
  undoStroke,
  type Axis,
  type Dir,
  type DigState,
} from './dig'
import { facingOf, type Facing } from './preview'
import { createIndex, type InstanceIndex } from './instances'

export { SHAPES }

export type Phase = 'digging' | 'right' | 'wrong'

/**
 * World size of one cube. The cubes are flush — no gap — and that is a
 * correctness decision, not a look.
 *
 * With even a four-hundredth of a unit between them, a ray aimed near a seam
 * slips *between* two cubes and strikes something buried three layers down.
 * The dig rules correctly call that cube invisible, so the tap did nothing, or
 * — worse, with an earlier version that walked the hits looking for a legal
 * one — dug a cube on the far side of the block. Flush cubes make the ray and
 * the rules agree exactly: the first thing a ray can reach is by definition
 * adjacent to the empty space the ray came through, which is the rules'
 * own definition of diggable.
 *
 * The grid still reads, because each cube is tinted very slightly differently
 * — see `shadeOf`. That is what the gap was for.
 */
const CUBE = 1
const GAP = 0

const COLOURS = {
  background: 0x0d1016,
  rock: 0x8d8271,
  find: 0xe8a63a,
  glow: 0xffb040,
}

export interface VoxelGame {
  stage: Stage3D
  phase(): Phase
  /** Taps spent. A tap drills a core (#152), so this is not cubes. */
  digs(): number
  /** Cubes dug out, across every tap. */
  dug(): number
  /** The shape actually buried, revealed only once the round is over. */
  answer(): Shape | null
  /** How many of the buried shape's cubes are currently in view. */
  exposed(): number
  /** Orbit angles, radians, and the camera's distance from the block. */
  view(): { yaw: number; pitch: number; distance: number }
  /** Which side the block is being looked at from, for the HUD's pictures. */
  facing(): Facing
  /**
   * Turns the glow of uncovered find cubes through the rock on or off. It is
   * always on in play; this exists so the check that guards it can turn it
   * off and watch the find disappear.
   */
  setGlow(on: boolean): void
  orbit(dYaw: number, dPitch: number): void
  zoom(factor: number): void
  /**
   * What is under a normalised viewport point: a rock cell that can be dug, a
   * cube of the find, or nothing.
   */
  probe(
    nx: number,
    ny: number,
  ): { cell: number; kind: 'rock' | 'find'; axis: Axis; dir: Dir } | null
  /**
   * Drills into whatever is under a point: the 3×3 around the cube, straight
   * in from the face that was tapped, until the find or the far side of the
   * block. Returns the cubes dug, or null when nothing was.
   */
  dig(nx: number, ny: number): number[] | null
  /** Puts the last tap's cubes back. #115 asks for this; a mis-tap is cheap. */
  undo(): boolean
  /** Names the find. Ends the round either way. */
  guess(id: string): boolean
  restart(): void
  onChange(fn: () => void): void
  dispose(): void
}

// Near enough to vertical to look straight down a one-cube shaft, which is
// what makes a deep narrow dig possible at all: from an oblique angle the
// shaft's own walls hide its floor. Not *at* vertical, where the camera's up
// vector and its view direction are parallel and the block spins on the spot.
const MIN_PITCH = -1.5
const MAX_PITCH = 1.5
// Zoom, as a multiple of the distance at which the block fits the screen.
const MIN_ZOOM = 0.38
const MAX_ZOOM = 1.45

/** A white square with a darker border: one cube face, as a texture. */
function edgedFace(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(70, 38, 0, 0.75)'
    ctx.lineWidth = 6
    ctx.strokeRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createGame(parent: HTMLElement, seed = Math.random()): VoxelGame {
  const stage = createStage3D({ parent, background: COLOURS.background })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOURS.background)

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200)
  stage.track(camera)

  scene.add(new THREE.AmbientLight(0xa8bccf, lambertIntensity(0.52)))
  const key = new THREE.DirectionalLight(0xfff0d8, lambertIntensity(0.82))
  key.position.set(9, 16, 11)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x6f96c0, lambertIntensity(0.3))
  rim.position.set(-12, 4, -9)
  scene.add(rim)
  // From underneath, because the shapes differ most in their lower layers and
  // the block is meant to be turned over: with the key and rim both above,
  // the underside had the ambient alone and read as one dark slab (#152).
  const under = new THREE.DirectionalLight(0xc9b79a, lambertIntensity(0.42))
  under.position.set(5, -14, 7)
  scene.add(under)

  const block = new THREE.Group()
  // Centred on the origin so orbiting turns around the block rather than
  // around its corner.
  const half = ((BLOCK.size - 1) * (CUBE + GAP)) / 2
  scene.add(block)

  const geometry = new THREE.BoxGeometry(CUBE, CUBE, CUBE)

  /** A cell's centre in world space. */
  const placeAt = (cell: number, into: THREE.Matrix4) => {
    const { x, y, z } = unkey(BLOCK, cell)
    into.makeTranslation(
      x * (CUBE + GAP) - half,
      y * (CUBE + GAP) - half,
      z * (CUBE + GAP) - half,
    )
  }

  let state: DigState
  let rockIndex: InstanceIndex
  let findIndex: InstanceIndex
  let answer: Shape
  let phase: Phase = 'digging'
  let stopped = false
  const listeners: (() => void)[] = []
  const notify = () => listeners.forEach((fn) => fn())

  // Two meshes, because the rock and the find are drawn in different colours
  // and a single instanced mesh has one material. Both are sized for the whole
  // block once; the count is what changes.
  const rockMesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: COLOURS.rock }),
    BLOCK.size ** 3,
  )
  const findMesh = new THREE.InstancedMesh(
    geometry,
    // Each face carries a darker edge, so the find reads as cubes that can be
    // counted against the pictures on the guess buttons. Uncovered whole, one
    // flat orange hid where one cube ended and the next began (#152).
    new THREE.MeshLambertMaterial({ color: COLOURS.find, map: edgedFace() }),
    // Only ever holds the find's own cubes, so it is sized for the shape box
    // rather than the block.
    BLOCK.shapeSize ** 3,
  )
  // The glow (#152): the same uncovered cubes again, drawn only where rock is
  // in the way. `GreaterDepth` is the whole trick — a fragment passes when
  // something already drawn is *nearer* than it — so a cube the player has
  // uncovered shows through the block from every side, dimmed, instead of
  // only down the hole it was found through. It shows nothing the rules do
  // not already call visible: it is fed the same cells as `findMesh`.
  //
  // Order matters. Rock is opaque and goes first. The glow is next, tested
  // against the rock alone; then the find itself, which is flagged
  // transparent only so that it sorts after the glow and paints over it
  // wherever the find is in plain view.
  const glowMesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: COLOURS.glow,
      transparent: true,
      opacity: 0.5,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
    }),
    BLOCK.shapeSize ** 3,
  )
  glowMesh.renderOrder = 1
  findMesh.renderOrder = 2
  ;(findMesh.material as THREE.Material).transparent = true
  rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  findMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  block.add(rockMesh, glowMesh, findMesh)

  const scratch = new THREE.Matrix4()
  const tint = new THREE.Color()

  /**
   * A cube's own shade, from its coordinates.
   *
   * Flush cubes with one colour are an unreadable slab — you cannot see where
   * one ends and the next begins, so you cannot tell what you are about to
   * tap. A per-instance tint restores the grain the gap used to provide and
   * costs one extra buffer.
   *
   * Derived from the cell rather than random, so a cube keeps its shade when
   * the swap moves it to a different slot, and gets it back on undo.
   */
  function shadeOf(cell: number, base: number, into: THREE.Color): THREE.Color {
    const { x, y, z } = unkey(BLOCK, cell)
    // A cheap integer hash. Any smooth function of position would band into
    // visible stripes along an axis.
    let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791)
    h = (h ^ (h >>> 13)) >>> 0
    const jitter = 1 + ((h % 1000) / 1000 - 0.5) * 0.18
    return into.setHex(base).multiplyScalar(jitter)
  }

  /** Writes one slot's matrix and tint from the cell it now draws. */
  function writeSlot(mesh: THREE.InstancedMesh, slot: number, cell: number, base: number) {
    placeAt(cell, scratch)
    mesh.setMatrixAt(slot, scratch)
    mesh.setColorAt(slot, shadeOf(cell, base, tint))
  }

  function rebuild(mesh: THREE.InstancedMesh, index: InstanceIndex, base: number) {
    const cells = index.live()
    cells.forEach((cell, slot) => writeSlot(mesh, slot, cell, base))
    mesh.count = cells.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }

  /**
   * Applies one removal to a mesh: rewrite the freed slot with whatever moved
   * into it, then shrink the count.
   *
   * The whole array is not rewritten. That is the point of the swap — a dig
   * touches one slot however big the block is.
   */
  function applyRemoval(
    mesh: THREE.InstancedMesh,
    index: InstanceIndex,
    result: { slot: number; moved: number | null },
    base: number,
  ) {
    if (result.moved !== null) writeSlot(mesh, result.slot, result.moved, base)
    mesh.count = index.count()
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** The find's cubes that are currently in view, as an index over them. */
  function visibleFindCells(): number[] {
    const removed = removedSet(state)
    return [...state.shape].filter((cell) => isVisible(BLOCK, cell, removed))
  }

  function refreshFind() {
    findIndex = createIndex(visibleFindCells())
    rebuild(findMesh, findIndex, COLOURS.find)
    rebuild(glowMesh, findIndex, COLOURS.glow)
  }

  function load() {
    const pick = SHAPES[Math.floor(seed * SHAPES.length) % SHAPES.length]
    answer = pick
    state = createState(pick)
    rockIndex = createIndex(allCells(BLOCK).filter((cell) => !state.shape.has(cell)))
    rebuild(rockMesh, rockIndex, COLOURS.rock)
    refreshFind()
    phase = 'digging'
    notify()
  }

  // --- the camera -----------------------------------------------------------

  let yaw = 0.7
  let pitch = 0.62
  let zoom = 1
  let distance = 42
  let framedFor = 0

  /**
   * The distance at which the whole block is on screen, whatever the screen's
   * shape.
   *
   * It was a fixed 42, chosen on a wide screen so the block clears the guess
   * buttons. On a phone held upright the view is less than half as wide as it
   * is tall, and at 42 the block's left and right corners were off the screen
   * (#152) — so the distance is whichever of the two directions needs more.
   */
  function fitDistance(): number {
    const radius = (BLOCK.size / 2) * Math.sqrt(3)
    const halfV = (camera.fov * Math.PI) / 360
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect)
    return Math.max((radius / Math.sin(halfV)) * 1.46, (radius / Math.sin(halfH)) * 1.05)
  }

  /**
   * Height of the HUD along the bottom of the screen, in CSS pixels: the hint,
   * the question and the row of pictured guesses.
   */
  const HUD_BAND = 170

  /**
   * Lifts the picture so the block sits in the space above the guesses rather
   * than in the middle of the screen, underneath them. A view offset moves
   * the projection and not the camera, so a tap still lands where it looks
   * like it lands — the raycaster reads the same matrix.
   */
  function frameForScreen() {
    const aspect = camera.aspect
    const height = Math.max(1, stage.renderer.domElement.clientHeight)
    const lift = Math.min(0.14, HUD_BAND / 2 / height)
    // `setViewOffset` also rewrites the aspect from its first two arguments,
    // so they are given in units that leave it as it was.
    camera.setViewOffset(aspect, 1, 0, lift, aspect, 1)
    camera.updateProjectionMatrix()
  }

  function placeCamera() {
    if (camera.aspect !== framedFor) frameForScreen()
    framedFor = camera.aspect
    distance = fitDistance() * zoom
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    )
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
  }
  placeCamera()

  const raycaster = new THREE.Raycaster()
  const point = new THREE.Vector2()

  const game: VoxelGame = {
    stage,
    phase: () => phase,
    digs: () => state.strokes.length,
    dug: () => state.removed.length,
    answer: () => (phase === 'digging' ? null : answer),
    exposed: () => findIndex.count(),
    view: () => ({ yaw, pitch, distance }),
    facing: () => facingOf(yaw, pitch),
    setGlow(on) {
      glowMesh.visible = on
    },
    orbit(dYaw, dPitch) {
      const before = facingOf(yaw, pitch)
      yaw += dYaw
      // Clamped short of the poles: at exactly vertical the camera's up vector
      // and its view direction are parallel and `lookAt` has no way to choose
      // a roll, so the block spins on the spot.
      pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch + dPitch))
      placeCamera()
      // The HUD's pictures follow the side being looked at, and only need
      // telling when it changes — not on every pixel of a drag.
      const after = facingOf(yaw, pitch)
      if (after.quarter !== before.quarter || after.below !== before.below) notify()
    },
    zoom(factor) {
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
      placeCamera()
    },
    probe(nx, ny) {
      point.set(nx * 2 - 1, -(ny * 2 - 1))
      raycaster.setFromCamera(point, camera)
      // The nearest hit and only the nearest. With the cubes flush there is
      // nothing to see past it, so anything further along the ray is behind
      // solid rock — and an earlier version that walked on looking for a legal
      // cube would happily hand back one on the opposite face of the block.
      const hit = raycaster.intersectObjects([rockMesh, findMesh], false)[0]
      if (!hit || hit.instanceId === undefined) return null
      // `instanceId` is a slot. Which cube a slot draws changes every time one
      // is removed, so it only means anything through the index.
      const isRock = hit.object === rockMesh
      const cell = (isRock ? rockIndex : findIndex).cellOf(hit.instanceId)
      if (cell < 0) return null
      if (isRock && !isDiggable(state, cell, removedSet(state))) return null
      // Which face was hit, as an axis. The instances are only ever
      // translated, so the geometry's own face normal is already axis-aligned
      // in the world.
      const n = hit.face?.normal ?? new THREE.Vector3(0, 1, 0)
      const ax = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)]
      const axis = ax.indexOf(Math.max(...ax)) as Axis
      // A drill goes in through the face, which is against its normal.
      const dir: Dir = [n.x, n.y, n.z][axis] > 0 ? -1 : 1
      return { cell, kind: isRock ? 'rock' : 'find', axis, dir }
    },
    dig(nx, ny) {
      if (phase !== 'digging') return null
      const target = game.probe(nx, ny)
      // The find is not diggable, and tapping it costs nothing. Charging a dig
      // for touching the thing you are trying to uncover would be a tax on
      // looking closely. `probe` has already rejected anything unreachable.
      if (!target || target.kind !== 'rock') return null
      // A core straight in from the tapped face (#152). `drillCells` takes
      // only cubes a single dig could have taken, in an order it could have.
      const cells = drillCells(state, target.cell, target.axis, target.dir)
      if (cells.length === 0) return null
      for (const cell of cells) {
        const result = rockIndex.remove(cell)
        if (result) applyRemoval(rockMesh, rockIndex, result, COLOURS.rock)
      }
      digStroke(state, cells)
      refreshFind()
      notify()
      return cells
    },
    undo() {
      if (phase !== 'digging' || state.strokes.length === 0) return false
      // Back in reverse, so each cube returns to the slot order it left.
      for (const cell of undoStroke(state).reverse()) {
        const slot = rockIndex.restore(cell)
        writeSlot(rockMesh, slot, cell, COLOURS.rock)
      }
      rockMesh.count = rockIndex.count()
      rockMesh.instanceMatrix.needsUpdate = true
      if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true
      refreshFind()
      notify()
      return true
    },
    guess(id) {
      if (phase !== 'digging') return false
      const right = id === answer.id
      phase = right ? 'right' : 'wrong'
      notify()
      return right
    },
    restart() {
      seed = Math.random()
      load()
    },
    onChange(fn) {
      listeners.push(fn)
    },
    dispose() {
      stopped = true
      stage.dispose()
    },
  }

  function frame() {
    if (stopped) return
    // The stage sets the camera's aspect when the canvas is measured or
    // resized; the framing depends on it, so it follows.
    if (camera.aspect !== framedFor) placeCamera()
    stage.render(scene, camera)
    requestAnimationFrame(frame)
  }

  load()
  requestAnimationFrame(frame)
  return game
}
