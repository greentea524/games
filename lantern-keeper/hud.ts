// Where Lantern Keeper's HUD goes, in the card's layout (#174).
//
// The card has a solid bar along the top and another along the bottom, with
// the forest between them and nothing laid over it. The game had two lines of
// pale text and an unlabelled bar, drawn on the forest itself.
//
// The game keeps three things worth showing, and only those are shown: how
// many of this stage's lanterns are lit, which stage this is, and how much
// oil is left. The card's score, lives and health are not things the game
// counts, and a HUD showing a number nothing tracks would be a lie.
//
// Press Start 2P at 8 pixels is eight pixels a character, so the layout is
// arithmetic. No Phaser here: `HudScene` draws these boxes and `hud_test.ts`
// checks the same ones.
import { HUD_BAR } from './constants'

export const CHAR = 8
export const BAR = HUD_BAR
/** Clear space at each side of a bar. */
export const MARGIN = 8
/**
 * The shell rounds the screen's bottom right corner deeply enough to cut the
 * end off anything a margin from it (#158, #180): the gauge stops short.
 */
export const CORNER = 16

export interface Box {
  x: number
  y: number
  width: number
  height: number
  text?: string
}

export interface HudValues {
  /** Lanterns lit on this stage, and how many it has. No count when it has none. */
  lit: number
  lanterns: number
  /** Which stage, from one, and how many there are. */
  stage: number
  stages: number
}

export const lanternText = (v: HudValues): string => (v.lanterns > 0 ? `LANTERNS ${v.lit}/${v.lanterns}` : '')
export const stageText = (v: HudValues): string => `STAGE ${v.stage}/${v.stages}`
/** The oil in the keeper's lantern: what a flask fills. */
export const OIL_LABEL = 'OIL'

export interface HudLayout {
  top: Box
  bottom: Box
  lanterns: Box
  stage: Box
  oilLabel: Box
  /** The gauge's inside: the fill is drawn from its left edge. */
  gauge: Box
}

/** Every box the HUD draws, on a screen `w` by `h`. */
export function layout(v: HudValues, w: number, h: number): HudLayout {
  const textY = Math.round((BAR - CHAR) / 2)
  const lt = lanternText(v)
  const st = stageText(v)
  const bottomY = h - BAR
  const labelW = OIL_LABEL.length * CHAR
  const gaugeX = MARGIN + labelW + 8
  return {
    top: { x: 0, y: 0, width: w, height: BAR },
    bottom: { x: 0, y: bottomY, width: w, height: BAR },
    lanterns: { x: MARGIN, y: textY, width: lt.length * CHAR, height: CHAR, text: lt },
    stage: { x: w - MARGIN - st.length * CHAR, y: textY, width: st.length * CHAR, height: CHAR, text: st },
    oilLabel: { x: MARGIN, y: bottomY + textY, width: labelW, height: CHAR, text: OIL_LABEL },
    gauge: { x: gaugeX, y: bottomY + 6, width: w - CORNER - gaugeX, height: BAR - 12 },
  }
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height

/**
 * What is wrong with a layout, or null: two things drawn over each other,
 * something off the screen, or something out of its bar.
 */
export function collision(l: HudLayout, w: number, h: number): string | null {
  const screen = { x: 0, y: 0, width: w, height: h }
  const items: [string, Box, Box][] = [
    ['the lantern count', l.lanterns, l.top],
    ['the stage', l.stage, l.top],
    ['the oil label', l.oilLabel, l.bottom],
    ['the gauge', l.gauge, l.bottom],
  ]
  for (const [name, box, bar] of items) {
    if (box.width === 0) continue
    if (!inside(box, screen)) return `${name} leaves the screen`
    if (!inside(box, bar)) return `${name} leaves its bar`
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [a, A] = items[i]
      const [b, B] = items[j]
      if (A.width && B.width && overlap(A, B)) return `${a} is over ${b}`
    }
  }
  if (l.gauge.width < 60) return `the gauge is ${l.gauge.width} pixels, too short to read`
  return null
}

/**
 * The bars' colours. The text is the card's amber on near-black; the
 * strip's edge is the forest's own green, so the bars read as a frame and
 * not as part of the play area.
 */
export const HUD_COLOURS = {
  strip: 0x050a07,
  edge: 0x2d4a33,
  text: 0xffcc66,
  /** The gauge: warm while there is oil, pale once it is low. */
  fill: 0xffcc66,
  low: 0xe0f8cf,
  empty: 0x1c2a20,
} as const

/** How much brighter one colour is than another, as WCAG measures it. */
export function contrast(a: number, b: number): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const L = (c: number) => 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255)
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
