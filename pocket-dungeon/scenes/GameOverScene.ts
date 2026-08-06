import Phaser from 'phaser'
import { GBC_WIDTH, FONT } from '../constants'
import { GameState } from '../state'
import { recordRun } from '../meta'
import type { RunStats } from '../meta'
import { music, sfx } from '../audio'

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover')
  }

  create(data: { victory: boolean }) {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    music.stop()
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

    // ── Title ──
    const titleColor = victory ? '#ffd700' : '#ff4444'
    const titleText = victory ? 'VICTORY!' : 'YOU DIED'
    this.add.text(GBC_WIDTH / 2, 8, titleText, {
      fontFamily: FONT, fontSize: '16px', color: titleColor, resolution: 2,
    }).setOrigin(0.5, 0)

    if (victory) {
      this.add.text(GBC_WIDTH / 2, 24, 'Vault cleared!', {
        fontFamily: FONT, fontSize: '8px', color: '#86b06a', resolution: 2,
      }).setOrigin(0.5, 0)
    }

    // ── Divider ──
    const div = this.add.graphics()
    div.fillStyle(0x506850); div.fillRect(20, 35, GBC_WIDTH - 40, 1)

    // ── Stats ──
    const statsY = 42
    const lines = [
      ['CLASS', GameState.selectedClass.toUpperCase()],
      ['FLOOR', `${GameState.floorDepth}`],
      ['TURNS', `${GameState.turnsCount}`],
      ['HP', `${GameState.playerHp}/${GameState.maxHp}`],
    ]
    lines.forEach(([label, value], i) => {
      this.add.text(30, statsY + i * 12, label, {
        fontFamily: FONT, fontSize: '8px', color: '#7a9a62', resolution: 2,
      })
      this.add.text(GBC_WIDTH - 30, statsY + i * 12, value, {
        fontFamily: FONT, fontSize: '8px', color: '#e0f8cf', resolution: 2,
      }).setOrigin(1, 0)
    })

    // ── Gold Earned ──
    const div2 = this.add.graphics()
    div2.fillStyle(0x506850); div2.fillRect(20, statsY + lines.length * 12 + 4, GBC_WIDTH - 40, 1)

    this.add.text(GBC_WIDTH / 2, statsY + lines.length * 12 + 10, `+${GameState.runGold} GOLD BANKED`, {
      fontFamily: FONT, fontSize: '8px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5, 0)

    // ── Continue Button ──
    const continueBtn = this.add.text(GBC_WIDTH / 2, 126, '\u25B6 CONTINUE', {
      fontFamily: FONT, fontSize: '8px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })

    continueBtn.on('pointerover', () => continueBtn.setColor('#ffffff'))
    continueBtn.on('pointerout', () => continueBtn.setColor('#e0f8cf'))
    continueBtn.on('pointerdown', () => {
      sfx.menuSelect()
      this.scene.stop('ui')
      this.scene.start('title')
    })

    const enterKey = this.input.keyboard!.addKey('ENTER')
    const zKey = this.input.keyboard!.addKey('Z')
    const goBack = () => {
      sfx.menuSelect()
      this.scene.stop('ui')
      this.scene.start('title')
    }
    enterKey.on('down', goBack)
    zKey.on('down', goBack)
  }
}
