import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import { SaveSystem } from '../save'
import type { BoardScene } from './BoardScene'
import { isMuted, setMuted } from '../audio'
import { BAR_HEIGHT, CELL, HUD_THEME, css, layout, type HudValues } from '../hud'

/** The pause panel's sound row, numbered with the rest; its state is live (#143). */
const soundLabel = () => `6. SOUND: ${isMuted() ? 'OFF' : 'ON'}`
/**
 * The pause panel's hint row (#164). The hint was on the H key and nowhere
 * else, so a phone could not ask for one at all.
 */
const hintLabel = (on: boolean) => `7. HINT: ${on ? 'ON' : 'OFF'}`

const ROW_LABELS = ['1. RESUME GAME', '2. HOW TO PLAY', '3. SKIP STAGE', '4. RESTART LVL', '5. QUIT TO MAP']
const PANEL = { width: 150, height: 114, rowGap: 12 }
const HELP = { width: 144, height: 130 }

/**
 * The HUD and the pause panel, laid out for 240×216 (#164).
 *
 * Solid bars in the warehouse's dark, text at the font's native 8 pixels with
 * no stroke, placed by `hud.ts` — the same boxes `hud_test.ts` checks. The
 * colours follow the palette in use, panels included.
 */
export class UIScene extends Phaser.Scene {
  private texts = new Map<string, Phaser.GameObjects.Text>()
  private bars!: Phaser.GameObjects.Graphics
  private panelBg!: Phaser.GameObjects.Graphics
  private helpBg!: Phaser.GameObjects.Graphics
  private panelTitle!: Phaser.GameObjects.Text
  private helpTexts: Phaser.GameObjects.Text[] = []
  private themed: 'gbc' | 'dmg' | null = null

  private pauseContainer!: Phaser.GameObjects.Container
  private helpContainer!: Phaser.GameObjects.Container
  private pauseOpen = false
  private helpOpen = false

  private pauseOptionsText: Phaser.GameObjects.Text[] = []
  private pauseSelectedIndex = 0

  constructor() {
    super('ui')
  }

  private label(x: number, y: number, text: string, size = CELL) {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff' })
  }

  private values(): HudValues {
    const level = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    const best = SaveSystem.getLevelData(level.id).bestMoves
    return {
      stage: level.id,
      moves: GameState.movesCount,
      par: level.parMoves,
      // 999 is the save's "never", from before it stored 0 for that.
      best: best > 0 && best < 999 ? best : 0,
      desktop: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    }
  }

  create() {
    this.pauseOpen = false
    this.helpOpen = false
    this.themed = null
    this.texts.clear()
    this.bars = this.add.graphics()
    // Every box the layout can produce, made once; `draw` places and fills them.
    for (const name of ['stage', 'moves', 'best', 'controls']) this.texts.set(name, this.label(0, 0, ''))

    this.createPauseMenu()
    this.createHelpModal()
    this.draw()

    // Level Intro Flash
    const values = this.values()
    const theme = HUD_THEME[GameState.paletteMode]
    const introContainer = this.add.container(GBC_WIDTH / 2, GBC_HEIGHT / 2).setDepth(100)
    const introBg = this.add.graphics()
    introBg.fillStyle(theme.bar, 0.92)
    introBg.fillRoundedRect(-56, -17, 112, 34, 4)
    introBg.lineStyle(1, theme.edge, 1)
    introBg.strokeRoundedRect(-56, -17, 112, 34, 4)
    const stageTitle = this.label(0, -11, `STAGE ${values.stage}`).setOrigin(0.5, 0).setColor(css(theme.accent))
    const stageBest = this.label(0, 3, values.best ? `BEST: ${values.best}` : `PAR: ${values.par}`)
      .setOrigin(0.5, 0)
      .setColor(css(theme.text))
    introContainer.add([introBg, stageTitle, stageBest])
    this.tweens.add({
      targets: introContainer,
      alpha: 0,
      delay: 1500,
      duration: 500,
      onComplete: () => introContainer.destroy(),
    })
  }

