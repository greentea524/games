import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, CSS_MID } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private energyText!: Phaser.GameObjects.Text
  private energyBarGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('ui')
  }

  create() {
    this.energyText = this.add.text(6, 4, 'PWR', {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    })

    this.energyBarGfx = this.add.graphics()
    this.updateEnergyBar()
  }

  update() {
    this.updateEnergyBar()
  }

  private updateEnergyBar() {
    this.energyBarGfx.clear()
    const pct = Math.max(0, GameState.energy / GameState.maxEnergy)
    const barWidth = 60
    const fillW = Math.floor(barWidth * pct)

    // Outer frame
    this.energyBarGfx.lineStyle(1, 0x8bac0f, 1)
    this.energyBarGfx.strokeRect(32, 4, barWidth, 7)

    // Inner fill
    const color = pct > 0.3 ? 0x9bbc0f : 0xff4444
    this.energyBarGfx.fillStyle(color, 1)
    this.energyBarGfx.fillRect(33, 5, fillW, 5)
  }
}
