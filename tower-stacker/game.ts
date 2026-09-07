// Tower Stacker's renderer and loop: three.js under the GameBoy shell (#109, #110).
//
// The shell was built around Phaser, and everything it provides — the d-pad,
// the palette toggle, the save, the hub card, the touch suite — has to keep
// working across the seam to a second renderer. The two things that make that
// possible — a 160x144 render target that CSS upscales, and a post pass that
// quantises to four tones so MONO/COLOR still means something — landed here
// first and now live in `shared/gb3d.ts`, where Tube Runner (#111) uses them
// too. What is left in this file is Tower Stacker's own camera, lighting and
// loop.
//
// The rest of the shell needs no adapter at all: `shared/dpad.ts` and
// `shared/buttons.ts` dispatch synthetic key events on `window`, so this reads
// them with plain listeners and never touches Phaser.
import * as THREE from 'three'
import {
  BASE_BLOCK,
  BLOCK_HEIGHT,
  axisFor,
  dropBlock,
  slideOffset,
  speedFor,
  type Axis,
  type Block,
} from './stack'
import { PAL } from './constants'
import { GB_HEIGHT, GB_WIDTH, createGb3d, gbIntensity } from '../shared/gb3d'
import { createHud, type Screen } from './hud'
import { loadTowerSave, recordRun } from './save'
import { playBlip, playLand, playMiss, playPerfect } from './audio'
import { prefersReducedMotion } from '../shared/motion'


/**
 * Base luminance every block is lit from.
 *
 * In MONO this is the block's colour outright — a neutral grey — and that is
 * the point. The first attempt kept each block's hue in both modes and relied
 * on normalising it to this luminance, which is correct right up until the
 * lighting multiplies it: a saturated hue puts most of its luminance in one
 * channel, that channel saturates at 1.0 on the brightest face, and the *lost*
 * luminance drops the face a whole tone. Measured, a red block's top face came
 * back at 0.74 luma instead of 0.83 and landed on `light` instead of
 * `lightest`, so the tower rendered with no highlight at all.
 *
 * Re-tinting on the toggle instead is also what the Phaser games here do —
 * Cart & Crate's `reloadPalette()` regenerates its textures rather than
 * trying to make one texture serve both palettes.
 */
const BASE_LUMA = 0.58

/**
 * Ambient and directional intensity, chosen together with `BASE_LUMA` so that
 * the three visible face orientations land in three *different* tones and none
 * of them lands in tone 0.
 *
 * This is the repo's most repeated defect handled structurally rather than by
 * inspection. CLAUDE.md counts six sprites that shipped invisible because they
 * were drawn in their background's tone; here the background is tone 0 by
 * construction (the scene clears to black) and the dimmest face any block can
 * present measures 0.448 luma — tone 1, with the tone-0 boundary at 0.25 a
 * long way below it. There is no lighting angle that can put a block face on
 * the sky's tone.
 *
 * Worked through for MONO's neutral grey, with the light at `LIGHT_DIR` and
 * the camera at `VIEW_DIR` so the visible faces are +Y, +X and +Z. The grey
 * peaks at 0.827 on the brightest face, so nothing clips and the arithmetic
 * below is what the framebuffer actually contains:
 *
 *   face   n.l     luma = BASE_LUMA * (AMBIENT + DIRECTIONAL * n.l)   tone
 *   +Y     0.838   0.58 * (0.42 + 1.20 * 0.838) = 0.827               3 lightest
 *   +X     0.461   0.58 * (0.42 + 1.20 * 0.461) = 0.564               2 light
 *   +Z     0.293   0.58 * (0.42 + 1.20 * 0.293) = 0.448               1 dark
 *
 * The intensities go through `gbIntensity`, which carries the 1/PI factor
 * three's Lambert BRDF applies — see the note on it in `shared/gb3d.ts`.
 *
 * `qa/touch/tower-stacker.mjs` reads these back out of the framebuffer, so the
 * arithmetic is checked against the image rather than trusted.
 */
