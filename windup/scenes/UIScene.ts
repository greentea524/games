import Phaser from 'phaser'
import { FONT } from '../constants'
import { GameState } from '../state'
import { LEVELS } from '../levels'
import {
  clearSlots, place, toyBox, energyLayout, clockLayout, energyLevel, litSegments, clockText, levelText,
  PANEL, SEGMENTS, HUD_THEME, type Box, type Placement,
} from '../hud'

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** One panel: a framed box and what is drawn in it, moved as a whole. */
interface Panel {
  box: Phaser.GameObjects.Rectangle
  parts: Phaser.GameObjects.GameObject[]
  at: Box | null
}

export class UIScene extends Phaser.Scene {
  private energy!: Panel
  private clock!: Panel
  private face!: Phaser.GameObjects.Image
  private label!: Phaser.GameObjects.Text
  private labelBack!: Phaser.GameObjects.Rectangle
  private bar!: Phaser.GameObjects.Graphics
  private timeText!: Phaser.GameObjects.Text
  private level!: Phaser.GameObjects.Text
  private placement: Placement = { energy: null, clock: null }
  private clearFor = -1
  private clear: Box[] = []
  private mode: 'gbc' | 'dmg' | null = null
  /** While the run summary is up (#170), the panels step out of its way. */
  private panelsHidden = false

  setPanelsHidden(hidden: boolean) {
    this.panelsHidden = hidden
  }

  constructor() {
    super('ui')
  }

  create() {
    // Laid out on the real screen since #169: no zoom, text at its native 8.
    this.cameras.main.setOrigin(0, 0).setZoom(1)
    this.placement = { energy: null, clock: null }
    this.clearFor = -1
    this.mode = null
    this.panelsHidden = false

    const text = (s: string) => this.add.text(0, 0, s, { fontFamily: FONT, fontSize: '8px', resolution: 2 })
    const panelBox = () => this.add.rectangle(0, 0, PANEL.width, PANEL.height).setOrigin(0, 0)

    const eBox = panelBox()
    this.face = this.add.image(0, 0, `windup_${GameState.paletteMode}_head`).setOrigin(0, 0)
    this.labelBack = this.add.rectangle(0, 0, 6 * 8 + 2, 10).setOrigin(0, 0)
    this.label = text('ENERGY')
    this.bar = this.add.graphics()
    this.energy = { box: eBox, parts: [this.face, this.labelBack, this.label, this.bar], at: null }

    const cBox = panelBox()
    this.timeText = text('00:00:000')
    this.level = text('LVL 1/32')
    this.clock = { box: cBox, parts: [this.timeText, this.level], at: null }

    this.update()
  }

  update() {
    const mode = GameState.paletteMode
    const theme = HUD_THEME[mode]
    if (mode !== this.mode) {
      this.mode = mode
      for (const p of [this.energy, this.clock]) p.box.setFillStyle(theme.panel, 1).setStrokeStyle(1, theme.frame)
      this.face.setTexture(`windup_${mode}_head`)
      this.timeText.setColor(css(theme.text))
      this.level.setColor(css(theme.dim))
    }

    // Where the panels go: clear of everything in this level (worked out
    // once a level), and clear of the toy (every frame).
    const n = GameState.levelIndex
    const lv = LEVELS[n] ?? LEVELS[1]
    if (this.clearFor !== n) {
      this.clearFor = n
      this.clear = clearSlots(lv)
      this.placement = { energy: null, clock: null }
    }
    const play = this.scene.get('platformer') as unknown as { player?: Phaser.GameObjects.Sprite }
    const toy = play?.player?.active ? toyBox(play.player.x, play.player.y) : null
    this.placement = place(this.clear, toy, this.placement)
    this.move(this.energy, this.placement.energy)
    this.move(this.clock, this.placement.clock)

    this.drawEnergy(theme)
    this.timeText.setText(clockText(GameState.speedrunDisplayMs))
    this.level.setText(levelText(n, Object.keys(LEVELS).length))
  }

  /** Puts a panel and everything in it at a place, or hides it. */
  private move(panel: Panel, at: Box | null) {
    const shown = at !== null && !this.panelsHidden
    panel.box.setVisible(shown)
    panel.parts.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(shown))
    if (!at || (panel.at && panel.at.x === at.x && panel.at.y === at.y)) {
      panel.at = at
      return
    }
    panel.at = at
    panel.box.setPosition(at.x, at.y)
    if (panel === this.energy) {
      const l = energyLayout(at)
      this.face.setPosition(l.face.x, l.face.y)
      this.label.setPosition(l.label.x, l.label.y)
      this.labelBack.setPosition(l.label.x - 1, l.label.y - 1)
    } else {
      const l = clockLayout(at)
      this.timeText.setPosition(l.time.x, l.time.y)
      this.level.setPosition(l.level.x, l.level.y)
    }
  }

  /**
   * The bar: ten segments, as many lit as there is spring left, all of them
   * one colour that runs yellow, orange, red. When it is low the label turns
   * to the alarm colour as well, so low is plain without counting segments.
   */
  private drawEnergy(theme: (typeof HUD_THEME)['gbc' | 'dmg']) {
    const charge = Math.max(0, Math.min(1, GameState.energy / GameState.maxEnergy))
    const level = energyLevel(charge)
    const lit = litSegments(charge)
    const low = level === 'low'
    this.labelBack.setFillStyle(theme.alarm, low ? 1 : 0)
    this.label.setColor(css(low ? theme.alarmText : theme.text))

    this.bar.clear()
    const at = this.energy.at
    if (!at) return
    const b = energyLayout(at).bar
    for (let i = 0; i < SEGMENTS; i++) {
      this.bar.fillStyle(i < lit ? theme.seg[level] : theme.empty, 1)
      this.bar.fillRect(b.x + i * (b.segment + b.gap), b.y, b.segment, b.height)
    }
  }
}
