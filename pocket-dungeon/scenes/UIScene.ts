import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, CSS_MID } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text
  private floorText!: Phaser.GameObjects.Text
  private turnText!: Phaser.GameObjects.Text
  private hungerText!: Phaser.GameObjects.Text
  private atkText!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    // Top HUD background
    this.add.rectangle(0, 0, GBC_WIDTH, 14, 0x000000, 0.65).setOrigin(0, 0)
    
    // Bottom HUD background
    this.add.rectangle(0, GBC_HEIGHT - 14, GBC_WIDTH, 14, 0x000000, 0.65).setOrigin(0, 0)

    const textStyle = (color: string, size: string = '6px') => ({
      fontFamily: FONT,
      fontSize: size,
      color: color,
      resolution: 4,
    })

    this.hpText = this.add.text(6, 4, '', textStyle(CSS_LIGHTEST))
    this.floorText = this.add.text(GBC_WIDTH / 2, 4, '', textStyle(CSS_LIGHTEST)).setOrigin(0.5, 0)
    this.turnText = this.add.text(GBC_WIDTH - 6, 4, '', textStyle(CSS_LIGHTEST)).setOrigin(1, 0)

    // Bottom bar
    this.hungerText = this.add.text(6, GBC_HEIGHT - 10, '', textStyle('#88ff88', '5px'))
    this.atkText = this.add.text(GBC_WIDTH - 6, GBC_HEIGHT - 10, '', textStyle('#ff8888', '5px')).setOrigin(1, 0)
    this.goldText = this.add.text(GBC_WIDTH / 2, GBC_HEIGHT - 10, '', textStyle('#ffd700', '5px')).setOrigin(0.5, 0)
  }

  update() {
    this.hpText.setText(`HP:${GameState.playerHp}/${GameState.maxHp}`)
    this.floorText.setText(`F${GameState.floorDepth}`)
    this.turnText.setText(`T:${GameState.turnsCount}`)

    // Hunger display - flash red when starving
    const hungerPct = GameState.hunger / GameState.maxHunger
    if (hungerPct <= 0) {
      this.hungerText.setColor('#ff4444')
      this.hungerText.setText('STARVING!')
    } else if (hungerPct <= 0.25) {
      this.hungerText.setColor('#ffcc00')
      this.hungerText.setText(`FD:${GameState.hunger}`)
    } else {
      this.hungerText.setColor('#88ff88')
      this.hungerText.setText(`FD:${GameState.hunger}`)
    }

    this.atkText.setText(`ATK:${GameState.playerAtk}`)
    this.goldText.setText(`${GameState.runGold}g`)
  }
}
