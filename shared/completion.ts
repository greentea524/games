// What the hub shows on each game card (#67).
//
// The hub and the games are served from the same origin
// (greentea524.github.io/games/...), so this reads their save keys directly —
// no messaging layer needed.
//
// Kept out of App.tsx because the interesting part is not the rendering, it is
// deciding what "progress" means per game, and that is worth testing.
import { loadSave } from './storage'

export interface GameStatus {
  /** The player has finished this game. */
  completed: boolean
  /** Short progress line, or null when the game has never been opened. */
  progress: string | null
}

const NONE: GameStatus = { completed: false, progress: null }

function readPayload(key: string): Record<string, unknown> | null {
  return loadSave<Record<string, unknown> | null>(key, 1, null, (payload) =>
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null,
  )
}

/** Static: a chapter count, and the ending flag the finale sets. */
function staticStatus(): GameStatus {
  const d = readPayload('static_save')
  if (!d) return NONE
  const flags = (d.flags ?? {}) as Record<string, unknown>
  const chapter = typeof d.chapter === 'number' ? d.chapter : 1
  return {
    completed: flags.game_ended === true,
    progress: flags.game_ended === true ? 'Finished' : `Chapter ${chapter}`,
  }
}

/** Cart & Crate: levels cleared out of the campaign's 50. */
const CART_CRATE_LEVELS = 50
function cartCrateStatus(): GameStatus {
  const d = readPayload('cart_crate_save_v1')
  if (!d) return NONE
  const cleared = Object.values(d).filter(
    (l) => typeof l === 'object' && l !== null && (l as { completed?: unknown }).completed === true,
  ).length
  if (cleared === 0) return NONE
  return {
    completed: cleared >= CART_CRATE_LEVELS,
    progress: `${cleared}/${CART_CRATE_LEVELS} levels`,
  }
}

/** Pocket Dungeon: a roguelite, so the deepest floor reached is the score. */
function pocketDungeonStatus(): GameStatus {
  const d = readPayload('pocket_dungeon_meta')
  if (!d) return NONE
  const victories = typeof d.totalVictories === 'number' ? d.totalVictories : 0
  const bestFloor = typeof d.bestFloor === 'number' ? d.bestFloor : 0
  const runs = typeof d.totalRuns === 'number' ? d.totalRuns : 0
  if (runs === 0 && bestFloor === 0) return NONE
  return {
    completed: victories > 0,
    progress: victories > 0 ? 'Cleared' : `Floor ${bestFloor}`,
  }
}

/** Windup: level index out of 32. */
const WINDUP_LEVELS = 32
function windupStatus(): GameStatus {
  const d = readPayload('windup_save')
  if (!d) return NONE
  const level = typeof d.levelIndex === 'number' ? d.levelIndex : 1
  const completed = d.completed === true
  if (!completed && level <= 1) return NONE
  return {
    completed,
    progress: completed ? 'Finished' : `Level ${level}/${WINDUP_LEVELS}`,
  }
}

/** Lantern Keeper: named stages rather than numbers. */
const LANTERN_STAGES: Record<string, string> = {
  level1: 'The Forest',
  level2: 'The Marsh',
  level3: 'The Canopy',
  level4: 'The Hollow',
}
function lanternKeeperStatus(): GameStatus {
  const d = readPayload('lantern_keeper_save')
  if (!d) return NONE
  const completed = d.completed === true
  const levelKey = typeof d.levelKey === 'string' ? d.levelKey : 'level1'
  const lit = typeof d.totalLanternsLit === 'number' ? d.totalLanternsLit : 0
  if (!completed && levelKey === 'level1' && lit === 0) return NONE
  return {
    completed,
    progress: completed ? 'Finished' : (LANTERN_STAGES[levelKey] ?? 'The Forest'),
  }
}

/**
 * Status for each local game, keyed by the id used on the hub. Games hosted
 * elsewhere are absent — the hub cannot read another origin's storage, and
 * pretending otherwise would badge them permanently unplayed.
 */
export function readStatuses(): Record<string, GameStatus> {
  return {
    static: staticStatus(),
    'cart-crate': cartCrateStatus(),
    'pocket-dungeon': pocketDungeonStatus(),
    windup: windupStatus(),
    'lantern-keeper': lanternKeeperStatus(),
  }
}
