import { loadSave, saveSave, migrateKey } from '../shared/storage'

export interface LevelSaveData {
  completed: boolean
  stars: number
  bestMoves: number
}

type LevelMap = Record<string, LevelSaveData>

// The '_v1' suffix is gone: the version lives in the envelope that
// shared/storage writes, and carrying it in the key too meant two sources of
// truth for one fact — bump SAVE_VERSION and the key would still say v1.
const SAVE_KEY = 'cart_crate_save'
const SAVE_VERSION = 1

/**
 * Highest level unlocked.
 *
 * This was three copies of a raw `localStorage.getItem('cart-crate-level')`
 * plus `parseInt`, spread over two scene files (#104). That gave up both
 * guarantees the shared layer exists for: the bare `getItem` *throws* rather
 * than returning null in Safari private mode and some webviews, and
 * `parseInt` of a malformed value yields NaN, which then flows into
 * `next > saved` comparisons that silently evaluate false — unlock progress
 * would stop persisting with no error anywhere.
 */
const UNLOCK_KEY = 'cart_crate_unlocked'
const UNLOCK_VERSION = 1

const EMPTY_LEVEL: LevelSaveData = { completed: false, stars: 0, bestMoves: 0 }

// Old key names, moved across once on first load so nobody loses progress.
migrateKey('cart_crate_save_v1', SAVE_KEY)
migrateKey('cart-crate-level', UNLOCK_KEY)

/** Highest level index the player has unlocked. Never throws. */
export function loadHighestUnlocked(): number {
  return loadSave(UNLOCK_KEY, UNLOCK_VERSION, 0, (payload) => {
    // The pre-#104 value was a bare string like "7", not an envelope, so it
    // arrives here as a raw payload with a null version.
    const n = typeof payload === 'number' ? payload : Number(payload)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  })
}

/** Records `level` as unlocked when it beats what is already stored. */
export function recordHighestUnlocked(level: number): void {
  if (!Number.isFinite(level) || level < 0) return
  if (level <= loadHighestUnlocked()) return
  saveSave(UNLOCK_KEY, UNLOCK_VERSION, level)
}

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
