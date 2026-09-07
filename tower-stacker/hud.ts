// The HUD, drawn into a 160x144 2D canvas and composited over the quantised
// 3D image (#110).
//
// three.js has no text, and the two usual answers are both worse here. A DOM
// overlay sits outside the pixelated upscale, so its text renders at the
// display's resolution and reads as a web page laid over a Game Boy. A
// world-space sprite goes through the palette post pass and comes back
// quantised, which turns 8px glyphs to mush.
//
// Drawing the HUD at exactly the render size and compositing it *after* the
// post pass gets both: the text is authored in the same 160x144 grid as
// everything else, and its colours land in the framebuffer untouched.
//
// CLAUDE.md's warning applies directly — the contrast suite measures sprites
// against a floor or a sky, and "art on the HUD bar answers to a surface
// nothing measures yet". So nothing here is left to chance: every glyph is
// drawn over a panel this file fills itself, in a tone this file picked, and
// the shadow below keeps it legible even where a panel is skipped.
import { CSS_DARKEST, CSS_LIGHTEST, FONT, GBC_HEIGHT, GBC_WIDTH, PAL } from './constants'

/** Which screen the HUD is drawing. */
export type Screen = 'title' | 'run' | 'over'

export interface HudState {
  screen: Screen
  /** Blocks placed above the base. */
  height: number
  best: number
  /** Consecutive perfect drops. */
  streak: number
  /** 1 just after a perfect drop, decaying to 0. */
  perfectFlash: number
  /** The run that just ended beat the stored best. */
  isRecord: boolean
  /** MONO rather than COLOR. */
  mono: boolean
  reducedMotion: boolean
  /** Camera height in world units, for the star parallax. */
  cameraY: number
  /** Seconds since load, for blinking prompts. */
  t: number
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')

/**
 * The star field, fixed at module load.
 *
 * Deterministic rather than random per run: a field that reshuffles on every
 * retry reads as noise, and one that scrolls past a *known* pattern is what
 * makes the climb legible.
 */
const STARS = Array.from({ length: 34 }, (_, i) => {
  // A cheap hash, so the layout is stable across reloads without shipping a table.
  const a = Math.sin(i * 12.9898) * 43758.5453
  const b = Math.sin(i * 78.233) * 12345.6789
  return {
    x: Math.floor((a - Math.floor(a)) * GBC_WIDTH),
    y: (b - Math.floor(b)) * 3,
    /** Nearer stars travel further, so the field has depth. */
    depth: 0.35 + ((a - Math.floor(a)) * 0.5),
  }
})

export interface Hud {
  canvas: HTMLCanvasElement
  draw(state: HudState): void
}

export function createHud(): Hud {
  const canvas = document.createElement('canvas')
  canvas.width = GBC_WIDTH
  canvas.height = GBC_HEIGHT
  const ctx = canvas.getContext('2d')!
  // The whole point is a hard pixel grid; smoothing would blur the 8px font.
  ctx.imageSmoothingEnabled = false
  ctx.textBaseline = 'top'

  /** Text with a one-pixel dark shadow. The shadow is what makes it legible
      over any tone the 3D layer happens to put behind it. */
  function text(s: string, x: number, y: number, colour: string, align: CanvasTextAlign = 'left') {
    ctx.textAlign = align
    ctx.fillStyle = CSS_DARKEST
    ctx.fillText(s, x + 1, y + 1)
    ctx.fillStyle = colour
    ctx.fillText(s, x, y)
  }

  /** A filled panel with a one-pixel border, for anything that must be read. */
  function panel(x: number, y: number, w: number, h: number) {
    ctx.fillStyle = CSS_DARKEST
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = hex(PAL.dark)
    ctx.lineWidth = 1
    // Offset by half a pixel so a 1px stroke lands on the pixel, not between two.
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  }

  function drawStars(state: HudState) {
    ctx.fillStyle = hex(PAL.dark)
    for (const s of STARS) {
      // Scrolls down as the camera rises, so climbing is visible even on the
      // frames where no block has landed yet. Parallax is tied to progress
      // rather than to time, so reduced motion has nothing to strip here —
      // a still field would misreport how far the run has come.
      const y = ((s.y + state.cameraY * s.depth * 6) % (GBC_HEIGHT + 8)) - 4
      ctx.fillRect(s.x, Math.floor(GBC_HEIGHT - y), 1, 1)
    }
  }

  function drawRun(state: HudState, ink: string) {
    // Height, top left. No panel — the sky behind the top of the frame is the
    // darkest tone, and the shadow covers the case where a block reaches it.
    text(String(state.height), 4, 4, ink)
    text(`BEST ${state.best}`, GBC_WIDTH - 4, 4, ink, 'right')

    if (state.streak >= 2) {
      text(`x${state.streak}`, 4, 14, hex(PAL.light))
    }

    if (state.perfectFlash > 0) {
      // The one loud signal in the game. It blinks rather than fades, because
      // a fade through the four tones is two frames of visible and then two
      // of nothing — a blink at least lands on the frames it is drawn.
      const on = state.reducedMotion ? state.perfectFlash > 0.25 : Math.floor(state.t * 16) % 2 === 0
      if (on) text('PERFECT!', GBC_WIDTH / 2, 30, ink, 'center')
    }
  }

  /**
   * The "PRESS A" prompt, on a panel of its own.
   *
   * It shipped as bare text first and was unreadable on both screens: the
   * prompt sits low, the tower behind it is tallest exactly there, and the
   * glyphs are `lightest` over a block face that is also `lightest`. The 1px
   * shadow every string here gets was not enough — it outlines the glyph but
   * the inside of the letter still matches what is behind it.
   *
   * This is the same defect CLAUDE.md counts six times over, arriving on the
   * one surface `npm run qa:contrast` does not look at. The fix is the panel:
   * the prompt now has a surface this file drew, so what is behind it stops
   * mattering. The panel does not blink with the text — a frame that stays put
   * while the label pulses is steadier to read than one that flashes whole.
   */
  function prompt(on: boolean, ink: string) {
    // Full width rather than a box around the words. A panel just big enough
    // for the label floats in the middle of the tower and reads as a hole
    // punched in it; a bar across the bottom reads as the footer it is.
    panel(0, 116, GBC_WIDTH, GBC_HEIGHT - 116)
    if (on) text('PRESS A', GBC_WIDTH / 2, 122, ink, 'center')
  }

  function drawTitle(state: HudState, ink: string) {
    // High on the screen, deliberately. A panel is opaque — it is filled in
    // the same tone as the sky — so one centred here sat squarely over the
    // tower behind it and the title screen showed a title card and a sliver
    // of block. The tower is the better half of this screen; the card gets
    // the strip above it.
    panel(16, 8, GBC_WIDTH - 32, 46)
    text('TOWER', GBC_WIDTH / 2, 16, ink, 'center')
    text('STACKER', GBC_WIDTH / 2, 30, ink, 'center')
    if (state.best > 0) text(`BEST ${state.best}`, GBC_WIDTH / 2, 42, hex(PAL.light), 'center')

    // A blinking prompt is decoration, and someone who asked for less motion
    // still has to be told which button starts the game — so it stops
    // blinking rather than disappearing.
    prompt(state.reducedMotion || Math.floor(state.t * 2) % 2 === 0, ink)
  }

  function drawOver(state: HudState, ink: string) {
    panel(14, 26, GBC_WIDTH - 28, 52)
    text(state.isRecord ? 'NEW BEST!' : 'TOPPLED', GBC_WIDTH / 2, 34, ink, 'center')
    text(`HEIGHT ${state.height}`, GBC_WIDTH / 2, 50, ink, 'center')
    text(`BEST ${state.best}`, GBC_WIDTH / 2, 62, hex(PAL.light), 'center')
    prompt(state.reducedMotion || Math.floor(state.t * 2) % 2 === 0, ink)
  }

  return {
    canvas,
    draw(state) {
      ctx.clearRect(0, 0, GBC_WIDTH, GBC_HEIGHT)
      // 8px is the font's native size — it is an 8x8 grid face, so any other
      // size lands glyph edges between pixels and fringes them.
      ctx.font = `8px ${FONT}`
      // In COLOR the 3D layer keeps its hues, so a green HUD would read as a
      // third palette on the same screen. Near-white sits over both.
      const ink = state.mono ? CSS_LIGHTEST : '#f8f8f0'

      drawStars(state)
      if (state.screen === 'title') drawTitle(state, ink)
      else if (state.screen === 'over') drawOver(state, ink)
      else drawRun(state, ink)
    },
  }
}
