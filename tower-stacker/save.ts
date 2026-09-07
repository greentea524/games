// Tower Stacker's save: one number, through shared/storage (#110).
//
// The game is endless, so there is no progress to restore — a save here is a
// record, not a resume point. That keeps this to a best height and a run
// count, and means a corrupt or missing save costs the player a personal best
// rather than a position in a campaign.
import { loadSave, saveSave } from '../shared/storage'
import { SAVE_KEY, SAVE_VERSION } from './constants'

export interface TowerSave {
  /** Tallest tower ever built, in blocks placed. */
  best: number
  /** How many runs have ended. Only used to tell "never played" from "best 0". */
  runs: number
}

const EMPTY: TowerSave = { best: 0, runs: 0 }

/**
 * Reads the save, repairing anything that is not a sane pair of counts.
 *
 * `revive` rather than the strict default because a hand-edited or truncated
 * value should cost the record, not throw the player at a blank game that
 * looks broken.
 */
export function loadTowerSave(): TowerSave {
  return loadSave<TowerSave>(SAVE_KEY, SAVE_VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    return { best: num(d.best), runs: num(d.runs) }
  })
}

/**
 * Records a finished run. Returns the save as it now stands, so the caller can
 * tell the player they beat their record without reading back.
 */
export function recordRun(height: number): TowerSave & { isRecord: boolean } {
  const prev = loadTowerSave()
  const isRecord = height > prev.best
  const next: TowerSave = {
    best: Math.max(prev.best, Math.max(0, Math.floor(height))),
    runs: prev.runs + 1,
  }
  saveSave(SAVE_KEY, SAVE_VERSION, next)
  return { ...next, isRecord }
}
