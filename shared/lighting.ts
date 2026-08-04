// A darkness overlay with circular light cut-outs, shared by the games that
// need one (#73 Static, #57 Pocket Dungeon). Extracted from Lantern Keeper,
// which had the only working implementation.
//
// The technique: a screen-sized RenderTexture pinned to the camera, filled
// opaque every frame, with a white circle erased at each light. Erasing is
// what makes the cut-out show the world underneath rather than a lighter
// shade of overlay.
import Phaser from 'phaser'

export interface Light {
  /** Centre, in world coordinates — conversion to screen space is handled here. */
  x: number
  y: number
  /** Radius in world pixels. Zero or less draws nothing, which is a valid state. */
  radius: number
}

export interface DarknessOptions {
  width: number
  height: number
  /** Depth of the overlay. Must sit above the world and below the HUD. */
  depth?: number
  /** 0 is fully lit, 1 fully opaque. Tweenable afterwards via `.alpha`. */
  alpha?: number
  /** Overlay colour. Black unless a game wants a tinted gloom. */
  color?: number
}

const BRUSH_PREFIX = '__light_brush_'

/**
 * Brushes are generated at their native size and cached per integer radius
 * rather than scaling one texture.
 *
 * These games run `pixelArt: true`, so filtering is NEAREST and a scaled
 * circle comes out visibly chunkier than a drawn one. Radii are rounded
 * because sub-pixel light size means nothing at 160x144 — and without
 * rounding, a smoothly shrinking radius would mint a texture per frame.
 */
function brushTexture(scene: Phaser.Scene, radius: number): string {
  const r = Math.max(1, Math.round(radius))
  const key = `${BRUSH_PREFIX}${r}`
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(r, r, r)
    g.generateTexture(key, r * 2, r * 2)
    g.destroy()
  }
  return key
}

export class Darkness {
  private readonly scene: Phaser.Scene
  private readonly rt: Phaser.GameObjects.RenderTexture
  private readonly brush: Phaser.GameObjects.Image
  private readonly color: number

  constructor(scene: Phaser.Scene, opts: DarknessOptions) {
    this.scene = scene
    this.color = opts.color ?? 0x000000
    this.rt = scene.add
      .renderTexture(0, 0, opts.width, opts.height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(opts.depth ?? 10)
    this.rt.alpha = opts.alpha ?? 1

    // One reusable stamp; its texture is swapped per radius. Not added to the
    // display list — erase() only needs it as a source.
    this.brush = new Phaser.GameObjects.Image(scene, 0, 0, brushTexture(scene, 1))
  }

  /** Exposed so tweens can target the overlay's opacity directly. */
  get alpha(): number {
    return this.rt.alpha
  }

  set alpha(value: number) {
    this.rt.alpha = value
  }

  /** The underlying object, for the rare case a caller needs depth or visibility. */
  get gameObject(): Phaser.GameObjects.RenderTexture {
    return this.rt
  }

  /** Repaints the overlay. Call whenever a light or the camera moves. */
  redraw(lights: readonly Light[]) {
    const cam = this.scene.cameras.main
    this.rt.clear()
    this.rt.fill(this.color, 1)

    for (const light of lights) {
      if (light.radius <= 0) continue

      const r = Math.max(1, Math.round(light.radius))
      const sx = light.x - cam.scrollX
      const sy = light.y - cam.scrollY

      // Skip lights whose circle cannot reach the screen. Cheap here, and it
      // matters for a game that lights every torch on a floor at once.
      if (
        sx + r < 0 ||
        sy + r < 0 ||
        sx - r > this.rt.width ||
        sy - r > this.rt.height
      ) {
        continue
      }

      this.brush.setTexture(brushTexture(this.scene, r))
      // setTexture does not always resize an Image that has had an explicit
      // display size, so pin it. With a native-size brush this is scale 1.0.
      this.brush.setDisplaySize(r * 2, r * 2)
      // erase() honours the brush's centre origin: pass the light's centre.
      this.rt.erase(this.brush, sx, sy)
    }
  }

  destroy() {
    this.rt.destroy()
    this.brush.destroy()
  }
}
