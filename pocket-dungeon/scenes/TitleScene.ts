import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { GameState } from '../state'
import { loadMeta, CLASSES, ClassName } from '../meta'
import { music, sfx, isMuted, setMuted } from '../audio'

export class TitleScene extends Phaser.Scene {
  private classIndex = 0
  private menuIndex = 0
  private classKeys: ClassName[] = []
  private classLabel!: Phaser.GameObjects.Text
  private classDesc!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text
  private arrowLeft!: Phaser.GameObjects.Text
  private arrowRight!: Phaser.GameObjects.Text
  private menuItems: Phaser.GameObjects.Text[] = []

  constructor() {
    super('title')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    const meta = loadMeta()
    this.classKeys = meta.unlockedClasses as ClassName[]
    this.classIndex = 0
    this.menuIndex = 0

    // ── Title Block ──
    this.add.text(GBC_WIDTH / 2, 6, 'POCKET', {
      fontFamily: FONT, fontSize: '12px', color: '#e0f8cf',
      resolution: 4, align: 'center',
    }).setOrigin(0.5, 0)

    this.add.text(GBC_WIDTH / 2, 20, 'DUNGEON', {
      fontFamily: FONT, fontSize: '8px', color: '#86b06a',
      resolution: 4, align: 'center',
    }).setOrigin(0.5, 0)

    // Sprite preview: hero flanked by a dungeon threat, in the title's side margins
    const heroPreview = this.add.sprite(20, 16, `hero_${GameState.paletteMode}_down`).setScale(1.4)
    const ratPreview = this.add.sprite(140, 16, `rat_${GameState.paletteMode}`).setScale(1.2)
    this.tweens.add({
      targets: heroPreview,
      y: '+=2',
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.tweens.add({
      targets: ratPreview,
      x: '+=2',
      duration: 350,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // ── Divider Line ──
    const divider = this.add.graphics()
    divider.fillStyle(0x506850); divider.fillRect(20, 33, GBC_WIDTH - 40, 1)

    // ── Gold ──
    this.goldText = this.add.text(GBC_WIDTH / 2, 38, `${meta.gold} GOLD`, {
      fontFamily: FONT, fontSize: '7px', color: '#ffd700', resolution: 4,
    }).setOrigin(0.5, 0)

    // ── Class Selector ──
    this.arrowLeft = this.add.text(14, 56, '\u25C0', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf', resolution: 4,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })

    this.classLabel = this.add.text(GBC_WIDTH / 2, 56, '', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf', resolution: 4,
    }).setOrigin(0.5, 0.5)

    this.arrowRight = this.add.text(GBC_WIDTH - 14, 56, '\u25B6', {
      fontFamily: FONT, fontSize: '10px', color: '#e0f8cf', resolution: 4,
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })

    // ── Class Stats ──
    this.statsText = this.add.text(GBC_WIDTH / 2, 68, '', {
      fontFamily: FONT, fontSize: '7px', color: '#e0f8cf', resolution: 4,
    }).setOrigin(0.5, 0)

    // ── Class Description ──
    this.classDesc = this.add.text(GBC_WIDTH / 2, 80, '', {
      fontFamily: FONT, fontSize: '5px', color: '#7a9a62', resolution: 4,
      wordWrap: { width: 136 }, align: 'center',
    }).setOrigin(0.5, 0)

    // ── Menu Buttons (navigable with UP/DOWN + ENTER) ──
    const btnY = 104
    this.menuItems = []

    const startBtn = this.add.text(GBC_WIDTH / 2, btnY, 'START', {
      fontFamily: FONT, fontSize: '8px', color: '#e0f8cf', resolution: 4,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })
    this.menuItems.push(startBtn)

    const shopBtn = this.add.text(GBC_WIDTH / 2, btnY + 14, 'SHOP', {
      fontFamily: FONT, fontSize: '8px', color: '#86b06a', resolution: 4,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })
    this.menuItems.push(shopBtn)

    // ── Run History ──
    const divider2 = this.add.graphics()
    divider2.fillStyle(0x506850); divider2.fillRect(20, 133, GBC_WIDTH - 40, 1)

    this.add.text(GBC_WIDTH / 2, 136, `RUNS ${meta.totalRuns}  BEST F${meta.bestFloor}  WINS ${meta.totalVictories}`, {
      fontFamily: FONT, fontSize: '4px', color: '#506850', resolution: 4,
    }).setOrigin(0.5, 0)

    this.updateClassDisplay()
    this.updateMenuCursor()

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
    mKey.on('down', () => {
      setMuted(!isMuted())
      if (!isMuted()) sfx.menuSelect()
    })

    // ── Touch / Click Input ──
    this.arrowLeft.on('pointerdown', () => this.cycleClass(-1))
    this.arrowRight.on('pointerdown', () => this.cycleClass(1))
    startBtn.on('pointerdown', () => { sfx.menuSelect(); this.startRun() })
    shopBtn.on('pointerdown', () => { sfx.menuSelect(); this.scene.start('shop') })
  }

  private cycleClass(dir: number) {
    sfx.menuMove()
    this.classIndex = (this.classIndex + dir + this.classKeys.length) % this.classKeys.length
    this.updateClassDisplay()
  }

  private confirmMenu() {
    if (this.menuIndex === 0) this.startRun()
    else if (this.menuIndex === 1) this.scene.start('shop')
  }

  private startRun() {
    GameState.selectedClass = this.classKeys[this.classIndex]
    GameState.resetRun()
    this.scene.start('dungeon')
  }

  private updateMenuCursor() {
    const labels = ['START', 'SHOP']
    for (let i = 0; i < this.menuItems.length; i++) {
      if (i === this.menuIndex) {
        this.menuItems[i].setText(`\u25B6 ${labels[i]}`)
        this.menuItems[i].setColor('#ffffff')
      } else {
        this.menuItems[i].setText(`  ${labels[i]}`)
        this.menuItems[i].setColor('#86b06a')
      }
    }
  }

  private updateClassDisplay() {
    const key = this.classKeys[this.classIndex]
    const cls = CLASSES[key]
    this.classLabel.setText(cls.name.toUpperCase())
    this.classDesc.setText(cls.description)
    this.statsText.setText(`HP ${cls.hp}  ATK ${cls.atk}  FD ${cls.hunger}`)
  }
}
