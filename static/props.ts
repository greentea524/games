// The things standing in the village and its rooms, drawn at 24 pixels (#178).
//
// A lamp post, a sign, a barrel, a fence, a hedge, flowers, the fountain, the
// cellar hatch, and indoors a bed, a rug, a bookshelf and a plant. They were
// 16-pixel drawings enlarged by half, in tones chosen before the village had
// a palette; these use the village's own, so a barrel's wood is a door's wood
// and a fountain's stone is a cottage's footing.
//
// Each is drawn on a clear ground through the same `Painter` the tiles use.
// No Phaser here, so `props_test.ts` can check every one.
import { TILE_PX, disc, type Painter, type VillagePalette } from './tiles'

export interface Prop {
  /** Size in tiles. The picture is that many times `TILE_PX`. */
  w: number
  h: number
  draw: (p: Painter, pal: VillagePalette) => void
}

const T = TILE_PX
const ALL: [number, number, number, number] = [0, 0, 1000, 1000]

/** A rectangle with a one-pixel outline round it. */
const box = (p: Painter, pal: VillagePalette, x: number, y: number, w: number, h: number, fill: number) => {
  p(x, y, w, h, pal.ink)
  p(x + 1, y + 1, w - 2, h - 2, fill)
}

function fountain(p: Painter, pal: VillagePalette, full: boolean) {
  const c = T
  disc(p, c, c, 22, pal.ink, ALL)
  disc(p, c, c, 21, pal.stone, ALL)
  // The coping: a paler top to the wall, lit from the upper left.
  disc(p, c - 1, c - 1, 19, pal.plaster, ALL)
  disc(p, c, c, 18, pal.stone, ALL)
  disc(p, c, c, 16, pal.stoneDark, ALL)
  if (full) {
    disc(p, c, c, 15, pal.water, ALL)
    for (const [x, y, w] of [[14, 17, 8], [27, 21, 7], [16, 30, 9], [29, 32, 5]]) {
      p(x, y, w, 1, pal.waterLight)
      p(x + 1, y + 1, w - 2, 1, pal.waterDeep)
    }
  } else {
    // Drained: the basin's floor, cracked, and the drain at its foot.
    disc(p, c, c, 15, pal.plasterShade, ALL)
    for (const [x, y, w, h] of [[14, 18, 9, 1], [22, 19, 1, 6], [26, 29, 8, 1], [30, 24, 1, 5], [15, 30, 5, 1]]) {
      p(x, y, w, h, pal.stoneDark)
    }
    box(p, pal, 20, 32, 8, 5, pal.stoneDark)
  }
  // The spout in the middle.
  disc(p, c, c, 5, pal.ink, ALL)
  disc(p, c, c, 4, pal.stone, ALL)
  disc(p, c - 1, c - 1, 2, full ? pal.waterLight : pal.plaster, ALL)
}

