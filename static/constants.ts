export const GBC_WIDTH = 160
export const GBC_HEIGHT = 144
export const TILE = 16

// Classic DMG/GBC 4-shade green palette (Normal world).
// The Static-side (later phases) will desaturate these + one accent.
export const PAL = {
  lightest: 0x9bbc0f,
  light: 0x8bac0f,
  dark: 0x306230,
  darkest: 0x0f380f,
} as const

export const PLAYER_SPEED = 60

// Tile GIDs (firstgid = 1) shared by BootScene's generated tileset and
// the Tiled map JSONs.
export const TILES = {
  GRASS: 1,
  PATH: 2,
  TREE: 3,
  WALL: 4,
  ROOF: 5,
  DOOR: 6,
  WATER: 7,
  FLOOR: 8,
} as const

// Tiles the player cannot walk through.
export const SOLID_TILES = [TILES.TREE, TILES.WALL, TILES.ROOF, TILES.WATER]
