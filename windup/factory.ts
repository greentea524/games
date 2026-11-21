// The factory: its stone, its hazards, its machines and the hall behind them
// (#167).
//
// The hub card is a place: mossy stone blocks with a grass cap, steel spikes
// over a glowing pit with electricity arcing across it, belts marked with
// bright arrows, and behind it all a green factory of gears, pipes, girders,
// a hanging lamp and a WINDUP banner. The game was red brick on near-black.
//
// Everything is drawn at the screen's resolution, 24 pixels to a tile. The
// world is still 16 units to a tile and the camera magnifies by 1.5 (#166),
// so a picture drawn here and shown at two thirds is one drawn pixel to one
// screen pixel.
//
// No Phaser in this file, so `factory_test.ts` can check every piece.

import { PAL } from './constants'

/** Pixels to a tile as drawn: `DRAWN_TILE`, which is 16 world units × 1.5. */
export const T = 24

/** A picture: a colour per pixel, or -1 where nothing is drawn. */
export interface Picture {
  w: number
  h: number
  px: Int32Array
}

export const picture = (w: number, h: number): Picture => ({ w, h, px: new Int32Array(w * h).fill(-1) })

export const get = (p: Picture, x: number, y: number): number =>
  x < 0 || y < 0 || x >= p.w || y >= p.h ? -1 : p.px[y * p.w + x]

const set = (p: Picture, x: number, y: number, c: number) => {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return
  p.px[y * p.w + x] = c
}

const rect = (p: Picture, x: number, y: number, w: number, h: number, c: number) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(p, i, j, c)
}

/**
 * A one-pixel edge round the silhouette, from the outside in: a clear pixel
 * next to a drawn one becomes the edge. The same rule as the other games'
 * pictures, and for the same reason: a pale spike needs no retoning to read
 * on a pale wall.
 */
const outline = (p: Picture, c: number) => {
  const edge: number[] = []
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (get(p, x, y) !== -1) continue
      if (get(p, x - 1, y) !== -1 || get(p, x + 1, y) !== -1 || get(p, x, y - 1) !== -1 || get(p, x, y + 1) !== -1) {
        edge.push(y * p.w + x)
      }
    }
  }
  for (const i of edge) p.px[i] = c
}

/** Perceived brightness, 0 to 255. */
export const luma = (c: number) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)

/** A small fixed hash, so a level always looks the same. */
const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

// --- palettes ----------------------------------------------------------------

export interface FactoryPalette {
  /** Behind everything: the camera's own colour. */
  void: number
  /** The far wall of the hall: buildings, tanks and chimneys. */
  far: number
  farLit: number
  farWindow: number
  /** The machinery in the middle distance. */
  gear: number
  gearLit: number
  gearDark: number
  pipe: number
  pipeLit: number
  pipeDark: number
  banner: number
  bannerLit: number
  bannerText: number
  /** The near steelwork. */
  steel: number
  steelLit: number
  /** The hanging lamp. The bulb is the one light in the backdrop. */
  lampShade: number
  lampBulb: number
  lampGlow: number
  /** Stone: the joint round a block, its face, and its lit and shadowed edges. */
  joint: number
  stone: number
  stoneLight: number
  stoneDark: number
  /** The moss and grass on anything open above. */
  moss: number
  mossLight: number
  mossDark: number
  /** Hazards. */
  edge: number
  spike: number
  spikeLit: number
  spikeDark: number
  lava: number
  lavaLit: number
  lavaHot: number
  lavaDark: number
  /** Belts. */
  belt: number
  beltLit: number
  beltDark: number
  arrow: number
  arrowDark: number
  /** Springs. */
  springBase: number
  coil: number
  coilDark: number
  pad: number
  padLit: number
  /** Moving platforms. */
  plate: number
  plateLit: number
  plateDark: number
  stripe: number
  /** Arc emitters. */
  pylon: number
  pylonLit: number
  copper: number
}

/**
 * The colour screen. The order the test holds: nothing behind is as bright
 * as a stone's face, and every hazard carries something brighter than
 * anything that is not one.
 */
