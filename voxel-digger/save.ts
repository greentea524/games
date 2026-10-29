// Voxel Digger's save (#115): the fewest digs a find has been named in.
import { loadSave, saveSave } from '../shared/storage'
import { SCORE_UNIT } from './dig'

const KEY = 'voxel_digger_save'
const VERSION = 1

export interface DiggerSave {
  /** Fewest digs used for a correct identification, or 0 for none yet. */
  best: number
  finds: number
  /**
   * `SCORE_UNIT` when `best` was set (#151). Absent in saves from when a dig
   * was one cube, whose best is ignored rather than compared with taps.
   */
  unit: string
}

const EMPTY: DiggerSave = { best: 0, finds: 0, unit: SCORE_UNIT }

export function loadDiggerSave(): DiggerSave {
  return loadSave<DiggerSave>(KEY, VERSION, EMPTY, (payload) => {
    if (typeof payload !== 'object' || payload === null) return null
    const d = payload as Record<string, unknown>
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    // The finds still count; only a best in another unit is dropped.
    const best = d.unit === SCORE_UNIT ? num(d.best) : 0
    return { best, finds: num(d.finds), unit: SCORE_UNIT }
  })
}

/** Records a correct identification. Fewer digs is better, so 0 means unset. */
export function recordFind(digs: number): DiggerSave {
  const prev = loadDiggerSave()
  const next: DiggerSave = {
    best: prev.best === 0 ? digs : Math.min(prev.best, digs),
    finds: prev.finds + 1,
    unit: SCORE_UNIT,
  }
  saveSave(KEY, VERSION, next)
  return next
}
