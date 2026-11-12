import Phaser from 'phaser'
import { GBC_WIDTH, FONT } from '../constants'
import { GameState } from '../state'
import { loadMeta, CLASSES } from '../meta'
import type { ClassName } from '../meta'
import { music, sfx, isMuted, setMuted } from '../audio'
import { CELL, THEME, TITLE, css, type Theme } from '../theme'

type Role = keyof Omit<Theme, 'bg' | 'rule'>

/**
 * The title, laid out for 240×216 in the HUD's font and colours (#159).
 *
 * Every line is 8 pixels or a whole multiple of it, on whole pixels, with no
 * stroke. Each text is kept with the role it plays, so the palette toggle can
 * recolour the screen in place.
 */
export class TitleScene extends Phaser.Scene {
  private classIndex = 0
  private menuIndex = 0
  private classKeys: ClassName[] = []
  private classLabel!: Phaser.GameObjects.Text
  private classDesc!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private arrowLeft!: Phaser.GameObjects.Text
  private arrowRight!: Phaser.GameObjects.Text
  private menuItems: Phaser.GameObjects.Text[] = []
  private heroPreview!: Phaser.GameObjects.Sprite
  private ratPreview!: Phaser.GameObjects.Sprite
  private inked: { text: Phaser.GameObjects.Text; role: Role }[] = []
  private rules: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('title')
  }

  /** A line of text, remembered with its role so the palette can change. */
  private label(x: number, y: number, text: string, role: Role, size = CELL) {
    const t = this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, align: 'center' })
    this.inked.push({ text: t, role })
    return t
  }

  create() {
    const meta = loadMeta()
    this.classKeys = meta.unlockedClasses as ClassName[]
    this.classIndex = 0
    this.menuIndex = 0
    this.inked = []
    this.rules = []
    const mid = GBC_WIDTH / 2

    // ── Title Block ──
    this.label(mid, 10, 'POCKET', 'text', CELL * 2).setOrigin(0.5, 0)
    this.label(mid, 30, 'DUNGEON', 'dim', CELL * 2).setOrigin(0.5, 0)

    // The hero and a dungeon threat, either side of the name. Held as fields
    // so `reloadPalette` can retexture them. Twice their size: a whole
    // multiple, so their pixels stay square.
    this.heroPreview = this.add.sprite(34, 28, `hero_${GameState.paletteMode}_down`).setScale(2)
    this.ratPreview = this.add.sprite(GBC_WIDTH - 34, 28, `rat_${GameState.paletteMode}`).setScale(2)
    this.tweens.add({
      targets: this.heroPreview, y: '+=2', duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: this.ratPreview, x: '+=2', duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })

    this.rules.push(this.add.rectangle(20, 54, GBC_WIDTH - 40, 1, 0).setOrigin(0, 0))

    // ── Gold ── drawn once per visit to this scene, never updated in place.
    this.label(mid, 62, `${meta.gold} GOLD`, 'gold').setOrigin(0.5, 0)

    // ── Class Selector ──
    this.arrowLeft = this.label(24, 82, '◀', 'text').setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
    this.classLabel = this.label(mid, 82, '', 'text').setOrigin(0.5, 0.5)
    this.arrowRight = this.label(GBC_WIDTH - 24, 82, '▶', 'text')
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
    this.statsText = this.label(mid, 96, '', 'text').setOrigin(0.5, 0)
    this.classDesc = this.label(mid, TITLE.descY, '', 'dim')
      .setOrigin(0.5, 0)
      .setWordWrapWidth(TITLE.descChars * CELL)
      .setLineSpacing(2)

    // ── Menu (UP/DOWN + ENTER, or a tap) ──
    // SOUND is the only mute a phone can reach between runs (#143): the shell
    // has no M key. Its label is the live state.
    this.menuItems = [0, 1, 2].map((i) =>
      this.label(mid, TITLE.menuY + i * TITLE.menuGap, '', 'dim')
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true }),
    )
    const [startBtn, shopBtn, soundBtn] = this.menuItems

    // ── Run History ──
    this.rules.push(this.add.rectangle(20, 190, GBC_WIDTH - 40, 1, 0).setOrigin(0, 0))
    this.label(mid, TITLE.recordY, `RUNS ${meta.totalRuns} WIN ${meta.totalVictories} BEST ${meta.bestFloor}`, 'dim')
      .setOrigin(0.5, 0)

    this.updateClassDisplay()
    this.applyTheme()

    music.play('title')

    // ── Keyboard Input ──
    const cursors = this.input.keyboard!.createCursorKeys()
    const enterKey = this.input.keyboard!.addKey('ENTER')
    const zKey = this.input.keyboard!.addKey('Z')

    cursors.left.on('down', () => this.cycleClass(-1))
    cursors.right.on('down', () => this.cycleClass(1))
    cursors.up.on('down', () => {
      sfx.menuMove()
      this.menuIndex = (this.menuIndex - 1 + this.menuItems.length) % this.menuItems.length
      this.updateMenuCursor()
    })
    cursors.down.on('down', () => {
      sfx.menuMove()
      this.menuIndex = (this.menuIndex + 1) % this.menuItems.length
      this.updateMenuCursor()
    })
    enterKey.on('down', () => {
      sfx.menuSelect()
      this.confirmMenu()
    })
    zKey.on('down', () => {
      sfx.menuSelect()
      this.confirmMenu()
    })

    const mKey = this.input.keyboard!.addKey('M')
    // Through the menu's own toggle, so the SOUND row's label follows M too.
    mKey.on('down', () => this.toggleSound())

    // ── Touch / Click Input ──
    this.arrowLeft.on('pointerdown', () => this.cycleClass(-1))
    this.arrowRight.on('pointerdown', () => this.cycleClass(1))
    startBtn.on('pointerdown', () => { sfx.menuSelect(); this.startRun() })
    shopBtn.on('pointerdown', () => { sfx.menuSelect(); this.scene.start('shop') })
    soundBtn.on('pointerdown', () => {
      this.menuIndex = 2
      this.toggleSound()
    })
  }

  private cycleClass(dir: number) {
    sfx.menuMove()
    this.classIndex = (this.classIndex + dir + this.classKeys.length) % this.classKeys.length
    this.updateClassDisplay()
  }

  private confirmMenu() {
    if (this.menuIndex === 0) this.startRun()
    else if (this.menuIndex === 1) this.scene.start('shop')
    else if (this.menuIndex === 2) this.toggleSound()
  }

  private toggleSound() {
    setMuted(!isMuted())
    if (!isMuted()) sfx.menuSelect()
    this.updateMenuCursor()
  }

  private startRun() {
    GameState.selectedClass = this.classKeys[this.classIndex]
    GameState.resetRun()
    this.scene.start('dungeon')
  }

  private updateMenuCursor() {
    const theme = THEME[GameState.paletteMode]
    const labels = ['START', 'SHOP', `SOUND: ${isMuted() ? 'OFF' : 'ON'}`]
    for (let i = 0; i < this.menuItems.length; i++) {
      const on = i === this.menuIndex
      this.menuItems[i].setText(`${on ? '▶' : ' '} ${labels[i]}`)
      this.menuItems[i].setColor(css(on ? theme.text : theme.dim))
    }
  }

  /** Colours everything for the palette in use. */
  private applyTheme() {
    const theme = THEME[GameState.paletteMode]
    this.cameras.main.setBackgroundColor(theme.bg)
    for (const { text, role } of this.inked) text.setColor(css(theme[role]))
    for (const rule of this.rules) rule.setFillStyle(theme.rule, 1)
    this.updateMenuCursor()
  }

  /**
   * Redraws the screen for the palette the player just chose (#134, #159).
   *
   * The title is the one place this game shows sprites outside the dungeon,
   * so without it a toggle pressed here does nothing visible and reads as a
   * dead control. In place, not by restarting: `create` resets the class the
   * player had scrolled to.
   */
  reloadPalette() {
    this.heroPreview?.setTexture(`hero_${GameState.paletteMode}_down`)
    this.ratPreview?.setTexture(`rat_${GameState.paletteMode}`)
    this.applyTheme()
  }

  private updateClassDisplay() {
    const key = this.classKeys[this.classIndex]
    const cls = CLASSES[key]
    this.classLabel.setText(cls.name.toUpperCase())
    this.classDesc.setText(cls.description)
    this.statsText.setText(`HP ${cls.hp} ATK ${cls.atk} FD ${cls.hunger}`)
  }
}
