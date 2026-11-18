// The screen is 240×216 (#166). It was 160×144.
export const GBC_WIDTH = 240
export const GBC_HEIGHT = 216

/**
 * The world, in its own units: a tile is 16 of them and a level is ten tiles
 * by nine, 160 by 144, as every level always was.
 *
 * The move to the larger screen is one factor, `VIEW_ZOOM`, applied in one
 * place: the cameras. Nothing under them changes. The toy still runs at 80
 * and jumps at what it always did, every level is the grid it was, and a jump
 * measured in tiles is the same jump, because no speed, distance or level was
 * touched (#166). On the screen a tile is 24 pixels, and the view is the same
 * ten tiles by nine it always was: 1.5 is the tile ratio, and also exactly
 * what the screen grew by.
 *
 * Lantern Keeper took the same road (#171). The ticket's other road, scaling
 * every constant by 1.5, is the one where a missed constant makes a jump
 * that was just possible impossible; this one has nothing to miss.
 */
export const TILE = 16
export const WORLD_WIDTH = 160
export const WORLD_HEIGHT = 144
/** Screen pixels to a world unit. */
export const VIEW_ZOOM = GBC_WIDTH / WORLD_WIDTH
/** A tile as drawn on the screen: what the art tickets draw to. */
export const DRAWN_TILE = TILE * VIEW_ZOOM

// Classic DMG 4-color palette
export const PAL = {
  lightest: 0x9bbc0f,
  light: 0x8bac0f,
  dark: 0x306230,
  darkest: 0x0f380f,
}

// Game Boy Color (GBC) Windup palette
export const GBC_PAL = {
  bgSky: 0x4878a8,
  groundBg: 0x68a040,
  groundDetail: 0x407828,
  brickWall: 0xa84830,
  brickLine: 0x682018,
  // Winding Station
  stationBody: 0xf8b020,
  stationLight: 0xf8e060,
  stationGlow: 0x40d870,
  // Windup Toy Robot Player
  robotBody: 0x3888d8,
  robotDark: 0x184888,
  windupKey: 0xf8b020,
  eyeGlow: 0xf8f840,
  // Interactive Mechanics
  springBase: 0x888888,
  springCoil: 0xd8d8d8,
  platformBody: 0x505050,
  platformEdge: 0xa0a0a0,
  energyBase: 0x2038e0,
  energyGlow: 0x4888f8,
}

export const CSS_LIGHTEST = '#9bbc0f'
export const CSS_LIGHT = '#8bac0f'
export const CSS_MID = '#306230'
export const CSS_DARKEST = '#0f380f'
export const FONT = '"Press Start 2P", monospace'
