import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHT, CSS_LIGHTEST, CSS_DARKEST, CSS_MID, PAL, GBC_PAL } from '../constants'
import { GameState } from '../state'

export class MainMenuScene extends Phaser.Scene {
  private selectedIndex = 0
  private menuItems: string[] = []
  private menuTexts: Phaser.GameObjects.Text[] = []
  
  private viewState: 'menu' | 'how-to' | 'about' = 'menu'
  private infoText!: Phaser.GameObjects.Text
  private cursorGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('mainmenu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    
    // Title
    this.add.text(GBC_WIDTH / 2, 30, 'WINDUP', {
      fontFamily: FONT,
      fontSize: '24px',
      color: GameState.paletteMode === 'dmg' ? CSS_LIGHTEST : '#40d870',
      resolution: 2,
    }).setOrigin(0.5).setShadow(2, 2, GameState.paletteMode === 'dmg' ? CSS_DARKEST : '#184888', 0, false, true)

    if (GameState.levelIndex > 1) {
      this.menuItems = ['CONTINUE', 'NEW GAME', 'HOW TO PLAY', 'ABOUT']
    } else {
      this.menuItems = ['NEW GAME', 'HOW TO PLAY', 'ABOUT']
    }

    // Menu Items
    const startY = 80
    this.menuTexts = []
    this.menuItems.forEach((item, index) => {
      const txt = this.add.text(GBC_WIDTH / 2, startY + index * 16, item, {
        fontFamily: FONT,
        fontSize: '8px',
        color: CSS_MID,
        resolution: 2,
      }).setOrigin(0.5)
      this.menuTexts.push(txt)
    })

    // Cursor
    this.cursorGfx = this.add.graphics()
    this.updateCursor()

    // Info Text Box (Hidden initially)
    this.infoText = this.add.text(10, 60, '', {
      fontFamily: FONT,
      fontSize: '8px',
      color: CSS_LIGHTEST,
      resolution: 2,
      wordWrap: { width: GBC_WIDTH - 20 }
    }).setOrigin(0).setVisible(false)

    // Keyboard Inputs
    this.input.keyboard!.on('keydown', this.handleInput, this)

    // Touch Support
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.viewState !== 'menu') {
        this.backToMenu()
        return
      }

      if (pointer.y > 60) {
        if (pointer.y < 88) this.selectedIndex = 0
        else if (pointer.y < 104) this.selectedIndex = 1
        else this.selectedIndex = 2
        
        this.updateCursor()
        this.selectOption()
      }
    })
  }

  private backToMenu() {
    this.viewState = 'menu'
    this.infoText.setVisible(false)
    this.menuTexts.forEach(t => t.setVisible(true))
    this.cursorGfx.setVisible(true)
  }

  private handleInput(e: KeyboardEvent) {
    if (this.viewState !== 'menu') {
      if (e.code === 'KeyX' || e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        this.backToMenu()
      }
      return
    }

    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length
      this.updateCursor()
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length
      this.updateCursor()
    } else if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space') {
      this.selectOption()
    }
  }

  private updateCursor() {
    this.menuTexts.forEach((txt, i) => {
      txt.setColor(i === this.selectedIndex ? CSS_LIGHTEST : CSS_MID)
    })

    this.cursorGfx.clear()
    this.cursorGfx.fillStyle(GameState.paletteMode === 'dmg' ? PAL.lightest : 0xffffff, 1)
    
    const targetY = 80 + this.selectedIndex * 16
    this.cursorGfx.fillTriangle(
      GBC_WIDTH / 2 - 45, targetY - 3,
      GBC_WIDTH / 2 - 45, targetY + 3,
      GBC_WIDTH / 2 - 40, targetY
    )
  }

  private selectOption() {
    const option = this.menuItems[this.selectedIndex]
    
    if (option === 'CONTINUE') {
      this.scene.start('platformer')
    } else if (option === 'NEW GAME') {
      GameState.reset()
      this.scene.start('platformer')
    } else if (option === 'HOW TO PLAY') {
      this.viewState = 'how-to'
      this.menuTexts.forEach(t => t.setVisible(false))
      this.cursorGfx.setVisible(false)
      this.infoText.setText("Move: D-PAD\nJump: A (or Z)\nWall Jump: Jump while sliding down walls!\n\nRecharge energy at Stations.")
      this.infoText.setVisible(true)
    } else if (option === 'ABOUT') {
      this.viewState = 'about'
      this.menuTexts.forEach(t => t.setVisible(false))
      this.cursorGfx.setVisible(false)
      this.infoText.setText("WINDUP\nA GBC-style puzzle platformer.\n\n32 Levels of precision jumping!")
      this.infoText.setVisible(true)
    }
  }
}
