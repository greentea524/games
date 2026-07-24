import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, CSS_MID } from '../constants'
import { GameState } from '../state'

export class UIScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text
  private floorText!: Phaser.GameObjects.Text
  private turnText!: Phaser.GameObjects.Text
  private hungerText!: Phaser.GameObjects.Text
  private atkText!: Phaser.GameObjects.Text

  constructor() {
    super('ui')
  }

  create() {
    this.hpText = this.add.text(6, 4, '', {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    })

    this.floorText = this.add.text(GBC_WIDTH / 2, 4, '', {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(0.5, 0)

    this.turnText = this.add.text(GBC_WIDTH - 6, 4, '', {
      fontFamily: FONT,
      fontSize: '6px',
      color: CSS_LIGHTEST,
      resolution: 2,
    }).setOrigin(1, 0)

    // Bottom bar
    this.hungerText = this.add.text(6, GBC_HEIGHT - 10, '', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#88ff88',
      resolution: 2,
    })

    this.atkText = this.add.text(GBC_WIDTH - 6, GBC_HEIGHT - 10, '', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#ff8888',
      resolution: 2,
    }).setOrigin(1, 0)
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
  }
}
