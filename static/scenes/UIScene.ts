import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, PAL } from '../constants'
import { GameState } from '../state'
import { ITEMS, resolveDialogue } from '../dialogue'
import type { NpcDef, DialogueLine, ChoiceOption } from '../dialogue'

const FONT = '"Press Start 2P"'
const CSS_LIGHT = '#9bbc0f'
const CSS_MID = '#8bac0f'

export class UIScene extends Phaser.Scene {
  // dialogue
  private activeNpc?: NpcDef
  private lines: DialogueLine[] = []
  private lineIndex = 0
  private choiceMode = false
  private choiceIndex = 0
  private choices: ChoiceOption[] = []
  private inputLockUntil = 0

  private box!: Phaser.GameObjects.Graphics
  private nameText!: Phaser.GameObjects.Text
  private bodyText!: Phaser.GameObjects.Text
  private arrow!: Phaser.GameObjects.Text
  private choiceBox!: Phaser.GameObjects.Graphics
  private choiceTexts: Phaser.GameObjects.Text[] = []

  // inventory
  private inv!: Phaser.GameObjects.Container

  // keys
  private advanceKey!: Phaser.Input.Keyboard.Key
  private invKey!: Phaser.Input.Keyboard.Key
  private cancelKey!: Phaser.Input.Keyboard.Key
  private up!: Phaser.Input.Keyboard.Key
  private down!: Phaser.Input.Keyboard.Key

  constructor() {
    super('ui')
  }

