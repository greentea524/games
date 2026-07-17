export const GBC_WIDTH = 160
export const GBC_HEIGHT = 144
export const TILE_SIZE = 8

// Fading firefly glow (KAN-113) — all tunable
export const GLOW = {
  maxRadius: 24,
  minRadius: 5,
  durationMs: 30000, // time for a full glow to fade to minimum
} as const

// Dash (KAN-114) — all tunable
export const SPAWN_POINT = { x: 32, y: 360 }
export const DASH = {
  speed: 400,
  durationMs: 100, // 40px = 5 tiles of travel
  cooldownMs: 400,
  bufferMs: 120, // presses this early still fire when the cooldown ends
} as const

// Wall-cling (KAN-115) — all tunable
export const WALL = {
  slideSpeed: 25, // max fall speed while clinging
  jumpVx: 100, // horizontal kick away from the wall
  jumpVy: -150,
  coyoteMs: 80, // wall-jump grace after leaving the wall
  jumpLockMs: 150, // arrows can't override the kick during this window
} as const

// Jump feel (KAN-112 tuning note)
export const JUMP_ASSIST = {
  coyoteMs: 80,
  bufferMs: 100,
} as const

// Darkness overlay per level (issue #7) — kept below 1 so terrain
// outlines stay faintly visible even without direct lantern light.
// Later levels stay darker, but never fully opaque.
export const DARKNESS_ALPHA: Record<string, number> = {
  level1: 0.84,
  level2: 0.88,
  level3: 0.88,
  level4: 0.92,
}

// Procedural stage decorations (issue #7) — density per exposed surface
export const DECO = {
  topDensity: 0.35, // chance of a plant on an exposed tile top
  vineDensity: 0.22, // chance of a vine under an exposed tile bottom
} as const

// GBC-inspired 4-color palette
export const PAL = {
  darkest: 0x0f1a12,
  dark: 0x2d4a33,
  light: 0x86b06a,
  lightest: 0xe0f8cf,
  warm: 0xffcc66,
} as const
