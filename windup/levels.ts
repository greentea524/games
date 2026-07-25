import { TILE } from './constants'

export interface LevelData {
  spawn: { x: number; y: number }
  goal: { x: number; y: number }
  platforms: { x: number; y: number }[]
  springs: { x: number; y: number }[]
  movingPlatforms: { x: number; y: number; dx: number; dy: number; duration: number }[]
  pickups: { x: number; y: number }[]
  stations: { x: number; y: number }[]
}

const parseGrid = (
  layout: string[],
  config: { [key: string]: 'platform' | 'spring' | 'pickup' | 'station' | 'spawn' | 'goal' | 'moving' },
  movingConfig?: Record<string, { dx: number; dy: number; duration: number }>
): LevelData => {
  const data: LevelData = {
    spawn: { x: 32, y: 32 },
    goal: { x: 32, y: 32 },
    platforms: [],
    springs: [],
    movingPlatforms: [],
    pickups: [],
    stations: [],
  }

  layout.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const char = row[rx]
      const type = config[char]
      const px = rx * TILE + TILE / 2
      const py = ry * TILE + TILE / 2

      if (type === 'platform') data.platforms.push({ x: px, y: py })
      else if (type === 'spring') data.springs.push({ x: px, y: py })
      else if (type === 'pickup') data.pickups.push({ x: px, y: py })
      else if (type === 'station') data.stations.push({ x: px, y: py })
      else if (type === 'spawn') data.spawn = { x: px, y: py }
      else if (type === 'goal') data.goal = { x: px, y: py }
      else if (type === 'moving' && movingConfig && movingConfig[char]) {
        data.movingPlatforms.push({
          x: px,
          y: py,
          ...movingConfig[char]
        })
      }
    }
  })

  return data
}

const legend: Record<string, any> = {
  'X': 'platform',
  'S': 'station',
  'P': 'pickup',
  '@': 'spawn',
  'G': 'goal',
  's': 'spring',
  'M': 'moving'
}

export const LEVELS: Record<number, LevelData> = {
  1: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "....P.S...",
    "..X..XX...",
    ".@......G.",
    "XXX....XXX"
  ], legend),
  2: parseGrid([
    "X.G....@.X",
    "XX......XX",
    "XX..S...XX",
    "XX..XX..XX",
    "XX......XX",
    "XX......XX",
    "XX..M...XX",
    "XX..s...XX",
    "XXXXXXXXXX"
  ], legend, {
    'M': { dx: TILE * 2, dy: 0, duration: 1500 }
  })
