// Tube Runner's HUD: the score lines, the screens, and the player's marker.
//
// The marker is the part that matters. The camera sits near the tube's axis
// so most of the ring ahead is visible at once, which means the player's own
// angular position is not implied by the view the way it would be in a first
// person one — without a reference, "line the gap up with yourself" has no
// second half. Drawing it here rather than in the world puts it on the one
// surface whose colours survive the palette pass untouched, and pins it to the
// bottom of the frame where it cannot be lost against a fogged tube wall.
import { CSS_DARKEST, CSS_LIGHTEST, FONT, PAL } from './constants'
import { GB_HEIGHT, GB_WIDTH } from '../shared/gb3d'
import { createHudSurface } from '../shared/gbhud'

export type Screen = 'title' | 'run' | 'over'

export interface HudState {
  screen: Screen
  /** Rings cleared this run. */
  rings: number
  best: number
  isRecord: boolean
  mono: boolean
  reducedMotion: boolean
  /** Seconds since load, for the blinking prompt. */
  t: number
  /** 1 just after a ring is cleared, decaying — the marker pulses on it. */
  clearFlash: number
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0')

export interface Hud {
  canvas: HTMLCanvasElement
  draw(state: HudState): void
}

export function createHud(): Hud {
  const surface = createHudSurface({
    font: FONT,
    shadow: CSS_DARKEST,
    panelFill: CSS_DARKEST,
    panelBorder: hex(PAL.dark),
  })
  const { ctx, text, panel } = surface

  /**
   * The player's marker: a chevron at the bottom of the frame, pointing up
   * into the tube.
   *
   * Always in the same place, because the camera rolls with the player rather
   * than the player moving across the screen — so what the run actually asks
   * is "bring the gap down to here".
   */
  function marker(state: HudState, ink: string) {
    const cx = GB_WIDTH / 2
    const baseY = GB_HEIGHT - 16
    // A clear pulses the marker one tone brighter for a few frames. Under
    // reduced motion it simply stays at its normal tone: the marker is
    // information, the pulse is decoration.
    const lit = !state.reducedMotion && state.clearFlash > 0.35
    ctx.fillStyle = CSS_DARKEST
    // A dark plinth under the chevron, so it never has to compete with
    // whatever tone the tube wall behind it happens to be.
    ctx.fillRect(cx - 7, baseY - 1, 14, 10)
    ctx.fillStyle = lit ? ink : hex(PAL.light)
    // Drawn as rows rather than a path: a filled triangle at this size
    // antialiases its own edges, and the whole point is hard pixels.
    for (let row = 0; row < 6; row++) {
      const halfWidth = 5 - row
      if (halfWidth <= 0) break
      ctx.fillRect(cx - halfWidth, baseY + row, halfWidth * 2, 1)
    }
  }

  function prompt(on: boolean, ink: string) {
    panel(0, 116, GB_WIDTH, GB_HEIGHT - 116)
    if (on) text('PRESS A', GB_WIDTH / 2, 122, ink, 'center')
  }

  return {
    canvas: surface.canvas,
    draw(state) {
      surface.clear()
      const ink = state.mono ? CSS_LIGHTEST : '#f8f8f0'

      if (state.screen === 'title') {
        panel(14, 8, GB_WIDTH - 28, 46)
        text('TUBE', GB_WIDTH / 2, 16, ink, 'center')
        text('RUNNER', GB_WIDTH / 2, 30, ink, 'center')
        if (state.best > 0) text(`BEST ${state.best}`, GB_WIDTH / 2, 42, hex(PAL.light), 'center')
        prompt(state.reducedMotion || Math.floor(state.t * 2) % 2 === 0, ink)
        return
      }

      if (state.screen === 'over') {
        panel(14, 26, GB_WIDTH - 28, 52)
        text(state.isRecord ? 'NEW BEST!' : 'CRASHED', GB_WIDTH / 2, 34, ink, 'center')
        text(`RINGS ${state.rings}`, GB_WIDTH / 2, 50, ink, 'center')
        text(`BEST ${state.best}`, GB_WIDTH / 2, 62, hex(PAL.light), 'center')
        prompt(state.reducedMotion || Math.floor(state.t * 2) % 2 === 0, ink)
        return
      }

      text(String(state.rings), 4, 4, ink)
      text(`BEST ${state.best}`, GB_WIDTH - 4, 4, ink, 'right')
      marker(state, ink)
    },
  }
}