export const GBC: FactoryPalette = {
  void: 0x0c1a1a,
  far: 0x15362d, farLit: 0x1d4838, farWindow: 0x3a6a3a,
  gear: 0x2e663c, gearLit: 0x3e8046, gearDark: 0x1a3e26,
  pipe: 0x2c6440, pipeLit: 0x3e7e4a, pipeDark: 0x183a26,
  banner: 0x34464c, bannerLit: 0x485c62, bannerText: 0x1a262a,
  steel: 0x1a2638, steelLit: 0x2c3e56,
  lampShade: 0x2a3a34, lampBulb: 0xe0f078, lampGlow: 0x3e5a30,
  joint: 0x0a120e, stone: 0x667666, stoneLight: 0x86967e, stoneDark: 0x3e4a42,
  moss: 0x5aa836, mossLight: 0x9cd858, mossDark: 0x2e6a26,
  edge: 0x080a0c,
  spike: 0xb8c4cc, spikeLit: 0xf0f6f8, spikeDark: 0x5c6874,
  lava: 0xd8481c, lavaLit: 0xf89020, lavaHot: 0xf8e450, lavaDark: 0x7a1c10,
  belt: 0x2a3038, beltLit: 0x4a545e, beltDark: 0x14181c, arrow: 0xf8c838, arrowDark: 0xa8701a,
  springBase: 0x4a5058, coil: 0xc8ccd0, coilDark: 0x6a7078, pad: 0xd83a2a, padLit: 0xf8806a,
  plate: 0x5a646e, plateLit: 0x9aa6b0, plateDark: 0x2e343a, stripe: 0xf8c838,
  pylon: 0x4a4038, pylonLit: 0x8a7a68, copper: 0xe08c3a,
}

/**
 * The green screen. Four tones, so the rule is about which tones a thing may
 * use: the backdrop is drawn in the two dark ones, as a line drawing in
 * `dark` on `darkest`, and the platforms are the two light ones over a dark
 * joint. #52 shipped a backdrop in the platform's tone; this cannot.
 */
export const DMG: FactoryPalette = {
  // Not one of the four tones, and it never was: Windup's camera has been
  // this near-black in both modes since the start. Every sprite in the game
  // is edged in `darkest`, and on a `darkest` sky those edges vanish;
  // `qa:contrast` failed eleven of fourteen when it was tried. So the room is
  // a shade under the green screen's darkest, and the backdrop's masses in
  // `darkest` show on it as the far wall should, barely.
  void: 0x0b0f0c,
  far: PAL.darkest, farLit: PAL.dark, farWindow: PAL.dark,
  gear: PAL.darkest, gearLit: PAL.dark, gearDark: PAL.darkest,
  pipe: PAL.darkest, pipeLit: PAL.dark, pipeDark: PAL.darkest,
  banner: PAL.darkest, bannerLit: PAL.dark, bannerText: PAL.dark,
  steel: PAL.darkest, steelLit: PAL.dark,
  lampShade: PAL.dark, lampBulb: PAL.dark, lampGlow: PAL.darkest,
  joint: PAL.darkest, stone: PAL.light, stoneLight: PAL.lightest, stoneDark: PAL.dark,
  moss: PAL.lightest, mossLight: PAL.lightest, mossDark: PAL.dark,
  edge: PAL.darkest,
  spike: PAL.lightest, spikeLit: PAL.lightest, spikeDark: PAL.light,
  lava: PAL.dark, lavaLit: PAL.light, lavaHot: PAL.lightest, lavaDark: PAL.darkest,
  belt: PAL.dark, beltLit: PAL.light, beltDark: PAL.darkest, arrow: PAL.lightest, arrowDark: PAL.light,
  springBase: PAL.dark, coil: PAL.light, coilDark: PAL.dark, pad: PAL.lightest, padLit: PAL.lightest,
  plate: PAL.dark, plateLit: PAL.light, plateDark: PAL.darkest, stripe: PAL.lightest,
  pylon: PAL.dark, pylonLit: PAL.light, copper: PAL.lightest,
}

export const PALETTES = { gbc: GBC, dmg: DMG } as const
export type Mode = keyof typeof PALETTES

// --- stone ---------------------------------------------------------------------

/** Which neighbours of a block are also stone. */
export const UP = 1
export const RIGHT = 2
export const DOWN = 4
export const LEFT = 8

/** Two looks for a block, so a run of them is not one stamp repeated. */
export const STONE_VARIANTS = 2

/** The frame for a block from its neighbours and its place. */
export const stoneFrame = (mask: number, cx: number, cy: number) => mask * STONE_VARIANTS + (hash(cx, cy) % STONE_VARIANTS)

