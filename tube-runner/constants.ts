// Tube Runner's fixed numbers (#111).
//
// The render size and the DMG ramp are the shell's, not this game's — see
// `shared/gb3d.ts` for why they are what they are.
export const PAL = {
  lightest: 0x9bbc0f,
  light: 0x8bac0f,
  dark: 0x306230,
  darkest: 0x0f380f,
}

export const CSS_LIGHTEST = '#9bbc0f'
export const CSS_DARKEST = '#0f380f'
export const FONT = '"Press Start 2P", monospace'

/** Storage key and envelope version for the saved best. */
export const SAVE_KEY = 'tube_runner_save'
export const SAVE_VERSION = 1
