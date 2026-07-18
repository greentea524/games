import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, CSS_MID, PAL } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private levelTitleText!: Phaser.GameObjects.Text
  private movesText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    this.levelTitleText = this.add.text(8, 4, 'STAGE 1', {
      fontFamily: FONT,
      fontSize: '7px',
      color: CSS_LIGHTEST,
      resolution: 2,
    })

    this.movesText = this.add.text(GBC_WIDTH - 8, 4, 'MOVES: 0', {
      fontFamily: FONT,
      fontSize: '7px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(1, 0)
  }

  update() {
    this.movesText.setText(`MOVES: ${GameState.movesCount}`)
  }
}
