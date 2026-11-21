import Phaser from 'phaser'
import { GBC_WIDTH, FONT } from '../constants'
import { GameState } from '../state'
import { CELL, MARGIN, SHOP, THEME, css } from '../theme'
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
 * Rows the list can show at once: the description's divider sits under the
 * last. Before #86 the shop held exactly as many entries as it had rows, and
 * could not have grown by one without the list scrolling.
 */
const MAX_VISIBLE = SHOP.rows

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
  private titleText!: Phaser.GameObjects.Text
  private backBtn!: Phaser.GameObjects.Text
  private rules: Phaser.GameObjects.Rectangle[] = []
  /** What the feedback line is saying, so a palette change can recolour it. */
  private infoRole: 'good' | 'bad' | 'dim' = 'dim'

  constructor() {
    super('shop')
  }

  create() {
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

    // ── Layout ── for 240×216, in the HUD's font: 8 pixels or twice it, on
    // whole pixels, no stroke (#159). Colours are set by `applyTheme`.
    const mid = GBC_WIDTH / 2
    const style = { fontFamily: FONT, fontSize: `${CELL}px` }
    this.titleText = this.add.text(mid, 8, 'SHOP', { ...style, fontSize: `${CELL * 2}px` }).setOrigin(0.5, 0)
    this.goldText = this.add.text(mid, 30, `${meta.gold} GOLD`, style).setOrigin(0.5, 0)
    this.rules = [46, SHOP.dividerY].map((y) => this.add.rectangle(20, y, GBC_WIDTH - 40, 1, 0).setOrigin(0, 0))

    // ── Item List ──
    // Name and cost are separate columns, left and right aligned. One text
    // pair per *visible* row, not per entry. The row's meaning moves with the
    // window, so the click handler reads `this.first` at click time rather
    // than closing over an entry index that would go stale the moment the
    // list scrolled.
    this.itemTexts = []
    this.costTexts = []
    const rows = Math.min(this.items.length, MAX_VISIBLE)
    for (let i = 0; i < rows; i++) {
      const y = SHOP.rowsY + i * SHOP.rowGap
      const txt = this.add.text(MARGIN, y, '', style).setInteractive({ useHandCursor: true })
      const cost = this.add.text(GBC_WIDTH - MARGIN, y, '', style).setOrigin(1, 0)

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

    // Centred *on the dividers*. Names are left aligned and costs right
    // aligned, so the middle of a divider is the one place nothing else can
    // reach; in the gutters the markers landed on a row's cost.
    this.moreAbove = this.add.text(mid, 46, '', style).setOrigin(0.5, 0.5)
    this.moreBelow = this.add.text(mid, SHOP.dividerY, '', style).setOrigin(0.5, 0.5)

    this.descText = this.add.text(mid, SHOP.descY, '', { ...style, align: 'center' })
      .setOrigin(0.5, 0)
      .setWordWrapWidth(SHOP.descChars * CELL)
      .setLineSpacing(2)
    this.infoText = this.add.text(mid, SHOP.infoY, '', style).setOrigin(0.5, 0)

    const backBtn = (this.backBtn = this.add.text(mid, SHOP.backY, '\u25C0 BACK', style)
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true }))
    backBtn.on('pointerdown', () => { sfx.menuCancel(); this.scene.start('title') })
    backBtn.on('pointerover', () => backBtn.setColor(css(THEME[GameState.paletteMode].text)))
    backBtn.on('pointerout', () => backBtn.setColor(css(THEME[GameState.paletteMode].dim)))

    this.applyTheme()

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

  /** Colours everything for the palette in use (#159). */
  private applyTheme() {
    const theme = THEME[GameState.paletteMode]
    this.cameras.main.setBackgroundColor(theme.bg)
    this.titleText.setColor(css(theme.gold))
    this.goldText.setColor(css(theme.gold))
    this.moreAbove.setColor(css(theme.gold))
    this.moreBelow.setColor(css(theme.gold))
    this.descText.setColor(css(theme.text))
    this.backBtn.setColor(css(theme.dim))
    this.rules.forEach((r) => r.setFillStyle(theme.rule, 1))
    const said = this.infoText.text
    this.updateCursor()
    this.say(said, this.infoRole)
  }

  /** The palette toggle, pressed while the shop is open. */
  reloadPalette() {
    this.applyTheme()
  }

  private say(text: string, role: 'good' | 'bad' | 'dim') {
    this.infoRole = role
    this.infoText.setText(text).setColor(css(THEME[GameState.paletteMode][role]))
  }

  private updateCursor() {
    const theme = THEME[GameState.paletteMode]
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

      // Owned rows step back; the cursor's row is the one in full white.
      const here = index === this.cursor
      this.itemTexts[i].setColor(css(here ? theme.text : theme.dim))
      this.costTexts[i].setColor(css(item.owned ? theme.dim : theme.gold))
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
      this.say('ALREADY OWNED', 'dim')
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
      this.say(item.type === 'keepsake' ? 'KEPT FOR NEXT RUN' : 'PURCHASED!', 'good')
    } else {
      sfx.menuCancel()
      this.say('NOT ENOUGH GOLD', 'bad')
    }
  }
}
