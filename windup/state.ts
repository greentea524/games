import { loadSave, saveSave } from '../shared/storage'

const SAVE_KEY = 'windup_save'
const SAVE_VERSION = 1

interface Saved {
  levelIndex: number
  paletteMode: 'dmg' | 'gbc'
  speedrunElapsedMs: number
  completed: boolean
}

export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'gbc'
  static energy: number = 100
  static maxEnergy: number = 100
  static levelIndex: number = 1
  static checkpointX: number = 32
  static checkpointY: number = 96
  static uiBlocking: boolean = false
  /**
   * Run time banked so far, in ms. This is the only part that is persisted:
   * it is a duration, so it survives a reload with its meaning intact.
   */
  static speedrunElapsedMs = 0
  /**
   * When the current play segment began. Deliberately never saved — a
   * wall-clock instant is meaningless after the tab has been closed, and
   * persisting one is what made a resumed save read 180 minutes.
   */
  static speedrunResumedAt: number | null = null
  /** Set once level 32 is cleared. Read by the hub to badge the card. */
  static completed = false

  static setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
  }

  static drainEnergy(amount: number) {
    this.energy = Math.max(0, this.energy - amount)
  }

  static refillEnergy() {
    this.energy = this.maxEnergy
  }

  static addEnergy(amount: number) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount)
  }

  static reset() {
    this.levelIndex = 1
    this.checkpointX = 32
    this.checkpointY = 96
    this.energy = this.maxEnergy
    this.speedrunElapsedMs = 0
    this.speedrunResumedAt = null
    // `completed` deliberately survives reset: it records that this player
    // has finished the game, not the state of the current run.
    this.saveGame()
  }

  /** Starts a play segment. Idempotent, so re-entering a level is harmless. */
  static speedrunResume() {
    if (this.speedrunResumedAt === null) this.speedrunResumedAt = Date.now()
  }

  /** Ends the current segment and adds it to the banked total. */
  static speedrunBank() {
    if (this.speedrunResumedAt !== null) {
      this.speedrunElapsedMs += Date.now() - this.speedrunResumedAt
      this.speedrunResumedAt = null
    }
  }

  /** Banked time plus whatever the running segment has accrued. */
  static get speedrunDisplayMs(): number {
    return (
      this.speedrunElapsedMs +
      (this.speedrunResumedAt !== null ? Date.now() - this.speedrunResumedAt : 0)
    )
  }

  static saveGame() {
    saveSave(SAVE_KEY, SAVE_VERSION, {
      levelIndex: this.levelIndex,
      paletteMode: this.paletteMode,
      // The display value, so an in-flight segment is not lost on reload.
      // In-memory state is left alone; the segment keeps running.
      speedrunElapsedMs: this.speedrunDisplayMs,
      completed: this.completed,
    })
  }

  static loadSave() {
    const s = loadSave(SAVE_KEY, SAVE_VERSION, null as Saved | null, (payload) => {
      if (typeof payload !== 'object' || payload === null) return null
      const p = payload as Record<string, unknown>
      return {
        levelIndex: typeof p.levelIndex === 'number' ? p.levelIndex : 1,
        paletteMode: p.paletteMode === 'dmg' ? 'dmg' : 'gbc',
        // speedrunElapsedMs is current; speedrunTimeMillis is the pre-#79
        // field. speedrunStartTime is deliberately ignored — it is a
        // timestamp, and nothing in it says how much of the span since then
        // was played, so honouring it invented hours of run time.
        speedrunElapsedMs:
          typeof p.speedrunElapsedMs === 'number'
            ? p.speedrunElapsedMs
            : typeof p.speedrunTimeMillis === 'number'
              ? p.speedrunTimeMillis
              : 0,
        completed: p.completed === true,
      }
      // Note: no version gate. Every field is checked individually, so an
      // older save is read on its merits rather than discarded wholesale.
    })
    if (!s) return
    this.levelIndex = s.levelIndex
    this.paletteMode = s.paletteMode
    this.speedrunElapsedMs = s.speedrunElapsedMs
    this.completed = s.completed
    this.speedrunResumedAt = null
  }
}
