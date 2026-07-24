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

  constructor() {
    super('title')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    const meta = loadMeta()
    this.classKeys = meta.unlockedClasses as ClassName[]
    this.classIndex = 0

    // Title
    this.add.text(GBC_WIDTH / 2, 16, 'POCKET\nDUNGEON', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf',
      resolution: 2, align: 'center',
    }).setOrigin(0.5)

    // Gold display
    this.goldText = this.add.text(GBC_WIDTH / 2, 42, `GOLD: ${meta.gold}`, {
      fontFamily: FONT, fontSize: '6px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5)

    // Class selector
    this.add.text(GBC_WIDTH / 2, 56, '< SELECT CLASS >', {
      fontFamily: FONT, fontSize: '5px', color: '#86b06a', resolution: 2,
    }).setOrigin(0.5)

    this.classLabel = this.add.text(GBC_WIDTH / 2, 68, '', {
      fontFamily: FONT, fontSize: '8px', color: '#e0f8cf', resolution: 2,
    }).setOrigin(0.5)

    this.classDesc = this.add.text(GBC_WIDTH / 2, 82, '', {
      fontFamily: FONT, fontSize: '4px', color: '#86b06a', resolution: 2,
      wordWrap: { width: 140 }, align: 'center',
    }).setOrigin(0.5, 0)

    // Stats
    this.statsText = this.add.text(GBC_WIDTH / 2, 102, '', {
      fontFamily: FONT, fontSize: '5px', color: '#86b06a', resolution: 2,
    }).setOrigin(0.5)

    // Controls hint
    this.add.text(GBC_WIDTH / 2, 118, 'LEFT/RIGHT: CLASS\nENTER: START\nS: SHOP', {
      fontFamily: FONT, fontSize: '4px', color: '#506850', resolution: 2,
      align: 'center',
    }).setOrigin(0.5)

    // Run stats
    this.add.text(GBC_WIDTH / 2, 136, `RUNS:${meta.totalRuns} BEST:F${meta.bestFloor} WINS:${meta.totalVictories}`, {
      fontFamily: FONT, fontSize: '4px', color: '#506850', resolution: 2,
    }).setOrigin(0.5)

    this.updateClassDisplay()

    // Key listeners
    const cursors = this.input.keyboard!.createCursorKeys()
    const enterKey = this.input.keyboard!.addKey('ENTER')
    const shopKey = this.input.keyboard!.addKey('S')

    cursors.left.on('down', () => {
      this.classIndex = (this.classIndex - 1 + this.classKeys.length) % this.classKeys.length
      this.updateClassDisplay()
    })
    cursors.right.on('down', () => {
      this.classIndex = (this.classIndex + 1) % this.classKeys.length
      this.updateClassDisplay()
    })
    enterKey.on('down', () => {
      GameState.selectedClass = this.classKeys[this.classIndex]
      GameState.resetRun()
      this.scene.start('dungeon')
    })
    shopKey.on('down', () => {
      this.scene.start('shop')
    })
  }

  private updateClassDisplay() {
    const key = this.classKeys[this.classIndex]
    const cls = CLASSES[key]
    this.classLabel.setText(cls.name.toUpperCase())
    this.classDesc.setText(cls.description)
    this.statsText.setText(`HP:${cls.hp} ATK:${cls.atk} FOOD:${cls.hunger}`)
  }
}
