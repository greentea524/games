// Voxel Digger (#115), on the standalone stage (#118).
//
// A block of rock with something buried in it. Tap a cube to dig it out, orbit
// to look from another side, and name what you found in as few digs as you
// can.
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
import { BLOCK, DIG_BUDGET, SHAPES, allCells, unkey, type Shape } from './block'
import { createState, isDiggable, isVisible, removedSet, type DigState } from './dig'
import { createIndex, type InstanceIndex } from './instances'

export { DIG_BUDGET, SHAPES }

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
}

export interface VoxelGame {
  stage: Stage3D
  phase(): Phase
  digs(): number
  budget(): number
  /** The shape actually buried, revealed only once the round is over. */
  answer(): Shape | null
  /** How many of the buried shape's cubes are currently in view. */
  exposed(): number
  /** Orbit angles, radians, and the camera's distance from the block. */
  view(): { yaw: number; pitch: number; distance: number }
  orbit(dYaw: number, dPitch: number): void
  zoom(factor: number): void
  /**
   * What is under a normalised viewport point: a rock cell that can be dug, a
   * cube of the find, or nothing.
   */
  probe(nx: number, ny: number): { cell: number; kind: 'rock' | 'find' } | null
  /** Digs whatever is under a point. Returns the cell dug, or null. */
  dig(nx: number, ny: number): number | null
  /** Puts the last dug cube back. #115 asks for this; a mis-tap is cheap. */
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
const MIN_DISTANCE = 16
const MAX_DISTANCE = 60

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
    new THREE.MeshLambertMaterial({ color: COLOURS.find }),
    // Only ever holds the find's own cubes, so it is sized for the shape box
    // rather than the block.
    BLOCK.shapeSize ** 3,
  )
  rockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  findMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  block.add(rockMesh, findMesh)

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
  // Far enough back that the block clears the guess buttons along the bottom
  // of the HUD. A block that overlaps them reads as being behind a menu.
  let distance = 42

  function placeCamera() {
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
    digs: () => state.removed.length,
    budget: () => DIG_BUDGET,
    answer: () => (phase === 'digging' ? null : answer),
    exposed: () => findIndex.count(),
    view: () => ({ yaw, pitch, distance }),
    orbit(dYaw, dPitch) {
      yaw += dYaw
      // Clamped short of the poles: at exactly vertical the camera's up vector
      // and its view direction are parallel and `lookAt` has no way to choose
      // a roll, so the block spins on the spot.
      pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch + dPitch))
      placeCamera()
    },
    zoom(factor) {
      distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance * factor))
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
      return { cell, kind: isRock ? 'rock' : 'find' }
    },
    dig(nx, ny) {
      if (phase !== 'digging' || state.removed.length >= DIG_BUDGET) return null
      const target = game.probe(nx, ny)
      // The find is not diggable, and tapping it costs nothing. Charging a dig
      // for touching the thing you are trying to uncover would be a tax on
      // looking closely. `probe` has already rejected anything unreachable.
      if (!target || target.kind !== 'rock') return null
      const result = rockIndex.remove(target.cell)
      if (!result) return null
      state.removed.push(target.cell)
      applyRemoval(rockMesh, rockIndex, result, COLOURS.rock)
      refreshFind()
      notify()
      return target.cell
    },
    undo() {
      if (phase !== 'digging' || state.removed.length === 0) return false
      const cell = state.removed.pop()!
      const slot = rockIndex.restore(cell)
      writeSlot(rockMesh, slot, cell, COLOURS.rock)
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
    stage.render(scene, camera)
    requestAnimationFrame(frame)
  }

  load()
  requestAnimationFrame(frame)
  return game
}