const AMBIENT = 0.42
const DIRECTIONAL = 1.2
const LIGHT_DIR = new THREE.Vector3(0.55, 1, 0.35)

/** Camera direction from its target. Sees the +X, +Y and +Z faces. */
const VIEW_DIR = new THREE.Vector3(1, 0.867, 1)

/**
 * How much of the world the camera shows, in world units of height.
 *
 * Sized off the slide rather than off the tower: the moving block reaches
 * 1.15 either side of centre plus its own half-width, which projects to about
 * 1.52 units of screen width, and the frustum is 2.0 half-widths across. A
 * block that slid off the edge of the screen would be a game asking for a
 * decision the player cannot see.
 */
const FRUSTUM_HEIGHT = 3.6

/** Seconds the end-of-run screen ignores input, matching shared/runSummary. */
const OVER_LOCK = 0.5

/** Screen-shake decay and magnitude, in world units. */
const SHAKE_DECAY = 7
const SHAKE_LAND = 0.055
const SHAKE_PERFECT = 0.1

interface Chip {
  mesh: THREE.Mesh
  vy: number
  spinX: number
  spinZ: number
  life: number
}

/**
 * Turns a placed-block mesh into a falling one.
 *
 * `transparent` is baked into a three material's shader program, so it has to
 * be set with `needsUpdate` once here rather than assigned every frame in the
 * loop — an assignment per frame either does nothing or recompiles the program
 * sixty times a second, depending on how the flag is set.
 */
function asFalling(mesh: THREE.Mesh): THREE.MeshLambertMaterial {
  const mat = mesh.material as THREE.MeshLambertMaterial
  mat.transparent = true
  mat.needsUpdate = true
  return mat
}

/** The handle `exposeForQA` publishes. Everything the touch suite reads. */
export interface TowerGame {
  /** Which screen is up. */
  screen(): Screen
  /** Blocks placed above the base. Only meaningful during a run — the title
      screen builds a decorative tower through the same stack. */
  height(): number
  /** Best height ever saved, as the game currently has it. */
  best(): number
  /** The stack, base first. */
  stack(): Block[]
  /** Where the sliding block is right now, or null when nothing is sliding. */
  moving(): Block | null
  /** Consecutive perfect drops. */
  streak(): number
  /** Perfect drops this run. */
  perfects(): number
  /** Drops the run has resolved, misses included. */
  drops(): number
  /** MONO rather than COLOR. */
  mono(): boolean
  setPalette(mono: boolean): void
  /** Reads the framebuffer back, for the palette and contrast checks. */
  readPixels(): Uint8Array
  /** Start, or retry from the end screen. Same thing the A button does. */
  press(): void
}

