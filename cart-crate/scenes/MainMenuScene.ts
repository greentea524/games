import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, PAL } from '../constants'
import { GameState } from '../state'

export class MainMenuScene extends Phaser.Scene {
  private blinkText!: Phaser.GameObjects.Text
  private canStart = false

  constructor() {
    super('mainmenu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#081820')

    this.add.text(GBC_WIDTH / 2, 40, 'CART CRATE', {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#e0f8cf',
      stroke: '#0f380f',
      strokeThickness: 2,
      resolution: 2,
    }).setOrigin(0.5)

    this.add.text(GBC_WIDTH / 2, 60, 'Sokoban Puzzle', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#8bac0f',
      resolution: 2,
    }).setOrigin(0.5)

    this.blinkText = this.add.text(GBC_WIDTH / 2, 100, 'PRESS START', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#ffcc00',
      resolution: 2,
    }).setOrigin(0.5)

    this.tweens.add({
      targets: this.blinkText,
      alpha: 0,
      duration: 500,
      yoyo: true,
      repeat: -1,
    })

    this.time.delayedCall(500, () => {
      this.canStart = true
    })

    this.input.on('pointerdown', () => this.startGame())
  }

  update() {
    const kb = this.input.keyboard!
    if (
      Phaser.Input.Keyboard.JustDown(kb.addKey('SPACE')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('ENTER')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('Z')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('X'))
    ) {
      this.startGame()
    }
  }

  private startGame() {
    if (!this.canStart) return
    import('../audio').then(a => a.playMenuConfirm())
    this.scene.start('levelselect')
  }
}
