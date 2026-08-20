import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST } from '../constants'
import { GameState } from '../state'
import { RELICS } from '../relics'

/** Pip art is 6x6 (see BootScene.buildRelics), laid out edge to edge. */
const PIP = 6
/** Breathing room between the gold figure and the first pip. */
const PIP_GAP = 4

export class UIScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text
  private floorText!: Phaser.GameObjects.Text
  private turnText!: Phaser.GameObjects.Text
  private hungerText!: Phaser.GameObjects.Text
  private atkText!: Phaser.GameObjects.Text
  private goldText!: Phaser.GameObjects.Text
  private relicPips: Phaser.GameObjects.Image[] = []

  constructor() {
    super('ui')
  }

  create() {
    // Top HUD background
    this.add.rectangle(0, 0, GBC_WIDTH, 15, 0x000000, 0.8).setOrigin(0, 0)

    // Bottom HUD background
    this.add.rectangle(0, GBC_HEIGHT - 15, GBC_WIDTH, 15, 0x000000, 0.8).setOrigin(0, 0)

    const textStyle = (color: string, size: string = '7px') => ({
      fontFamily: FONT,
      fontSize: size,
      color: color,
      resolution: 4,
      stroke: '#000000',
      strokeThickness: 2,
    })

    this.hpText = this.add.text(6, 4, '', textStyle(CSS_LIGHTEST))
    this.floorText = this.add.text(GBC_WIDTH / 2, 4, '', textStyle(CSS_LIGHTEST)).setOrigin(0.5, 0)
    this.turnText = this.add.text(GBC_WIDTH - 6, 4, '', textStyle(CSS_LIGHTEST)).setOrigin(1, 0)

    // Bottom bar
    this.hungerText = this.add.text(6, GBC_HEIGHT - 11, '', textStyle('#88ff88', '6px'))
    this.atkText = this.add.text(GBC_WIDTH - 6, GBC_HEIGHT - 11, '', textStyle('#ff8888', '6px')).setOrigin(1, 0)
    // Gold and the relic pips (#84) are laid out as one group centred in the
    // bottom bar, rather than each centred on its own. Measured in a browser
    // first, the way #59's overlapping kill counter should have been. At the
    // widest the bar ever gets — `FD:100`, `9999g`, three pips, `ATK:99` —
    // the group runs x=53..108 between text ending at 45 and starting at 115,
    // so the clearances are 8px on the left and 7px on the right.
    this.goldText = this.add.text(0, GBC_HEIGHT - 11, '', textStyle('#ffd700', '6px')).setOrigin(0, 0)
    this.relicPips = RELICS.map(() =>
      this.add.image(0, GBC_HEIGHT - 10, `relicpip_empty_${GameState.paletteMode}`).setOrigin(0, 0),
    )
  }

  /**
   * Lays gold and the pips out as one centred group.
   *
   * Re-run every frame because the gold figure changes width — a group
   * positioned once at create time drifts off centre the moment the player
   * banks their tenth coin.
   */
  private layoutBottomCentre() {
    const pipsWidth = this.relicPips.length * PIP
    const total = this.goldText.width + PIP_GAP + pipsWidth
    const startX = Math.round((GBC_WIDTH - total) / 2)
    this.goldText.setX(startX)
    const pipsX = startX + this.goldText.width + PIP_GAP
    this.relicPips.forEach((pip, i) => pip.setX(pipsX + i * PIP))
  }

  update() {
    this.hpText.setText(`HP:${GameState.playerHp}/${GameState.maxHp}`)
    this.floorText.setText(`F${GameState.floorDepth}`)
    this.turnText.setText(`T:${GameState.turnsCount}`)

    // Hunger display - flash red when starving
    const hungerPct = GameState.hunger / GameState.maxHunger
    if (hungerPct <= 0) {
      this.hungerText.setColor('#ff4444')
      this.hungerText.setText('STARVING!')
    } else if (hungerPct <= 0.25) {
      this.hungerText.setColor('#ffcc00')
      this.hungerText.setText(`FD:${GameState.hunger}`)
    } else {
      this.hungerText.setColor('#88ff88')
      this.hungerText.setText(`FD:${GameState.hunger}`)
    }

    this.atkText.setText(`ATK:${GameState.playerAtk}`)
    this.goldText.setText(`${GameState.runGold}g`)

    const mode = GameState.paletteMode
    this.relicPips.forEach((pip, i) => {
      const held = GameState.relics.includes(RELICS[i].id)
      pip.setTexture(`relicpip_${held ? 'held' : 'empty'}_${mode}`)
    })
    this.layoutBottomCentre()
  }
}