/** How deep the moss cap is, and how far its drips reach. */
export const CAP = 6

/**
 * A block of mossy stone.
 *
 * Each block is a stone of its own with a dark joint round it, as on the card.
 * What the neighbours decide is the moss: a cap where nothing is above, run
 * edge to edge where the next block along has one too, so a ledge reads as
 * one grassy top; moss hanging down a side that is open; and a darker lip
 * along a bottom that is open.
 */
export function stone(mask: number, variant: number, pal: FactoryPalette, capEdge = true): Picture {
  const p = picture(T, T)
  rect(p, 0, 0, T, T, pal.joint)
  rect(p, 1, 1, T - 2, T - 2, pal.stone)
  rect(p, 1, 1, T - 2, 1, pal.stoneLight)
  rect(p, 1, 1, 1, T - 2, pal.stoneLight)
  rect(p, T - 2, 2, 1, T - 3, pal.stoneDark)
  rect(p, 2, T - 2, T - 3, 1, pal.stoneDark)

  // A crack and a fleck or two, so the stone is stone and not a panel.
  const crack = variant === 0
    ? [[5, 9], [6, 10], [7, 10], [8, 11], [9, 12], [9, 13], [10, 14]]
    : [[17, 10], [16, 11], [15, 12], [15, 13], [14, 14], [13, 15], [18, 9]]
  for (const [x, y] of crack) set(p, x, y, pal.stoneDark)
  for (const [x, y] of variant === 0 ? [[16, 15], [12, 18]] : [[6, 16], [9, 8]]) set(p, x, y, pal.stoneLight)

  if (!(mask & DOWN)) rect(p, 1, T - 3, T - 2, 2, pal.stoneDark)

  if (!(mask & UP)) {
    // Where the cap ends, it ends a pixel in, with a rounded shoulder; where
    // the next block has one too, it runs to the edge to meet it.
    const x0 = capEdge && mask & LEFT ? 0 : 1
    const x1 = capEdge && mask & RIGHT ? T - 1 : T - 2
    for (let x = x0; x <= x1; x++) {
      set(p, x, 0, -1)
      rect(p, x, 1, 1, 1, pal.mossLight)
      rect(p, x, 2, 1, CAP - 3, pal.moss)
      set(p, x, CAP - 1, pal.mossDark)
      // Tufts above and drips below, scattered by column and by variant, so
      // a ledge of blocks is not one stamp repeated.
      const h = hash(x + variant * 31, 7)
      if (h % 5 === 0) set(p, x, 0, pal.mossLight)
      if (h % 7 === 0) {
        set(p, x, CAP - 1, pal.moss)
        set(p, x, CAP, pal.moss)
        set(p, x, CAP + 1, pal.mossDark)
      }
    }
    // The shadow the cap throws on the face.
    for (let x = Math.max(x0, 2); x <= Math.min(x1, T - 3); x++) {
      if (get(p, x, CAP) === pal.stone || get(p, x, CAP) === pal.stoneLight) set(p, x, CAP, pal.stoneDark)
    }
    if (!(mask & LEFT)) {
      set(p, 0, 1, -1)
      set(p, 1, 1, pal.joint)
      rect(p, 1, CAP, 1, 5, pal.moss)
      set(p, 1, CAP + 5, pal.mossDark)
    }
    if (!(mask & RIGHT)) {
      set(p, T - 1, 1, -1)
      set(p, T - 2, 1, pal.joint)
      rect(p, T - 2, CAP, 1, 3, pal.moss)
      set(p, T - 2, CAP + 3, pal.mossDark)
    }
  }
  return p
}

/** Every block, in frame order: sixteen masks, each in every variant. */
export function stoneSheet(pal: FactoryPalette): Picture[] {
  const out: Picture[] = []
  for (let mask = 0; mask < 16; mask++) for (let v = 0; v < STONE_VARIANTS; v++) out.push(stone(mask, v, pal))
  return out
}

// --- hazards -------------------------------------------------------------------

/**
 * Steel spikes on a plate.
 *
 * The body is still the old one, set from the 16-unit tile (#54), so the
 * points stand where they stood: the plate is the bottom quarter and the
 * points rise to the top third.
 */
