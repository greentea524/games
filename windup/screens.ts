// Windup's title, its two info pages and the pause panel, on the real
// 240×216 screen (#170).
//
// They were laid out for 160×144 and magnified by the play camera's 1.5
// (#166), so their 8-pixel text came out at 12 and the title stood on
// near-black with a blue box and an orange square under it. Now they use the
// HUD's framed panels and colours (#169) and stand in the factory: its
// backdrop behind, a ledge of mossy stone, and the toy beside a winding
// station on it.
//
// No Phaser here: the scenes draw from these boxes and `screens_test.ts`
// checks the same ones.

import { SCREEN_W, SCREEN_H, CHAR, type Box } from './hud'

export const TITLE = 'WINDUP'
/** The title's font size: three times the HUD's. */
export const TITLE_PX = 24
export const LINE = 14
/** Characters to a line on an info page. */
export const INFO_COLS = 26

/** Where the stone ledge's top is, which the figures stand on. */
export const LEDGE_Y = SCREEN_H - 24

/** Breaks text into lines of at most `cols` characters, at spaces, keeping its own line breaks. */
export function wrap(text: string, cols: number): string[] {
  return text.split('\n').flatMap((para) => {
    if (!para) return ['']
    const out: string[] = []
    let line = ''
    for (const word of para.split(' ')) {
      if (!line) line = word
      else if (line.length + 1 + word.length <= cols) line += ` ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
    return out
  })
}

/** A framed panel round `rows` lines of up to `cols` characters, centred across the screen at `y`. */
export function panelFor(cols: number, rows: number, y: number, pad = 8): Box {
  const width = cols * CHAR + pad * 2 + 12
  const height = rows * LINE - (LINE - CHAR) + pad * 2
  return { x: Math.round((SCREEN_W - width) / 2), y, width, height }
}

export interface MenuLayout {
  title: { x: number; y: number }
  panel: Box
  /** Where each item's text starts, and where its cursor's point is. */
  items: { x: number; y: number; cursor: { x: number; y: number } }[]
  /** The toy and the station, by the middle of the foot of each picture. */
  toy: { x: number; y: number }
  station: { x: number; y: number }
}

/**
 * The title: the name across the top, the choices in a panel under it, and
 * the toy and a station on the ledge along the bottom.
 */
export function titleLayout(items: string[]): MenuLayout {
  const cols = Math.max(...items.map((s) => s.length))
  const panel = panelFor(cols, items.length, 60)
  const x = panel.x + 20
  return {
    title: { x: SCREEN_W / 2, y: 18 },
    panel,
    items: items.map((_, i) => {
      const y = panel.y + 8 + i * LINE
      return { x, y, cursor: { x: x - 10, y: y + CHAR / 2 } }
    }),
    toy: { x: SCREEN_W / 2 - 30, y: LEDGE_Y },
    station: { x: SCREEN_W / 2 + 30, y: LEDGE_Y },
  }
}

/** An info page: its lines in a panel under the title. */
export function infoLayout(lines: string[]) {
  const panel = panelFor(INFO_COLS, lines.length, 52)
  return { panel, text: { x: panel.x + 14, y: panel.y + 8 } }
}

/** The pause panel: PAUSED at twice the size, and the choices under it. */
export function pauseLayout(items: string[]) {
  const cols = Math.max(6 * 2, ...items.map((s) => s.length))
  const panel = panelFor(cols, items.length + 2, 48)
  const x = panel.x + 20
  return {
    panel,
    heading: { x: SCREEN_W / 2, y: panel.y + 8 },
    items: items.map((_, i) => {
      const y = panel.y + 8 + (i + 2) * LINE
      return { x, y, cursor: { x: x - 10, y: y + CHAR / 2 } }
    }),
  }
}

/** The controls page, for the controls in the player's hands. */
export function howToPlay(desktop: boolean): string {
  return desktop
    ? 'MOVE: ARROWS\nJUMP: Z\nWALL JUMP: Z while sliding down a wall\nSOUND: M or the ENTER menu\n\nYour key winds down as you move. Wind it up again at a station.'
    : 'MOVE: D-PAD\nJUMP: A\nWALL JUMP: A while sliding down a wall\nSOUND: START for the menu\n\nYour key winds down as you move. Wind it up again at a station.'
}

export const ABOUT = 'WINDUP\nA clockwork toy in a factory of moss and steel.\n\n32 rooms to cross before the spring runs down.'
