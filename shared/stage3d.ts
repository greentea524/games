// The stage a standalone 3D game runs on (#118).
//
// `shared/gb3d.ts` puts a game inside the GameBoy shell: a fixed 160x144
// target, a four-tone palette pass, an 8px HUD composited into the same grid.
// That was the right answer for Tower Stacker and Tube Runner and the wrong
// answer for everything after them — these are meant to be additional games in
// the hub, not more GBC games, and the hub already hosts both kinds.
//
// So this is the other stage. Full resolution, full colour, no palette, no
// bezel: a canvas that fills its container and keeps up with it, and an
// overlay element the game puts its own HUD in.
//
// What is deliberately *not* here: the camera, the lighting, the HUD's
// contents, and the controls. Those differ per game — a minigolf camera and a
// tilt-maze camera have nothing in common — and a module that tried to serve
// both would be a worse version of three.js. What is here is only the part
// every one of them would otherwise write identically and get subtly wrong.
import * as THREE from 'three'

/**
 * Ceiling on the device pixel ratio.
 *
 * A phone at DPR 3 asks for nine times the fragments of DPR 1 for a difference
 * almost nobody can see on a moving 3D scene, and these games have to hold a
 * frame rate on hardware that is not a workstation. Two is the usual place to
 * stop.
 */
const MAX_PIXEL_RATIO = 2

/**
 * What a light's intensity must be multiplied by before it reaches three.
 *
 * `BRDF_Lambert` is `RECIPROCAL_PI * diffuseColor`, and three applies it to
 * the ambient term as well as the direct one, so a light of intensity `i`
 * contributes `i / PI` to the image. A rig written from the brightness you
 * actually want comes out at a third of it — a scene that looks like night
 * when it was meant to look like a lit room.
 *
 * This has now cost two games. `shared/gb3d.ts` has the same helper under
 * `gbIntensity` for the GameBoy pair, where it was found by measuring a
 * framebuffer that had collapsed to one tone; Tilt Maze rediscovered it as a
 * board too dark to see. It is duplicated rather than shared because the two
 * stages are meant to be independent — but if a third game meets it, that is
 * the moment to stop and pull it out.
 */
export function lambertIntensity(fraction: number): number {
  return fraction * Math.PI
}

export interface Stage3DOptions {
  /** The element the canvas fills. Must be able to size itself. */
  parent: HTMLElement
  /** Clear colour. Defaults to a near-black that is not pure black. */
  background?: number
  /** Called after a resize, with the new CSS size. */
  onResize?: (width: number, height: number) => void
}

export interface Stage3D {
  renderer: THREE.WebGLRenderer
  /**
   * A DOM layer above the canvas, for the game's HUD.
   *
   * DOM rather than a drawn overlay, which is the freedom this stage buys over
   * `shared/gb3d.ts`: with no pixelated upscale to stay in step with, text can
   * be real text — crisp at any resolution, selectable, and reachable by a
   * screen reader. It is `pointer-events: none` by default so it cannot eat
   * the canvas's input; put `pointer-events: auto` on the individual controls
   * that need it.
   */
  overlay: HTMLElement
  /** Current CSS size of the canvas. */
  size(): { width: number; height: number }
  /**
   * Keeps `camera`'s aspect in step with the canvas.
   *
   * The single most-forgotten line in a three.js resize handler, and its
   * symptom — everything subtly stretched — is easy to look at without seeing.
   */
  track(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera): void
  render(scene: THREE.Scene, camera: THREE.Camera): void
  /** The frame as RGBA, rows bottom-up, at drawing-buffer resolution. */
  readPixels(): { data: Uint8Array; width: number; height: number }
  /** Releases the context and stops observing. */
  dispose(): void
}

export function createStage3D(options: Stage3DOptions): Stage3D {
  const { parent, background = 0x0b0f14, onResize } = options

  // `preserveDrawingBuffer` so `readPixels` can be called outside the render
  // callback — the QA suites measure a frame after the fact, and without this
  // the buffer is undefined by then and they would assert on nothing.
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setClearColor(background, 1)

  const canvas = renderer.domElement
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  // Touch gestures on the canvas are the game's input, not the browser's
  // scroll and zoom. The page-level guard in `shared/noZoom.ts` still applies;
  // this is the part that has to be on the element itself.
  canvas.style.touchAction = 'none'
  parent.appendChild(canvas)

  const overlay = document.createElement('div')
  overlay.className = 'stage3d-overlay'
  parent.appendChild(overlay)

  const tracked: (THREE.PerspectiveCamera | THREE.OrthographicCamera)[] = []
  let width = 0
  let height = 0

  function applySize() {
    // `clientWidth` rather than `getBoundingClientRect`: a CSS transform on an
    // ancestor would scale the rect and ask for a drawing buffer that does not
    // match the pixels the element actually occupies.
    const w = Math.max(1, parent.clientWidth)
    const h = Math.max(1, parent.clientHeight)
    if (w === width && h === height) return
    width = w
    height = h

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
    renderer.setSize(w, h, false)

    for (const camera of tracked) {
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const perspective = camera as THREE.PerspectiveCamera
        perspective.aspect = w / h
        perspective.updateProjectionMatrix()
      } else {
        // An orthographic camera has no aspect of its own: its frustum is in
        // world units, so the height is kept and the width follows the canvas.
        // Games set the height they want by assigning top/bottom before
        // tracking; this preserves that and only ever rewrites left/right.
        const ortho = camera as THREE.OrthographicCamera
        const halfHeight = (ortho.top - ortho.bottom) / 2
        const halfWidth = halfHeight * (w / h)
        ortho.left = -halfWidth
        ortho.right = halfWidth
        ortho.updateProjectionMatrix()
      }
    }
    onResize?.(w, h)
  }

  // A ResizeObserver, not a window `resize` listener. The parent can change
  // size without the window doing so — a sidebar opening, an orientation
  // change that keeps the same area, the element itself being restyled — and
  // a window listener sleeps through all of it.
  const observer = new ResizeObserver(applySize)
  observer.observe(parent)
  applySize()

  return {
    renderer,
    overlay,
    size: () => ({ width, height }),
    track(camera) {
      tracked.push(camera)
      applySize()
      // `applySize` returns early when the size has not changed, which on the
      // first call after construction it usually has not — so a camera
      // registered later would keep whatever aspect it was built with.
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        const perspective = camera as THREE.PerspectiveCamera
        perspective.aspect = width / height
        perspective.updateProjectionMatrix()
      }
    },
    render(scene, camera) {
      renderer.render(scene, camera)
    },
    readPixels() {
      const gl = renderer.getContext()
      const w = gl.drawingBufferWidth
      const h = gl.drawingBufferHeight
      const data = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
      return { data, width: w, height: h }
    },
    dispose() {
      observer.disconnect()
      renderer.dispose()
      canvas.remove()
      overlay.remove()
    },
  }
}
