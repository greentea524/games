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
    localStorage.setItem('windup_save', JSON.stringify({
      levelIndex: this.levelIndex,
      paletteMode: this.paletteMode,
      // The display value, so an in-flight segment is not lost on reload.
      // In-memory state is left alone; the segment keeps running.
      speedrunElapsedMs: this.speedrunDisplayMs,
    }))
  }

  static loadSave() {
    const data = localStorage.getItem('windup_save')
    if (data) {
      try {
        const parsed = JSON.parse(data)
        if (parsed.levelIndex) this.levelIndex = parsed.levelIndex
        if (parsed.paletteMode) this.paletteMode = parsed.paletteMode
        if (typeof parsed.speedrunElapsedMs === 'number') {
          this.speedrunElapsedMs = parsed.speedrunElapsedMs
        } else if (typeof parsed.speedrunTimeMillis === 'number') {
          // Pre-migration save. speedrunStartTime is deliberately ignored:
          // it is a timestamp, and nothing in it says how much of the span
          // since then was actually played. Falling back to the old banked
          // figure understates an interrupted run rather than inventing hours.
          this.speedrunElapsedMs = parsed.speedrunTimeMillis
        }
        this.speedrunResumedAt = null
      } catch (e) {}
    }
  }
}
