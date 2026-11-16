// Where everything on the HUD goes, and what it says (#164).
//
// The HUD was "STG 1" and "0 / 10" in chunky stroked text on a see-through
// bar, with the level showing through it, and a bottom line naming three keys
// a phone does not have. This is the layout for 240×216: solid bars, text at
// the font's native 8 pixels, and a bottom line written for whichever of a
// keyboard or the shell's buttons the player is holding.
//
// Press Start 2P at 8 pixels is one 8×8 cell a character, so a line's width
// is eight times its length and `hud_test.ts` can hold the layout to its
// promise that nothing overlaps, without a browser. No Phaser here.
import { PAL } from './constants'

/** One character cell of the HUD font. */
export const CELL = 8
/** Each bar's height: a tile less a pixel, as Pocket Dungeon's are. */
export const BAR_HEIGHT = 23
/**
 * Clear space at the screen's left and right edges. The shell rounds the
 * screen's corners; at 6 Pocket Dungeon's bottom line lost the foot of its
 * last digit to the curve (#158).
 */
export const MARGIN = 9

export interface HudValues {
  stage: number
  moves: number
  par: number
  /** The fewest moves this level has been cleared in, or 0 for never. */
  best: number
  /** True when the player has a keyboard and a mouse, not a touch screen. */
  desktop: boolean
}

export interface Box {
  name: string
  x: number
  y: number
  width: number
  height: number
  text: string
}

/**
 * The bottom line, for the controls in the player's hands.
 *
 * On a phone there is no Z, H or R. B undoes, SELECT resets, and the hint is
 * in the START menu, so that is what the line says there.
 */
export const controlsLine = (desktop: boolean): string =>
  desktop ? 'Z:UNDO  H:HINT  R:RESET' : 'B:UNDO SEL:RESET START:MENU'

/**
 * Every line of text on the HUD for a screen of `width` by `height`.
 *
 * Top bar: the stage on the left, moves against par on the right, and the
 * best for the level between them when there is one. Bottom bar: the
 * controls, centred.
 */
export function layout(v: HudValues, width: number, height: number): Box[] {
  const text = (name: string, s: string, x: number, y: number): Box => ({
    name, x, y, width: s.length * CELL, height: CELL, text: s,
  })
  const y = Math.floor((BAR_HEIGHT - CELL) / 2)
  const boxes: Box[] = []

  const stage = `STAGE ${v.stage}`
  boxes.push(text('stage', stage, MARGIN, y))
  const moves = `${v.moves}/${v.par}`
  const movesX = width - MARGIN - moves.length * CELL
  boxes.push(text('moves', moves, movesX, y))
  if (v.best > 0) {
    const best = `BEST ${v.best}`
    // Centred in the gap the other two leave, on a whole pixel.
    const gapLeft = MARGIN + stage.length * CELL
    boxes.push(text('best', best, Math.round((gapLeft + movesX - best.length * CELL) / 2), y))
  }

  const controls = controlsLine(v.desktop)
  boxes.push(text('controls', controls, Math.round((width - controls.length * CELL) / 2), height - BAR_HEIGHT + y))
  return boxes
}

/** The first two boxes that touch or crowd each other, or run off the screen. */
export function collision(boxes: Box[], width: number, height: number): string | null {
  for (const b of boxes) {
    if (b.x < MARGIN || b.y < 0 || b.x + b.width > width - MARGIN || b.y + b.height > height) {
      return `${b.name} leaves the screen`
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      // A clear cell between neighbours on a line: touching text reads as one word.
      const apart = a.x + a.width + CELL <= b.x || b.x + b.width + CELL <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      if (!apart) return `${a.name} crowds ${b.name}`
    }
  }
  return null
}

// --- colours -----------------------------------------------------------------

export interface HudTheme {
  /** The bars, solid. */
  bar: number
  /** A line along each bar's inner edge. */
  edge: number
  /** What the player reads. */
  text: number
  /** The labels beside it, and the controls line. */
  dim: number
  /** The best, and a selected menu row. */
  accent: number
}

/**
 * In colour the bars are the warehouse's own dark: the outline tone of its
 * walls, with their rim along the edge. On the green screen, four tones; the
 * dim text is the second-lightest, because dark on darkest is the pair
 * Pocket Dungeon's empty relic pip was lost in (#158).
 */
export const HUD_THEME: Record<'gbc' | 'dmg', HudTheme> = {
  gbc: { bar: 0x1f1214, edge: 0x6c4138, text: 0xf4f4f4, dim: 0xb4a8a0, accent: 0xf6cc3c },
  dmg: { bar: PAL.darkest, edge: PAL.dark, text: PAL.lightest, dim: PAL.light, accent: PAL.lightest },
}

export const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`
