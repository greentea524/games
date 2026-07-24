import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { GameState } from '../state'
import { recordRun, RunStats } from '../meta'

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover')
  }

  create(data: { victory: boolean }) {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    const victory = data?.victory ?? false

    // Record run stats
    const stats: RunStats = {
      date: new Date().toISOString(),
      className: GameState.selectedClass,
      floorsCleared: GameState.floorDepth - 1,
      turnsUsed: GameState.turnsCount,
      goldEarned: GameState.runGold,
      victory,
    }
    recordRun(stats)

    // Title
    const titleColor = victory ? '#ffd700' : '#ff4444'
    const titleText = victory ? 'VICTORY!' : 'YOU DIED'
    this.add.text(GBC_WIDTH / 2, 18, titleText, {
      fontFamily: FONT, fontSize: '12px', color: titleColor, resolution: 2,
    }).setOrigin(0.5)

    // Subtitle
    if (victory) {
      this.add.text(GBC_WIDTH / 2, 34, 'The Vault is cleared!', {
        fontFamily: FONT, fontSize: '5px', color: '#86b06a', resolution: 2,
      }).setOrigin(0.5)
    }

    // Stats
    const statsY = 50
    const lines = [
      `CLASS: ${GameState.selectedClass.toUpperCase()}`,
      `FLOOR: ${GameState.floorDepth}`,
      `TURNS: ${GameState.turnsCount}`,
      `GOLD: ${GameState.runGold}`,
      `HP: ${GameState.playerHp}/${GameState.maxHp}`,
    ]
    lines.forEach((line, i) => {
      this.add.text(GBC_WIDTH / 2, statsY + i * 12, line, {
        fontFamily: FONT, fontSize: '5px', color: '#e0f8cf', resolution: 2,
      }).setOrigin(0.5)
    })

    // Gold added notice
    this.add.text(GBC_WIDTH / 2, statsY + lines.length * 12 + 6, `+${GameState.runGold} GOLD BANKED`, {
      fontFamily: FONT, fontSize: '6px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5)

    // Controls
    this.add.text(GBC_WIDTH / 2, 132, 'ENTER: RETURN TO TITLE', {
      fontFamily: FONT, fontSize: '4px', color: '#506850', resolution: 2,
    }).setOrigin(0.5)

    const enterKey = this.input.keyboard!.addKey('ENTER')
    enterKey.on('down', () => {
      this.scene.stop('ui')
      this.scene.start('title')
    })
  }
}
