// The boot screen, the title, the story and the forest path, on the real
// screen (#175).
//
// They were laid out for 160×144 and shown through a camera zoomed by half
// again, in pale green on black, and the boot screen still said RETRO PAD.
// Now each is drawn at 240×216 over the forest the game is played in, in the
// HUD's amber, with the keeper standing on the stone.
//
// Press Start 2P at 8 pixels is eight pixels a character, so the layout is
// arithmetic. No Phaser here: the scenes draw these boxes and
// `screens_test.ts` checks the same ones.
import { wrapText } from './text'

export const CHAR = 8

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The colours every screen uses: the HUD's amber, and a panel behind text. */
export const SCREEN_COLOURS = {
  title: 0xffcc66,
  titleShadow: 0x3a2008,
  text: 0xe0f8cf,
  dim: 0x86b06a,
  selected: 0xffcc66,
  panel: 0x050a07,
  panelEdge: 0x2d4a33,
} as const

export const TITLE = 'LANTERN KEEPER'
/** The title is twice the font's size. */
export const TITLE_SCALE = 2
/** The figures on the title are shown at twice their drawn size. */
export const FIGURE_SCALE = 2
/** How tall the strip of stone along the bottom of a screen is. */
export const GROUND = 24

const centred = (screenW: number, width: number, y: number, height: number): Box => ({
  x: Math.round((screenW - width) / 2),
  y,
  width,
  height,
})

export interface TitleLayout {
  title: Box
  panel: Box
  options: Box[]
  keeper: Box
  lantern: Box
  ground: Box
}

/**
 * The title: the name across the top, the choices on a panel in the middle,
 * and the keeper on the stone at the bottom with a lit lantern beside them.
 * `keeper` and `lantern` are the sizes their pictures are drawn at.
 */
export function titleLayout(
  screenW: number,
  screenH: number,
  labels: string[],
  keeper: [number, number],
  lantern: [number, number],
): TitleLayout {
  const title = centred(screenW, TITLE.length * CHAR * TITLE_SCALE, 22, CHAR * TITLE_SCALE)
  // Two characters for the marker beside the one chosen.
  const widest = Math.max(...labels.map((l) => l.length + 2)) * CHAR
  const rows = labels.length
  const panel = centred(screenW, widest + 32, title.y + title.height + 18, rows * 18 + 14)
  const options = labels.map((l, i) => centred(screenW, (l.length + 2) * CHAR, panel.y + 10 + i * 18, CHAR))
  const ground: Box = { x: 0, y: screenH - GROUND, width: screenW, height: GROUND }
  const kw = keeper[0] * FIGURE_SCALE
  const kh = keeper[1] * FIGURE_SCALE
  const lw = lantern[0] * FIGURE_SCALE
  const lh = lantern[1] * FIGURE_SCALE
  const keeperBox: Box = { x: Math.round(screenW / 2 - kw - 6), y: ground.y - kh, width: kw, height: kh }
  const lanternBox: Box = { x: Math.round(screenW / 2 + 10), y: ground.y - lh, width: lw, height: lh }
  return { title, panel, options, keeper: keeperBox, lantern: lanternBox, ground }
}

/** Characters to a line of the story and the controls. */
export const PAGE_COLS = 24

export const STORY = [
  'An ancient darkness has fallen upon the realm.',
  'Light the ancient lanterns to restore your powers and reach the Heart Tree.',
]

/**
 * The controls, for the controls in the player's hands: a phone has the
 * pad and two buttons, a desktop the keys. The old page named the keys on a
 * phone too.
 */
export const controls = (desktop: boolean): string[] =>
  desktop
    ? ['Arrows: move', 'Z or Up: jump', 'X: dash', 'Enter: pause', 'M: sound']
    : ['Pad: move', 'A: jump', 'B: dash', 'START: pause']

/** A page of text on a panel: the story, or the controls. */
export function pageLines(paragraphs: string[]): string[] {
  return paragraphs.flatMap((p, i) => [...(i ? [''] : []), ...wrapText(p, PAGE_COLS)])
}

export function pageLayout(screenW: number, heading: Box, lines: number): Box {
  return centred(screenW, PAGE_COLS * CHAR + 24, heading.y + heading.height + 14, lines * 12 + 14)
}

export const RETURN = (desktop: boolean): string => (desktop ? 'X: back' : 'B: back')

// --- the forest path ---------------------------------------------------------

export const MAP_TITLE = 'THE FOREST PATH'

export interface MapLayout {
  title: Box
  /** Where the stage's name goes, under the path. */
  label: Box
  nodes: { x: number; y: number }[]
}

/**
 * The stages as a winding path: four to a row, the rows running alternately
 * left and right so the path reads as one line. Laid out by index, so a stage
 * added to the list finds its own place.
 */
export function mapLayout(screenW: number, screenH: number, stages: number): MapLayout {
  const title = centred(screenW, MAP_TITLE.length * CHAR, 22, CHAR)
  const label: Box = { x: 12, y: screenH - GROUND - 34, width: screenW - 24, height: CHAR }
  const perRow = 4
  const rows = Math.ceil(stages / perRow)
  const marginX = 40
  const span = screenW - marginX * 2
  const top = title.y + title.height + 40
  const gap = rows > 1 ? Math.min(52, (label.y - 30 - top) / (rows - 1)) : 0
  const nodes = Array.from({ length: stages }, (_, i) => {
    const row = Math.floor(i / perRow)
    const col = i % perRow
    const c = row % 2 === 0 ? col : perRow - 1 - col
    return { x: Math.round(marginX + (span * c) / (perRow - 1)), y: Math.round(top + row * gap) }
  })
  return { title, label, nodes }
}
