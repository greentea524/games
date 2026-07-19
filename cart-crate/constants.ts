export const GBC_WIDTH = 160
export const GBC_HEIGHT = 144
export const TILE = 16

// Classic Game Boy DMG 4-color palette
export const PAL = {
  lightest: 0x9bbc0f, // background / grass / light
  light: 0x8bac0f,    // path / highlights
  dark: 0x306230,     // walls / shadows / crates
  darkest: 0x0f380f,  // outline / text / player dark
}

// Game Boy Color (GBC) enhanced palette
export const GBC_PAL = {
  bgGrass: 0x589840,
  detailGrass: 0x387828,
  bgPath: 0xd8c078,
  detailPath: 0xb09858,
  wallBg: 0x886850,
  wallLine: 0x584030,
  targetBg: 0xe8a040,
  targetBorder: 0xb86820,
  crateBg: 0xa85820,
  crateFrame: 0x683010,
  crateLight: 0xd88840,
  // Courier Player (Fox)
  furOrange: 0xe86020,
  furWhite: 0xf8f8f0,
  furDark: 0x502010,
  shirtBlue: 0x3068c8,
}

// World-specific GBC palettes (Overrides base GBC_PAL colors)
export const WORLD_PALS = [
  GBC_PAL, // World 1: Warehouse (Default)
  { ...GBC_PAL, bgGrass: 0x58a8c0, detailGrass: 0x386890, wallBg: 0x608090, wallLine: 0x405060, targetBg: 0x80c0d0 }, // World 2: Ice (Cyan/Blue)
  { ...GBC_PAL, bgGrass: 0xc0a060, detailGrass: 0x907040, wallBg: 0xa08050, wallLine: 0x604030, targetBg: 0xd0b070 }, // World 3: Ruins (Sandy/Sepia)
  { ...GBC_PAL, bgGrass: 0x604080, detailGrass: 0x402060, wallBg: 0x503060, wallLine: 0x301040, targetBg: 0x8060a0 }, // World 4: Labyrinth (Purple)
  { ...GBC_PAL, bgGrass: 0xa04040, detailGrass: 0x702020, wallBg: 0x803030, wallLine: 0x501010, targetBg: 0xc06060 }, // World 5: Master Class (Crimson)
]

export const CSS_LIGHTEST = '#9bbc0f'
export const CSS_LIGHT = '#8bac0f'
export const CSS_MID = '#306230'
export const CSS_DARKEST = '#0f380f'
export const FONT = '"Press Start 2P"'
