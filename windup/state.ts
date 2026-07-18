export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'dmg'
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
}
