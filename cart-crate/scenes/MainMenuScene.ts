import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, PAL } from '../constants'
import { GameState } from '../state'
import { music, isMuted, setMuted } from '../audio'

export class MainMenuScene extends Phaser.Scene {
  private blinkText!: Phaser.GameObjects.Text
  private canStart = false

  constructor() {
    super('mainmenu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#081820')

    // Two lines: 'CART CRATE' on one is 163px at 16px, wider than the screen.
    // Dropping to 8px would keep it on one line but no longer read as a title.
    this.add.text(GBC_WIDTH / 2, 34, 'CART\nCRATE', {
      fontFamily: FONT,
      fontSize: '16px',
      color: '#e0f8cf',
      stroke: '#0f380f',
      strokeThickness: 2,
      align: 'center',
      lineSpacing: 2,
      resolution: 2,
    }).setOrigin(0.5)

    // Between the two-line title (ends y=51) and the sprite row (starts y=65).
    this.add.text(GBC_WIDTH / 2, 58, 'Sokoban Puzzle', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#8bac0f',
      resolution: 2,
    }).setOrigin(0.5)

    // Sprite preview: the courier fox pushing a crate onto its target
    const mode = GameState.paletteMode
    const keyPrefix = mode === 'gbc' ? '_w1' : ''
    const targetPreview = this.add.sprite(GBC_WIDTH / 2 + 20, 80, `target_${mode}${keyPrefix}`).setScale(1.8)
    const cratePreview = this.add.sprite(GBC_WIDTH / 2, 80, `crate_${mode}${keyPrefix}`).setScale(1.8)
    this.add.sprite(GBC_WIDTH / 2 - 22, 80, `player_${mode}_right`).setScale(1.8)
    this.tweens.add({
      targets: cratePreview,
      x: '+=4',
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: targetPreview,
      alpha: { from: 0.5, to: 1 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    })

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

    music.play('puzzle')

    this.input.on('pointerdown', () => this.startGame())
    
    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))
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
