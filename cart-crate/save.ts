import { loadSave, saveSave } from '../shared/storage'

export interface LevelSaveData {
  completed: boolean
  stars: number
  bestMoves: number
}

type LevelMap = Record<string, LevelSaveData>

const SAVE_KEY = 'cart_crate_save_v1'
const SAVE_VERSION = 1

const EMPTY_LEVEL: LevelSaveData = { completed: false, stars: 0, bestMoves: 0 }

export class SaveSystem {
  /** Every level's record. Never throws, never returns a partial parse. */
  private static readAll(): LevelMap {
    return loadSave(SAVE_KEY, SAVE_VERSION, {} as LevelMap, (payload) => {
      if (typeof payload !== 'object' || payload === null) return null
      return payload as LevelMap
    })
  }

  static getLevelData(levelId: number): LevelSaveData {
    return this.readAll()[levelId] ?? { ...EMPTY_LEVEL }
  }

  static saveLevelCompletion(levelId: number, moves: number, parMoves: number): number {
    // This used to JSON.parse the raw value with no try/catch — unlike
    // getLevelData beside it — so one malformed entry threw on level
    // completion and lost the result. readAll() cannot throw.
    const data = this.readAll()

    let stars = 1
    if (moves <= parMoves) stars = 3
    else if (moves <= parMoves + 3) stars = 2

    const prev = data[levelId] ?? { completed: false, stars: 0, bestMoves: 999 }
    data[levelId] = {
      completed: true,
      stars: Math.max(prev.stars, stars),
      bestMoves: Math.min(prev.bestMoves || 999, moves),
    }

    saveSave(SAVE_KEY, SAVE_VERSION, data)
    return stars
  }

  /** How many levels have been cleared — read by the hub for its badge. */
  static completedCount(): number {
    return Object.values(this.readAll()).filter((l) => l?.completed).length
  }
}
