export interface LevelData {
  id: number
  name: string
  width: number
  height: number
  grid: string[] // Rows of characters: '#' wall, '.' floor, 'P' player, 'C' crate, 'T' target, 'B' crate on target
}

export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'dmg'
  static currentLevelIndex: number = 0
  static movesCount: number = 0
  static pushesCount: number = 0
  static uiBlocking: boolean = false
  static uiClosedAt: number = 0

  static setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
  }
}
