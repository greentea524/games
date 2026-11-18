// The title and the level select, on the real screen (#165).
//
// Both were laid out for 160×144 and shown through a zoomed camera, in a
// navy that is not one of the green screen's four tones. Now they are drawn
// at 240×216 in the HUD's colours, and the level select has a page for each
// world, in that world's colours, where it had pages of twelve that cut
// across them.
//
// Press Start 2P at 8 pixels is eight pixels a character, so the layout is
// arithmetic. No Phaser here: the scenes draw these boxes and
// `screens_test.ts` checks the same ones.

export const CHAR = 8

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export const TITLE = 'CART & CRATE'
export const SUBTITLE = 'A SOKOBAN PUZZLE'
/** The title is twice the font's size. */
export const TITLE_SCALE = 2

/** What each world is, in the order the levels go through them. */
export const WORLD_NAMES = ['WAREHOUSE', 'ICE DEPOT', 'RUINS', 'LABYRINTH', 'MASTER CLASS']

/** The prompt on the title, for the controls in the player's hands. */
export const startPrompt = (desktop: boolean): string => (desktop ? 'PRESS ENTER' : 'PRESS START')

const centred = (screenW: number, width: number, y: number, height: number): Box => ({
  x: Math.round((screenW - width) / 2),
  y,
  width,
  height,
})

export interface TitleLayout {
  title: Box
  subtitle: Box
  /** A strip of the warehouse: a row of wall over a row of floor, in tiles. */
  wallRow: number
  floorRow: number
  /** Which tiles along that floor the fox, the crate and the target stand on. */
  fox: number
  crate: number
  target: number
  prompt: Box
}

export function titleLayout(screenW: number, screenH: number, tile: number, desktop: boolean): TitleLayout {
  const title = centred(screenW, TITLE.length * CHAR * TITLE_SCALE, 30, CHAR * TITLE_SCALE)
  const subtitle = centred(screenW, SUBTITLE.length * CHAR, title.y + title.height + 10, CHAR)
  const wallRow = subtitle.y + subtitle.height + 18
  const floorRow = wallRow + tile
  const across = Math.floor(screenW / tile)
  const prompt = centred(screenW, startPrompt(desktop).length * CHAR, Math.min(floorRow + tile + 26, screenH - 30), CHAR)
  return { title, subtitle, wallRow, floorRow, fox: Math.floor(across / 2) - 2, crate: Math.floor(across / 2) - 1, target: Math.floor(across / 2) + 1, prompt }
}

// --- the level select ----------------------------------------------------------

export const COLS = 5
export const ROWS = 2
export const PER_PAGE = COLS * ROWS
const CELL = 36
const GAP = 8

export interface SelectLayout {
  heading: Box
  world: Box
  cells: Box[]
  left: Box
  right: Box
  hint: Box
}

export const selectHint = (desktop: boolean): string => (desktop ? 'Z: PLAY  ARROWS: CHOOSE' : 'A: PLAY  PAD: CHOOSE')

/** One page: the heading, the world's name, ten stages, and the way on. */
export function selectLayout(screenW: number, screenH: number, worldName: string, desktop: boolean): SelectLayout {
  const heading = centred(screenW, 'SELECT STAGE'.length * CHAR * TITLE_SCALE, 14, CHAR * TITLE_SCALE)
  const world = centred(screenW, worldName.length * CHAR, heading.y + heading.height + 12, CHAR)
  const gridW = COLS * CELL + (COLS - 1) * GAP
  const x0 = Math.round((screenW - gridW) / 2)
  const y0 = world.y + world.height + 16
  const cells = Array.from({ length: PER_PAGE }, (_, i) => ({
    x: x0 + (i % COLS) * (CELL + GAP),
    y: y0 + Math.floor(i / COLS) * (CELL + GAP),
    width: CELL,
    height: CELL,
  }))
  const midY = y0 + (ROWS * CELL + (ROWS - 1) * GAP) / 2 - CHAR / 2
  const hintText = selectHint(desktop)
  return {
    heading,
    world,
    cells,
    left: { x: x0 - CHAR - 3, y: Math.round(midY), width: CHAR, height: CHAR },
    right: { x: x0 + gridW + 3, y: Math.round(midY), width: CHAR, height: CHAR },
    // Clear of the shell's rounded bottom right corner.
    hint: centred(screenW, hintText.length * CHAR, screenH - 28, CHAR),
  }
}

/** Which page, and which place on it, a level is: one page to a world. */
export const pageOf = (index: number): number => Math.floor(index / PER_PAGE)
