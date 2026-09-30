// Minigolf's save (#113): the best round, in strokes — and, since #141, the
// course it was set on. See `COURSE_KEY`.
import { loadSave, saveSave } from '../shared/storage'
import { COURSE_KEY } from './holes'

const KEY = 'minigolf_save'
const VERSION = 1

export interface GolfSave {
  /** Fewest strokes for a completed round, or 0 for none yet. */
  best: number
  rounds: number
  /** `COURSE_KEY` when `best` was set. Absent in saves from before #141. */
  course: string
}

const EMPTY: GolfSave = { best: 0, rounds: 0, course: COURSE_KEY }

export function loadGolfSave(): GolfSave {
  return loadSave<GolfSave>(KEY, VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    // A best from another course is not a best on this one. The round count
    // is kept: those rounds were played, whatever they were played on.
    const sameCourse = d.course === COURSE_KEY
    return { best: sameCourse ? num(d.best) : 0, rounds: num(d.rounds), course: COURSE_KEY }
  })
}

/** Records a finished round. Lower is better, so an unset best is replaced. */
export function recordRound(total: number): GolfSave {
  const prev = loadGolfSave()
  const next: GolfSave = {
    best: prev.best === 0 ? total : Math.min(prev.best, total),
    rounds: prev.rounds + 1,
    course: COURSE_KEY,
  }
  saveSave(KEY, VERSION, next)
  return next
}