  /** Places the HUD's text, and recolours everything when the palette changes. */
  private draw() {
    const mode = GameState.paletteMode
    const theme = HUD_THEME[mode]
    const boxes = layout(this.values(), GBC_WIDTH, GBC_HEIGHT)
    for (const [name, text] of this.texts) {
      const box = boxes.find((b) => b.name === name)
      text.setVisible(!!box)
      if (!box) continue
      text.setPosition(box.x, box.y)
      if (text.text !== box.text) text.setText(box.text)
    }
    if (this.themed === mode) return
    this.themed = mode

    this.bars.clear()
    this.bars.fillStyle(theme.bar, 1)
    this.bars.fillRect(0, 0, GBC_WIDTH, BAR_HEIGHT)
    this.bars.fillRect(0, GBC_HEIGHT - BAR_HEIGHT, GBC_WIDTH, BAR_HEIGHT)
    this.bars.fillStyle(theme.edge, 1)
    this.bars.fillRect(0, BAR_HEIGHT - 1, GBC_WIDTH, 1)
    this.bars.fillRect(0, GBC_HEIGHT - BAR_HEIGHT, GBC_WIDTH, 1)
    this.texts.get('stage')!.setColor(css(theme.text))
    this.texts.get('moves')!.setColor(css(theme.text))
    this.texts.get('best')!.setColor(css(theme.accent))
    this.texts.get('controls')!.setColor(css(theme.dim))

    const panel = (g: Phaser.GameObjects.Graphics, size: { width: number; height: number }) => {
      g.clear()
      g.fillStyle(theme.bar, 1)
      g.fillRoundedRect(-size.width / 2, -size.height / 2, size.width, size.height, 6)
      g.lineStyle(1, theme.text, 1)
      g.strokeRoundedRect(-size.width / 2, -size.height / 2, size.width, size.height, 6)
    }
    panel(this.panelBg, PANEL)
    panel(this.helpBg, HELP)
    this.panelTitle.setColor(css(theme.accent))
    this.helpTexts.forEach((t, i) => t.setColor(css(i === 0 || i === this.helpTexts.length - 1 ? theme.accent : theme.text)))
    this.updatePauseSelection()
  }