export function spikes(pal: FactoryPalette): Picture {
  const p = picture(T, T)
  rect(p, 1, T - 5, T - 2, 4, pal.spikeDark)
  rect(p, 1, T - 5, T - 2, 1, pal.spike)
  for (let i = 0; i < 4; i++) {
    const cx = 3 + i * 6
    for (let y = 8; y < T - 5; y++) {
      const half = Math.floor(((y - 8) / (T - 13)) * 2.6)
      for (let x = cx - half; x <= cx + half + 1; x++) set(p, x, y, x <= cx ? pal.spikeLit : pal.spike)
      set(p, cx + half + 1, y, pal.spikeDark)
    }
    set(p, cx, 7, pal.spikeLit)
  }
  outline(p, pal.edge)
  return p
}

/** Frames of lava, the surface rolling. One period of the wave is one tile, so tiles join. */
export const LAVA_FRAMES = 4

/**
 * A pool of lava. A surface and not a block (#54): the top is a wave, and the
 * body glows with bubbles, so nobody takes it for somewhere to stand.
 */
export function lava(frame: number, pal: FactoryPalette): Picture {
  const p = picture(T, T)
  const phase = (frame / LAVA_FRAMES) * Math.PI * 2
  for (let x = 0; x < T; x++) {
    const top = 5 + Math.round(Math.sin((x / T) * Math.PI * 2 + phase) * 1.4)
    set(p, x, top, pal.lavaHot)
    rect(p, x, top + 1, 1, 2, pal.lavaLit)
    rect(p, x, top + 3, 1, T - top - 3, pal.lava)
    // The heat is at the top; it darkens toward the bottom of the pit.
    for (let y = top + 3; y < T; y++) {
      if (y > 16 && hash(x, y) % 3 === 0) set(p, x, y, pal.lavaDark)
    }
  }
  // Bubbles rise a pixel a frame.
  for (const [bx, by] of [[5, 18], [15, 21], [19, 13]]) {
    const y = by - ((frame * 2) % 8)
    if (y > 9) {
      set(p, bx, y, pal.lavaHot)
      set(p, bx + 1, y, pal.lavaLit)
    }
  }
  return p
}

/**
 * An arc emitter: a porcelain insulator wound with copper. It is drawn at
 * every point a bolt runs between, so the hazard has a source before it
 * fires; until #167 the bolt came out of empty air.
 */
export function pylon(pal: FactoryPalette): Picture {
  const s = 16
  const p = picture(s, s)
  for (let y = 2; y < s - 2; y++) {
    const w = y < 4 || y > s - 5 ? 6 : 8
    rect(p, (s - w) / 2, y, w, 1, pal.pylon)
  }
  rect(p, 5, 2, 2, s - 4, pal.pylonLit)
  for (const y of [5, 8, 11]) rect(p, 3, y, 10, 1, pal.copper)
  outline(p, pal.edge)
  return p
}

// --- machines ------------------------------------------------------------------

/** Frames to a belt: two phases for each of the two directions. */
export const BELT_FRAMES = 4

/**
 * A belt block: solid, with a bright arrow on its face pointing the way it
 * carries, and a tread along the top that moves that way between frames.
 * Frames 0 and 1 run right, 2 and 3 run left.
 */
export function belt(frame: number, pal: FactoryPalette): Picture {
  const dir = frame < 2 ? 1 : -1
  const phase = frame % 2
  const p = picture(T, T)
  rect(p, 0, 0, T, T, pal.beltDark)
  rect(p, 1, 1, T - 2, T - 2, pal.belt)
  // Tread: a lit strip with dark teeth that step along with the belt.
  rect(p, 1, 1, T - 2, 3, pal.beltLit)
  for (let x = 1; x < T - 1; x++) if ((x - dir * phase * 3 + 60) % 6 === 0) rect(p, x, 1, 1, 3, pal.beltDark)
  // The panel the arrow sits in.
  rect(p, 4, 7, T - 8, 13, pal.beltDark)
  // The arrow: a solid point, its flat back away from the way it runs and
  // its tip toward it, lit above the middle and shaded below.
  const shift = dir * phase * 2
  const mid = 13
  for (let k = 0; k <= 5; k++) {
    const len = 6 - k
    for (let i = 0; i < len; i++) {
      const x = dir > 0 ? 8 + shift + i : T - 9 + shift - i
      set(p, x, mid - k, pal.arrow)
      set(p, x, mid + k, k === 0 ? pal.arrow : pal.arrowDark)
    }
  }
  return p
}

