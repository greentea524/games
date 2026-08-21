import Phaser from 'phaser'
import { GBC_WIDTH, FONT } from '../constants'
import {
  loadMeta, CLASSES, SHOP_ITEMS, unlockClass, purchaseShopItem,
  keepsakeCost, buyKeepsake,
} from '../meta'
import type { ClassName } from '../meta'
import { ITEMS } from '../items'
import { sfx } from '../audio'

interface MenuItem {
  type: 'class' | 'item' | 'keepsake'
  id: string
  name: string
  description: string
  cost: number
  owned: boolean
}

/**
 * Rows the list can show at once.
 *
 * Measured, not chosen: rows start at y=37 and step 12, and the description
 * divider sits at y=97, so the sixth row would be drawn *on* the divider with
 * its text running into the description underneath. Before #86 the shop held
 * exactly five entries — two classes and three unlocks — so it was already
 * full to the pixel and could not have grown by one without this.
 */
const MAX_VISIBLE = 5

export class ShopScene extends Phaser.Scene {
  private items: MenuItem[] = []
  private cursor = 0
  /** Index of the entry drawn in the top visible row. */
  private first = 0
  private moreAbove!: Phaser.GameObjects.Text
  private moreBelow!: Phaser.GameObjects.Text
  private itemTexts: Phaser.GameObjects.Text[] = []
  private costTexts: Phaser.GameObjects.Text[] = []
  private descText!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text
  private infoText!: Phaser.GameObjects.Text

