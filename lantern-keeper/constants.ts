export const GBC_WIDTH = 160
export const GBC_HEIGHT = 144
export const TILE_SIZE = 8

// Fading firefly glow (KAN-113) — all tunable
export const GLOW = {
  maxRadius: 24,
  minRadius: 5,
  durationMs: 30000, // time for a full glow to fade to minimum
} as const

// GBC-inspired 4-color palette
export const PAL = {
  darkest: 0x0f1a12,
  dark: 0x2d4a33,
  light: 0x86b06a,
  lightest: 0xe0f8cf,
  warm: 0xffcc66,
} as const
