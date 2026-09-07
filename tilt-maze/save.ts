// Tilt Maze's save (#112).
//
// Unlike the two endless games, this one has a finish, so the save is a
// position in a campaign rather than a record: the furthest level reached, and
// whether the last one was cleared.
import { loadSave, saveSave } from '../shared/storage'

const KEY = 'tilt_maze_save'
const VERSION = 1

export interface TiltSave {
  /** Highest level index unlocked. */
  reached: number
  /** Every level cleared. */
  completed: boolean
}

const EMPTY: TiltSave = { reached: 0, completed: false }

export function loadTiltSave(): TiltSave {
  return loadSave<TiltSave>(KEY, VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const reached =
      typeof d.reached === 'number' && Number.isFinite(d.reached) && d.reached >= 0
        ? Math.floor(d.reached)
        : 0
    return { reached, completed: d.completed === true }
  })
}

/** Records progress. Never moves `reached` backwards. */
export function recordProgress(level: number, completed: boolean): TiltSave {
  const prev = loadTiltSave()
  const next: TiltSave = {
    reached: Math.max(prev.reached, level),
    completed: prev.completed || completed,
  }
  saveSave(KEY, VERSION, next)
  return next
}