/** A spring set into the floor: a plate, a coil and a red pad on top. */
export function spring(pal: FactoryPalette): Picture {
  const p = picture(T, T)
  rect(p, 2, T - 4, T - 4, 3, pal.springBase)
  for (let y = 12; y < T - 4; y++) {
    const w = (y - 12) % 3 === 1 ? 12 : 10
    rect(p, (T - w) / 2, y, w, 1, (y - 12) % 3 === 2 ? pal.coilDark : pal.coil)
  }
  rect(p, 4, 9, T - 8, 3, pal.pad)
  rect(p, 5, 9, T - 10, 1, pal.padLit)
  outline(p, pal.edge)
  return p
}

/**
 * A moving platform: a riveted steel plate with striped ends. It fills the
 * top half of the tile, where the old one was drawn, because the body is
 * still the whole tile and the toy stands on its top.
 */
export function mover(pal: FactoryPalette): Picture {
  const p = picture(T, T)
  const h = 12
  rect(p, 0, 0, T, h, pal.edge)
  rect(p, 1, 1, T - 2, h - 2, pal.plate)
  rect(p, 1, 1, T - 2, 2, pal.plateLit)
  rect(p, 1, h - 3, T - 2, 2, pal.plateDark)
  for (const x0 of [1, T - 6]) {
    for (let y = 3; y < h - 3; y++) for (let x = x0; x < x0 + 5; x++) if ((x + y) % 4 < 2) set(p, x, y, pal.stripe)
  }
  for (const x of [8, 15]) set(p, x, 5, pal.plateLit)
  return p
}

// --- the hall behind ------------------------------------------------------------

/** The screen, in drawn pixels. */
export const SCREEN_W = 240
export const SCREEN_H = 216

/**
 * How far past each edge a backdrop layer is drawn. The layers slide against
 * the toy (#52) by up to `nearShiftPx` world units each way, which is 5.25
 * drawn pixels; this leaves room for that.
 */
export const BLEED = 12
export const LAYER_W = SCREEN_W + BLEED * 2
export const LAYER_H = SCREEN_H + BLEED * 2

/**
 * The far wall: a skyline of sheds, tanks and chimneys along the bottom, with
 * a few lit windows. Drawn in the darkest two of the backdrop's colours.
 */
export function farLayer(pal: FactoryPalette): Picture {
  const p = picture(LAYER_W, LAYER_H)
  const ground = LAYER_H
  // Sheds with sawtooth roofs, a tank, chimneys: left to right.
  const sheds: [number, number, number][] = [
    [0, 70, 120], [64, 58, 92], [150, 54, 128], [200, 64, 100],
  ]
  for (const [x, w, top] of sheds) {
    rect(p, x, top, w, ground - top, pal.far)
    for (let i = 0; i < w; i++) {
      const tooth = (i % 14) < 10 ? Math.floor((i % 14) / 2.5) : 0
      for (let y = top - tooth; y < top; y++) set(p, x + i, y, pal.far)
      if ((i % 14) < 10) set(p, x + i, top - tooth - 1, pal.farLit)
    }
    // A row of high windows, a few of them lit: a wall of them was noise.
    for (let wx = x + 6; wx < x + w - 6; wx += 12) {
      if (hash(wx, top) % 3 === 0) rect(p, wx, top + 10, 4, 6, pal.farWindow)
    }
  }
  // A round tank on legs.
  const tx = 128, ty = 116, tr = 18
  for (let y = -tr; y <= tr; y++) for (let x = -tr; x <= tr; x++) {
    const d = x * x + y * y
    if (d <= tr * tr) set(p, tx + x, ty + y, d >= (tr - 1) * (tr - 1) && y < 0 ? pal.farLit : pal.far)
  }
  for (const lx of [tx - 12, tx + 11]) rect(p, lx, ty + tr - 2, 2, ground - ty - tr + 2, pal.far)
  // Two chimneys.
  for (const [cx, top] of [[40, 60], [222, 44]]) {
    rect(p, cx, top, 8, ground - top, pal.far)
    rect(p, cx - 1, top, 10, 3, pal.farLit)
  }
  return p
}

/** A five-by-seven face for the six letters of the banner. */
const GLYPHS: Record<string, string[]> = {
  W: ['X...X', 'X...X', 'X...X', 'X.X.X', 'X.X.X', 'XX.XX', 'X...X'],
  I: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
  N: ['X...X', 'XX..X', 'X.X.X', 'X.X.X', 'X..XX', 'X...X', 'X...X'],
  D: ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  P: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
}

