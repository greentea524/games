import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, PAL } from '../constants'
import { GameState } from '../state'
import { RELICS } from '../relics'
import { BAR_HEIGHT, CELL, foodState, hpFill, iconKey, layout, type Box, type HudValues } from '../hud'

/**
 * What the HUD is drawn in, per palette (#158).
 *
 * One colour family for everything the player reads; yellow and red are kept
 * for the two food warnings, which are signals and not decoration. The green
 * screen has no red to warn with, so there the word STARVING! carries it.
 */
const INK = {
  gbc: { bar: 0x0b0b12, text: 0xf4f4f4, low: 0xffcc00, bad: 0xff5050, track: 0x3a3a48, fill: 0xe84858 },
  dmg: { bar: PAL.darkest, text: PAL.lightest, low: PAL.lightest, bad: PAL.lightest, track: PAL.dark, fill: PAL.lightest },
} as const

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/**
 * The two status bars, laid out for 240×216 by `hud.ts` (#158).
 *
 * Every position comes from `layout()`, the same function `hud_test.ts`
 * checks for overlaps, so what is tested is what is drawn. The font is used
 * at its native 8 pixels, on whole pixels, with no stroke: the bars are solid
 * and the text needs nothing behind it.
 */
export class UIScene extends Phaser.Scene {
  private bars: Phaser.GameObjects.Rectangle[] = []
  private texts = new Map<string, Phaser.GameObjects.Text>()
  private icons = new Map<string, Phaser.GameObjects.Image>()
  private pips: Phaser.GameObjects.Image[] = []
  private track!: Phaser.GameObjects.Rectangle
  private fill!: Phaser.GameObjects.Rectangle

  constructor() {
    super('ui')
  }

  create() {
    this.bars = [
      this.add.rectangle(0, 0, GBC_WIDTH, BAR_HEIGHT, 0).setOrigin(0, 0),
      this.add.rectangle(0, GBC_HEIGHT - BAR_HEIGHT, GBC_WIDTH, BAR_HEIGHT, 0).setOrigin(0, 0),
    ]
    this.texts.clear()
    this.icons.clear()
    this.track = this.add.rectangle(0, 0, 1, 1, 0).setOrigin(0, 0)
    this.fill = this.add.rectangle(0, 0, 1, 1, 0).setOrigin(0, 0)
    const mode = GameState.paletteMode
    this.pips = RELICS.map(() => this.add.image(0, 0, `relicpip_empty_${mode}`).setOrigin(0, 0))
    for (const box of layout(this.values(), GBC_WIDTH, GBC_HEIGHT)) {
      if (box.text !== undefined) {
        this.texts.set(
          box.name,
          this.add.text(box.x, box.y, box.text, { fontFamily: FONT, fontSize: `${CELL}px`, color: '#ffffff' }),
        )
      } else if (box.name.endsWith('-icon') || box.name === 'heart') {
        const picture = box.name.replace('-icon', '')
        this.icons.set(box.name, this.add.image(box.x, box.y, iconKey(picture, mode)).setOrigin(0, 0))
      }
    }
    this.draw()
  }

  private values(): HudValues {
    const inv = GameState.inventory
    return {
      floor: GameState.floorDepth,
      hp: GameState.playerHp,
      maxHp: GameState.maxHp,
      food: GameState.hunger,
      maxFood: GameState.maxHunger,
      gold: GameState.runGold,
      atk: GameState.playerAtk,
      weapon: inv.equippedWeapon?.atkBonus ?? 0,
      armour: inv.equippedArmor?.defBonus ?? 0,
      keys: inv.count('key'),
      relics: RELICS.length,
    }
  }

  update() {
    this.draw()
  }

  /**
   * Puts every box where `layout()` says it is now.
   *
   * Every frame, because the numbers change width: HP is right-aligned and
   * the gold is centred with the pips, so both move as they grow.
   */
  private draw() {
    const mode = GameState.paletteMode
    const ink = INK[mode]
    const values = this.values()
    this.bars.forEach((bar) => bar.setFillStyle(ink.bar, 1))

    const place = (box: Box) => {
      const text = this.texts.get(box.name)
      if (text && box.text !== undefined) {
        text.setPosition(box.x, box.y)
        if (text.text !== box.text) text.setText(box.text)
        let colour: number = ink.text
        if (box.name === 'food') {
          const state = foodState(values)
          colour = state === 'starving' ? ink.bad : state === 'low' ? ink.low : ink.text
        }
        if (text.style.color !== css(colour)) text.setColor(css(colour))
        return
      }
      const icon = this.icons.get(box.name)
      if (icon) {
        icon.setPosition(box.x, box.y).setTexture(iconKey(box.name.replace('-icon', ''), mode))
        return
      }
      if (box.name === 'hpbar') {
        this.track.setPosition(box.x, box.y).setSize(box.width, box.height).setFillStyle(ink.track, 1)
        const filled = hpFill(values.hp, values.maxHp, box.width - 2)
        this.fill
          .setPosition(box.x + 1, box.y + 1)
          .setSize(filled, box.height - 2)
          .setFillStyle(ink.fill, 1)
          .setVisible(filled > 0)
        return
      }
      if (box.name.startsWith('pip-')) {
        const i = Number(box.name.slice(4))
        const held = GameState.relics.includes(RELICS[i].id)
        this.pips[i].setPosition(box.x, box.y).setTexture(`relicpip_${held ? 'held' : 'empty'}_${mode}`)
      }
    }
    layout(values, GBC_WIDTH, GBC_HEIGHT).forEach(place)
  }
}
