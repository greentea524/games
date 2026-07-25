import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { loadMeta, CLASSES, SHOP_ITEMS, unlockClass, purchaseShopItem, ClassName } from '../meta'

interface MenuItem {
  type: 'class' | 'item'
  id: string
  name: string
  description: string
  cost: number
  owned: boolean
}

export class ShopScene extends Phaser.Scene {
  private items: MenuItem[] = []
  private cursor = 0
  private itemTexts: Phaser.GameObjects.Text[] = []
  private descText!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text
  private infoText!: Phaser.GameObjects.Text

  constructor() {
    super('shop')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    this.cursor = 0

    const meta = loadMeta()

    // Build menu items
    this.items = []

    for (const [key, cls] of Object.entries(CLASSES)) {
      if (cls.unlockCost > 0) {
        this.items.push({
          type: 'class', id: key, name: cls.name,
          description: cls.description, cost: cls.unlockCost,
          owned: meta.unlockedClasses.includes(key as ClassName),
        })
      }
    }

    for (const item of SHOP_ITEMS) {
      this.items.push({
        type: 'item', id: item.id, name: item.name,
        description: item.description, cost: item.cost,
        owned: meta.purchasedItems.includes(item.id),
      })
    }

    // ── Title ──
    this.add.text(GBC_WIDTH / 2, 6, 'SHOP', {
      fontFamily: FONT, fontSize: '10px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5, 0)

    this.goldText = this.add.text(GBC_WIDTH / 2, 20, `${meta.gold} GOLD`, {
      fontFamily: FONT, fontSize: '7px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5, 0)

    // ── Divider ──
    const div = this.add.graphics()
    div.fillStyle(0x506850); div.fillRect(20, 31, GBC_WIDTH - 40, 1)

    // ── Item List ──
    this.itemTexts = []
    const startY = 36
    const rowH = 14
    for (let i = 0; i < this.items.length; i++) {
      const txt = this.add.text(16, startY + i * rowH, '', {
        fontFamily: FONT, fontSize: '6px',
        color: '#e0f8cf', resolution: 2,
      }).setInteractive({ useHandCursor: true })

      txt.on('pointerdown', () => {
        this.cursor = i
        this.updateCursor()
        this.tryPurchase()
      })

      this.itemTexts.push(txt)
    }

    // ── Description Area ──
    const descDiv = this.add.graphics()
    descDiv.fillStyle(0x506850); descDiv.fillRect(20, 105, GBC_WIDTH - 40, 1)

    this.descText = this.add.text(GBC_WIDTH / 2, 109, '', {
      fontFamily: FONT, fontSize: '5px', color: '#7a9a62', resolution: 2,
      wordWrap: { width: 136 }, align: 'center',
    }).setOrigin(0.5, 0)

    // ── Feedback Text ──
    this.infoText = this.add.text(GBC_WIDTH / 2, 126, '', {
      fontFamily: FONT, fontSize: '6px', color: '#ff8888', resolution: 2,
    }).setOrigin(0.5, 0)

    // ── Back Button ──
    const backBtn = this.add.text(GBC_WIDTH / 2, 138, '\u25C0 BACK', {
      fontFamily: FONT, fontSize: '6px', color: '#86b06a', resolution: 2,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })

    backBtn.on('pointerdown', () => this.scene.start('title'))
    backBtn.on('pointerover', () => backBtn.setColor('#e0f8cf'))
    backBtn.on('pointerout', () => backBtn.setColor('#86b06a'))

    this.updateCursor()

    // ── Keyboard Input ──
    const cursors = this.input.keyboard!.createCursorKeys()
    const enterKey = this.input.keyboard!.addKey('ENTER')
    const escKey = this.input.keyboard!.addKey('ESC')

    cursors.up.on('down', () => {
      this.cursor = (this.cursor - 1 + this.items.length) % this.items.length
      this.updateCursor()
    })
    cursors.down.on('down', () => {
      this.cursor = (this.cursor + 1) % this.items.length
      this.updateCursor()
    })
    enterKey.on('down', () => this.tryPurchase())
    escKey.on('down', () => this.scene.start('title'))
  }

  private updateCursor() {
    for (let i = 0; i < this.itemTexts.length; i++) {
      const item = this.items[i]
      const costStr = item.owned ? 'OWNED' : `${item.cost}g`
      const prefix = i === this.cursor ? '\u25B6 ' : '  '
      this.itemTexts[i].setText(`${prefix}${item.name}  ${costStr}`)

      if (item.owned) {
        this.itemTexts[i].setColor('#506850')
      } else if (i === this.cursor) {
        this.itemTexts[i].setColor('#ffffff')
      } else {
        this.itemTexts[i].setColor('#e0f8cf')
      }
    }
    this.descText.setText(this.items[this.cursor]?.description ?? '')
    this.infoText.setText('')
  }

  private tryPurchase() {
    const item = this.items[this.cursor]
    if (!item || item.owned) {
      this.infoText.setText('ALREADY OWNED')
      this.infoText.setColor('#888888')
      return
    }

    let success = false
    if (item.type === 'class') {
      success = unlockClass(item.id as ClassName)
    } else {
      success = purchaseShopItem(item.id)
    }

    if (success) {
      item.owned = true
      const meta = loadMeta()
      this.goldText.setText(`${meta.gold} GOLD`)
      this.infoText.setText('PURCHASED!')
      this.infoText.setColor('#88ff88')
      this.updateCursor()
    } else {
      this.infoText.setText('NOT ENOUGH GOLD')
      this.infoText.setColor('#ff8888')
    }
  }
}
