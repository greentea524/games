// Where Static's on-screen text and its minimap go (#180).
//
// The UI was laid out for 160×144 and shown through a camera zoomed by half
// again. Text at 8 pixels came out at 12, eighteen characters to a line, in a
// box that took four tenths of the screen; the minimap was a quarter of it,
// over the town. This lays everything out on the real 240×216 screen, with
// the font at its native size: twenty-six characters to a line, and no line
// of the game's dialogue longer than three of them.
//
// The font is Press Start 2P at 8 pixels, so a character is eight pixels wide
// and a layout is arithmetic. No Phaser here: `UIScene` and `WorldScene` draw
// from these boxes and `hud_test.ts` checks the same ones.

/** One character of the font, and the distance between two lines of it. */
export const CHAR = 8
export const LINE = 10

/** Characters to a line of dialogue, and the most lines a box holds. */
export const COLS = 26
export const BODY_LINES = 3

/** Space kept between a box and the edge of the screen. */
export const MARGIN = 6

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Breaks text into lines of at most `cols` characters, at spaces.
 *
 * The scenes draw the lines this returns, joined, with Phaser's own wrapping
 * off. So what the test measures is what is drawn, and not an estimate of
 * what a different wrapping routine will do with the same words.
 */
export function wrap(text: string, cols: number): string[] {
  return text.split('\n').flatMap((para) => {
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

// --- dialogue ----------------------------------------------------------------

const PAD = 10
const NAME_GAP = 5

export interface DialogueLayout {
  box: Box
  name: { x: number; y: number }
  body: { x: number; y: number }
  arrow: { x: number; y: number }
}

/** The speaker's name, three lines of what they say, and room round both. */
export const DIALOGUE_HEIGHT = 8 + CHAR + NAME_GAP + (BODY_LINES - 1) * LINE + CHAR + 9

/**
 * The dialogue box, along the bottom of the screen or along the top.
 *
 * It is `COLS` characters wide inside, which with the padding is the screen
 * less a margin each side.
 */
export function dialogue(screenW: number, screenH: number, top: boolean): DialogueLayout {
  const width = COLS * CHAR + PAD * 2
  const x = Math.floor((screenW - width) / 2)
  const y = top ? MARGIN : screenH - MARGIN - DIALOGUE_HEIGHT
  return {
    box: { x, y, width, height: DIALOGUE_HEIGHT },
    name: { x: x + PAD, y: y + 8 },
    body: { x: x + PAD, y: y + 8 + CHAR + NAME_GAP },
    // Inside the padding, clear of the last character of a full line.
    arrow: { x: x + width - PAD, y: y + DIALOGUE_HEIGHT - 12 },
  }
}

/**
 * Whether the box should go along the top: when the kid, or whoever they are
 * talking to, would be under it at the bottom. The camera follows the kid, so
 * in the town they are mid-screen and it never is. A room does not scroll,
 * and the kid at its door stands in the bottom rows.
 *
 * `ys` are screen positions of the middles of the sprites to keep clear.
 */
export function dialogueOnTop(ys: number[], screenH: number, spriteH: number): boolean {
  const boxTop = screenH - MARGIN - DIALOGUE_HEIGHT
  return ys.some((y) => y + spriteH / 2 > boxTop)
}

export interface ChoiceLayout {
  box: Box
  rows: { x: number; y: number }[]
}

/**
 * The answers to a question, in a box of their own beside the dialogue box:
 * above it when it is at the bottom, below when it is at the top, so the
 * question stays in view. Each label is drawn with a two-character marker.
 */
export function choices(labels: string[], d: DialogueLayout, top: boolean): ChoiceLayout {
  const longest = Math.max(...labels.map((l) => l.length)) + 2
  const width = longest * CHAR + 12
  const height = labels.length * 12 + 8
  const x = d.box.x + d.box.width - width
  const y = top ? d.box.y + d.box.height + 3 : d.box.y - height - 3
  return {
    box: { x, y, width, height },
    rows: labels.map((_, i) => ({ x: x + 6, y: y + 6 + i * 12 })),
  }
}

// --- the minimap -------------------------------------------------------------

export interface MinimapLayout {
  box: Box
  /** Screen pixels to a tile. */
  scale: number
  /** Where tile (0, 0) is drawn. */
  originX: number
  originY: number
}

/**
 * The minimap: two pixels to a tile, in the top right corner.
 *
 * It was scaled to sixty pixels whatever the map, which for the town was a
 * quarter of the screen. Two pixels is the least at which a path between two
 * houses is still a gap; the town's twenty-four tiles come to under a
 * twentieth of the screen.
 */
export function minimap(mapW: number, mapH: number, screenW: number, screenH = 0, corner: Corner = 'top-right'): MinimapLayout {
  const scale = 2
  const pad = 2
  const width = mapW * scale + pad * 2
  const height = mapH * scale + pad * 2
  // The shell rounds the screen's bottom right corner, deeply enough to cut
  // the corner off a box a margin from both edges. No layout check sees
  // that; a screenshot did.
  const inset = corner === 'bottom-right' ? ROUNDED : MARGIN
  const x = corner.endsWith('left') ? MARGIN : screenW - width - inset
  const y = corner.startsWith('top') ? MARGIN : screenH - height - inset
  return { box: { x, y, width, height }, scale, originX: x + pad, originY: y + pad }
}

/**
 * The corners the minimap may sit in, in the order it prefers them. Not the
 * top left: the name of a place arrives there.
 */
export type Corner = 'top-right' | 'bottom-right' | 'bottom-left'
export const CORNERS: Corner[] = ['top-right', 'bottom-left', 'bottom-right']

/** How far to stay from the two edges of the screen's rounded corner. */
export const ROUNDED = 12

/**
 * Which corner the minimap should be in, or null for none.
 *
 * It stays where it is while that corner is clear, so it does not hop about
 * as the town scrolls. When something to walk up to comes under it, it moves
 * to the first corner that is clear; and when none is, it is not drawn. The
 * first version only hid it, and with every lamp post and signpost a thing
 * that can be looked at, it was hidden for most of a walk through the town.
 */
export function minimapCorner(
  mapW: number, mapH: number, screenW: number, screenH: number,
  points: { x: number; y: number }[], reach: number, current: Corner | null,
): Corner | null {
  const clear = (c: Corner) => !covers(minimap(mapW, mapH, screenW, screenH, c).box, points, reach)
  if (current && clear(current)) return current
  return CORNERS.find(clear) ?? null
}

/**
 * Whether a box on the screen is over any of these points, allowing each
 * `reach` round it for the sprite drawn there.
 *
 * The world scene asks this of the minimap every frame, with every door,
 * person, patch and thing that can be used. A map in a corner must cover
 * something as the town scrolls under it; when what it covers is something
 * to walk up to, the map steps aside.
 */
export function covers(box: Box, points: { x: number; y: number }[], reach: number): boolean {
  return points.some(
    (p) => p.x + reach > box.x && p.x - reach < box.x + box.width && p.y + reach > box.y && p.y - reach < box.y + box.height,
  )
}

// --- prompts, banners, toasts ------------------------------------------------

/** What pressing the button will do, with the button first. */
export function promptText(verb: string, desktop: boolean): string {
  return `${desktop ? 'Z' : 'A'} ${verb}`
}

/**
 * The prompt's box, over the head of the thing it is about and kept on the
 * screen. `x` and `y` are that thing's middle, on the screen.
 */
export function prompt(text: string, x: number, y: number, tile: number, screenW: number, under = false): Box {
  const width = text.length * CHAR + 8
  const height = CHAR + 6
  const left = Math.round(x - width / 2)
  const top = Math.round(y - tile / 2 - height - 3)
  return {
    x: Math.max(2, Math.min(screenW - width - 2, left)),
    // Under it instead when the kid is standing over it, where the prompt
    // would be on their head; or when it is on the top row, with no room.
    y: under || top < 2 ? Math.round(y + tile / 2 + 3) : top,
    width,
    height,
  }
}

/** The name of a place, in the top left as you arrive, for a moment. */
export function banner(label: string): Box {
  return { x: MARGIN, y: MARGIN, width: label.length * CHAR + 12, height: CHAR + 8 }
}

/** Characters to a line of a toast, beside its icon. */
export const TOAST_COLS = 22

/** A toast: an item's picture and a line or two about it. */
export function toast(lines: number, screenW: number, screenH: number, top: boolean): Box {
  const width = 24 + 12 + TOAST_COLS * CHAR + 8
  const height = Math.max(28, lines * LINE + 12)
  return { x: Math.floor((screenW - width) / 2), y: top ? MARGIN : screenH - MARGIN - height, width, height }
}

/** Whether two boxes share any pixel. */
export const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Whether a box is wholly on the screen. */
export const onScreen = (b: Box, screenW: number, screenH: number): boolean =>
  b.x >= 0 && b.y >= 0 && b.x + b.width <= screenW && b.y + b.height <= screenH