/** Where the middle layer's pieces are, in drawn pixels on the layer. */
export const MID = {
  banner: { x: 128, y: 62, w: 76, h: 24 },
  lamp: { x: 120 + BLEED, y: 0 },
  /** The gears' centres, on the screen and so in the layer less the bleed. */
  bigGear: { x: 45, y: 51 },
  smallGear: { x: 86, y: 32 },
} as const

/**
 * The middle distance: pipes with elbows and flanges, the WINDUP banner
 * hanging on two chains, and the lamp over the middle of the room. The gears
 * are separate pictures, because they turn.
 */
export function midLayer(pal: FactoryPalette): Picture {
  const p = picture(LAYER_W, LAYER_H)
  const pipeH = (x0: number, x1: number, y: number, r = 5) => {
    rect(p, x0, y - r, x1 - x0, r * 2, pal.pipe)
    rect(p, x0, y - r + 1, x1 - x0, 2, pal.pipeLit)
    rect(p, x0, y + r - 2, x1 - x0, 2, pal.pipeDark)
    for (let x = x0 + 10; x < x1 - 4; x += 22) {
      rect(p, x, y - r - 1, 3, r * 2 + 2, pal.pipeDark)
      rect(p, x, y - r - 1, 1, r * 2 + 2, pal.pipeLit)
    }
  }
  const pipeV = (x: number, y0: number, y1: number, r = 5) => {
    rect(p, x - r, y0, r * 2, y1 - y0, pal.pipe)
    rect(p, x - r + 1, y0, 2, y1 - y0, pal.pipeLit)
    rect(p, x + r - 2, y0, 2, y1 - y0, pal.pipeDark)
    for (let y = y0 + 12; y < y1 - 4; y += 26) {
      rect(p, x - r - 1, y, r * 2 + 2, 3, pal.pipeDark)
      rect(p, x - r - 1, y, r * 2 + 2, 1, pal.pipeLit)
    }
  }
  const elbow = (cx: number, cy: number, r = 5) => rect(p, cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2, pal.pipe)

  // A run along the top left that turns down, as on the card; and one low
  // across the back that rises at the right.
  pipeH(0, 124, 30)
  elbow(124, 30)
  pipeV(124, 30, 58)
  pipeH(150, LAYER_W, 150, 6)
  elbow(150, 150, 6)
  pipeV(150, 104, 150, 6)

  // The banner: a board on two chains from the roof.
  const b = MID.banner
  for (const cx of [b.x + 8, b.x + b.w - 9]) for (let y = 0; y < b.y; y += 2) set(p, cx, y, pal.bannerLit)
  rect(p, b.x, b.y, b.w, b.h, pal.bannerText)
  rect(p, b.x + 1, b.y + 1, b.w - 2, b.h - 2, pal.banner)
  rect(p, b.x + 1, b.y + 1, b.w - 2, 1, pal.bannerLit)
  let lx = b.x + 6
  for (const ch of 'WINDUP') {
    GLYPHS[ch].forEach((row, gy) => {
      for (let gx = 0; gx < 5; gx++) if (row[gx] === 'X') rect(p, lx + gx * 2, b.y + 5 + gy * 2, 2, 2, pal.bannerText)
    })
    lx += 11
  }

  // The lamp: a cord, a shade, and a bulb that glows.
  const l = MID.lamp
  // Long enough that the bulb hangs below the HUD's top line, where the run
  // clock is; at first it hung behind the clock's digits.
  const cord = 54
  rect(p, l.x, l.y, 1, cord, pal.lampShade)
  for (let y = 0; y < 7; y++) rect(p, l.x - 2 - y, l.y + cord + y, 5 + y * 2, 1, pal.lampShade)
  if (pal.lampGlow !== pal.void) {
    for (let y = 0; y < 6; y++) rect(p, l.x - 6 - y, l.y + cord + 7 + y, 13 + y * 2, 1, pal.lampGlow)
  }
  rect(p, l.x - 2, l.y + cord + 7, 5, 3, pal.lampBulb)
  return p
}

/**
 * The near steelwork: two lattice towers and a truss, and the pipes at the
 * edges that the steam comes out of (#53).
 */
