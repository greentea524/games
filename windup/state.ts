export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'gbc'
  static energy: number = 100
  static maxEnergy: number = 100
  static levelIndex: number = 1
  static checkpointX: number = 32
  static checkpointY: number = 96
  static uiBlocking: boolean = false

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

  static saveGame() {
    localStorage.setItem('windup_save', JSON.stringify({
      levelIndex: this.levelIndex,
      paletteMode: this.paletteMode
    }))
  }

  static loadSave() {
    const data = localStorage.getItem('windup_save')
    if (data) {
      try {
        const parsed = JSON.parse(data)
        if (parsed.levelIndex) this.levelIndex = parsed.levelIndex
        if (parsed.paletteMode) this.paletteMode = parsed.paletteMode
      } catch (e) {}
    }
  }
}
