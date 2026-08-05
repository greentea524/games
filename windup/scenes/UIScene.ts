import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private energyBarGfx!: Phaser.GameObjects.Graphics
  private speedrunText!: Phaser.GameObjects.Text
  private levelText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    // Static label; nothing updates it, so it needs no field.
    this.add.text(6, 4, 'PWR', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
    })

    this.energyBarGfx = this.add.graphics()
    this.updateEnergyBar()

    // Second row, not beside the bar. At the font's native 8px the timer is
    // 72px wide and 'PWR' plus the 60px bar already reach x=92, so a single
    // row would need 164px on a 160px screen and the two would overlap.
    this.speedrunText = this.add.text(GBC_WIDTH - 6, 14, '00:00:000', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(1, 0)
    
    this.levelText = this.add.text(6, GBC_HEIGHT - 12, 'LVL 1', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0, 0)
  }

  update() {
    this.updateEnergyBar()
    this.levelText.setText(`LVL ${GameState.levelIndex}/32`)
    
    const currentMillis = GameState.speedrunDisplayMs

    const mins = Math.floor(currentMillis / 60000)
    const secs = Math.floor((currentMillis % 60000) / 1000)
    const ms = currentMillis % 1000
    this.speedrunText.setText(
      `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`
    )
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