export function nearLayer(pal: FactoryPalette): Picture {
  const p = picture(LAYER_W, LAYER_H)
  const tower = (x: number, top: number, w = 18) => {
    rect(p, x, top, 3, LAYER_H - top, pal.steelLit)
    rect(p, x + w - 3, top, 3, LAYER_H - top, pal.steel)
    for (let y = top; y < LAYER_H; y += w) {
      rect(p, x, y, w, 2, pal.steel)
      for (let i = 0; i < w; i++) {
        set(p, x + i, y + i, pal.steel)
        set(p, x + w - 1 - i, y + i, pal.steel)
      }
    }
  }
  tower(66, 92)
  tower(190, 40)
  // A truss from the right tower to the wall.
  const ty = 96
  rect(p, 190, ty, LAYER_W - 190, 2, pal.steelLit)
  rect(p, 190, ty + 10, LAYER_W - 190, 2, pal.steel)
  for (let x = 190; x < LAYER_W; x += 10) for (let i = 0; i < 10; i++) set(p, x + i, ty + 1 + i, pal.steel)

  // The pipes the vents are on, at world x 9 and 151: 13.5 and 226.5 drawn.
  for (const cx of [Math.round(9 * 1.5) + BLEED, Math.round(151 * 1.5) + BLEED]) {
    rect(p, cx - 4, 0, 9, LAYER_H, pal.pipe)
    rect(p, cx - 3, 0, 2, LAYER_H, pal.pipeLit)
    rect(p, cx + 3, 0, 2, LAYER_H, pal.pipeDark)
    for (let y = 18; y < LAYER_H; y += 24) {
      rect(p, cx - 5, y, 11, 3, pal.pipeDark)
      rect(p, cx - 5, y, 11, 1, pal.pipeLit)
    }
  }
  return p
}

// --- gears ---------------------------------------------------------------------

export interface GearSpec {
  /** Radius to the tips of the teeth, and to their roots. */
  tip: number
  root: number
  teeth: number
  /** Round holes in the web; the gear's symmetry is the smaller of these and the teeth. */
  holes: number
}

export const BIG_GEAR: GearSpec = { tip: 30, root: 25, teeth: 12, holes: 6 }
export const SMALL_GEAR: GearSpec = { tip: 16, root: 12, teeth: 6, holes: 3 }

/** Degrees between two frames of a turning gear, whatever its size. */
export const GEAR_STEP = 5

/**
 * How far a gear turns before it looks the same again: the angle that is a
 * whole number of tooth pitches and a whole number of hole pitches.
 */
export const gearSymmetry = (g: GearSpec) => {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  return 360 / gcd(g.teeth, g.holes)
}

/** Frames in one loop of a gear's turn, `GEAR_STEP` degrees apart. */
export const gearFrames = (g: GearSpec, symmetry = gearSymmetry(g)) => Math.round(symmetry / GEAR_STEP)

/**
 * A gear turned by `angle` degrees, drawn pixel by pixel from its shape,
 * so each frame is crisp. Turning a sprite of one gear smears it at this size.
 */
export function gear(g: GearSpec, angle: number, pal: FactoryPalette): Picture {
  const size = g.tip * 2 + 1
  const p = picture(size, size)
  const c = g.tip
  const rot = (angle * Math.PI) / 180
  const pitch = (Math.PI * 2) / g.teeth
  const holeR = (g.root - 4) * 0.62
  const holeRadius = Math.max(2, Math.round(g.root * 0.18))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c, dy = y - c
      const r = Math.hypot(dx, dy)
      const a = Math.atan2(dy, dx) - rot
      const t = (((a / pitch) % 1) + 1) % 1
      const inTooth = t > 0.18 && t < 0.62
      if (r > g.tip + 0.5 || (r > g.root && !inTooth)) continue
      let colour = pal.gear
      // Lit on the upper left, shaded on the lower right, by where the pixel is, not by the turn.
      if (r > g.root - 2.5) colour = dx + dy < 0 ? pal.gearLit : pal.gearDark
      for (let h = 0; h < g.holes; h++) {
        const ha = rot + (h / g.holes) * Math.PI * 2
        if (Math.hypot(dx - Math.cos(ha) * holeR, dy - Math.sin(ha) * holeR) < holeRadius) colour = -1
      }
      if (r < 4.5) colour = r < 2 ? pal.gearDark : pal.gearLit
      if (colour !== -1) set(p, x, y, colour)
    }
  }
  return p
}
