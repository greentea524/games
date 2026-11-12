/**
 * The screen, in game pixels (#155).
 *
 * It was the Game Boy's own 160×144 with 16-pixel tiles. The hub card's
 * painting has about one and a half times that detail, and there is no room
 * for it at 16 pixels a tile — so the screen is 240×216 with 24-pixel tiles.
 * That is still ten tiles by nine: the game shows exactly as much dungeon as
 * it did, with 2.25 times the pixels in each tile.
 */
export const GBC_WIDTH = 240
export const GBC_HEIGHT = 216
export const TILE = 24

/**
 * The size everything was first drawn and laid out at.
 *
 * The title, shop and game-over screens are still laid out for 160×144 and
 * shown through a camera zoomed by `SCALE`, until #159 lays them out at the
 * new size; when the last goes, so do these.
 */
export const LEGACY_WIDTH = 160
export const LEGACY_HEIGHT = 144
export const LEGACY_TILE = 16
export const SCALE = TILE / LEGACY_TILE
/** A length measured on the old 16-pixel grid, at the new size. */
export const sx = (n: number): number => Math.round(n * SCALE)

// Classic DMG 4-color palette
export const PAL = {
  lightest: 0x9bbc0f,
  light: 0x8bac0f,
  dark: 0x306230,
  darkest: 0x0f380f,
}

// Game Boy Color (GBC) Cellar Biome palette
export const GBC_PAL = {
  // Cellar Biome
  floorBg: 0x2d2338,
  floorDetail: 0x1d1528,
  wallBg: 0x5a4668,
  wallLine: 0x3a2c48,
  
  // Catacomb Biome
  catacombFloorBg: 0x483828,
  catacombFloorDetail: 0x281810,
  catacombWallBg: 0x886848,
  catacombWallLine: 0x584028,
  
  // Vault Biome
  vaultFloorBg: 0x203848,
  vaultFloorDetail: 0x102030,
  vaultWallBg: 0x4080a0,
  vaultWallLine: 0x205070,
  
  stairsBg: 0x906840,
  stairsStep: 0x503820,
  // Knight Hero
  armorSilver: 0xc8d8e8,
  armorDark: 0x687890,
  capeRed: 0xd83040,
  skinTone: 0xf8d0b0,
  // Rat Enemy
  ratBrown: 0x985030,
  ratDark: 0x582818,
  ratEye: 0xff3030,
}

export const CSS_LIGHTEST = '#9bbc0f'
export const CSS_LIGHT = '#8bac0f'
export const CSS_MID = '#306230'
export const CSS_DARKEST = '#0f380f'
export const FONT = '"Press Start 2P", monospace'