  private createPauseMenu() {
    this.panelBg = this.add.graphics()
    const top = -PANEL.height / 2
    this.panelTitle = this.label(0, top + 6, 'PAUSED', CELL * 2).setOrigin(0.5, 0)

    // Seven rows. "> 1. RESUME GAME" is 16 characters, 128 pixels, and starts
    // 66 left of centre, inside the 150-pixel panel.
    const labels = [...ROW_LABELS, soundLabel(), hintLabel(false)]
    this.pauseOptionsText = labels.map((text, i) =>
      this.label(-66, top + 28 + i * PANEL.rowGap, text)
        .setInteractive({ useHandCursor: true })
        .setData('label', text)
        .on('pointerdown', () => this.executePauseAction(i)),
    )

    this.pauseContainer = this.add
      .container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [this.panelBg, this.panelTitle, ...this.pauseOptionsText])
      .setDepth(3000)
      .setVisible(false)
  }

  private createHelpModal() {
    this.helpBg = this.add.graphics()
    const top = -HELP.height / 2

    // Sixteen characters a line: the text column inside this panel is 134
    // pixels. Each control is named for the keyboard and for the shell.
    const rulesLines = [
      'MOVE: D-Pad/WASD',
      'GOAL: Push all',
      '  crates onto X',
      'ICE: Crates fly',
      'UNDO: B or Z',
      'RESET: SELECT/R',
      'HINT: Pause/H',
      'SOUND: Pause/M',
      'Lvls 11-50 by',
      'D.W. Skinner',
    ]
    const title = this.label(0, top + 8, 'HOW TO PLAY').setOrigin(0.5, 0)
    const lines = rulesLines.map((line, idx) => this.label(-62, top + 22 + idx * 9, line))
    const closeBtn = this.label(0, top + HELP.height - 16, '[ BACK TO PAUSE ]')
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true })
    closeBtn.on('pointerdown', () => {
      this.helpContainer.setVisible(false)
      this.helpOpen = false
      this.pauseContainer.setVisible(true)
    })
    this.helpTexts = [title, ...lines, closeBtn]

    this.helpContainer = this.add
      .container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [this.helpBg, ...this.helpTexts])
      .setDepth(3500)
      .setVisible(false)
  }

  isPauseOpen() {
    return this.pauseOpen || this.helpOpen
  }

  togglePauseMenu() {
    if (this.helpOpen) {
      this.helpContainer.setVisible(false)
      this.helpOpen = false
    }
    this.pauseOpen = !this.pauseOpen
    this.pauseContainer.setVisible(this.pauseOpen)
    GameState.uiBlocking = this.pauseOpen
    
    if (this.pauseOpen) {
      // M on the main menu can change the state while this panel is built and
      // hidden, so the sound row is relabelled each time it opens (#143).
      this.pauseOptionsText[5].setData('label', soundLabel())
      const board = this.scene.get('board') as BoardScene
      this.pauseOptionsText[6].setData('label', hintLabel(!!board?.hintOn()))
      this.pauseSelectedIndex = 0
      this.updatePauseSelection()
    }
  }

  private updatePauseSelection(playAudio = false) {
    if (playAudio) {
      import('../audio').then(a => a.playMenuSelect())
    }
    const theme = HUD_THEME[GameState.paletteMode]
    this.pauseOptionsText.forEach((txt, idx) => {
      const on = idx === this.pauseSelectedIndex
      txt.setText((on ? '> ' : '  ') + txt.getData('label'))
      txt.setColor(css(on ? theme.accent : theme.text))
    })
  }

  private executePauseAction(idx: number) {
    import('../audio').then(a => a.playMenuConfirm())
    if (idx === 0) { // Resume
      this.togglePauseMenu()
    } else if (idx === 1) { // Help
      this.pauseContainer.setVisible(false)
      this.helpContainer.setVisible(true)
      this.helpOpen = true
    } else if (idx === 2) { // Skip Stage
      this.togglePauseMenu()
      const boardScene = this.scene.get('board') as BoardScene
      if (boardScene) boardScene.skipLevel()
    } else if (idx === 3) { // Restart
      this.togglePauseMenu()
      const boardScene = this.scene.get('board') as BoardScene
      if (boardScene) boardScene.resetLevel()
    } else if (idx === 4) { // Quit to Map
      this.togglePauseMenu()
      this.scene.stop('board')
      this.scene.start('levelselect')
    } else if (idx === 5) { // Sound
      setMuted(!isMuted())
      const btn = this.pauseOptionsText[5]
      btn.setData('label', soundLabel())
      this.pauseSelectedIndex = 5
      this.updatePauseSelection()
    } else if (idx === 6) { // Hint
      // Closed first: the hint is an arrow on the board, and is not shown
      // while a panel holds the game.
      this.togglePauseMenu()
      const boardScene = this.scene.get('board') as BoardScene
      if (boardScene) boardScene.toggleHint()
    }
  }

  update() {
    this.draw()

    if (this.pauseOpen && !this.helpOpen) {
      const kb = this.input.keyboard!
      if (Phaser.Input.Keyboard.JustDown(kb.addKey('DOWN')) || Phaser.Input.Keyboard.JustDown(kb.addKey('S'))) {
        this.pauseSelectedIndex = (this.pauseSelectedIndex + 1) % this.pauseOptionsText.length
        this.updatePauseSelection(true)
      } else if (Phaser.Input.Keyboard.JustDown(kb.addKey('UP')) || Phaser.Input.Keyboard.JustDown(kb.addKey('W'))) {
        this.pauseSelectedIndex = (this.pauseSelectedIndex - 1 + this.pauseOptionsText.length) % this.pauseOptionsText.length
        this.updatePauseSelection(true)
      } else if (
        Phaser.Input.Keyboard.JustDown(kb.addKey('SPACE')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('ENTER')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('Z')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('X'))
      ) {
        this.executePauseAction(this.pauseSelectedIndex)
      }
    } else if (this.helpOpen) {
      const kb = this.input.keyboard!
      if (
        Phaser.Input.Keyboard.JustDown(kb.addKey('SPACE')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('ENTER')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('Z')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('X')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('ESC')) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey('B'))
      ) {
        this.helpContainer.setVisible(false)
        this.helpOpen = false
        this.pauseContainer.setVisible(true)
      }
    }
  }
}
