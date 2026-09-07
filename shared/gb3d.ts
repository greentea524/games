// The GameBoy shell's second renderer, as one module (#109, #111).
//
// Tower Stacker landed this inline, because #109 asked for the plumbing to be
// built as part of a real game rather than as a spike. Tube Runner is the
// second game to need it, which is the point at which this repo extracts —
// `shared/buttons.ts`, `shared/dpad.ts` and `shared/shell.css` all came out of
// duplicated copies for the same reason, and the note in `buttons.ts` about
// there being "nowhere to look" applies exactly as well to a render pipeline.
//
// What is here is everything a 3D game under this shell has no business
// deciding for itself:
//
//   - a renderer at exactly 160x144 with `setPixelRatio(1)`, sized by CSS the
//     way Phaser's `Scale.FIT` sizes the other five
//   - the post pass that quantises to four tones, so the MONO/COLOR toggle
//     keeps meaning something in 3D
//   - the HUD composite, which happens *after* the quantise so a game's text
//     keeps the exact colours it chose
//   - the framebuffer readback the touch suites assert on
//
// What is *not* here is the camera, the lighting rig's placement, or anything
// about a game's world. Two 3D games disagree about all of those — Tower
// Stacker looks at a tower from outside with an orthographic camera, Tube
// Runner sits inside a fogged tube with a perspective one — and a module that
// tried to serve both would be a worse version of three.js.
import * as THREE from 'three'

/**
 * The render size, fixed by the shell.
 *
 * `#game` is pinned to `aspect-ratio: 160 / 144` and sized to an integer
 * multiple of it by the pre-init script in each `index.html`, and
 * `image-rendering: pixelated` does the upscale. It is also what keeps
 * `canvasSpace` in `qa/touch/grid.mjs` usable by a 3D game, since that helper
 * derives its scale by assuming a 160-wide canvas.
 */
export const GB_WIDTH = 160
export const GB_HEIGHT = 144

// Colour management off, deliberately.
//
// three's default converts material colours into linear space and back on
// output, which is right for a lit scene aiming at physical plausibility and
// wrong for these: the palette is four exact bytes, and the post pass below
// writes them straight to the framebuffer. With conversion on, `PAL.lightest`
// leaves the shader as 0x9bbc0f and reaches the screen as something else, and
// the contrast the whole DMG look rests on becomes something to measure rather
// than something to know.
THREE.ColorManagement.enabled = false

/**
 * What a light's intensity must be multiplied by before it reaches three.
 *
 * `BRDF_Lambert` is `RECIPROCAL_PI * diffuseColor`, and three applies it to
 * the ambient term as well as the direct one, so a light of intensity `i`
 * contributes `i / PI` to the image. Passing intended intensities through
 * unscaled put *every* face of *every* block in Tower Stacker on one tone —
 * a flat dark silhouette against the sky, with the shading that separates the
 * top of a slab from its sides gone entirely. It reads as a bug in the palette
 * pass rather than in the lighting, which is what makes it worth a name.
 *
 * Use `gbIntensity` rather than this constant directly; it exists so the
 * factor can be found by searching for either.
 */
export const LAMBERT_PI = Math.PI

/**
 * Converts an intensity expressed in "fraction of the image" into the number
 * three wants.
 *
 * So a rig written as `gbIntensity(0.42)` ambient and `gbIntensity(1.2)`
 * directional means a surface of luminance L facing the light lands at
 * `L * (0.42 + 1.2 * n.l)` in the framebuffer — which is the arithmetic the
 * tone tables in the games are written in.
 */
export function gbIntensity(fraction: number): number {
  return fraction * LAMBERT_PI
}

/**
 * The tone a luminance quantises to in MONO: `floor(luma * 4)`, clamped.
 *
 * Exported so a game can check its own lighting arithmetic in a unit test
 * rather than only against a rendered frame. The boundaries are what the
 * shader below uses, so a face at 0.25 luma is tone 1 and one a hair under is
 * tone 0 — the sky's tone, and the one no feature may land on.
 */
