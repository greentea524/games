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
  const { text, panel } = surface

  // The chevron that used to live here is gone. It existed because the camera
  // sat near the tube's axis and the player had no body, so nothing on screen
  // said where "you" were — the marker was standing in for a character. The
  // runner is that character, drawn in the world at the radius the collision
  // test actually uses, so a HUD stand-in would now be a second, less accurate
  // answer to the same question.

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
    },
  }
}
