// A 160x144 2D canvas for a 3D game's HUD (#109, #111).
//
// three.js has no text, and the two usual answers are both worse under this
// shell. A DOM overlay sits outside the pixelated upscale, so its text renders
// at the display's resolution and reads as a web page laid over a Game Boy. A
// world-space sprite goes through the palette post pass and comes back
// quantised, which turns 8px glyphs to mush.
//
// Drawing the HUD at exactly the render size and letting `shared/gb3d.ts`
// composite it *after* the post pass gets both: the text is authored in the
// same 160x144 grid as everything else, and its colours land in the
// framebuffer untouched.
//
// CLAUDE.md's warning is the reason `panel` is here rather than left to each
// game. The contrast suite measures sprites against a floor or a sky, and
// "art on the HUD bar answers to a surface nothing measures yet" — so a
// prompt drawn straight onto the scene is unguarded. Tower Stacker's PRESS A
// shipped that way for one round and was unreadable: `lightest` glyphs over a
// block face that was also `lightest`, with the 1px shadow outlining the
// letter while its inside stayed invisible. A panel is a surface this module
// drew, so what is behind it stops mattering.
import { GB_HEIGHT, GB_WIDTH } from './gb3d'

export interface HudSurfaceOptions {
  /** CSS font shorthand's family part, e.g. `'"Press Start 2P", monospace'`. */
  font: string
  /** Drawn one pixel down-right of every string. Normally the darkest tone. */
  shadow: string
  /** Panel interior. Normally the darkest tone, so panels are opaque. */
  panelFill: string
  /** Panel outline, one pixel. */
  panelBorder: string
}

export interface HudSurface {
  /** Pass this to `createGb3d` as its `hudCanvas`. */
  canvas: HTMLCanvasElement
  /** For anything this module does not cover. */
  ctx: CanvasRenderingContext2D
  /** Wipes the surface to fully transparent. Call once per frame, first. */
  clear(): void
  /**
   * Text with a one-pixel shadow.
   *
   * 8px is the native size of `Press Start 2P` — it is an 8x8 grid face, so
   * any other size lands glyph edges between pixels and fringes them.
   */
  text(s: string, x: number, y: number, colour: string, align?: CanvasTextAlign): void
  /** An opaque panel with a one-pixel border. */
  panel(x: number, y: number, w: number, h: number): void
}

export function createHudSurface(options: HudSurfaceOptions): HudSurface {
  const canvas = document.createElement('canvas')
  canvas.width = GB_WIDTH
  canvas.height = GB_HEIGHT
  const ctx = canvas.getContext('2d')!
  // The whole point is a hard pixel grid; smoothing would blur the 8px font.
  ctx.imageSmoothingEnabled = false
  ctx.textBaseline = 'top'

  return {
    canvas,
    ctx,
    clear() {
      ctx.clearRect(0, 0, GB_WIDTH, GB_HEIGHT)
      // Re-set every frame: `clearRect` does not touch these, but a game that
      // changed them mid-draw would otherwise leak the change into next frame.
      ctx.font = `8px ${options.font}`
      ctx.textBaseline = 'top'
    },
    text(s, x, y, colour, align = 'left') {
      ctx.textAlign = align
      ctx.fillStyle = options.shadow
      ctx.fillText(s, x + 1, y + 1)
      ctx.fillStyle = colour
      ctx.fillText(s, x, y)
    },
    panel(x, y, w, h) {
      ctx.fillStyle = options.panelFill
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = options.panelBorder
      ctx.lineWidth = 1
      // Offset by half a pixel so a 1px stroke lands on the pixel rather than
      // straddling two and coming out as two half-lit rows.
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    },
  }
}
