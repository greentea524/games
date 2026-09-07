// Tower Stacker's renderer and loop: three.js under the GameBoy shell (#109, #110).
//
// The shell was built around Phaser, and everything it provides — the d-pad,
// the palette toggle, the save, the hub card, the touch suite — has to keep
// working across the seam to a second renderer. The two things that make that
// possible are both here:
//
//   - The render target is exactly 160x144 with `setPixelRatio(1)`, and CSS
//     does the upscale, which is what Phaser's `Scale.FIT` plus
//     `image-rendering: pixelated` already does for the other five games. It
//     also keeps `canvasSpace` in `qa/touch/grid.mjs` usable here, since that
//     helper derives its scale by assuming a 160-wide canvas.
//   - A post pass quantises the image to four tones, so the MONO/COLOR toggle
//     still means something in 3D rather than being a dead switch on a page
//     that has no palette to swap.
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
import { GBC_HEIGHT, GBC_WIDTH, PAL } from './constants'
import { createHud, type Screen } from './hud'
import { loadTowerSave, recordRun } from './save'
import { playBlip, playLand, playMiss, playPerfect } from './audio'
import { prefersReducedMotion } from '../shared/motion'

// Colour management off, deliberately.
//
// three's default converts material colours into linear space and back on
// output, which is right for a lit scene aiming at physical plausibility and
// wrong for this one: the palette is four exact bytes, and the post pass below
// writes them straight to the framebuffer. With conversion on, `PAL.lightest`
// leaves the shader as 0x9bbc0f and reaches the screen as something else, and
// the contrast the whole DMG look rests on becomes something to measure rather
// than something to know.
THREE.ColorManagement.enabled = false

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
 * `qa/touch/tower-stacker.mjs` reads these back out of the framebuffer, so the
 * arithmetic is checked against the image rather than trusted.
 */
const AMBIENT = 0.42
const DIRECTIONAL = 1.2
const LIGHT_DIR = new THREE.Vector3(0.55, 1, 0.35)

/**
 * What the intensities above are multiplied by before they reach three.
 *
 * `BRDF_Lambert` is `RECIPROCAL_PI * diffuseColor`, and three applies it to
 * the ambient term as well as the direct one, so a light of intensity `i`
 * contributes `i / PI` to the image. Passing the table's numbers through
 * unscaled put *every* face of *every* block on tone 1 — one flat dark
 * silhouette against the sky, with the shading that separates the top of a
 * slab from its sides gone entirely. It reads as a bug in the palette pass
 * rather than in the lighting, which is what makes it worth naming here.
 */
const LAMBERT_PI = Math.PI

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

  // `preserveDrawingBuffer` is for `readPixels` below. Without it the drawing
  // buffer is undefined once the frame is composited, so the palette and
  // contrast checks would read back an empty image and pass on nothing.
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  // No antialiasing and no device pixel ratio: the image is 160x144 and every
  // pixel in it is meant to be visible as a pixel. `false` stops three writing
  // its own CSS size, which would fight the shell's sizing below.
  renderer.setPixelRatio(1)
  renderer.setSize(GBC_WIDTH, GBC_HEIGHT, false)
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace
  renderer.setClearColor(0x000000, 1)

  const canvas = renderer.domElement
  // The shell pins `#game` to 160x144 times an integer zoom and applies
  // `image-rendering: pixelated`, so filling it exactly reproduces what
  // Phaser's Scale.FIT does for the other games. `flexShrink` matters: `#game`
  // is a flex container, and without it the canvas would be shrunk below the
  // size the percentages just asked for.
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.style.flexShrink = '0'
  parent.appendChild(canvas)

  // ------------------------------------------------------------------- scene

  const scene = new THREE.Scene()

  // Declared up here because `blockColour` below reads it: the palette decides
  // what colour a block is made, not just how it is post-processed.
  let mono = true

  const aspect = GBC_WIDTH / GBC_HEIGHT
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM_HEIGHT * aspect) / 2,
    (FRUSTUM_HEIGHT * aspect) / 2,
    FRUSTUM_HEIGHT / 2,
    -FRUSTUM_HEIGHT / 2,
    0.1,
    120,
  )
  const viewOffset = VIEW_DIR.clone().normalize().multiplyScalar(24)

  const light = new THREE.DirectionalLight(0xffffff, DIRECTIONAL * LAMBERT_PI)
  light.position.copy(LIGHT_DIR)
  scene.add(light)
  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT * LAMBERT_PI))

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

  // ------------------------------------------------------------- post pass

  const target = new THREE.WebGLRenderTarget(GBC_WIDTH, GBC_HEIGHT, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    // three.js's answer to Phaser's `pixelArt: true`. Nothing here is ever
    // sampled at a non-integer scale, but a linear filter would still soften
    // the composite on drivers that round differently.
    depthBuffer: true,
  })

  const hud = createHud()
  const hudTexture = new THREE.CanvasTexture(hud.canvas)
  hudTexture.minFilter = THREE.NearestFilter
  hudTexture.magFilter = THREE.NearestFilter

  const tone = (n: number) => new THREE.Color(n)
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture },
      tHud: { value: hudTexture },
      uMono: { value: 1 },
      uT0: { value: tone(PAL.darkest) },
      uT1: { value: tone(PAL.dark) },
      uT2: { value: tone(PAL.light) },
      uT3: { value: tone(PAL.lightest) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // The tones are four separate uniforms rather than an array because
    // indexing a uniform array with a computed index is not allowed in a
    // GLSL ES 1.00 fragment shader, and that is the version three compiles a
    // plain ShaderMaterial as.
    fragmentShader: `
      uniform sampler2D tScene;
      uniform sampler2D tHud;
      uniform float uMono;
      uniform vec3 uT0;
      uniform vec3 uT1;
      uniform vec3 uT2;
      uniform vec3 uT3;
      varying vec2 vUv;

      void main() {
        vec3 src = texture2D(tScene, vUv).rgb;
        vec3 quantised;
        if (uMono > 0.5) {
          // MONO: collapse to luminance and pick one of the four DMG tones.
          float luma = dot(src, vec3(0.299, 0.587, 0.114));
          float q = clamp(floor(luma * 4.0), 0.0, 3.0);
          quantised = uT0;
          quantised = mix(quantised, uT1, step(0.5, q));
          quantised = mix(quantised, uT2, step(1.5, q));
          quantised = mix(quantised, uT3, step(2.5, q));
        } else {
          // COLOR: four levels per channel, which is the GBC analogue — hue
          // survives, but the shading is banded exactly as hard as MONO's.
          quantised = min(floor(src * 4.0), 3.0) / 3.0;
        }
        // The HUD is composited after the quantise so its glyphs keep the
        // exact colours hud.ts chose.
        vec4 overlay = texture2D(tHud, vUv);
        gl_FragColor = vec4(mix(quantised, overlay.rgb, overlay.a), 1.0);
      }
    `,
  })
  const postScene = new THREE.Scene()
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial))
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

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
    hudTexture.needsUpdate = true

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(postScene, postCamera)

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
      postMaterial.uniforms.uMono.value = next ? 1 : 0
      retint()
    },
    readPixels() {
      const buf = new Uint8Array(GBC_WIDTH * GBC_HEIGHT * 4)
      const gl = renderer.getContext()
      gl.readPixels(0, 0, GBC_WIDTH, GBC_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, buf)
      return buf
    },
    press,
  }
}
