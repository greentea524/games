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
 * Tower Stacker: endless, so the best height is the whole record (#110).
 *
 * `completed` is never true here, and that is deliberate rather than an
 * omission. The other five games have a finish to badge — a last level, a
 * boss, an ending flag. This one has no end state to reach, so picking a
 * height and calling it "complete" would badge the card with a claim the game
 * never makes. The run count is what separates "never played" from a genuine
 * best of zero, which is a real result: a first drop can miss.
 */
function towerStackerStatus(): GameStatus {
  const d = readPayload('tower_stacker_save')
  if (!d) return NONE
  const best = typeof d.best === 'number' ? d.best : 0
  const runs = typeof d.runs === 'number' ? d.runs : 0
  if (runs === 0) return NONE
  return { completed: false, progress: `Best ${best}` }
}

/**
 * Tube Runner: endless, so the rings cleared in the best run is the record.
 *
 * `completed` is never true, for the same reason as Tower Stacker's: there is
 * no finish to badge, and inventing a threshold would claim an ending the game
 * does not have.
 */
function tubeRunnerStatus(): GameStatus {
  const d = readPayload('tube_runner_save')
  if (!d) return NONE
  const best = typeof d.best === 'number' ? d.best : 0
  const runs = typeof d.runs === 'number' ? d.runs : 0
  if (runs === 0) return NONE
  return { completed: false, progress: `Best ${best}` }
}

/**
 * Tilt Maze: a campaign, so progress is a position rather than a record.
 *
 * Unlike the two endless 3D games, this one has an end — so `completed` means
 * something here and the badge can finally say so.
 */
const TILT_MAZE_LEVELS = 8
function tiltMazeStatus(): GameStatus {
  const d = readPayload('tilt_maze_save')
  if (!d) return NONE
  const completed = d.completed === true
  const reached = typeof d.reached === 'number' ? d.reached : 0
  if (!completed && reached <= 0) return NONE
  return {
    completed,
    progress: completed ? 'Finished' : `Level ${reached + 1}/${TILT_MAZE_LEVELS}`,
  }
}

/**
 * Minigolf: a round has a total, and lower is better.
 *
 * The only game here whose score improves by going *down*, which is why the
 * badge says "Best 9" rather than a level or a height — a number with no
 * direction would read as progress rather than as a round.
 */
function minigolfStatus(): GameStatus {
  const d = readPayload('minigolf_save')
  if (!d) return NONE
  const best = typeof d.best === 'number' ? d.best : 0
  const rounds = typeof d.rounds === 'number' ? d.rounds : 0
  if (rounds === 0 || best === 0) return NONE
  return { completed: true, progress: `Best ${best}` }
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
    'tower-stacker': towerStackerStatus(),
    'tube-runner': tubeRunnerStatus(),
    'tilt-maze': tiltMazeStatus(),
    minigolf: minigolfStatus(),
  }
}
