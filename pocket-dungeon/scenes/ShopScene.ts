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

    // Classes
    for (const [key, cls] of Object.entries(CLASSES)) {
      if (cls.unlockCost > 0) {
        this.items.push({
          type: 'class', id: key, name: cls.name,
          description: cls.description, cost: cls.unlockCost,
          owned: meta.unlockedClasses.includes(key as ClassName),
        })
      }
    }

    // Shop items
    for (const item of SHOP_ITEMS) {
      this.items.push({
        type: 'item', id: item.id, name: item.name,
        description: item.description, cost: item.cost,
        owned: meta.purchasedItems.includes(item.id),
      })
    }

    // Title
    this.add.text(GBC_WIDTH / 2, 8, 'META SHOP', {
      fontFamily: FONT, fontSize: '8px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5)

    this.goldText = this.add.text(GBC_WIDTH / 2, 20, `GOLD: ${meta.gold}`, {
      fontFamily: FONT, fontSize: '6px', color: '#ffd700', resolution: 2,
    }).setOrigin(0.5)

    // Render item list
    this.itemTexts = []
    const startY = 34
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]
      const label = item.owned ? `${item.name} [OWNED]` : `${item.name} (${item.cost}g)`
      const txt = this.add.text(12, startY + i * 12, label, {
        fontFamily: FONT, fontSize: '5px',
        color: item.owned ? '#506850' : '#e0f8cf',
        resolution: 2,
      })
      this.itemTexts.push(txt)
    }

    // Description area
    this.descText = this.add.text(GBC_WIDTH / 2, 106, '', {
      fontFamily: FONT, fontSize: '4px', color: '#86b06a', resolution: 2,
      wordWrap: { width: 140 }, align: 'center',
    }).setOrigin(0.5, 0)

    // Info
    this.infoText = this.add.text(GBC_WIDTH / 2, 126, '', {
      fontFamily: FONT, fontSize: '5px', color: '#ff8888', resolution: 2,
    }).setOrigin(0.5)

    // Controls
    this.add.text(GBC_WIDTH / 2, 138, 'UP/DOWN:NAV  ENTER:BUY  ESC:BACK', {
      fontFamily: FONT, fontSize: '3px', color: '#506850', resolution: 2,
    }).setOrigin(0.5)

    this.updateCursor()

    // Input
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
      if (i === this.cursor) {
        this.itemTexts[i].setText(`> ${item.owned ? `${item.name} [OWNED]` : `${item.name} (${item.cost}g)`}`)
        this.itemTexts[i].setColor(item.owned ? '#506850' : '#ffffff')
      } else {
        this.itemTexts[i].setText(`  ${item.owned ? `${item.name} [OWNED]` : `${item.name} (${item.cost}g)`}`)
        this.itemTexts[i].setColor(item.owned ? '#506850' : '#e0f8cf')
      }
    }
    this.descText.setText(this.items[this.cursor]?.description ?? '')
    this.infoText.setText('')
  }

  private tryPurchase() {
    const item = this.items[this.cursor]
    if (!item || item.owned) {
      this.infoText.setText('ALREADY OWNED')
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
      this.goldText.setText(`GOLD: ${meta.gold}`)
      this.infoText.setText('PURCHASED!')
      this.infoText.setColor('#88ff88')
      this.updateCursor()
    } else {
      this.infoText.setText('NOT ENOUGH GOLD')
      this.infoText.setColor('#ff8888')
    }
  }
}
