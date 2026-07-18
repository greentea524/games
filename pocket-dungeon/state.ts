export enum TurnState {
  PLAYER_TURN,
  ENEMY_TURN,
  ANIMATING,
}

export class GameState {
  static paletteMode: 'dmg' | 'gbc' = 'dmg'
  static turnState: TurnState = TurnState.PLAYER_TURN
  static floorDepth: number = 1
  static playerHp: number = 20
  static maxHp: number = 20
  static playerAtk: number = 4
  static turnsCount: number = 0

  static setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
  }

  static resetRun() {
    this.floorDepth = 1
    this.playerHp = 20
    this.maxHp = 20
    this.playerAtk = 4
    this.turnsCount = 0
    this.turnState = TurnState.PLAYER_TURN
  }
}
