import type { BoardScene, CrateInstance } from './scenes/BoardScene'
import { TILE } from './constants'
import { GameState } from './state'

export interface ICommand {
  execute(): void
  undo(): void
}

export interface StepRecord {
  playerPrevTX: number
  playerPrevTY: number
  playerNextTX: number
  playerNextTY: number
  facing: 'down' | 'up' | 'left' | 'right'
  crate: CrateInstance | null
  cratePrevTX: number | null
  cratePrevTY: number | null
  crateNextTX: number | null
  crateNextTY: number | null
  cratePrevDocked: boolean | null
  crateNextDocked: boolean | null
  crackedTiles: { tx: number; ty: number }[]
  crateDestroyed: boolean
}

export class MoveCommand implements ICommand {
  constructor(
    private scene: BoardScene,
    public record: StepRecord,
  ) {}

  execute() {
    // Executed during board step
  }

  undo() {
    const mode = GameState.paletteMode
    this.scene.setPlayerPos(this.record.playerPrevTX, this.record.playerPrevTY, this.record.facing)

    this.record.crackedTiles.forEach((t) => {
      this.scene.setTile(t.tx, t.ty, 'X')
    })

    if (this.record.crate && this.record.cratePrevTX !== null && this.record.cratePrevTY !== null) {
      if (this.record.crateDestroyed) {
        this.record.crate.destroyed = false
        this.record.crate.sprite.setVisible(true).setScale(1)
        this.scene.setTile(this.record.crateNextTX!, this.record.crateNextTY!, 'O')
      }
      this.record.crate.tx = this.record.cratePrevTX
      this.record.crate.ty = this.record.cratePrevTY
      this.record.crate.docked = !!this.record.cratePrevDocked
      this.record.crate.sprite.setPosition(
        this.record.cratePrevTX * TILE + TILE / 2,
        this.record.cratePrevTY * TILE + TILE / 2,
      )
      if (this.record.crate.docked) {
        this.record.crate.sprite.setTint(mode === 'dmg' ? 0x9bbc0f : 0xffff44)
      } else {
        this.record.crate.sprite.clearTint()
      }
    }
  }
}