,
  3: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    ".....X....",
    "..........",
    "....S.....",
    ".@......G.",
    "XXXXXXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  4: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..X.S.....",
    ".@......G.",
    "XXXXXXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  5: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    ".......X..",
    "..........",
    "....S.....",
    ".@......G.",
    "XXXXXXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  6: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "....X.....",
    "..........",
    "....S.....",
    ".@......G.",
    "XXsXXXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  7: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    ".....X....",
    "....S.....",
    ".@......G.",
    "XXXXXsXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  8: parseGrid([
    "..........",
    "..........",
    "..........",
    "......X...",
    "..........",
    "....X.....",
    "....S.....",
    ".@......G.",
    "XXsXXXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  9: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "..X.......",
    "..X.......",
    "....S.....",
    ".@......G.",
    "XXsXXXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  10: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..XXS.X...",
    ".@......G.",
    "XXXXsXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  11: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    ".......X..",
    "....X..X..",
    "....S.....",
    ".@......G.",
    "XXsXXsXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  12: parseGrid([
    "..........",
    "..........",
    "..........",
    "....X.....",
    ".....X.X..",
    "..X.......",
    "....S.....",
    ".@......G.",
    "XXXXXXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  13: parseGrid([
    "..........",
    "..........",
    "..........",
    "..X.X..X..",
    "..........",
    "..X.......",
    "....S.....",
    ".@......G.",
    "XXXssXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  14: parseGrid([
    "..........",
    "..........",
    "..........",
    "....X.....",
    "......X...",
    "...X..X...",
    "....S.....",
    ".@......G.",
    "XXssXXXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  15: parseGrid([
    "..........",
    "..........",
    "..........",
    "...X.XX...",
    ".....X....",
    "....X.....",
    "....S.....",
    ".@......G.",
    "XXsXXssXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  16: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "......X...",
    "...X.X....",
    "....S.SX..",
    ".@......G.",
    "XXXXXssXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  17: parseGrid([
    "..........",
    "..........",
    "..........",
    "...X...X..",
    "......X...",
    "..X.......",
    "....S.S...",
    ".@......G.",
    "XXXXXsXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  18: parseGrid([
    "..........",
    "..........",
    "..........",
    "....X..X..",
    "...X......",
    "...X...X..",
    "....SXS...",
    ".@......G.",
    "XXXXsXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  19: parseGrid([
    "..........",
    "..........",
    "..........",
    ".....XX...",
    "..X..X....",
    "..........",
    "....S.S...",
    ".@......G.",
    "XXsXXsXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  20: parseGrid([
    "..........",
    "..........",
    "..........",
    "..........",
    "...X.X....",
    "....X.....",
    "...XS.S...",
    ".@......G.",
    "XXsXXXssXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  21: parseGrid([
    "..........",
    "..........",
    "..........",
    "..X.X.X...",
    "...X...X..",
    "..X.......",
    "....S.S...",
    ".@......G.",
    "XXXssXsXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  22: parseGrid([
    "..........",
    "..........",
    "..........",
    "......X...",
    "..XX.X....",
    "....X.....",
    "..X.S.S...",
    ".@......G.",
    "XXsXXXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  23: parseGrid([
    "..........",
    "..........",
    "..........",
    "......X...",
    "......X...",
    "...X...X..",
    "...XS.S...",
    ".@......G.",
    "XXsXsXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  24: parseGrid([
    "..........",
    "..........",
    "..........",
    "..X..XX...",
    "..X.......",
    "....XX....",
    "..X.S.SX..",
    ".@......G.",
    "XXsXXXssXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  25: parseGrid([
    "..........",
    "..........",
    "..........",
    "...X.X.X..",
    "...X.X....",
    "..........",
    "...XS.S...",
    ".@......G.",
    "XXXssXsXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  26: parseGrid([
    "..........",
    "..........",
    "..........",
    ".....XX...",
    "....X..X..",
    ".....X....",
    "..X.S.S...",
    ".@......G.",
    "XXXssssXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  27: parseGrid([
    "..........",
    "..........",
    "..........",
    "..X...X...",
    "...X......",
    "..X.X.XX..",
    "....S.SX..",
    ".@......G.",
    "XXsssXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  28: parseGrid([
    "..........",
    "..........",
    "..........",
    "....XXX...",
    "..X.......",
    "..XX...X..",
    "....SXS...",
    ".@......G.",
    "XXXsXsssXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  29: parseGrid([
    "..........",
    "..........",
    "..........",
    "..X....X..",
    "..X...XX..",
    "..X.......",
    "....SXSX..",
    ".@......G.",
    "XXssXsssXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  30: parseGrid([
    "..........",
    "..........",
    "..........",
    "....XXXX..",
    "..........",
    "..X.X..X..",
    "....SXS...",
    ".@......G.",
    "XXsssXXsXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  31: parseGrid([
    "..........",
    "..........",
    "..........",
    "...X.X.X..",
    "..X.......",
    "...X...X..",
    "...XS.SX..",
    ".@......G.",
    "XXssssXXXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  }),
  32: parseGrid([
    "..........",
    "..........",
    "..........",
    "...XX.....",
    "...X..XX..",
    "....X.....",
    "..XXSXS...",
    ".@......G.",
    "XXXsXsssXX"
  ], legend, {
    'M': { dx: 32, dy: 0, duration: 1500 }
  })
}