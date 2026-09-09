// Tower Stacker's renderer and loop (#110, #119).
//
// Built first inside the GameBoy shell — a 160x144 target upscaled by CSS, a
// post pass quantising to four DMG tones, a d-pad — because #109 assumed that
// was where a 3D game belonged. #118 settled that it is not: these are extra
// games in the hub, not more GBC games. So this now runs on
// `shared/stage3d.ts`, at the display's own resolution and in full colour.
//
// What the rework deliberately did *not* touch is `stack.ts` and its test.
// None of the overlap, slice, perfect-drop or speed arithmetic ever knew about
// the palette, and a rework that also rewrote the rules would have made any
// regression impossible to attribute.
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
import { OUTLINE, SKY } from './constants'
import { HALF_HEIGHT, HALF_WIDTH, VIEW_DIR, frustumFor } from './framing'
import { createStage3D, lambertIntensity, type Stage3D } from '../shared/stage3d'
import { type Screen } from './hud'
import { loadTowerSave, recordRun } from './save'
import { playBlip, playLand, playMiss, playPerfect } from './audio'
import { prefersReducedMotion } from '../shared/motion'


/**
 * Base luminance every block is lit from, before the light touches it.
 *
 * Every slab is normalised to this whatever its hue, which is what lets one
 * arithmetic table below describe the whole game rather than one colour of it.
 *
 * It is also low enough that nothing clips. A saturated hue puts most of its
 * luminance in one channel; if that channel reaches 1.0 on the brightest face,
 * the luminance it would have carried past 1.0 is simply lost and the face
 * comes back *darker* than the table says. Measured during #110, a red block's
 * top face came back at 0.74 instead of 0.83. At this base the brightest face
 * peaks at 0.83 and no channel saturates.
 */
const BASE_LUMA = 0.58

/**
 * Ambient and directional intensity, chosen together with `BASE_LUMA` so the
 * three visible face orientations land at three clearly separated
 * brightnesses, none of them near the sky's.
 *
 * This is the repo's most repeated defect handled structurally rather than by
 * inspection. CLAUDE.md counts six sprites that shipped invisible because they
 * were drawn in their background's tone. Here the equivalent would be a block
 * face rendered at the sky's value, which would punch a hole in the tower
 * rather than make a sprite vanish — so the rig is arranged to make that
 * impossible rather than to make it unlikely.
 *
 * Worked through with the light at `LIGHT_DIR` and the camera at `VIEW_DIR`,
 * so the visible faces are +Y, +X and +Z:
 *
 *   face   n.l     BASE_LUMA * (AMBIENT + DIRECTIONAL * n.l)
 *   +Y     0.838   0.58 * (0.42 + 1.20 * 0.838) = 0.827
 *   +X     0.461   0.58 * (0.42 + 1.20 * 0.461) = 0.564
 *   +Z     0.293   0.58 * (0.42 + 1.20 * 0.293) = 0.448
 *
 * Against `SKY` at 0.076, the dimmest face any block can present is six times
 * the background's luminance, and no lighting angle can close that.
 *
 * The intensities go through `lambertIntensity`, which carries the 1/PI factor
 * three's Lambert BRDF applies — see the note on it in `shared/stage3d.ts`.
 *
 * These are the values *before* the renderer's colour management encodes the
 * frame for display, which lifts them: what actually reaches the framebuffer
 * is nearer 0.90, 0.78 and 0.69. `qa/touch/tower-stacker.mjs` measures the
 * frame rather than trusting this table, which is the only reason the
 * difference is safe to leave written down here.
 */
const AMBIENT = 0.42
const DIRECTIONAL = 1.2
const LIGHT_DIR = new THREE.Vector3(0.55, 1, 0.35)

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
  /** The run that just ended beat the stored best. */
  isRecord(): boolean
  /** 1 just after a perfect drop, decaying to 0. Drives the HUD's flash. */
  perfectFlash(): number
  /** Seconds since load, for the HUD's blinking prompts. */
  clock(): number
  /** Start, or retry from the end screen. */
  press(): void
  stage: Stage3D
  onChange(fn: () => void): void
}

