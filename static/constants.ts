/**
 * The screen, in game pixels (#177).
 *
 * It was the Game Boy's own 160×144 with 16-pixel tiles. The hub card's
 * village has pitched roofs, round trees and a crackling television, and none
 * of that fits in 16 pixels, so the screen is 240×216 with 24-pixel tiles, as
 * Pocket Dungeon's and Cart & Crate's are. That is still ten tiles by nine.
 */
export const GBC_WIDTH = 240
export const GBC_HEIGHT = 216
export const TILE = 24

/**
 * The size everything was first drawn, laid out and tuned at.
 *
 * #177 changes the canvas and nothing about the art. `BootScene` still draws
 * on a 16-pixel grid and enlarges each texture once; the title, dialogue and
 * menus are still laid out for 160×144 and shown through a camera zoomed by
 * `SCALE`. #178 to #181 replace each with art and layout made at the new
 * size; when the last goes, so do these.
 *
 * The kid moves by velocity, not tile by tile, so every speed, collision box,
 * reach and radius is a length, and each goes through `scaled`. Nothing is
 * retuned by feel: a walk across the town takes exactly as long as it did.
 */
export const LEGACY_WIDTH = 160
export const LEGACY_HEIGHT = 144
export const LEGACY_TILE = 16
export const SCALE = TILE / LEGACY_TILE
/** A length measured on the old 16-pixel grid, at the new size. */
export const scaled = (n: number): number => Math.round(n * SCALE)

// Classic DMG/GBC 4-shade green palette (Normal world).
// The Static-side (later phases) will desaturate these + one accent.
export const PAL = {
  lightest: 0x9bbc0f,
  light: 0x8bac0f,
  dark: 0x306230,
  darkest: 0x0f380f,
} as const

// Vibrant Game Boy Color (GBC) palette system.
export const GBC_PAL = {
  // Nature / Overworld
  grassBg: 0x60b038,       // Vibrant GBC grass green
  grassDetail: 0x388820,   // Grass blade detail
  treeDark: 0x206818,      // Deep evergreen canopy
  treeOutline: 0x083810,   // Dark tree outline
  trunk: 0x784818,         // Wood trunk brown

  // Dirt Path
  pathBg: 0xe0a850,        // Warm golden GBC dirt path
  pathDetail: 0xb87828,    // Path grain accent

  // Buildings
  wallBg: 0x98a0a8,        // Slate stone wall
  wallLine: 0x505860,      // Brick mortar line
  roofBg: 0xc84838,        // Terracotta red GBC roof
  roofLine: 0x781810,      // Dark red roof shadow
  doorBg: 0x804820,        // Wood door panel
  doorFrame: 0x402008,     // Dark wood frame
  knobGlow: 0xf8d038,      // Brass knob yellow

  // Water
  waterBg: 0x4890e8,       // GBC ocean azure blue
  waterWave: 0x90c0f8,     // Foam wave highlight
  waterDeep: 0x1850b0,     // Deep water blue

  // Interior Floor
  floorBg: 0xd09858,       // Warm wood floorboard
  floorLine: 0x885828,     // Floor seam

  // Characters
  skin: 0xf8d0a0,          // Warm skin tone
  hairDark: 0x302018,      // Dark espresso hair
  hairGold: 0xe8a020,      // Golden hair
  hairGrey: 0x9098a0,      // Silver grey hair
  shirtHero: 0xe03838,     // Hero kid red shirt
  pantsHero: 0x3050a8,     // Hero denim blue pants
  shirtMom: 0xb858a8,      // Mom violet sweater
  shirtRen: 0x4098d8,      // Ren sky blue jacket
  shirtGus: 0x487050,      // Gus forest green coat

  // Items
  flashlightBody: 0x505860,
  flashlightGlow: 0xf8e050,
  flowerBloom: 0xd83848,
  flowerStem: 0x488828,
} as const

/** Pixels a second. 60 on the old grid: three and three-quarter tiles. */
export const PLAYER_SPEED = 60 * SCALE

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
  // Worn Static-side variants (#15): same tileset texture, extra columns.
  // Structural decay reads through the #47 duotone where color wouldn't.
  DEAD_TREE: 9,
  CRACKED_WALL: 10,
  ROTTED_FLOOR: 11,
  CRACKED_GRASS: 12,
} as const

export const TILESET_COLUMNS = 12

// Tiles the player cannot walk through.
export const SOLID_TILES = [
  TILES.TREE,
  TILES.WALL,
  TILES.ROOF,
  TILES.WATER,
  TILES.DEAD_TREE,
  TILES.CRACKED_WALL,
]
