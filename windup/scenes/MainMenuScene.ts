import Phaser from 'phaser'
import { FONT } from '../constants'
import { GameState } from '../state'
import { sfx, isMuted, setMuted } from '../audio'
import { HUD_THEME, SCREEN_W } from '../hud'
import { MID, BLEED, PALETTES, stoneFrame, LEFT, RIGHT } from '../factory'
import { TITLE, TITLE_PX, LINE, LEDGE_Y, INFO_COLS, titleLayout, infoLayout, wrap, howToPlay, ABOUT } from '../screens'

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** A desktop names keys; a phone names the pad and buttons. */
const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

/**
 * The title (#170): on the real screen, in the HUD's panels and colours,
 * standing in the factory, with the toy and a station on a ledge of stone.
 */
export class MainMenuScene extends Phaser.Scene {
  private selectedIndex = 0
  private menuItems: string[] = []
  private menuTexts: Phaser.GameObjects.Text[] = []

  private viewState: 'menu' | 'how-to' | 'about' = 'menu'
  private menuPanel!: Phaser.GameObjects.Rectangle
  private infoPanel!: Phaser.GameObjects.Rectangle
  private infoText!: Phaser.GameObjects.Text
  private figures: Phaser.GameObjects.Image[] = []
  private cursorGfx!: Phaser.GameObjects.Graphics
  private layout!: ReturnType<typeof titleLayout>

  constructor() {
    super('mainmenu')
  }

