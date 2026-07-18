import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, PAL } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private levelTitleText!: Phaser.GameObjects.Text
  private movesText!: Phaser.GameObjects.Text
  private victoryContainer!: Phaser.GameObjects.Container

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

    // Victory Banner Container
    const bgGfx = this.add.graphics()
    bgGfx.fillStyle(PAL.darkest, 0.92)
    bgGfx.fillRoundedRect(-65, -25, 130, 50, 4)
    bgGfx.lineStyle(1.5, PAL.lightest, 1)
    bgGfx.strokeRoundedRect(-65, -25, 130, 50, 4)

    const vicText = this.add.text(0, -10, 'STAGE CLEARED!', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0.5)

    const subText = this.add.text(0, 8, 'ALL CRATES DELIVERED', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#8bac0f',
      resolution: 2,
    }).setOrigin(0.5)

    this.victoryContainer = this.add.container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [bgGfx, vicText, subText])
      .setDepth(2000)
      .setVisible(false)
  }

  update() {
    this.movesText.setText(`MOVES: ${GameState.movesCount}`)
  }

  showVictoryBanner() {
    this.victoryContainer.setScale(0).setVisible(true)
    this.tweens.add({
      targets: this.victoryContainer,
      scale: 1,
      duration: 250,
      ease: 'Back.out',
    })
  }
}