  create() {
    const boxH = 46
    const boxY = GBC_HEIGHT - boxH

    this.box = this.add.graphics().setDepth(1000)
    this.box.fillStyle(PAL.darkest, 0.92)
    this.box.fillRoundedRect(3, boxY, GBC_WIDTH - 6, boxH - 3, 3)
    this.box.lineStyle(1, PAL.light, 1)
    this.box.strokeRoundedRect(3, boxY, GBC_WIDTH - 6, boxH - 3, 3)

    this.nameText = this.add
      .text(8, boxY + 4, '', { fontFamily: FONT, fontSize: '8px', color: CSS_MID, resolution: 2 })
      .setDepth(1001)
    this.bodyText = this.add
      .text(8, boxY + 16, '', {
        fontFamily: FONT,
        fontSize: '8px',
        color: CSS_LIGHT,
        resolution: 2,
        lineSpacing: 3,
        wordWrap: { width: GBC_WIDTH - 20 },
      })
      .setDepth(1001)
    this.arrow = this.add
      .text(GBC_WIDTH - 12, GBC_HEIGHT - 10, '▼', {
        fontFamily: FONT,
        fontSize: '7px',
        color: CSS_LIGHT,
        resolution: 2,
      })
      .setDepth(1001)

    // Choices show in their own small box (top-right) so the question text
    // in the main dialogue box stays visible.
    this.choiceBox = this.add.graphics().setDepth(1001).setVisible(false)
    this.choiceTexts = [0, 1].map((i) =>
      this.add
        .text(0, 0, '', {
          fontFamily: FONT,
          fontSize: '8px',
          color: CSS_LIGHT,
          resolution: 2,
        })
        .setDepth(1002)
        .setVisible(false)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (!this.choiceMode) return
          this.choiceIndex = i
          this.renderChoices()
          this.confirmChoice()
        }),
    )

    this.buildInventory()
    this.hideDialogue()

    const kb = this.input.keyboard!
    this.advanceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.invKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    this.cancelKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.up = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP)
    this.down = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)

    // Tap anywhere to advance readable text (not during a choice).
    this.input.on('pointerdown', () => {
      if (GameState.dialogueActive && !this.choiceMode) this.advance()
    })
  }

  // ---- Dialogue ----
  startDialogue(npc: NpcDef) {
    this.activeNpc = npc
    this.lines = resolveDialogue(npc)
    this.lineIndex = 0
    this.choiceMode = false
    this.inputLockUntil = this.time.now + 140
    this.showDialogueUI(true)
    this.showLine()
  }

  private showLine() {
    const line = this.lines[this.lineIndex]
    if (line.give) GameState.addItem(line.give)
    if (line.setFlag) GameState.setFlag(line.setFlag)

    this.nameText.setText(this.activeNpc?.name ?? '')
    this.bodyText.setText(line.text)

    if (line.choice) {
      this.enterChoice(line.choice)
    } else {
      this.exitChoice()
      this.arrow.setVisible(true)
    }
  }

  private advance() {
    if (this.time.now < this.inputLockUntil) return
    if (this.choiceMode) return
    this.lineIndex++
    if (this.lineIndex >= this.lines.length) {
      this.endDialogue()
      return
    }
    this.showLine()
  }

  private enterChoice(options: ChoiceOption[]) {
    this.choiceMode = true
    this.choices = options
    this.choiceIndex = 0
    this.arrow.setVisible(false)
    this.renderChoices()
  }

  private exitChoice() {
    this.choiceMode = false
    this.choiceBox.setVisible(false)
    this.choiceTexts.forEach((t) => t.setVisible(false))
  }

  private renderChoices() {
    const n = this.choices.length
    const lineH = 11
    const boxW = 58
    const boxH = n * lineH + 6
    const bx = GBC_WIDTH - boxW - 4
    const by = 4
    this.choiceBox.clear()
    this.choiceBox.fillStyle(PAL.darkest, 0.95)
    this.choiceBox.fillRoundedRect(bx, by, boxW, boxH, 3)
    this.choiceBox.lineStyle(1, PAL.light, 1)
    this.choiceBox.strokeRoundedRect(bx, by, boxW, boxH, 3)
    this.choiceBox.setVisible(true)

    this.choiceTexts.forEach((t, i) => {
      if (i < n) {
        t.setVisible(true)
        t.setPosition(bx + 5, by + 4 + i * lineH)
        t.setText((i === this.choiceIndex ? '▶ ' : '  ') + this.choices[i].label)
        t.setColor(i === this.choiceIndex ? '#e0f8cf' : CSS_LIGHT)
      } else {
        t.setVisible(false)
      }
    })
  }

  private moveChoice(dir: number) {
    this.choiceIndex =
      (this.choiceIndex + dir + this.choices.length) % this.choices.length
    this.renderChoices()
  }

  private confirmChoice() {
    const opt = this.choices[this.choiceIndex]
    if (opt.setFlag) GameState.setFlag(opt.setFlag)
    this.endDialogue()
  }

  private endDialogue() {
    this.exitChoice()
    this.bodyText.setVisible(true)
    this.showDialogueUI(false)
    GameState.dialogueActive = false
    GameState.uiClosedAt = this.time.now
  }

  private showDialogueUI(v: boolean) {
    this.box.setVisible(v)
    this.nameText.setVisible(v)
    this.bodyText.setVisible(v)
    this.arrow.setVisible(v)
    if (!v) {
      this.choiceBox.setVisible(false)
      this.choiceTexts.forEach((t) => t.setVisible(false))
    }
  }

  private hideDialogue() {
    this.showDialogueUI(false)
  }

  // ---- Inventory ----
  private buildInventory() {
    this.inv = this.add.container(0, 0).setDepth(1100).setVisible(false)
    const bg = this.add.graphics()
    bg.fillStyle(PAL.darkest, 0.96)
    bg.fillRect(0, 0, GBC_WIDTH, GBC_HEIGHT)
    bg.lineStyle(1, PAL.light, 1)
    bg.strokeRect(4, 4, GBC_WIDTH - 8, GBC_HEIGHT - 8)
    const title = this.add.text(10, 10, 'INVENTORY', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 2,
    })
    const hint = this.add.text(10, GBC_HEIGHT - 16, 'SELECT: close', {
      fontFamily: FONT,
      fontSize: '7px',
      color: CSS_MID,
      resolution: 2,
    })
    this.inv.add([bg, title, hint])
  }

  private refreshInventory() {
    // clear previous item rows (keep first 3 children: bg, title, hint)
    while (this.inv.length > 3) {
      const c = this.inv.getAt(this.inv.length - 1) as Phaser.GameObjects.GameObject
      this.inv.remove(c, true)
    }
    if (GameState.inventory.length === 0) {
      this.inv.add(
        this.add.text(16, 30, '(empty)', {
          fontFamily: FONT,
          fontSize: '8px',
          color: CSS_MID,
          resolution: 2,
        }),
      )
      return
    }
    GameState.inventory.forEach((id, i) => {
      const def = ITEMS[id]
      const y = 28 + i * 20
      const icon = this.add.image(20, y + 4, def ? def.icon : '').setOrigin(0.5)
      const label = this.add.text(34, y, def ? def.name : id, {
        fontFamily: FONT,
        fontSize: '8px',
        color: CSS_LIGHT,
        resolution: 2,
      })
      this.inv.add([icon, label])
    })
  }

  private toggleInventory() {
    if (GameState.dialogueActive) return
    GameState.inventoryOpen = !GameState.inventoryOpen
    if (GameState.inventoryOpen) {
      this.refreshInventory()
      this.inv.setVisible(true)
    } else {
      this.inv.setVisible(false)
      GameState.uiClosedAt = this.time.now
    }
  }

  update() {
    // blink advance arrow
    if (this.arrow.visible) {
      this.arrow.setAlpha(Math.floor(this.time.now / 350) % 2 ? 1 : 0.25)
    }

    if (Phaser.Input.Keyboard.JustDown(this.invKey)) this.toggleInventory()

    if (GameState.inventoryOpen) {
      if (
        Phaser.Input.Keyboard.JustDown(this.cancelKey) ||
        Phaser.Input.Keyboard.JustDown(this.advanceKey)
      ) {
        this.toggleInventory()
      }
      return
    }

    if (GameState.dialogueActive) {
      if (this.choiceMode) {
        if (Phaser.Input.Keyboard.JustDown(this.up)) this.moveChoice(-1)
        if (Phaser.Input.Keyboard.JustDown(this.down)) this.moveChoice(1)
        if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) this.confirmChoice()
      } else if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) {
        this.advance()
      }
    }
  }
}