  create() {
    const mode = GameState.paletteMode
    const theme = HUD_THEME[mode]
    this.cameras.main.setOrigin(0, 0).setZoom(1)
    this.cameras.main.setBackgroundColor(PALETTES[mode].void)
    this.viewState = 'menu'

    // The factory behind: the same three layers as a level, still.
    for (const key of ['bgfar', 'bgmid', 'bgnear']) this.add.image(-BLEED, -BLEED, `${key}_${mode}`).setOrigin(0)
    this.add.image(MID.bigGear.x, MID.bigGear.y, `gearbig_${mode}`, 0)
    this.add.image(MID.smallGear.x, MID.smallGear.y, `gearsmall_${mode}`, 0)
    // A ledge of mossy stone along the bottom, one long cap.
    for (let i = 0; i < SCREEN_W / 24; i++) {
      const mask = (i > 0 ? LEFT : 0) | (i < SCREEN_W / 24 - 1 ? RIGHT : 0)
      this.add.image(i * 24, LEDGE_Y, `stone_${mode}`, stoneFrame(mask, i, 8)).setOrigin(0)
    }

    this.add.text(SCREEN_W / 2, 18, TITLE, {
      fontFamily: FONT, fontSize: `${TITLE_PX}px`, color: css(theme.seg.full), resolution: 2,
    }).setOrigin(0.5, 0).setShadow(2, 2, css(theme.panel), 0, false, true)

    this.menuItems = GameState.levelIndex > 1 ? ['CONTINUE', 'NEW GAME', 'HOW TO PLAY', 'ABOUT'] : ['NEW GAME', 'HOW TO PLAY', 'ABOUT']
    this.layout = titleLayout(this.menuItems)
    const l = this.layout

    // The toy beside a station, twice the size they are in play. The origin
    // puts the lowest drawn row of each on the ledge: the toy's feet are one
    // row above its picture's foot, the station's base three.
    const foot = (img: Phaser.GameObjects.Image, rowsBelow: number) =>
      img.setOrigin(0.5, 1 - rowsBelow / 24).setScale(2)
    const toy = foot(this.add.image(l.toy.x, l.toy.y, `robot_${mode}`, 0), 1)
    // The key where it sits in play: nine pixels behind the middle and three
    // below it, here twice over. The middle is eleven rows above the feet.
    const key = this.add.image(l.toy.x - 18, l.toy.y - 22 + 6, `key_${mode}`, 0).setScale(2)
    const station = foot(this.add.image(l.station.x, l.station.y, `station_${mode}`), 3)
    // In front of its key, which is on its back.
    toy.setDepth(1)
    this.figures = [key, toy, station]

    const panel = (b: { x: number; y: number; width: number; height: number }) =>
      this.add.rectangle(b.x, b.y, b.width, b.height, theme.panel, 1).setOrigin(0).setStrokeStyle(1, theme.frame)
    this.menuPanel = panel(l.panel)
    this.menuTexts = this.menuItems.map((item, i) =>
      this.add.text(l.items[i].x, l.items[i].y, item, { fontFamily: FONT, fontSize: '8px', resolution: 2 }),
    )
    this.cursorGfx = this.add.graphics()

    this.infoPanel = panel(l.panel).setVisible(false)
    this.infoText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '8px', color: css(theme.text), resolution: 2, lineSpacing: LINE - 8,
    }).setVisible(false)

    this.updateCursor()

    this.input.keyboard!.on('keydown', this.handleInput, this)
    // A tap on a choice picks it; any tap on an info page goes back.
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.viewState !== 'menu') {
        this.backToMenu()
        return
      }
      const hit = this.layout.items.findIndex((it) => pointer.y >= it.y - 3 && pointer.y < it.y - 3 + LINE)
      if (hit >= 0 && pointer.x >= this.layout.panel.x && pointer.x < this.layout.panel.x + this.layout.panel.width) {
        this.selectedIndex = hit
        this.updateCursor()
        this.selectOption()
      }
    })

    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))
  }

  private showMenu(shown: boolean) {
    this.menuPanel.setVisible(shown)
    this.menuTexts.forEach((t) => t.setVisible(shown))
    this.cursorGfx.setVisible(shown)
  }

  private backToMenu() {
    sfx.menuSelect()
    this.viewState = 'menu'
    this.infoPanel.setVisible(false)
    this.infoText.setVisible(false)
    this.figures.forEach((f) => f.setVisible(true))
    this.showMenu(true)
  }

  private showInfo(text: string) {
    const lines = wrap(text, INFO_COLS)
    const l = infoLayout(lines)
    this.showMenu(false)
    // The page is taller than the gap above the ledge, so the figures step out.
    this.figures.forEach((f) => f.setVisible(false))
    this.infoPanel.setPosition(l.panel.x, l.panel.y).setSize(l.panel.width, l.panel.height).setVisible(true)
    this.infoText.setPosition(l.text.x, l.text.y).setText(lines.join('\n')).setVisible(true)
  }

  private handleInput(e: KeyboardEvent) {
    if (this.viewState !== 'menu') {
      if (e.code === 'KeyX' || e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        this.backToMenu()
      }
      return
    }

    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      sfx.menuSelect()
      this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length
      this.updateCursor()
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      sfx.menuSelect()
      this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length
      this.updateCursor()
    } else if (e.code === 'KeyZ' || e.code === 'Enter' || e.code === 'Space') {
      this.selectOption()
    }
    // No KeyM here. `mKey` in `create()` already toggles the mute, on every
    // view; a second toggle in this handler cancelled it on the menu view,
    // so M did nothing there — found by #142's sound check, the first thing
    // ever to listen to it.
  }

  private updateCursor() {
    const theme = HUD_THEME[GameState.paletteMode]
    this.selectedIndex = Math.min(this.selectedIndex, this.menuItems.length - 1)
    this.menuTexts.forEach((txt, i) => txt.setColor(css(i === this.selectedIndex ? theme.text : theme.dim)))
    const c = this.layout.items[this.selectedIndex].cursor
    this.cursorGfx.clear()
    this.cursorGfx.fillStyle(theme.seg.full, 1)
    this.cursorGfx.fillTriangle(c.x - 4, c.y - 4, c.x - 4, c.y + 4, c.x, c.y)
  }

  private selectOption() {
    const option = this.menuItems[this.selectedIndex]
    sfx.menuSelect()

    if (option === 'CONTINUE') {
      this.scene.start('platformer')
    } else if (option === 'NEW GAME') {
      GameState.reset()
      this.scene.start('platformer')
    } else if (option === 'HOW TO PLAY') {
      this.viewState = 'how-to'
      this.showInfo(howToPlay(isDesktop()))
    } else if (option === 'ABOUT') {
      this.viewState = 'about'
      this.showInfo(ABOUT)
    }
  }
}
