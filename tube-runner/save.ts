// Tube Runner's save: one number, through shared/storage (#111).
//
// Endless, like Tower Stacker, so this is a record rather than a resume point
// and a corrupt value costs a personal best instead of a position in a
// campaign.
import { loadSave, saveSave } from '../shared/storage'
import { SAVE_KEY, SAVE_VERSION } from './constants'

export interface TubeSave {
  /** Most rings ever cleared in one run. */
  best: number
  /** Runs finished. Tells "never played" from a genuine best of zero. */
  runs: number
}

const EMPTY: TubeSave = { best: 0, runs: 0 }

export function loadTubeSave(): TubeSave {
  return loadSave<TubeSave>(SAVE_KEY, SAVE_VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    return { best: num(d.best), runs: num(d.runs) }
  })
}

/** Records a finished run, and says whether it beat the record. */
export function recordRun(rings: number): TubeSave & { isRecord: boolean } {
  const prev = loadTubeSave()
  const isRecord = rings > prev.best
  const next: TubeSave = {
    best: Math.max(prev.best, Math.max(0, Math.floor(rings))),
    runs: prev.runs + 1,
  }
  saveSave(SAVE_KEY, SAVE_VERSION, next)
  return { ...next, isRecord }
}
