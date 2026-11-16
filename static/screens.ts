// The title and the two endings, on the real screen and in each palette (#181).
//
// The title was laid out for 160×144 behind a zoomed camera, its sprites over
// its own text, and in green whichever palette was chosen; the palette switch
// threw on it, because it reloaded a world that had not started. The endings
// were hard-wrapped to eighteen characters for the old screen, and told a
// phone to press Z.
//
// No Phaser here, so `screens_test.ts` can check the layout and the colours.
import { CHAR, LINE, wrap, type Box } from './hud'

export type Mode = 'gbc' | 'dmg'

/** The green screen's four tones. */
const TONE = { lightest: 0x9bbc0f, light: 0x8bac0f, dark: 0x306230, darkest: 0x0f380f }

export interface ScreenTheme {
  background: number
  title: number
  /** A second colour behind the title, a pixel off: a signal out of register. */
  ghost: number
  subtitle: number
  option: number
  selected: number
  /** The ground the two figures stand on. */
  stage: number
  stageEdge: number
}

/**
 * The title's colours. In colour it is the static's own: the near-black, pale
 * and cold blue of a patch, which nothing else in the game is. On the green
 * screen it is the four tones.
 */
export const TITLE_THEME: Record<Mode, ScreenTheme> = {
  gbc: { background: 0x10141c, title: 0xe8ecf4, ghost: 0x5a9cc0, subtitle: 0x6a7488, option: 0xa4abb4, selected: 0xaaf0ff, stage: 0x68aa52, stageEdge: 0x2c4a34 },
  dmg: { background: TONE.darkest, title: TONE.lightest, ghost: TONE.dark, subtitle: TONE.light, option: TONE.light, selected: TONE.lightest, stage: TONE.lightest, stageEdge: TONE.dark },
}

export const TITLE = 'STATIC'
export const SUBTITLE = 'a small town is fading'
/** The title is drawn at three times the font's size, the rest at one. */
export const TITLE_SCALE = 3
/** The kid and the entity stand between the words, at twice their size. */
export const FIGURE_SCALE = 2

export interface TitleLayout {
  title: Box
  subtitle: Box
  kid: Box
  entity: Box
  /**
   * A patch of lawn under the two of them. The entity is a dark figure and
   * the title is a dark screen: on the green screen it could not be seen.
   */
  stage: Box
  options: Box[]
}

/** Every box on the title, for however many options there are. */
export function titleLayout(screenW: number, optionLabels: string[], tile: number, entityH: number): TitleLayout {
  const centred = (width: number, y: number, height: number): Box => ({ x: Math.round((screenW - width) / 2), y, width, height })
  const title = centred(TITLE.length * CHAR * TITLE_SCALE, 28, CHAR * TITLE_SCALE)
  const subtitle = centred(SUBTITLE.length * CHAR, title.y + title.height + 10, CHAR)
  const figY = subtitle.y + subtitle.height + 16
  const fig = tile * FIGURE_SCALE
  const kid: Box = { x: screenW / 2 - fig - 8, y: figY + (entityH - tile) * FIGURE_SCALE, width: fig, height: fig }
  const entity: Box = { x: screenW / 2 + 8, y: figY, width: fig, height: entityH * FIGURE_SCALE }
  const stage: Box = { x: kid.x - 12, y: figY - 6, width: entity.x + entity.width - kid.x + 24, height: entity.height + 12 }
  const top = stage.y + stage.height + 12
  // Two characters for the marker beside the one chosen.
  const options = optionLabels.map((label, i) => centred((label.length + 2) * CHAR, top + i * 16, CHAR))
  return { title, subtitle, kid, entity, stage, options }
}

// --- the endings -------------------------------------------------------------

export type Ending = 'empathy' | 'severance'

/** What each ending says, a paragraph to a beat. Wrapped for the screen below. */
export const ENDINGS: Record<Ending, string[]> = {
  empathy: ['You step into the static and stay.', 'The lonely thing is lonely no more.', 'The town remembers all it lost.'],
  severance: ['You tear the signal loose.', 'The static screams, then falls silent.', 'The town is safe.', 'But the vanished stay gone.'],
}

/** Characters to a line of an ending: short lines, centred, like a card. */
export const ENDING_COLS = 22

/** An ending as the lines drawn, with an empty line between beats. */
export function endingLines(which: Ending): string[] {
  return ENDINGS[which].flatMap((para, i) => [...(i ? [''] : []), ...wrap(para, ENDING_COLS)])
}

/** How tall an ending's text is, at the leading it is drawn with. */
export const endingHeight = (which: Ending): number => (endingLines(which).length - 1) * LINE + CHAR

/**
 * An ending's colours. Staying is a pale card with dark writing and cutting
 * loose a dark one with pale; on the green screen those are its two ends.
 */
export const ENDING_THEME: Record<Mode, Record<Ending, { background: number; text: number }>> = {
  gbc: { empathy: { background: 0xf2e6c4, text: 0x1a1410 }, severance: { background: 0x10141c, text: 0xe8ecf4 } },
  dmg: { empathy: { background: TONE.lightest, text: TONE.darkest }, severance: { background: TONE.darkest, text: TONE.lightest } },
}

/** The line under an ending. A phone has no Z. */
export const endingPrompt = (desktop: boolean): string => `${desktop ? 'Z' : 'A'}: on`

/**
 * The tally after an ending, in `shared/runSummary`'s terms. It was the green
 * screen's four tones in both modes.
 */
export const summaryPalette = (mode: Mode) =>
  mode === 'dmg'
    ? { ...TONE }
    : { darkest: 0x10141c, dark: 0x6a7488, light: 0xa4abb4, lightest: 0xe8ecf4 }

export const css = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`