export function createGame(parent: HTMLElement): TowerGame {
  // ---------------------------------------------------------------- renderer

  const hud = createHud()
  const gb = createGb3d({ parent, hudCanvas: hud.canvas, ramp: PAL })

  // ------------------------------------------------------------------- scene

  const scene = new THREE.Scene()

  // Declared up here because `blockColour` below reads it: the palette decides
  // what colour a block is made, not just how it is post-processed.
  let mono = true

  const aspect = GB_WIDTH / GB_HEIGHT
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM_HEIGHT * aspect) / 2,
    (FRUSTUM_HEIGHT * aspect) / 2,
    FRUSTUM_HEIGHT / 2,
    -FRUSTUM_HEIGHT / 2,
    0.1,
    120,
  )
  const viewOffset = VIEW_DIR.clone().normalize().multiplyScalar(24)

  const light = new THREE.DirectionalLight(0xffffff, gbIntensity(DIRECTIONAL))
  light.position.copy(LIGHT_DIR)
  scene.add(light)
  scene.add(new THREE.AmbientLight(0xffffff, gbIntensity(AMBIENT)))

  // One geometry for every block. A unit box scaled per mesh costs one
  // buffer instead of one per slab, which matters on a tower that can run to
  // a few hundred over a session.
  const unitBox = new THREE.BoxGeometry(1, BLOCK_HEIGHT, 1)
  const unitEdges = new THREE.EdgesGeometry(unitBox)
  // The outline CLAUDE.md prescribes: "when a light feature lands on the light
  // floor, outline it — do not retone it". Two slabs of the same size stacked
  // flush present the same face at the same angle, so without an edge they
  // merge into one column and the tower stops reading as a stack. One pixel of
  // `darkest` at each boundary is what separates them; on the silhouette it
  // costs a pixel to the sky, which is the trade that note describes.
  const edgeMaterial = new THREE.LineBasicMaterial({ color: PAL.darkest })

  /**
   * The colour to build the slab at `level` in, for the palette now selected.
   *
   * MONO gets a neutral grey — every slab identical, so the three visible face
   * orientations land in the three tones the table above works out, on every
   * block of every tower. COLOR gets a walking hue, so the climb reads as a
   * gradient; there the per-channel quantise keeps the hue and a clipped
   * channel just means a bright face, which is what it should mean.
   */
  function blockColour(level: number): THREE.Color {
    if (mono) return new THREE.Color(BASE_LUMA, BASE_LUMA, BASE_LUMA)
    const c = new THREE.Color().setHSL((level * 0.062) % 1, 0.52, 0.6)
    const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    return c.multiplyScalar(BASE_LUMA / Math.max(luma, 1e-4))
  }

  /** Repaints every slab for the current palette. The toggle's other half. */
  function retint() {
    const paint = (mesh: THREE.Mesh) => {
      const mat = mesh.material as THREE.MeshLambertMaterial
      mat.color.copy(blockColour(mesh.userData.level as number))
    }
    for (const m of meshes) paint(m)
    for (const c of chips) paint(c.mesh)
    if (movingMesh) paint(movingMesh)
  }

  function makeBlockMesh(block: Block, level: number, y: number): THREE.Mesh {
    const material = new THREE.MeshLambertMaterial({
      color: blockColour(level),
      // Flat shading: a box has no smooth normals to interpolate anyway, and
      // asking for it explicitly keeps a future non-box mesh honest.
      flatShading: true,
      // The outline below sits exactly on these faces, so without a nudge the
      // two have equal depth and fight: the edges came out as dotted diagonals
      // scattered across each block rather than as lines, which reads as a
      // rendering fault rather than as a seam. Pushing the faces back a hair
      // lets the lines win outright.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const mesh = new THREE.Mesh(unitBox, material)
    // `retint` needs this to recompute the hue when the palette changes.
    mesh.userData.level = level
    mesh.scale.set(block.w, 1, block.d)
    mesh.position.set(block.x, y, block.z)
    mesh.add(new THREE.LineSegments(unitEdges, edgeMaterial))
    return mesh
  }

  // -------------------------------------------------------------- run state

  let screen: Screen = 'title'
  let stack: Block[] = [{ ...BASE_BLOCK }]
  let meshes: THREE.Mesh[] = []
  let chips: Chip[] = []
  let levelTime = 0
  let streak = 0
  let perfects = 0
  let drops = 0
  let overAt = 0
  let isRecord = false
  let best = loadTowerSave().best
  let shake = 0
  let cameraY = 0
  let perfectFlash = 0
  /** The slab in the air. Declared with the rest of the run state because
      `clearScene` below has to be able to drop it. */
  let movingMesh: THREE.Mesh | null = null
  let flashMesh: THREE.MeshLambertMaterial | null = null
  let flashAmount = 0
  let elapsed = 0

  const height = () => stack.length - 1
  const currentAxis = (): Axis => axisFor(height())
  const topBlock = () => stack[stack.length - 1]
  const blockY = (index: number) => index * BLOCK_HEIGHT

  /** Where the sliding block is this instant, or null when nothing slides. */
  function movingBlock(): Block | null {
    if (screen !== 'run') return null
    const top = topBlock()
    const axis = currentAxis()
    const offset = slideOffset(levelTime, speedFor(height()))
    return axis === 'x' ? { ...top, x: top.x + offset } : { ...top, z: top.z + offset }
  }

  function clearScene() {
    for (const m of meshes) {
      scene.remove(m)
      ;(m.material as THREE.Material).dispose()
    }
    meshes = []
    for (const c of chips) {
      scene.remove(c.mesh)
      ;(c.mesh.material as THREE.Material).dispose()
    }
    chips = []
    if (movingMesh) {
      scene.remove(movingMesh)
      ;(movingMesh.material as THREE.Material).dispose()
      movingMesh = null
    }
    flashMesh = null
  }

  function spawnMoving() {
    const b = movingBlock()
    if (!b) return
    movingMesh = makeBlockMesh(b, height() + 1, blockY(stack.length))
    scene.add(movingMesh)
  }

  function reset() {
    clearScene()
    stack = [{ ...BASE_BLOCK }]
    const base = makeBlockMesh(stack[0], 0, blockY(0))
    scene.add(base)
    meshes.push(base)
    levelTime = 0
    streak = 0
    perfects = 0
    drops = 0
    shake = 0
    perfectFlash = 0
    flashAmount = 0
    isRecord = false
    cameraY = blockY(0)
  }

  /**
   * The title screen's tower.
   *
   * Built through `dropBlock` with a handful of sloppy offsets rather than
   * placed by hand, so what the title shows is a tower the game could actually
   * produce — ledges, slices and all — instead of a neat column no run would
   * ever make. `height()` therefore reads non-zero on the title; it only means
   * anything once `startRun` has cleared it.
   */
  function showTitle() {
    reset()
    for (const offset of [0.19, -0.13, 0.1, -0.21, 0.08]) {
      const axis = currentAxis()
      const top = topBlock()
      const moving = axis === 'x' ? { ...top, x: top.x + offset } : { ...top, z: top.z + offset }
      const result = dropBlock(top, moving, axis)
      if (!result.placed) break
      stack.push(result.placed)
      const mesh = makeBlockMesh(result.placed, stack.length - 1, blockY(stack.length - 1))
      scene.add(mesh)
      meshes.push(mesh)
    }
    cameraY = blockY(stack.length - 1)
    screen = 'title'
  }

  function startRun() {
    reset()
    screen = 'run'
    spawnMoving()
  }

  function endRun() {
    screen = 'over'
    overAt = elapsed
    const result = recordRun(height())
    best = result.best
    isRecord = result.isRecord
    playMiss()
  }

  /** The A button, and the only verb the game has. */
  function press() {
    if (screen === 'title') {
      playBlip()
      startRun()
      return
    }
    if (screen === 'over') {
      // The press that ended the run must not also restart it. Same lock, and
      // the same reason, as shared/runSummary's `inputLockMs`.
      if (elapsed - overAt < OVER_LOCK) return
      playBlip()
      startRun()
      return
    }
    doDrop()
  }

  function doDrop() {
    const moving = movingBlock()
    if (!moving || !movingMesh) return
    const axis = currentAxis()
    const result = dropBlock(topBlock(), moving, axis)
    drops++

    const reduced = prefersReducedMotion()

    if (result.missed) {
      // The block that missed keeps falling, so the failure is something the
      // player watches rather than something the screen simply stops on.
      asFalling(movingMesh)
      chips.push({
        mesh: movingMesh,
        vy: -0.6,
        spinX: reduced ? 0 : 2.4,
        spinZ: reduced ? 0 : 1.1,
        life: 2,
      })
      movingMesh = null
      streak = 0
      endRun()
      return
    }

    const placed = result.placed!
    // The moving mesh becomes the placed slab rather than being rebuilt, so
    // its colour and its edges carry straight over.
    movingMesh.scale.set(placed.w, 1, placed.d)
    movingMesh.position.set(placed.x, blockY(stack.length), placed.z)
    meshes.push(movingMesh)
    stack.push(placed)

    if (result.chip) {
      const chipMesh = makeBlockMesh(result.chip, height(), blockY(stack.length - 1))
      asFalling(chipMesh)
      scene.add(chipMesh)
      chips.push({
        mesh: chipMesh,
        vy: 0.1,
        // The spin is decoration — the chip carries no information the player
        // acts on, so this is exactly what shared/motion.ts is for.
        spinX: reduced ? 0 : (result.chip.x > placed.x ? -3.2 : 3.2),
        spinZ: reduced ? 0 : (result.chip.z > placed.z ? 3.2 : -3.2),
        life: 1.4,
      })
    }

    if (result.perfect) {
      streak++
      perfects++
      perfectFlash = 1
      // Signalled loudly, in three places at once: the slab flashes to the
      // lightest tone, the shake is doubled, and the HUD says so. #110 calls
      // this the only skill expression in the game.
      flashMesh = movingMesh.material as THREE.MeshLambertMaterial
      flashAmount = 1
      playPerfect(streak)
      shake = reduced ? 0 : SHAKE_PERFECT
    } else {
      streak = 0
      playLand(height())
      shake = reduced ? 0 : SHAKE_LAND
    }

    movingMesh = null
    levelTime = 0
    spawnMoving()
  }

  // ---------------------------------------------------------------- the loop

  let last = performance.now()
  /** Reused every frame; a fresh Vector3 at 60Hz is pure GC churn. */
  const lookTarget = new THREE.Vector3()

  function frame(now: number) {
    // Clamped: a backgrounded tab hands back a delta of seconds, and an
    // unclamped one would teleport the sliding block across its whole travel
    // between two frames — the player would return to a run already lost.
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now
    elapsed += dt

    if (screen === 'run') {
      levelTime += dt
      const b = movingBlock()
      if (b && movingMesh) movingMesh.position.set(b.x, blockY(stack.length), b.z)
    }

    // Chips.
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i]
      c.vy -= 9.8 * dt * 0.35
      c.mesh.position.y += c.vy * dt
      c.mesh.rotation.x += c.spinX * dt
      c.mesh.rotation.z += c.spinZ * dt
      c.life -= dt
      const mat = c.mesh.material as THREE.MeshLambertMaterial
      mat.opacity = Math.max(0, Math.min(1, c.life))
      if (c.life <= 0) {
        scene.remove(c.mesh)
        mat.dispose()
        chips.splice(i, 1)
      }
    }

    // The perfect flash, decayed on the material's emissive so it reads
    // through the palette quantise as a jump to the lightest tone.
    if (flashMesh) {
      flashAmount = Math.max(0, flashAmount - dt * 3.5)
      flashMesh.emissive.setScalar(flashAmount * 0.5)
      if (flashAmount === 0) flashMesh = null
    }
    perfectFlash = Math.max(0, perfectFlash - dt * 1.2)

    // Camera. The lift is tweened rather than snapped, and it is *not* gated
    // on reduced motion: the rise is how the game reports height, which
    // shared/motion.ts draws the line at.
    const wantY = blockY(stack.length - 1)
    cameraY += (wantY - cameraY) * Math.min(1, dt * 6)
    shake = Math.max(0, shake - shake * SHAKE_DECAY * dt)
    const jitter = shake > 0.0005 ? shake : 0
    lookTarget.set(
      jitter ? (Math.random() - 0.5) * jitter : 0,
      cameraY + (jitter ? (Math.random() - 0.5) * jitter : 0),
      jitter ? (Math.random() - 0.5) * jitter : 0,
    )
    camera.position.copy(lookTarget).add(viewOffset)
    camera.lookAt(lookTarget)

    hud.draw({
      screen,
      height: height(),
      best,
      streak,
      perfectFlash,
      isRecord,
      mono,
      reducedMotion: prefersReducedMotion(),
      cameraY,
      t: elapsed,
    })
    gb.needsHudUpdate()
    gb.present(scene, camera)

    requestAnimationFrame(frame)
  }

  showTitle()
  requestAnimationFrame(frame)

  return {
    screen: () => screen,
    height,
    best: () => best,
    stack: () => stack.map((b) => ({ ...b })),
    moving: movingBlock,
    streak: () => streak,
    perfects: () => perfects,
    drops: () => drops,
    mono: () => mono,
    setPalette(next) {
      mono = next
      gb.setPalette(next)
      retint()
    },
    readPixels: gb.readPixels,
    press,
  }
}
