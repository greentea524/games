// Where everything on the HUD goes, and the little pictures on it (#158).
//
// The HUD was laid out for the old 160×144 screen and shown enlarged. This is
// the layout at 240×216: the card's top bar, floor on the left and HP on the
// right, and a bottom bar of two lines. No Phaser here, so `hud_test.ts` can
// hold the layout to its promise that nothing overlaps at the longest values.
//
// The font is Press Start 2P at 8 pixels, its native size: every character is
// one 8×8 cell, so the width of a string is eight times its length. That is
// what makes the arithmetic below a measurement rather than a guess.

/** One character cell of the HUD font. */
export const CELL = 8
/** Each bar's height. One tile less a pixel: the play band is unchanged. */
export const BAR_HEIGHT = 23
/**
 * Clear space at the screen's left and right edges. The shell rounds the
 * screen's corners, and at 6 the bottom line lost the foot of its last digit
 * to the curve: "ATK:99" read as "ATK:9" and a smudge.
 */
export const MARGIN = 9

export interface HudValues {
  floor: number
  hp: number
  maxHp: number
  food: number
  maxFood: number
  gold: number
  atk: number
  /** Bonus of the weapon in hand, 0 for none. */
  weapon: number
  /** Bonus of the armour worn, 0 for none. */
  armour: number
  keys: number
  /** How many relic pips the bar shows. */
  relics: number
}

export interface Box {
  name: string
  x: number
  y: number
  width: number
  height: number
  /** What a text box says. Absent for a picture or a bar. */
  text?: string
}

/** The relic pips are 6×6, laid edge to edge. */
export const PIP = 6
const PIP_GAP = 4
/** A slot is `[`, a picture, three characters and `]`. */
const SLOT_CELLS = 6
const SLOT_GAP = 3

/** A bonus in three characters: `+15`, ` +4`, ` --`. */
const bonus = (n: number): string => (n > 0 ? `+${n}` : '--').padStart(3)
/** A count in three characters: ` x2`, ` --`. */
const count = (n: number): string => (n > 0 ? `x${n}` : '--').padStart(3)

export const foodState = (v: Pick<HudValues, 'food' | 'maxFood'>): 'ok' | 'low' | 'starving' => {
  const part = v.food / v.maxFood
  return part <= 0 ? 'starving' : part <= 0.25 ? 'low' : 'ok'
}

/** How much of the HP bar is filled, in whole pixels of `width`. */
export function hpFill(hp: number, maxHp: number, width: number): number {
  if (hp <= 0 || maxHp <= 0) return 0
  // A hero with any health left shows at least a pixel of it.
  return Math.max(1, Math.min(width, Math.round((hp / maxHp) * width)))
}

/**
 * Every box on the HUD for a screen of `width` by `height`.
 *
 * Top bar: floor on the left, HP on the right. Bottom bar, first line: a
 * heart, the HP bar, and three bracketed slots for weapon, armour and keys.
 * Second line: food on the left, attack on the right, and gold with the relic
 * pips centred between them as one group.
 */
export function layout(v: HudValues, width: number, height: number): Box[] {
  const text = (name: string, s: string, x: number, y: number): Box => ({
    name, x, y, width: s.length * CELL, height: CELL, text: s,
  })
  const right = width - MARGIN
  const boxes: Box[] = []

  // --- top bar
  const topY = Math.floor((BAR_HEIGHT - CELL) / 2)
  boxes.push(text('floor', `FLOOR: B${v.floor}F`, MARGIN, topY))
  const hp = `HP: ${v.hp}/${v.maxHp}`
  boxes.push(text('hp', hp, right - hp.length * CELL, topY))

  // --- bottom bar, first line
  const line1 = height - BAR_HEIGHT + 2
  const line2 = line1 + CELL + 2
  boxes.push({ name: 'heart', x: MARGIN, y: line1, width: CELL, height: CELL })

  const slotWidth = SLOT_CELLS * CELL
  const slots: [string, string][] = [
    ['weapon', bonus(v.weapon)],
    ['armour', bonus(v.armour)],
    ['keys', count(v.keys)],
  ]
  const slotsWidth = slots.length * slotWidth + (slots.length - 1) * SLOT_GAP
  const slotsX = right - slotsWidth
  const barX = MARGIN + CELL + 3
  boxes.push({ name: 'hpbar', x: barX, y: line1 + 1, width: slotsX - 7 - barX, height: 6 })
  slots.forEach(([name, value], i) => {
    const x = slotsX + i * (slotWidth + SLOT_GAP)
    boxes.push(text(`${name}-open`, '[', x, line1))
    boxes.push({ name: `${name}-icon`, x: x + CELL, y: line1, width: CELL, height: CELL })
    boxes.push(text(`${name}-value`, `${value}]`, x + 2 * CELL, line1))
  })

  // --- bottom bar, second line
  const food = foodState(v) === 'starving' ? 'STARVING!' : `FD:${v.food}`
  boxes.push(text('food', food, MARGIN, line2))
  const atk = `ATK:${v.atk}`
  boxes.push(text('atk', atk, right - atk.length * CELL, line2))
  const gold = `${v.gold}G`
  const group = gold.length * CELL + PIP_GAP + v.relics * PIP
  const groupX = Math.round((width - group) / 2)
  boxes.push(text('gold', gold, groupX, line2))
  for (let i = 0; i < v.relics; i++) {
    boxes.push({
      name: `pip-${i}`, x: groupX + gold.length * CELL + PIP_GAP + i * PIP, y: line2 + 1, width: PIP, height: PIP,
    })
  }
  return boxes
}

/** The first two boxes that touch, or run off the screen. Null when clean. */
export function collision(boxes: Box[], width: number, height: number): string | null {
  for (const b of boxes) {
    if (b.x < 0 || b.y < 0 || b.x + b.width > width || b.y + b.height > height) return `${b.name} leaves the screen`
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      if (!apart) return `${a.name} overlaps ${b.name}`
    }
  }
  return null
}

// --- the pictures -----------------------------------------------------------

/** Eight by eight, one colour each: `#` is ink. */
export const ICONS: Record<string, { rows: string[]; gbc: number }> = {
  heart: {
    gbc: 0xe84858,
    rows: [
      '.##..##.',
      '########',
      '########',
      '########',
      '.######.',
      '..####..',
      '...##...',
      '........',
    ],
  },
  weapon: {
    gbc: 0xd0d8e8,
    rows: [
      '......##',
      '.....###',
      '....###.',
      '#..###..',
      '.####...',
      '..##....',
      '.#.##...',
      '#...#...',
    ],
  },
  armour: {
    gbc: 0x70a0e8,
    rows: [
      '########',
      '########',
      '########',
      '########',
      '.######.',
      '.######.',
      '..####..',
      '...##...',
    ],
  },
  keys: {
    gbc: 0xf0c040,
    rows: [
      '.###....',
      '#...#...',
      '#...####',
      '#...#.##',
      '.###..#.',
      '........',
      '........',
      '........',
    ],
  },
}

export const iconKey = (name: string, mode: 'dmg' | 'gbc'): string => `hud_${name}_${mode}`
