// Run progress, persisted (#67).
//
// Lantern Keeper was the one game that saved nothing but its mute setting:
// level, unlocked abilities and lantern count were passed between scenes as
// scene data and lived only in memory, so closing the tab lost everything —
// including abilities the player had earned two levels back.
//
// Granularity is per level, not per lantern. Levels are short and each one
// starts from a known spawn, so a level boundary is a natural checkpoint;
// restoring mid-level would need the lit set and the player's position, which
// is a bigger change than the gap it closes.
import { loadSave, saveSave, clearSave } from '../shared/storage'

const SAVE_KEY = 'lantern_keeper_save'
const SAVE_VERSION = 1

export interface Progress {
  levelKey: string
  hasDoubleJump: boolean
  hasDash: boolean
  hasWallCling: boolean
  totalLanternsLit: number
  /** Set when the Heart Tree is reached. Read by the hub to badge the card. */
  completed: boolean
}

const LEVELS = ['level1', 'level2', 'level3', 'level4']

export function defaultProgress(): Progress {
  return {
    levelKey: 'level1',
    hasDoubleJump: false,
    hasDash: false,
    hasWallCling: false,
    totalLanternsLit: 0,
    completed: false,
  }
}

export function loadProgress(): Progress {
  return loadSave(SAVE_KEY, SAVE_VERSION, defaultProgress(), (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const p = payload as Record<string, unknown>
    // levelKey is checked against the known set rather than trusted: an
    // unknown key would be handed to make.tilemap and fail at boot, which is
    // a worse failure than starting over.
    const levelKey =
      typeof p.levelKey === 'string' && LEVELS.includes(p.levelKey)
        ? p.levelKey
        : 'level1'
    return {
      levelKey,
      hasDoubleJump: p.hasDoubleJump === true,
      hasDash: p.hasDash === true,
      hasWallCling: p.hasWallCling === true,
      totalLanternsLit:
        typeof p.totalLanternsLit === 'number' && p.totalLanternsLit >= 0
          ? p.totalLanternsLit
          : 0,
      completed: p.completed === true,
    }
  })
}

export function saveProgress(p: Progress): void {
  saveSave(SAVE_KEY, SAVE_VERSION, p)
}

/** True when there is progress worth offering to resume. */
export function hasProgress(): boolean {
  const p = loadProgress()
  return p.levelKey !== 'level1' || p.totalLanternsLit > 0 || p.completed
}

export function clearProgress(): void {
  clearSave(SAVE_KEY)
}
