import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, PAL } from '../constants'
import { GameState } from '../state'

export class MainMenuScene extends Phaser.Scene {
  private optionsText: Phaser.GameObjects.Text[] = []
  private selectedIndex = 0
  private savedLevel = 0

  constructor() {
    super('mainmenu')
  }

  create() {
    const savedStr = localStorage.getItem('cart-crate-level')
    this.savedLevel = savedStr ? parseInt(savedStr, 10) : 0

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

    const newGameBtn = this.add.text(GBC_WIDTH / 2, 90, 'NEW GAME', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setData('action', 'new')

    const continueBtn = this.add.text(GBC_WIDTH / 2, 110, 'CONTINUE', {
      fontFamily: FONT,
      fontSize: '8px',
      color: this.savedLevel > 0 ? '#e0f8cf' : '#306230',
      resolution: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: this.savedLevel > 0 }).setData('action', 'continue')

    this.optionsText = [newGameBtn, continueBtn]
    
    // Default select Continue if there's a save, else New Game
    this.selectedIndex = this.savedLevel > 0 ? 1 : 0
    this.updateSelection()

    newGameBtn.on('pointerdown', () => {
      this.selectedIndex = 0
      this.executeAction()
    })

    continueBtn.on('pointerdown', () => {
      if (this.savedLevel > 0) {
        this.selectedIndex = 1
        this.executeAction()
      }
    })
  }

  update() {
    const kb = this.input.keyboard!
    if (Phaser.Input.Keyboard.JustDown(kb.addKey('UP')) || Phaser.Input.Keyboard.JustDown(kb.addKey('W'))) {
      this.selectedIndex = 0
      this.updateSelection()
    } else if (Phaser.Input.Keyboard.JustDown(kb.addKey('DOWN')) || Phaser.Input.Keyboard.JustDown(kb.addKey('S'))) {
      if (this.savedLevel > 0) {
        this.selectedIndex = 1
        this.updateSelection()
      }
    } else if (
      Phaser.Input.Keyboard.JustDown(kb.addKey('SPACE')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('ENTER')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('Z')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('X'))
    ) {
      this.executeAction()
    }
  }

  private updateSelection() {
    this.optionsText.forEach((txt, idx) => {
      if (idx === this.selectedIndex) {
        txt.setText(`> ${txt.getData('action') === 'new' ? 'NEW GAME' : 'CONTINUE'} <`)
        txt.setColor('#ffcc00')
      } else {
        txt.setText(txt.getData('action') === 'new' ? 'NEW GAME' : 'CONTINUE')
        txt.setColor(txt.getData('action') === 'continue' && this.savedLevel === 0 ? '#306230' : '#e0f8cf')
      }
    })
  }

  private executeAction() {
    if (this.selectedIndex === 0) {
      GameState.currentLevelIndex = 0
      localStorage.setItem('cart-crate-level', '0')
    } else {
      GameState.currentLevelIndex = this.savedLevel
    }
    
    this.scene.start('board')
  }
}
