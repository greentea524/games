// The Anomaly Room's save (#114): the longest run cleared.
import { loadSave, saveSave } from '../shared/storage'

const KEY = 'anomaly_room_save'
const VERSION = 1

export interface AnomalySave {
  /** Most rounds found in one run. */
  best: number
  /** Runs cleared outright. */
  cleared: number
}

const EMPTY: AnomalySave = { best: 0, cleared: 0 }

export function loadAnomalySave(): AnomalySave {
  return loadSave<AnomalySave>(KEY, VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    return { best: num(d.best), cleared: num(d.cleared) }
  })
}

/** Records a finished run: how many rounds were found, and whether it cleared. */
export function recordRun(found: number, cleared: boolean): AnomalySave {
  const prev = loadAnomalySave()
  const next: AnomalySave = {
    best: Math.max(prev.best, found),
    cleared: prev.cleared + (cleared ? 1 : 0),
  }
  saveSave(KEY, VERSION, next)
  return next
}
