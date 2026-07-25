import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { GameState } from '../state'
import { loadMeta, CLASSES, ClassName } from '../meta'

export class TitleScene extends Phaser.Scene {
  private classIndex = 0
  private classKeys: ClassName[] = []
  private classLabel!: Phaser.GameObjects.Text
  private classDesc!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text
  private arrowLeft!: Phaser.GameObjects.Text
  private arrowRight!: Phaser.GameObjects.Text

  constructor() {
    super('title')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    const meta = loadMeta()
    this.classKeys = meta.unlockedClasses as ClassName[]
    this.classIndex = 0

    // ── Title Block ──
    this.add.text(GBC_WIDTH / 2, 6, 'POCKET', {
      fontFamily: FONT, fontSize: '12px', color: '#e0f8cf',
      resolution: 2, align: 'center',
    }).setOrigin(0.5, 0)

    this.add.text(GBC_WIDTH / 2, 20, 'DUNGEON', {
      fontFamily: FONT, fontSize: '8px', color: '#86b06a',
      resolution: 2, align: 'center',
    }).setOrigin(0.5, 0)

    // ── Divider Line ──
    const divider = this.add.graphics()
    divider.fillStyle(0x506850); divider.fillRect(20, 33, GBC_WIDTH - 40, 1)

    // ── Gold ──
    this.goldText = this.add.text(GBC_WIDTH / 2, 38, `${meta.gold} GOLD`, {
      fontFamily: FONT, fontSize: '7px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5, 0)

    // ── Class Selector ──
    this.arrowLeft = this.add.text(14, 56, '\u25C0', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })

    this.classLabel = this.add.text(GBC_WIDTH / 2, 56, '', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(0.5, 0.5)

    this.arrowRight = this.add.text(GBC_WIDTH - 14, 56, '\u25B6', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })

    // ── Class Stats (bar style) ──
    this.statsText = this.add.text(GBC_WIDTH / 2, 68, '', {
      fontFamily: FONT, fontSize: '7px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(0.5, 0)

    // ── Class Description ──
    this.classDesc = this.add.text(GBC_WIDTH / 2, 80, '', {
      fontFamily: FONT, fontSize: '5px', color: '#7a9a62', resolution: 2,
      wordWrap: { width: 136 }, align: 'center',
    }).setOrigin(0.5, 0)

    // ── Menu Buttons ──
    const btnY = 104
    const startBtn = this.add.text(GBC_WIDTH / 2, btnY, '\u25B6 START', {
      fontFamily: FONT, fontSize: '8px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })

    const shopBtn = this.add.text(GBC_WIDTH / 2, btnY + 14, 'SHOP', {
      fontFamily: FONT, fontSize: '7px', color: '#86b06a', resolution: 2,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })

    // ── Run History ──
    const divider2 = this.add.graphics()
    divider2.fillStyle(0x506850); divider2.fillRect(20, 133, GBC_WIDTH - 40, 1)

    this.add.text(GBC_WIDTH / 2, 136, `RUNS ${meta.totalRuns}  BEST F${meta.bestFloor}  WINS ${meta.totalVictories}`, {
      fontFamily: FONT, fontSize: '4px', color: '#506850', resolution: 2,
    }).setOrigin(0.5, 0)

    this.updateClassDisplay()

    // ── Keyboard Input ──
    const cursors = this.input.keyboard!.createCursorKeys()
    const enterKey = this.input.keyboard!.addKey('ENTER')
    const shopKey = this.input.keyboard!.addKey('S')

    cursors.left.on('down', () => this.cycleClass(-1))
    cursors.right.on('down', () => this.cycleClass(1))
    enterKey.on('down', () => this.startRun())
    shopKey.on('down', () => this.scene.start('shop'))

    // ── Touch / Click Input ──
    this.arrowLeft.on('pointerdown', () => this.cycleClass(-1))
    this.arrowRight.on('pointerdown', () => this.cycleClass(1))
    startBtn.on('pointerdown', () => this.startRun())
    shopBtn.on('pointerdown', () => this.scene.start('shop'))

    // Hover highlights
    ;[startBtn, shopBtn].forEach(btn => {
      btn.on('pointerover', () => btn.setColor('#ffffff'))
      btn.on('pointerout', () => btn.setColor(btn === startBtn ? '#e0f8cf' : '#86b06a'))
    })
  }

  private cycleClass(dir: number) {
    this.classIndex = (this.classIndex + dir + this.classKeys.length) % this.classKeys.length
    this.updateClassDisplay()
  }

  private startRun() {
    GameState.selectedClass = this.classKeys[this.classIndex]
    GameState.resetRun()
    this.scene.start('dungeon')
  }

  private updateClassDisplay() {
    const key = this.classKeys[this.classIndex]
    const cls = CLASSES[key]
    this.classLabel.setText(cls.name.toUpperCase())
    this.classDesc.setText(cls.description)
    this.statsText.setText(`HP ${cls.hp}  ATK ${cls.atk}  FD ${cls.hunger}`)
  }
}