export function createGame(parent: HTMLElement): TowerGame {
  // ------------------------------------------------------------------ camera
  //
  // Before the stage, and deliberately: the stage measures its container and
  // calls `onResize` while it is still being constructed, so anything that
  // callback touches has to exist already. Declared after it, `camera` is in
  // its temporal dead zone at that moment and the game throws on load.

  // Orthographic, as it always was: the tower is read by comparing the edges
  // of two slabs, and perspective makes the upper one narrower than the lower
  // whether or not it overhangs.
  const camera = new THREE.OrthographicCamera(-HALF_WIDTH, HALF_WIDTH, HALF_HEIGHT, -HALF_HEIGHT, 0.1, 120)
  const viewOffset = new THREE.Vector3(VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z).normalize().multiplyScalar(24)

  /** Fits the frustum to the canvas. The arithmetic is in `framing.ts`. */
  function fitFrustum(width: number, height: number) {
    const { halfWidth, halfHeight } = frustumFor(width, height)
    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
  }

  // ---------------------------------------------------------------- renderer

  const stage = createStage3D({ parent, background: SKY, onResize: fitFrustum })
  const size = stage.size()
  fitFrustum(size.width, size.height)

  // ------------------------------------------------------------------- scene

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)

  const light = new THREE.DirectionalLight(0xffffff, lambertIntensity(DIRECTIONAL))
  light.position.copy(LIGHT_DIR)
  scene.add(light)
  scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(AMBIENT)))

  /**
   * The star field, as points in the world rather than pixels in the HUD.
   *
   * In the GameBoy build this was drawn into the 2D HUD surface and scrolled
   * by hand against the camera height, which meant the field had to be told
   * how far the run had come. In the scene it simply is where it is, and the
   * camera rising through it is the parallax — one fewer thing that can drift
   * out of step with the tower.
   *
   * Deterministic rather than random, for the reason it always was: a field
   * that reshuffles on every retry reads as noise, and climbing past a field
   * you recognise is what makes the height legible.
   */
  const STAR_COUNT = 320
  const STAR_SPREAD = 26
  const STAR_TOP = 180
  const starPositions = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    // A cheap hash of the index, so the layout is stable across reloads
    // without shipping a table of coordinates.
    const a = Math.sin(i * 12.9898) * 43758.5453
    const b = Math.sin(i * 78.233) * 12345.6789
    const c = Math.sin(i * 39.4251) * 24634.6345
    const frac = (n: number) => n - Math.floor(n)
    starPositions[i * 3] = (frac(a) - 0.5) * STAR_SPREAD * 2
    starPositions[i * 3 + 1] = frac(b) * STAR_TOP - 8
    // Pushed behind the tower. The far plane is 120 from the camera and the
    // camera sits 24 back, so anything much deeper than this is clipped away.
    starPositions[i * 3 + 2] = (frac(c) - 0.5) * STAR_SPREAD * 2 - 20
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const stars = new THREE.Points(
    starGeometry,
    // `sizeAttenuation` off: under an orthographic camera there is no
    // perspective for it to work with, and leaving it on renders every star at
    // a size derived from a division that means nothing here.
    new THREE.PointsMaterial({ color: 0x4a5f80, size: 2, sizeAttenuation: false }),
  )
  scene.add(stars)

  // One geometry for every block. A unit box scaled per mesh costs one
  // buffer instead of one per slab, which matters on a tower that can run to
  // a few hundred over a session.
  const unitBox = new THREE.BoxGeometry(1, BLOCK_HEIGHT, 1)
  const unitEdges = new THREE.EdgesGeometry(unitBox)
  // The outline CLAUDE.md prescribes: "when a light feature lands on the light
  // floor, outline it — do not retone it". Two slabs of the same size stacked
  // flush present the same face at the same angle, so without an edge they
  // merge into one column and the tower stops reading as a stack. A dark line
  // at each boundary is what separates them; on the silhouette it costs a
  // pixel to the sky, which is the trade that note describes.
  //
  // #119 flagged this as worth carrying forward, and it was right to: it was
  // reasoned about as a DMG palette problem and it never was one. It is a
  // shading problem, and two flush slabs of the same size present the same
  // face at the same angle in full colour exactly as they did in four tones.
  const edgeMaterial = new THREE.LineBasicMaterial({ color: OUTLINE })

  /**
   * The colour to build the slab at `level` in: a hue that walks with height,
   * normalised to a fixed luminance.
   *
   * The normalisation is what the lighting table depends on. Every slab is the
   * same brightness whatever its hue, so the three visible face orientations
   * land at the same three luminances on every block of every tower — which is
   * what lets a single arithmetic table describe the whole game rather than
   * one colour of it.
   *
   * There used to be a greyscale alternative here for the GameBoy shell's MONO
   * switch. It is gone with the shell; the clipping hazard that shaped it is
   * not — see `BASE_LUMA`.
   */
  function blockColour(level: number): THREE.Color {
    const c = new THREE.Color().setHSL((level * 0.062) % 1, 0.52, 0.6)
    const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    return c.multiplyScalar(BASE_LUMA / Math.max(luma, 1e-4))
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

  const listeners: (() => void)[] = []
  /**
   * Told on the moments that change what the HUD says, not every frame.
   *
   * The one thing it cannot cover is the perfect-drop flash, which decays
   * continuously — the HUD polls `perfectFlash()` for that. Driving the whole
   * HUD from the loop instead would rebuild its DOM sixty times a second to
   * change a number that moves a few times a minute.
   */
  const notify = () => listeners.forEach((fn) => fn())

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
    notify()
  }

  function startRun() {
    reset()
    screen = 'run'
    spawnMoving()
    notify()
  }

  function endRun() {
    screen = 'over'
    overAt = elapsed
    const result = recordRun(height())
    best = result.best
    isRecord = result.isRecord
    playMiss()
    notify()
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
      // Signalled loudly, in three places at once: the slab flashes bright,
      // the shake is doubled, and the HUD says so. #110 calls this the only
      // skill expression in the game.
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
    notify()
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

    // The perfect flash, decayed on the material's emissive.
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

    // The star field parallaxes because it is *in* the scene rather than
    // painted behind it: the camera rises through it, so the sense of climbing
    // costs nothing to keep in step with the tower. In the GameBoy build this
    // was scrolled by hand in HUD space against `cameraY`, which had to be
    // told how far the run had come.
    stage.render(scene, camera)

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
    isRecord: () => isRecord,
    perfectFlash: () => perfectFlash,
    clock: () => elapsed,
    press,
    stage,
    onChange(fn) {
      listeners.push(fn)
    },
  }
}
