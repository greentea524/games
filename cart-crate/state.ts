export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'dmg'
  static currentLevelIndex: number = 0
  static movesCount: number = 0
  static pushesCount: number = 0
  static uiBlocking: boolean = false

  static setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
  }

  static resetStats() {
    this.movesCount = 0
    this.pushesCount = 0
    this.uiBlocking = false
  }
}
