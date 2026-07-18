import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, PAL } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import type { BoardScene } from './BoardScene'

export class UIScene extends Phaser.Scene {
  private levelTitleText!: Phaser.GameObjects.Text
  private movesText!: Phaser.GameObjects.Text
  private victoryContainer!: Phaser.GameObjects.Container
  private starsText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    this.levelTitleText = this.add.text(6, 4, `STAGE ${levelConfig.id}`, {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    })

    this.movesText = this.add.text(GBC_WIDTH - 6, 4, 'MOVES: 0', {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(1, 0)

    // Victory Banner Container
    const bgGfx = this.add.graphics()
    bgGfx.fillStyle(PAL.darkest, 0.94)
    bgGfx.fillRoundedRect(-65, -30, 130, 60, 4)
    bgGfx.lineStyle(1.5, PAL.lightest, 1)
    bgGfx.strokeRoundedRect(-65, -30, 130, 60, 4)

    const vicText = this.add.text(0, -16, 'STAGE CLEARED!', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0.5)

    this.starsText = this.add.text(0, -2, '★★★', {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#ffcc00',
      resolution: 2,
    }).setOrigin(0.5)

    const nextBtnText = this.add.text(0, 14, '[ PRESS START / NEXT ]', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#8bac0f',
      resolution: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    nextBtnText.on('pointerdown', () => {
      const boardScene = this.scene.get('board') as BoardScene
      if (boardScene) boardScene.nextLevel()
    })

    this.victoryContainer = this.add.container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [bgGfx, vicText, this.starsText, nextBtnText])
      .setDepth(2000)
      .setVisible(false)
  }

  update() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    this.levelTitleText.setText(`STAGE ${levelConfig.id}`)
    this.movesText.setText(`MOVES: ${GameState.movesCount}`)
  }

  showVictoryBanner(stars: number = 3) {
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars)
    this.starsText.setText(starStr)
    this.victoryContainer.setScale(0).setVisible(true)
    this.tweens.add({
      targets: this.victoryContainer,
      scale: 1,
      duration: 250,
      ease: 'Back.out',
    })
  }

  hideVictoryBanner() {
    this.victoryContainer.setVisible(false)
  }
}
