import Phaser from 'phaser'
import { FONT } from '../constants'
import { HUD_THEME, SCREEN_W, SCREEN_H } from '../hud'
import { pauseLayout } from '../screens'

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`
import { GameState } from '../state'
import { sfx, isMuted, setMuted } from '../audio'

export class PauseScene extends Phaser.Scene {
  private selectedIndex = 0
  // SOUND is here so a phone can mute mid-level (#143): the shell has no M key,
  // and M was the only mute this game had. Its label is the live state.
  private menuItems: string[] = ['RESUME', 'SOUND', 'QUIT TO MENU']
  private menuTexts: Phaser.GameObjects.Text[] = []
  private cursorGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super('pause')
  }

  private layout!: ReturnType<typeof pauseLayout>

  create() {
    // On the real screen since #170, in the HUD's panel and colours.
    const theme = HUD_THEME[GameState.paletteMode]
    this.cameras.main.setOrigin(0, 0).setZoom(1)
    this.selectedIndex = 0
    this.layout = pauseLayout(this.menuItems.map((m) => this.labelFor(m)).concat('SOUND: OFF'))
    const l = this.layout
    // The level dimmed behind, and the panel over it.
    this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, theme.panel, 0.7).setOrigin(0, 0)
    this.add.rectangle(l.panel.x, l.panel.y, l.panel.width, l.panel.height, theme.panel, 1).setOrigin(0).setStrokeStyle(1, theme.frame)

    this.add.text(l.heading.x, l.heading.y, 'PAUSED', {
      fontFamily: FONT,
      fontSize: '16px',
      color: css(theme.seg.full),
      resolution: 2,
    }).setOrigin(0.5, 0)

    this.menuTexts = this.menuItems.map((item, index) =>
      this.add.text(l.items[index].x, l.items[index].y, this.labelFor(item), {
        fontFamily: FONT,
        fontSize: '8px',
        resolution: 2,
      }),
    )

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

  private labelFor(item: string): string {
    return item === 'SOUND' ? `SOUND: ${isMuted() ? 'OFF' : 'ON'}` : item
  }

  private moveSelection(dir: number) {
    sfx.hit()
    this.selectedIndex += dir
    if (this.selectedIndex < 0) this.selectedIndex = this.menuItems.length - 1
    if (this.selectedIndex >= this.menuItems.length) this.selectedIndex = 0
    this.updateSelection()
  }

  private updateSelection() {
    const theme = HUD_THEME[GameState.paletteMode]
    this.menuTexts.forEach((txt, i) => txt.setColor(css(i === this.selectedIndex ? theme.text : theme.dim)))
    const c = this.layout.items[this.selectedIndex].cursor
    this.cursorGfx.clear()
    this.cursorGfx.fillStyle(theme.seg.full, 1)
    this.cursorGfx.fillTriangle(c.x - 4, c.y - 4, c.x - 4, c.y + 4, c.x, c.y)
  }

  private handleSelection() {
    sfx.menuSelect()
    const item = this.menuItems[this.selectedIndex]
    if (item === 'RESUME') {
      this.resumeGame()
    } else if (item === 'SOUND') {
      setMuted(!isMuted())
      // Audible confirmation on the way back on, as Static's does.
      if (!isMuted()) sfx.menuSelect()
      this.menuTexts[this.selectedIndex].setText(this.labelFor(item))
      this.updateSelection()
    } else if (item === 'QUIT TO MENU') {
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
