import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST } from '../constants'
import { GameState } from '../state'

// The HUD portrait (#56).
//
// The bar moved right to make room. It could not go *inside* the bar's frame
// as the thumbnail suggests: that frame is 7px tall and the toy's head is 8,
// and 'PWR' already occupies x 6-30, so there was no gap to tuck it into.
const PORTRAIT = {
  x: 36,
  y: 7,
  /** Bar frame starts here now, was 32. Its right edge lands at 108 of 160. */
  barX: 44,
  /**
   * Below this fraction the portrait dims, matching the threshold the bar
   * already uses to turn red. The issue suggests ~0.25; using the bar's own
   * 0.3 keeps the two halves of the same readout from disagreeing.
   */
  lowRatio: 0.3,
} as const

export class UIScene extends Phaser.Scene {
  private energyBarGfx!: Phaser.GameObjects.Graphics
  private portrait!: Phaser.GameObjects.Image
  private portraitMode: 'dmg' | 'gbc' | null = null
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

    this.portrait = this.add.image(PORTRAIT.x, PORTRAIT.y, `windup_${GameState.paletteMode}_head`)
    this.portraitMode = GameState.paletteMode

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
    this.updatePortrait()
    this.levelText.setText(`LVL ${GameState.levelIndex}/32`)
    
    const currentMillis = GameState.speedrunDisplayMs

    const mins = Math.floor(currentMillis / 60000)
    const secs = Math.floor((currentMillis % 60000) / 1000)
    const ms = currentMillis % 1000
    this.speedrunText.setText(
      `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`
    )
  }

  /**
   * Keeps the portrait in the right palette, and dims it when the spring is
   * nearly out — a second read on a value the player already has to watch.
   */
  private updatePortrait() {
    if (this.portraitMode !== GameState.paletteMode) {
      this.portraitMode = GameState.paletteMode
      this.portrait.setTexture(`windup_${this.portraitMode}_head`)
    }
    const pct = Math.max(0, GameState.energy / GameState.maxEnergy)
    if (pct <= PORTRAIT.lowRatio) {
      this.portrait.setTint(0xff4444)
    } else {
      this.portrait.clearTint()
    }
  }

  private updateEnergyBar() {
    this.energyBarGfx.clear()
    const pct = Math.max(0, GameState.energy / GameState.maxEnergy)
    const barWidth = 60
    const fillW = Math.floor(barWidth * pct)

    // Outer frame
    this.energyBarGfx.lineStyle(1, 0x8bac0f, 1)
    this.energyBarGfx.strokeRect(PORTRAIT.barX, 4, barWidth, 7)

    // Inner fill
    const color = pct > PORTRAIT.lowRatio ? 0x9bbc0f : 0xff4444
    this.energyBarGfx.fillStyle(color, 1)
    this.energyBarGfx.fillRect(PORTRAIT.barX + 1, 5, fillW, 5)
  }
}
