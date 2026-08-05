import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST, CSS_DARKEST, CSS_MID, CSS_LIGHT } from '../constants'
import { GameState } from '../state'
import { sfx } from '../audio'

export class PauseScene extends Phaser.Scene {
  private selectedIndex = 0
  private menuItems: string[] = ['RESUME', 'QUIT TO MENU']
  private menuTexts: Phaser.GameObjects.Text[] = []
  private cursorGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('pause')
  }

  create() {
    // Semi-transparent overlay
    this.add.rectangle(0, 0, GBC_WIDTH, GBC_HEIGHT, 0x000000, 0.7).setOrigin(0, 0)

    // Title
    this.add.text(GBC_WIDTH / 2, 40, 'PAUSED', {
      fontFamily: FONT,
      fontSize: '16px',
      color: GameState.paletteMode === 'dmg' ? CSS_LIGHTEST : '#ffffff',
      resolution: 2,
    }).setOrigin(0.5).setShadow(1, 1, CSS_DARKEST, 0, false, true)

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
    this.updateSelection()

    // Input handling
    // Phaser names these events after Phaser.Input.Keyboard.KeyCodes, not the
    // DOM key: 'UP'/'DOWN', not 'ArrowUp'/'ArrowDown'. The DOM spelling never
    // fired, so the cursor could not be moved off RESUME. The ENTER/ESC/Z
    // bindings around it were already using the right names.
    this.input.keyboard!.on('keydown-UP', () => this.moveSelection(-1))
    this.input.keyboard!.on('keydown-DOWN', () => this.moveSelection(1))
    
    const confirm = () => this.handleSelection()
    this.input.keyboard!.on('keydown-ENTER', confirm)
    this.input.keyboard!.on('keydown-Z', confirm)

    this.input.keyboard!.on('keydown-ESC', () => {
      sfx.menuSelect()
      this.resumeGame()
    })
  }

  private moveSelection(dir: number) {
    sfx.hit()
    this.selectedIndex += dir
    if (this.selectedIndex < 0) this.selectedIndex = this.menuItems.length - 1
    if (this.selectedIndex >= this.menuItems.length) this.selectedIndex = 0
    this.updateSelection()
  }

  private updateSelection() {
    this.menuTexts.forEach((txt, i) => {
      txt.setColor(i === this.selectedIndex ? CSS_LIGHTEST : CSS_MID)
    })

    const targetTxt = this.menuTexts[this.selectedIndex]
    this.cursorGfx.clear()
    this.cursorGfx.fillStyle(Phaser.Display.Color.HexStringToColor(CSS_LIGHT).color)
    // Draw a small triangle cursor
    const cx = targetTxt.x - targetTxt.width / 2 - 8
    const cy = targetTxt.y
    this.cursorGfx.fillTriangle(cx - 3, cy - 3, cx + 3, cy, cx - 3, cy + 3)
  }

  private handleSelection() {
    sfx.menuSelect()
    if (this.selectedIndex === 0) {
      this.resumeGame()
    } else if (this.selectedIndex === 1) {
      this.quitToMenu()
    }
  }

  private resumeGame() {
    // Restart the run clock; it was banked when the menu opened.
    GameState.speedrunResume()
    this.scene.resume('platformer')
    this.scene.stop()
  }

  private quitToMenu() {
    // Abandoning to the menu leaves the clock stopped, not running in the
    // background — it was already banked on pause, so just persist it.
    GameState.saveGame()
    this.scene.stop('platformer')
    this.scene.stop('ui')
    this.scene.start('mainmenu')
  }
}
