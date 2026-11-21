// Where Windup's HUD goes, and what it shows (#169).
//
// The card has a framed ENERGY panel with the robot's face and a segmented
// bar, and clean text top right. The game had PWR and a plain bar along the
// top, a chunky timer under it, and LVL 1/32 written over the floor, where it
// covered the platforms and the toy.
//
// There is no room for a bar. A level is the whole screen: ten tiles by nine
// at 24 pixels is 240 by 216 exactly (#166), and level 2 has walls, its goal
// and its spawn in the top row. A bar would mean shrinking the view to a
// tile size the art is not drawn at. So the HUD is two small framed panels,
// each a tile tall and four wide, laid on the level where the level is empty:
// the energy panel and the clock with the level number. For each level the
// panels go in the places nearest their homes, top left and top right, that
// cover nothing in the level; and when the toy comes under one, it steps
// aside to the next clear place, as Static's minimap does (#180).
//
// No Phaser here: `UIScene` draws from these boxes and `hud_test.ts` checks
// the same ones against all 32 levels.

import type { LevelData } from './levels'
import { TILE, PAL } from './constants'

/** The screen, a drawn tile, and the font: eight pixels a character. */
export const SCREEN_W = 240
export const SCREEN_H = 216
export const TILE_PX = 24
export const CHAR = 8
/** Screen pixels to a world unit. */
const ZOOM = TILE_PX / TILE

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A panel: four tiles wide and one tall, less a little room round it. */
export const PANEL_TILES = 4
export const PANEL = { width: PANEL_TILES * TILE_PX - 4, height: TILE_PX - 2 }

/** How many rows down a panel may sit, and how finely it may slide along one. */
const ROWS = 3
export const STEP = 1
const MAX_X = SCREEN_W - PANEL.width - 2

/**
 * Every place a panel may go: a row of the top three, which every level but
 * one leaves almost empty, and anywhere along it to the pixel. Whole tiles,
 * then steps of three, were tried first: in level 2 the one gap clear of the
 * walls, the goal and the toy at its start is 93 pixels for a panel of 92,
 * and it has to sit exactly there.
 */
export function slots(): Box[] {
  const out: Box[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let x = 2; x <= MAX_X; x += STEP) out.push({ x, y: r * TILE_PX + 1, ...PANEL })
  }
  return out
}

/** Where each panel would rather be: energy top left, the clock top right. */
export const HOME = { energy: { x: 2, y: 1 }, clock: { x: MAX_X - ((MAX_X - 2) % STEP), y: 1 } }

/**
 * The tiles a level puts something in: every platform, hazard, belt,
 * spring, pickup, station and the goal, where the toy starts, every tile
 * an arc's bolt crosses, and every tile a moving platform passes through.
 */