export const PROPS: Record<string, Prop> = {
  prop_lamp: {
    w: 1, h: 1,
    draw: (p, pal) => {
      // A wrought-iron post with a lit lantern.
      p(7, 20, 10, 3, pal.ink)
      p(8, 21, 8, 1, pal.stone)
      p(10, 8, 4, 13, pal.ink)
      p(11, 9, 2, 12, pal.stoneDark)
      box(p, pal, 7, 2, 10, 8, pal.knob)
      p(11, 3, 2, 6, pal.plaster)
      p(6, 1, 12, 2, pal.ink)
      p(10, 0, 4, 1, pal.ink)
    },
  },
  prop_sign: {
    w: 1, h: 1,
    draw: (p, pal) => {
      // A board on a post. Not in the lamp's warm tone: a sign that glows
      // looks like something to collect.
      p(10, 13, 4, 10, pal.ink)
      p(11, 13, 2, 9, pal.trunk)
      box(p, pal, 2, 3, 20, 11, pal.plaster)
      p(3, 4, 18, 1, pal.plasterShade)
      p(5, 6, 12, 2, pal.timber)
      p(5, 10, 9, 2, pal.timber)
    },
  },
  prop_barrel: {
    w: 1, h: 1,
    draw: (p, pal) => {
      // Staves bulging at the waist, and two iron hoops.
      p(6, 3, 12, 19, pal.ink)
      p(5, 7, 14, 11, pal.ink)
      p(7, 4, 10, 17, pal.door)
      p(6, 8, 12, 9, pal.door)
      p(9, 4, 1, 17, pal.doorDark)
      p(14, 4, 1, 17, pal.doorDark)
      p(7, 5, 2, 15, pal.floorLight)
      p(6, 7, 12, 2, pal.stoneDark)
      p(6, 16, 12, 2, pal.stoneDark)
      p(7, 4, 10, 1, pal.floorLight)
    },
  },
  prop_fence: {
    w: 1, h: 1,
    draw: (p, pal) => {
      // Two rails the width of the tile, so a run of them joins, on two posts.
      for (const y of [8, 15]) {
        p(0, y, T, 4, pal.ink)
        p(0, y + 1, T, 2, pal.door)
      }
      for (const x of [3, 16]) {
        p(x, 4, 5, 18, pal.ink)
        p(x + 1, 5, 3, 16, pal.door)
        p(x + 1, 5, 1, 16, pal.floorLight)
        p(x + 1, 3, 3, 1, pal.ink)
        p(x + 2, 2, 1, 1, pal.ink)
      }
    },
  },
  prop_bush: {
    w: 1, h: 1,
    draw: (p, pal) => {
      const clip: [number, number, number, number] = [0, 0, T, T]
      disc(p, 12, 20, 3, pal.grassDark, clip)
      p(4, 20, 16, 2, pal.grassDark)
      disc(p, 12, 12, 10, pal.ink, clip)
      disc(p, 12, 12, 9, pal.canopyDark, clip)
      disc(p, 11, 11, 7, pal.canopy, clip)
      disc(p, 9, 9, 4, pal.canopyLight, clip)
      // Berries.
      for (const [x, y] of [[15, 9], [8, 15], [16, 15]]) p(x, y, 2, 2, pal.flower2)
    },
  },
  prop_flower: {
    w: 1, h: 1,
    draw: (p, pal) => {
      // Three blooms on their stems. No ground under them: they are laid on
      // whatever is there.
      for (const [x, y, petal] of [[6, 7, pal.flower2], [15, 5, pal.flower], [11, 13, pal.flower2]]) {
        p(x + 1, y + 3, 1, 6, pal.canopyDark)
        p(x - 1, y + 5, 2, 1, pal.canopy)
        p(x - 1, y, 4, 4, pal.ink)
        p(x, y - 1, 2, 6, pal.ink)
        p(x, y, 2, 4, petal)
        p(x - 1, y + 1, 4, 2, petal)
        p(x, y + 1, 2, 2, pal.flowerCore)
      }
    },
  },
  prop_plant: {
    w: 1, h: 1,
    draw: (p, pal) => {
      const clip: [number, number, number, number] = [0, 0, T, T]
      box(p, pal, 7, 14, 10, 9, pal.door)
      p(6, 13, 12, 3, pal.ink)
      p(7, 14, 10, 1, pal.floorLight)
      disc(p, 12, 8, 8, pal.ink, clip)
      disc(p, 12, 8, 7, pal.canopyDark, clip)
      disc(p, 10, 7, 4, pal.canopy, clip)
      disc(p, 15, 5, 3, pal.canopy, clip)
      disc(p, 9, 5, 2, pal.canopyLight, clip)
    },
  },
  hatch: {
    w: 1, h: 1,
    draw: (p, pal) => {
      // A trapdoor set in the ground, with a ring to lift it by.
      box(p, pal, 2, 3, 20, 18, pal.timber)
      p(4, 5, 16, 14, pal.door)
      for (const x of [9, 14]) p(x, 5, 1, 14, pal.doorDark)
      p(4, 9, 16, 1, pal.doorDark)
      p(4, 15, 16, 1, pal.doorDark)
      box(p, pal, 10, 10, 5, 5, pal.knob)
      p(12, 12, 1, 1, pal.doorDark)
    },
  },
  fountain_full: { w: 2, h: 2, draw: (p, pal) => fountain(p, pal, true) },
  fountain_drained: { w: 2, h: 2, draw: (p, pal) => fountain(p, pal, false) },
  prop_bed: {
    w: 2, h: 2,
    draw: (p, pal) => {
      // A wooden frame, a pillow at the head and a blanket turned down.
      box(p, pal, 3, 2, 42, 44, pal.timber)
      p(5, 4, 38, 40, pal.flower)
      box(p, pal, 9, 6, 30, 10, pal.plaster)
      p(10, 7, 28, 1, pal.flower)
      p(5, 20, 38, 24, pal.roof)
      p(5, 20, 38, 3, pal.roofLight)
      p(5, 23, 38, 1, pal.roofDark)
      for (const x of [14, 24, 34]) p(x, 26, 1, 16, pal.roofDark)
      p(5, 43, 38, 1, pal.roofDark)
    },
  },
  prop_rug: {
    w: 2, h: 2,
    draw: (p, pal) => {
      // A woven rug with a border and a row of diamonds. Flat on the floor,
      // so it has no outline to stand it up.
      p(1, 3, 46, 42, pal.roofDark)
      p(3, 5, 42, 38, pal.roof)
      p(5, 7, 38, 34, pal.roofDark)
      p(6, 8, 36, 32, pal.roof)
      for (const cx of [14, 24, 34]) {
        for (let i = 0; i < 5; i++) {
          p(cx - i, 19 + i, 2 * i + 1, 1, pal.roofLight)
          p(cx - i, 29 - i, 2 * i + 1, 1, pal.roofLight)
        }
        p(cx, 24, 1, 1, pal.roofDark)
      }
      // The fringe at each end.
      for (let x = 2; x < 46; x += 3) {
        p(x, 1, 1, 2, pal.plaster)
        p(x, 45, 1, 2, pal.plaster)
      }
    },
  },
  prop_bookshelf: {
    w: 1, h: 2,
    draw: (p, pal) => {
      box(p, pal, 1, 1, 22, 46, pal.timber)
      const spines = [pal.roof, pal.glass, pal.canopy, pal.knob, pal.roofDark, pal.plaster]
      ;[4, 18, 32].forEach((y, shelf) => {
        p(3, y, 18, 12, pal.doorDark)
        // Books of different heights, leaning on each other.
        let x = 4
        for (let i = 0; x < 19; i++) {
          const w = 2 + ((i + shelf) % 2)
          const h = 8 + ((i * 3 + shelf * 2) % 4)
          p(x, y + 12 - h, w, h, spines[(i + shelf * 2) % spines.length])
          x += w + 1
        }
        p(2, y + 12, 20, 2, pal.door)
      })
    },
  },
}

/** A prop's texture key: `prop_lamp_gbc`. */
export const propKey = (name: string, mode: 'dmg' | 'gbc'): string => `${name}_${mode}`
