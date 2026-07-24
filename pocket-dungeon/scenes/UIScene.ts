import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, CSS_MID } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text
  private floorText!: Phaser.GameObjects.Text
  private turnText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    this.hpText = this.add.text(6, 4, `HP: ${GameState.playerHp}/${GameState.maxHp}`, {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    })

    this.floorText = this.add.text(GBC_WIDTH / 2, 4, `F${GameState.floorDepth}`, {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0.5, 0)

    this.turnText = this.add.text(GBC_WIDTH - 6, 4, `TURN: 0`, {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(1, 0)
  }

  update() {
    this.hpText.setText(`HP: ${GameState.playerHp}/${GameState.maxHp}`)
    this.floorText.setText(`F${GameState.floorDepth}`)
    this.turnText.setText(`TURN: ${GameState.turnsCount}`)
  }
}
