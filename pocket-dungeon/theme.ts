// The colours every screen outside the dungeon is drawn in (#159).
//
// The title, shop and game-over screens were green on near-black with a
// stroke, from before the HUD was redrawn. They use the HUD's family now:
// white for what the player reads, a cool grey for what they are not on, gold
// for gold. The green screen gets its own four tones and nothing else.
//
// No Phaser here, so `screens_test.ts` can read it.
import { PAL } from './constants'

export interface Theme {
  /** The screen behind everything. */
  bg: number
  /** What the player is reading or has selected. */
  text: number
  /** Everything else on the screen. */
  dim: number
  gold: number
  good: number
  bad: number
  /** Divider lines. */
  rule: number
}

export const THEME: Record<'gbc' | 'dmg', Theme> = {
  gbc: { bg: 0x0b0b12, text: 0xf4f4f4, dim: 0x8890a8, gold: 0xffd700, good: 0x88ff88, bad: 0xff6060, rule: 0x3a3a48 },
  // On the green screen `dim` is the second-lightest tone, not the third:
  // PAL.dark on PAL.darkest is the pair #158's empty relic pip was lost in.
  dmg: {
    bg: PAL.darkest, text: PAL.lightest, dim: PAL.light, gold: PAL.lightest,
    good: PAL.lightest, bad: PAL.lightest, rule: PAL.dark,
  },
}

export const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`

/** The four tones `shared/runSummary` wants, for the game-over panel. */
export const summaryPalette = (mode: 'gbc' | 'dmg') => {
  const t = THEME[mode]
  return { darkest: t.bg, dark: t.rule, light: t.dim, lightest: t.text }
}

// --- where things go ---------------------------------------------------------
//
// Press Start 2P at 8 pixels is one 8×8 cell a character, so a line's width is
// eight times its length and these can be checked without a browser.

/** One character cell at the body size. */
export const CELL = 8
/** Clear space at the left and right edges, as the HUD keeps. */
export const MARGIN = 9

export const TITLE = {
  /** Characters a class description may run to on one line. */
  descChars: 26,
  /** Lines the description has room for before the menu. */
  descLines: 2,
  descY: 112,
  menuY: 142,
  menuGap: 14,
  recordY: 197,
}

export const SHOP = {
  rowsY: 54,
  rowGap: 14,
  /** Rows the list shows at once: the description's divider is under the last. */
  rows: 6,
  dividerY: 140,
  descY: 146,
  descChars: 27,
  // Three, not two: "From your last run. Restores 1 HP every 8 turns." is
  // the longest line a recovered item can have, and it takes all three.
  descLines: 3,
  infoY: 182,
  backY: 196,
}

/** Greedy word wrap, as Phaser's does it: how many lines `text` takes. */
export function wrappedLines(text: string, chars: number): number {
  let lines = 1
  let used = 0
  for (const word of text.split(' ')) {
    const need = used === 0 ? word.length : used + 1 + word.length
    if (need > chars && used > 0) {
      lines++
      used = word.length
    } else {
      used = need
    }
  }
  return lines
}
