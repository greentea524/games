// Tower Stacker's fixed numbers (#110).
//
// The render target is 160x144 like every other game here, and for the same
// reason: the shell pins `#game` to `aspect-ratio: 160 / 144` and upscales
// with `image-rendering: pixelated`. It is also what lets the touch suite
// reuse `canvasSpace` from `qa/touch/grid.mjs`, which assumes a 160-wide
// canvas when it maps game space to client points.
export const GBC_WIDTH = 160
export const GBC_HEIGHT = 144

// The classic DMG ramp, shared with the other four games. In 3D these are the
// four tones the post pass quantises to, rather than four colours sprites are
// drawn in — same palette, different mechanism.
export const PAL = {
  lightest: 0x9bbc0f,
  light: 0x8bac0f,
  dark: 0x306230,
  darkest: 0x0f380f,
}

export const CSS_LIGHTEST = '#9bbc0f'
export const CSS_DARKEST = '#0f380f'
export const FONT = '"Press Start 2P", monospace'

/** Storage key and envelope version for the single saved best height. */
export const SAVE_KEY = 'tower_stacker_save'
export const SAVE_VERSION = 1