export function occupied(level: LevelData): Set<string> {
  const cells = new Set<string>()
  const at = (x: number, y: number) => cells.add(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`)
  for (const list of [level.platforms, level.springs, level.pickups, level.stations, level.spikes, level.lava, level.arcs, level.conveyors]) {
    for (const p of list) at(p.x, p.y)
  }
  at(level.goal.x, level.goal.y)
  at(level.spawn.x, level.spawn.y)
  for (let i = 0; i + 1 < level.arcs.length; i += 2) {
    const [a, b] = [level.arcs[i], level.arcs[i + 1]]
    for (let t = 0; t <= 1; t += 1 / 32) at(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }
  for (const m of level.movingPlatforms) {
    for (let t = 0; t <= 1; t += 1 / 16) at(m.x + m.dx * t, m.y + m.dy * t)
  }
  return cells
}

/** The tiles, on the screen, that a box lies over. */
export const tilesUnder = (b: Box): string[] => {
  const out: string[] = []
  for (let y = Math.floor(b.y / TILE_PX); y <= Math.floor((b.y + b.height - 1) / TILE_PX); y++) {
    for (let x = Math.floor(b.x / TILE_PX); x <= Math.floor((b.x + b.width - 1) / TILE_PX); x++) out.push(`${x},${y}`)
  }
  return out
}

/** The places a panel may go in this level: those over nothing in it. */
export const clearSlots = (level: LevelData): Box[] => {
  const cells = occupied(level)
  return slots().filter((s) => !tilesUnder(s).some((c) => cells.has(c)))
}

/** Whether two boxes share any pixel. */
export const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * The toy on the screen, as much as is drawn of it: its picture is a tile
 * square about its middle (#168), and its key and the key's outline reach
 * three pixels past that on whichever side its back is.
 */
export const toyBox = (x: number, y: number): Box => {
  const halfW = TILE_PX / 2 + 3
  const halfH = TILE_PX / 2
  return { x: x * ZOOM - halfW, y: y * ZOOM - halfH, width: halfW * 2, height: halfH * 2 }
}

export interface Placement {
  energy: Box | null
  clock: Box | null
}

const near = (home: { x: number; y: number }) => (a: Box, b: Box) =>
  Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y)

/**
 * Where the two panels go. Each keeps its place while that is still clear;
 * otherwise it takes the clear place nearest its home. The energy panel is
 * placed first. A panel with nowhere clear is not drawn: the toy's key still
 * says how much energy is left (#168), and the clock goes on counting.
 */
export function place(clear: Box[], toy: Box | null, current: Placement = { energy: null, clock: null }): Placement {
  const free = (b: Box, taken: Box | null) => !(toy && overlap(b, toy)) && !(taken && overlap(b, taken))
  const pick = (cur: Box | null, home: { x: number; y: number }, taken: Box | null) => {
    if (cur && clear.some((s) => s.x === cur.x && s.y === cur.y) && free(cur, taken)) return cur
    return [...clear].sort(near(home)).find((s) => free(s, taken)) ?? null
  }
  const energy = pick(current.energy, HOME.energy, null)
  const clock = pick(current.clock, HOME.clock, energy)
  return { energy, clock }
}

// --- inside a panel ---------------------------------------------------------------

/** The energy panel: the toy's face on the left, ENERGY over a bar of ten. */
export const SEGMENTS = 10
export function energyLayout(p: Box) {
  return {
    face: { x: p.x + 3, y: p.y + 5 },
    label: { x: p.x + 20, y: p.y + 3 },
    bar: { x: p.x + 20, y: p.y + 13, segment: 6, gap: 1, height: 6 },
  }
}

/** The clock's panel: the run time, and the level under it. */
export function clockLayout(p: Box) {
  return { time: { x: p.x + 6, y: p.y + 3 }, level: { x: p.x + 6, y: p.y + 12 } }
}

/** Below this share of a full spring, the energy panel raises the alarm. */
export const LOW = 0.3
/** Below this, it is nearly gone. */
export const MID = 0.6

export type Level = 'full' | 'mid' | 'low'
export const energyLevel = (charge: number): Level => (charge <= LOW ? 'low' : charge <= MID ? 'mid' : 'full')

/** How many of the ten segments are lit. Any energy at all lights one. */
export const litSegments = (charge: number) => (charge <= 0 ? 0 : Math.max(1, Math.ceil(Math.min(1, charge) * SEGMENTS)))

/** The run time as the clock shows it. */
export const clockText = (ms: number) => {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${String(Math.min(mins, 99)).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(Math.floor(ms % 1000)).padStart(3, '0')}`
}
export const levelText = (n: number, of: number) => `LVL ${n}/${of}`

// --- colours ------------------------------------------------------------------------

/**
 * The HUD's colours, a set for each palette (#169). The colour set is the
 * card's: a dark framed panel, clean pale text, and segments that run yellow
 * to orange to red as the spring runs down. The green screen's is its four
 * tones, and its alarm is the panel's label turned light.
 */
export const HUD_THEME = {
  gbc: {
    panel: 0x131c28, frame: 0x5a7896, text: 0xeef2f6, dim: 0x8aa0b4, empty: 0x26303c,
    seg: { full: 0xf8d048, mid: 0xf89030, low: 0xf04030 } as Record<Level, number>,
    alarm: 0xf04030, alarmText: 0x06080c,
  },
  dmg: {
    panel: PAL.darkest, frame: PAL.light, text: PAL.lightest, dim: PAL.light, empty: PAL.dark,
    seg: { full: PAL.lightest, mid: PAL.light, low: PAL.lightest } as Record<Level, number>,
    alarm: PAL.lightest, alarmText: PAL.darkest,
  },
} as const

