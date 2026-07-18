import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, PAL } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import type { BoardScene } from './BoardScene'

export class UIScene extends Phaser.Scene {
  private levelTitleText!: Phaser.GameObjects.Text
  private movesText!: Phaser.GameObjects.Text
  private objectiveTickerText!: Phaser.GameObjects.Text
  private victoryContainer!: Phaser.GameObjects.Container
  private starsText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    
    // Top Bar
    this.levelTitleText = this.add.text(6, 4, `STAGE ${levelConfig.id}: ${levelConfig.title.toUpperCase()}`, {
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

    // Bottom Objective Banner (Clear instructions for player)
    this.objectiveTickerText = this.add.text(GBC_WIDTH / 2, GBC_HEIGHT - 6, 'GOAL: PUSH CRATES ONTO TARGET DOTS', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#8bac0f',
      resolution: 2,
    }).setOrigin(0.5, 1)

    // Victory Banner Container
    const bgGfx = this.add.graphics()
    bgGfx.fillStyle(PAL.darkest, 0.95)
    bgGfx.fillRoundedRect(-72, -35, 144, 70, 6)
    bgGfx.lineStyle(1.5, PAL.lightest, 1)
    bgGfx.strokeRoundedRect(-72, -35, 144, 70, 6)

    const vicText = this.add.text(0, -20, 'STAGE CLEARED!', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0.5)

    this.starsText = this.add.text(0, -5, '★★★', {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#ffcc00',
      resolution: 2,
    }).setOrigin(0.5)

    const subText = this.add.text(0, 8, 'ALL CRATES DELIVERED!', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#8bac0f',
      resolution: 2,
    }).setOrigin(0.5)

    const nextBtnText = this.add.text(0, 22, '[ TAP / PRESS ANY KEY ]', {
      fontFamily: FONT,
      fontSize: '5px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0.5)

    this.victoryContainer = this.add.container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [
      bgGfx,
      vicText,
      this.starsText,
      subText,
      nextBtnText,
    ])
      .setDepth(2000)
      .setVisible(false)

    // Advance level on pointer/touch click anywhere when victory banner is showing
    this.input.on('pointerdown', () => {
      if (GameState.uiBlocking) {
        const boardScene = this.scene.get('board') as BoardScene
        if (boardScene) boardScene.nextLevel()
      }
    })
  }

  update() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    this.levelTitleText.setText(`STAGE ${levelConfig.id}: ${levelConfig.title.toUpperCase()}`)
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
