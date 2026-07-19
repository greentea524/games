import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, PAL } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import type { BoardScene } from './BoardScene'

export class UIScene extends Phaser.Scene {
  private levelTitleText!: Phaser.GameObjects.Text
  private movesText!: Phaser.GameObjects.Text
  private objectiveTickerText!: Phaser.GameObjects.Text

  private pauseContainer!: Phaser.GameObjects.Container
  private helpContainer!: Phaser.GameObjects.Container
  private pauseOpen = false
  private helpOpen = false

  private pauseOptionsText: Phaser.GameObjects.Text[] = []
  private pauseSelectedIndex = 0

  constructor() {
    super('ui')
  }

  create() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]

    // Top Bar Pill Background for High Contrast in MONO and COLOR modes
    const topBarGfx = this.add.graphics()
    topBarGfx.fillStyle(0x0f380f, 0.85)
    topBarGfx.fillRect(0, 0, GBC_WIDTH, 14)

    // Top Bar Level Title Text with stroke contour
    this.levelTitleText = this.add.text(4, 3, `STG ${levelConfig.id}`, {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#e0f8cf',
      stroke: '#0f380f',
      strokeThickness: 1,
      resolution: 2,
    })

    this.movesText = this.add.text(GBC_WIDTH - 4, 3, 'MOVES: 0', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#e0f8cf',
      stroke: '#0f380f',
      strokeThickness: 1,
      resolution: 2,
    }).setOrigin(1, 0)

    // Bottom Bar Pill Background for Objective
    const bottomBarGfx = this.add.graphics()
    bottomBarGfx.fillStyle(0x0f380f, 0.85)
    bottomBarGfx.fillRect(0, GBC_HEIGHT - 12, GBC_WIDTH, 12)

    this.objectiveTickerText = this.add.text(GBC_WIDTH / 2, GBC_HEIGHT - 3, 'GOAL: DELIVER CRATES TO TARGETS', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#9bbc0f',
      stroke: '#0f380f',
      strokeThickness: 1,
      resolution: 2,
    }).setOrigin(0.5, 1)

    // Build Pause Menu & How-To-Play Overlay
    this.createPauseMenu()
    this.createHelpModal()
  }

  private createPauseMenu() {
    const bgGfx = this.add.graphics()
    bgGfx.fillStyle(PAL.darkest, 0.96)
    bgGfx.fillRoundedRect(-65, -45, 130, 90, 6)
    bgGfx.lineStyle(1.5, PAL.lightest, 1)
    bgGfx.strokeRoundedRect(-65, -45, 130, 90, 6)

    const titleText = this.add.text(0, -32, 'PAUSED', {
      fontFamily: FONT,
      fontSize: '9px',
      color: '#9bbc0f',
      resolution: 2,
    }).setOrigin(0.5)

    const btnResume = this.add.text(-50, -12, '1. RESUME GAME', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#e0f8cf',
      resolution: 2,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).setData('label', '1. RESUME GAME')

    const btnHelp = this.add.text(-50, 4, '2. HOW TO PLAY', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#e0f8cf',
      resolution: 2,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).setData('label', '2. HOW TO PLAY')

    const btnSkip = this.add.text(-50, 20, '3. SKIP STAGE', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#e0f8cf',
      resolution: 2,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).setData('label', '3. SKIP STAGE')

    const btnRestart = this.add.text(-50, 36, '4. RESTART STAGE', {
      fontFamily: FONT,
      fontSize: '6px',
      color: '#e0f8cf',
      resolution: 2,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).setData('label', '4. RESTART STAGE')

    btnResume.on('pointerdown', () => this.executePauseAction(0))
    btnHelp.on('pointerdown', () => this.executePauseAction(1))
    btnSkip.on('pointerdown', () => this.executePauseAction(2))
    btnRestart.on('pointerdown', () => this.executePauseAction(3))

    this.pauseContainer = this.add.container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [
      bgGfx,
      titleText,
      btnResume,
      btnHelp,
      btnSkip,
      btnRestart,
    ])
      .setDepth(3000)
      .setVisible(false)

    this.pauseOptionsText = [btnResume, btnHelp, btnSkip, btnRestart]
  }

  private createHelpModal() {
    const bgGfx = this.add.graphics()
    bgGfx.fillStyle(PAL.darkest, 0.98)
    bgGfx.fillRoundedRect(-72, -65, 144, 130, 6)
    bgGfx.lineStyle(1.5, PAL.lightest, 1)
    bgGfx.strokeRoundedRect(-72, -65, 144, 130, 6)

    const titleText = this.add.text(0, -48, 'HOW TO PLAY', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#ffcc00',
      resolution: 2,
    }).setOrigin(0.5)

    const rulesLines = [
      'MOVE: D-Pad / WASD / Swipe',
      'GOAL: Push crates [C]',
      '      onto target X marks',
      'ICE : Crates slide to wall',
      'UNDO: B Button / Z key',
      'RSET: SELECT / R key',
      '',
      'Lvls 11-50 by D.W. Skinner'
    ]

    const textObjs = rulesLines.map((line, idx) => {
      return this.add.text(-62, -32 + idx * 12, line, {
        fontFamily: FONT,
        fontSize: '5px',
        color: '#e0f8cf',
        stroke: '#0f380f',
        strokeThickness: 1,
        resolution: 2,
      }).setOrigin(0, 0.5)
    })

    const closeBtn = this.add.text(0, 46, '[ BACK TO PAUSE ]', {
      fontFamily: FONT,
      fontSize: '5px',
      color: '#9bbc0f',
      resolution: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    closeBtn.on('pointerdown', () => {
      this.helpContainer.setVisible(false)
      this.helpOpen = false
      this.pauseContainer.setVisible(true)
    })

    this.helpContainer = this.add.container(GBC_WIDTH / 2, GBC_HEIGHT / 2, [
      bgGfx,
      titleText,
      ...textObjs,
      closeBtn,
    ])
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
      this.pauseSelectedIndex = 0
      this.updatePauseSelection()
    }
  }

  private updatePauseSelection() {
    this.pauseOptionsText.forEach((txt, idx) => {
      if (idx === this.pauseSelectedIndex) {
        txt.setText('> ' + txt.getData('label'))
        txt.setColor('#ffcc00')
      } else {
        txt.setText('  ' + txt.getData('label'))
        txt.setColor('#e0f8cf')
      }
    })
  }

  private executePauseAction(idx: number) {
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
    }
  }

  update() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    this.levelTitleText.setText(`STG ${levelConfig.id}`)
    this.movesText.setText(`MOVES: ${GameState.movesCount}`)

    if (this.pauseOpen && !this.helpOpen) {
      const kb = this.input.keyboard!
      if (Phaser.Input.Keyboard.JustDown(kb.addKey('DOWN')) || Phaser.Input.Keyboard.JustDown(kb.addKey('S'))) {
        this.pauseSelectedIndex = (this.pauseSelectedIndex + 1) % this.pauseOptionsText.length
        this.updatePauseSelection()
      } else if (Phaser.Input.Keyboard.JustDown(kb.addKey('UP')) || Phaser.Input.Keyboard.JustDown(kb.addKey('W'))) {
        this.pauseSelectedIndex = (this.pauseSelectedIndex - 1 + this.pauseOptionsText.length) % this.pauseOptionsText.length
        this.updatePauseSelection()
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