  constructor() {
    super('shop')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    this.cursor = 0
    this.first = 0

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

    // Gear the last run ended holding (#86). `owned` marks the one already
    // being held rather than something permanently bought, so the row reads
    // KEPT and buying a different one is still allowed — see `buyKeepsake`.
    for (const id of meta.recovered) {
      const def = ITEMS[id]
      if (!def) continue
      this.items.push({
        type: 'keepsake', id, name: def.name,
        description: `From your last run. ${def.description}`,
        cost: keepsakeCost(def),
        owned: meta.keepsake === id,
      })
    }

    // ── Title ──
    this.add.text(GBC_WIDTH / 2, 1, 'SHOP', {
      fontFamily: FONT, fontSize: '16px', color: '#ffd700', resolution: 4,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0)

    this.goldText = this.add.text(GBC_WIDTH / 2, 21, `${meta.gold} GOLD`, {
      fontFamily: FONT, fontSize: '8px', color: '#ffd700', resolution: 4,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0)

    // ── Divider ──
    const div = this.add.graphics()
    div.fillStyle(0x506850); div.fillRect(20, 33, GBC_WIDTH - 40, 1)

    // ── Item List ──
    // Name and cost are separate columns: at 8px (monospaced, 8px/char) a
    // single combined string would run past the 160px screen edge.
    this.itemTexts = []
    this.costTexts = []
    const startY = 37
    const rowH = 12
    // One text pair per *visible* row, not per entry. The row's meaning moves
    // with the window, so the click handler reads `this.first` at click time
    // rather than closing over an entry index that would go stale the moment
    // the list scrolled.
    const rows = Math.min(this.items.length, MAX_VISIBLE)
    for (let i = 0; i < rows; i++) {
      const rowStyle = {
        fontFamily: FONT, fontSize: '8px',
        color: '#e0f8cf', resolution: 4,
        stroke: '#000000', strokeThickness: 2,
      }
      const txt = this.add.text(4, startY + i * rowH, '', rowStyle)
        .setInteractive({ useHandCursor: true })
      const cost = this.add.text(GBC_WIDTH - 4, startY + i * rowH, '', rowStyle)
        .setOrigin(1, 0)

      txt.on('pointerdown', () => {
        const index = this.first + i
        if (index >= this.items.length) return
        this.cursor = index
        this.updateCursor()
        this.tryPurchase()
      })

      this.itemTexts.push(txt)
      this.costTexts.push(cost)
    }

    // Centred *on the dividers*, which is the only clear space on this screen.
    // They were first put in the right-hand gutter at the top and bottom of
    // the list, and the screenshot showed why that fails: the rows are packed
    // to the pixel between the dividers, so the lower marker landed on top of
    // the fifth row's cost and the upper one on the gold line. Names are left
    // aligned and costs right aligned, so the middle of a divider is the one
    // place nothing else can reach.
    const markerStyle = {
      fontFamily: FONT, fontSize: '8px', color: '#ffd700', resolution: 4,
      stroke: '#000000', strokeThickness: 2,
    }
    this.moreAbove = this.add.text(GBC_WIDTH / 2, 33, '', markerStyle).setOrigin(0.5, 0.5)
    this.moreBelow = this.add.text(GBC_WIDTH / 2, 97, '', markerStyle).setOrigin(0.5, 0.5)

    // ── Description Area ──
    const descDiv = this.add.graphics()
    descDiv.fillStyle(0x506850); descDiv.fillRect(20, 97, GBC_WIDTH - 40, 1)

    this.descText = this.add.text(GBC_WIDTH / 2, 101, '', {
      fontFamily: FONT, fontSize: '8px', color: '#b8d8a0', resolution: 4,
      stroke: '#000000', strokeThickness: 2,
      wordWrap: { width: 150 }, align: 'center',
    }).setOrigin(0.5, 0)

    // ── Feedback Text ──
    this.infoText = this.add.text(GBC_WIDTH / 2, 121, '', {
      fontFamily: FONT, fontSize: '8px', color: '#ff8888', resolution: 4,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0)

    // ── Back Button ──
    const backBtn = this.add.text(GBC_WIDTH / 2, 132, '\u25C0 BACK', {
      fontFamily: FONT, fontSize: '8px', color: '#86b06a', resolution: 4,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setInteractive({ useHandCursor: true })

    backBtn.on('pointerdown', () => { sfx.menuCancel(); this.scene.start('title') })
    backBtn.on('pointerover', () => backBtn.setColor('#e0f8cf'))
    backBtn.on('pointerout', () => backBtn.setColor('#86b06a'))

    this.updateCursor()

    // ── Keyboard Input ──
    const cursors = this.input.keyboard!.createCursorKeys()
    const enterKey = this.input.keyboard!.addKey('ENTER')
    const escKey = this.input.keyboard!.addKey('ESC')

    cursors.up.on('down', () => {
      sfx.menuMove()
      this.cursor = (this.cursor - 1 + this.items.length) % this.items.length
      this.updateCursor()
    })
    cursors.down.on('down', () => {
      sfx.menuMove()
      this.cursor = (this.cursor + 1) % this.items.length
      this.updateCursor()
    })
    enterKey.on('down', () => this.tryPurchase())
    escKey.on('down', () => { sfx.menuCancel(); this.scene.start('title') })

    const zKey = this.input.keyboard!.addKey('Z')
    const xKey = this.input.keyboard!.addKey('X')
    zKey.on('down', () => this.tryPurchase())
    xKey.on('down', () => { sfx.menuCancel(); this.scene.start('title') })
  }

  private updateCursor() {
    // Scroll only far enough to bring the cursor back into view, so the list
    // stays put while moving within the window.
    const rows = this.itemTexts.length
    if (this.cursor < this.first) this.first = this.cursor
    else if (this.cursor >= this.first + rows) this.first = this.cursor - rows + 1
    this.first = Math.max(0, Math.min(this.first, this.items.length - rows))

    for (let i = 0; i < rows; i++) {
      const index = this.first + i
      const item = this.items[index]
      if (!item) {
        this.itemTexts[i].setText('')
        this.costTexts[i].setText('')
        continue
      }
      // A recovered item is *held*, not permanently owned — the row has to
      // say which, or "OWNED" on a Flame Brand would read as "you have this
      // from now on" when it lasts exactly one run.
      const costStr = item.owned
        ? item.type === 'keepsake' ? 'KEPT' : 'OWNED'
        : `${item.cost}g`
      const prefix = index === this.cursor ? '\u25B6 ' : '  '
      this.itemTexts[i].setText(`${prefix}${item.name}`)
      this.costTexts[i].setText(costStr)

      const color = item.owned ? '#7e9a7c' : index === this.cursor ? '#ffffff' : '#e0f8cf'
      this.itemTexts[i].setColor(color)
      this.costTexts[i].setColor(item.owned ? '#7e9a7c' : '#ffd700')
    }

    this.moreAbove.setText(this.first > 0 ? '\u25B2' : '')
    this.moreBelow.setText(this.first + rows < this.items.length ? '\u25BC' : '')

    this.descText.setText(this.items[this.cursor]?.description ?? '')
    this.infoText.setText('')
  }

  private tryPurchase() {
    const item = this.items[this.cursor]
    if (!item || item.owned) {
      sfx.menuCancel()
      this.infoText.setText('ALREADY OWNED')
      this.infoText.setColor('#888888')
      return
    }

    let success = false
    if (item.type === 'class') {
      success = unlockClass(item.id as ClassName)
    } else if (item.type === 'keepsake') {
      success = buyKeepsake(item.id)
    } else {
      success = purchaseShopItem(item.id)
    }

    if (success) {
      sfx.pickup()
      item.owned = true
      // Only one keepsake is held at a time, so buying this one released any
      // other. The rows have to follow, or two of them would read KEPT.
      if (item.type === 'keepsake') {
        for (const other of this.items) {
          if (other.type === 'keepsake' && other.id !== item.id) other.owned = false
        }
      }
      const meta = loadMeta()
      this.goldText.setText(`${meta.gold} GOLD`)
      // After `updateCursor`, not before. It clears `infoText` on every call
      // — that is what wipes the message when you move the cursor — so a
      // confirmation set first is erased in the same frame it is written.
      // "PURCHASED!" has been unreachable since this screen was built; it
      // showed up the moment #86 added a check that read the line back.
      this.updateCursor()
      this.infoText.setText(item.type === 'keepsake' ? 'KEPT FOR NEXT RUN' : 'PURCHASED!')
      this.infoText.setColor('#88ff88')
    } else {
      sfx.menuCancel()
      this.infoText.setText('NOT ENOUGH GOLD')
      this.infoText.setColor('#ff8888')
    }
  }
}
