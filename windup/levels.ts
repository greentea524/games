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
}