export function toneOf(luma: number): 0 | 1 | 2 | 3 {
  const q = Math.floor(Math.max(0, Math.min(0.999999, luma)) * 4)
  return q as 0 | 1 | 2 | 3
}

/** The four DMG tones the MONO pass maps to, darkest first. */
export interface ToneRamp {
  darkest: number
  dark: number
  light: number
  lightest: number
}

export interface Gb3dOptions {
  /** The shell's `#game` element. The canvas is appended to it. */
  parent: HTMLElement
  /**
   * A 160x144 2D canvas drawn over the quantised image.
   *
   * Composited after the palette pass, so whatever a game paints here keeps
   * its exact colours — which is the only way 8px glyphs survive at this size.
   * Set `needsHudUpdate()` after drawing.
   */
  hudCanvas: HTMLCanvasElement
  /** The DMG ramp. */
  ramp: ToneRamp
}

export interface Gb3d {
  renderer: THREE.WebGLRenderer
  /** Renders `scene` through the palette pass and composites the HUD. */
  present(scene: THREE.Scene, camera: THREE.Camera): void
  /** Call after redrawing the HUD canvas, before the next `present`. */
  needsHudUpdate(): void
  /** MONO when true, COLOR when false. */
  setPalette(mono: boolean): void
  mono(): boolean
  /** The composited frame, RGBA, rows bottom-up. For the QA suites. */
  readPixels(): Uint8Array
}

export function createGb3d(options: Gb3dOptions): Gb3d {
  const { parent, hudCanvas, ramp } = options

  // `preserveDrawingBuffer` is for `readPixels`. Without it the drawing buffer
  // is undefined once the frame is composited, so the palette and contrast
  // checks would read back an empty image and pass on nothing.
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  // No antialiasing and no device pixel ratio: the image is 160x144 and every
  // pixel in it is meant to be visible as a pixel. The `false` stops three
  // writing its own CSS size, which would fight the sizing below.
  renderer.setPixelRatio(1)
  renderer.setSize(GB_WIDTH, GB_HEIGHT, false)
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

  const target = new THREE.WebGLRenderTarget(GB_WIDTH, GB_HEIGHT, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    // three.js's answer to Phaser's `pixelArt: true`. Nothing here is ever
    // sampled at a non-integer scale, but a linear filter would still soften
    // the composite on drivers that round differently.
    depthBuffer: true,
  })

  const hudTexture = new THREE.CanvasTexture(hudCanvas)
  hudTexture.minFilter = THREE.NearestFilter
  hudTexture.magFilter = THREE.NearestFilter

  const tone = (n: number) => new THREE.Color(n)
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture },
      tHud: { value: hudTexture },
      uMono: { value: 1 },
      uT0: { value: tone(ramp.darkest) },
      uT1: { value: tone(ramp.dark) },
      uT2: { value: tone(ramp.light) },
      uT3: { value: tone(ramp.lightest) },
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
        // exact colours the game's HUD chose.
        vec4 overlay = texture2D(tHud, vUv);
        gl_FragColor = vec4(mix(quantised, overlay.rgb, overlay.a), 1.0);
      }
    `,
  })
  const postScene = new THREE.Scene()
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial))
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  let isMono = true

  return {
    renderer,
    present(scene, camera) {
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      renderer.render(postScene, postCamera)
    },
    needsHudUpdate() {
      hudTexture.needsUpdate = true
    },
    setPalette(next) {
      isMono = next
      postMaterial.uniforms.uMono.value = next ? 1 : 0
    },
    mono: () => isMono,
    readPixels() {
      const buf = new Uint8Array(GB_WIDTH * GB_HEIGHT * 4)
      const gl = renderer.getContext()
      gl.readPixels(0, 0, GB_WIDTH, GB_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, buf)
      return buf
    },
  }
}
