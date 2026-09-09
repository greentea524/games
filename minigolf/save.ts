// Minigolf's save (#113): the best round, in strokes.
import { loadSave, saveSave } from '../shared/storage'

const KEY = 'minigolf_save'
const VERSION = 1

export interface GolfSave {
  /** Fewest strokes for a completed round, or 0 for none yet. */
  best: number
  rounds: number
}

const EMPTY: GolfSave = { best: 0, rounds: 0 }

export function loadGolfSave(): GolfSave {
  return loadSave<GolfSave>(KEY, VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    return { best: num(d.best), rounds: num(d.rounds) }
  })
}

/** Records a finished round. Lower is better, so an unset best is replaced. */
export function recordRound(total: number): GolfSave {
  const prev = loadGolfSave()
  const next: GolfSave = {
    best: prev.best === 0 ? total : Math.min(prev.best, total),
    rounds: prev.rounds + 1,
  }
  saveSave(KEY, VERSION, next)
  return next
}
