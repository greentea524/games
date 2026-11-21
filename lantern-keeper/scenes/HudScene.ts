import Phaser from 'phaser'
import { GBC_HEIGHT, GBC_WIDTH } from '../constants'
import { BAR, HUD_COLOURS, layout, type HudValues } from '../hud'

const FONT = '"Press Start 2P", monospace'

/** Something on the HUD that can be taken off it again. */
export interface HudToast {
  destroy(): void
}

/**
 * The two bars, the messages and the end of the run, over the forest (#171).
 *
 * Since #174 the bars are solid strips along the top and the bottom, in the
 * card's layout: lanterns lit and the stage along the top, the oil along the
 * bottom. The play camera draws between them.
 *
 * These were in the play scene, fixed to its camera. That camera magnifies
 * the forest now, and anything fixed to it is magnified with it, about the
 * middle of the screen: the count would have been twice the size and half off
 * the corner. A scene of its own has a camera of its own, at the screen's
 * real size, so the text is the font's native 8 pixels whatever the forest
 * is drawn at.
 *
 * The play scene launches this as it starts and stops it as it ends, and a
 * launch does not happen until the next frame. So what the play scene asks
 * for before then is kept, and drawn in `create`.
 */
export class HudScene extends Phaser.Scene {
  private ready = false
  private values: HudValues = { lit: 0, lanterns: 0, stage: 1, stages: 1 }
  private countsVisible = true
  private fuel = { ratio: 1, low: false }
  private waiting: { message: string; duration: number; top: boolean; handle: { text?: Phaser.GameObjects.Text; gone: boolean } }[] = []

  private lanternText!: Phaser.GameObjects.Text
  private stageText!: Phaser.GameObjects.Text
  private bars!: Phaser.GameObjects.Graphics
  private gauge!: Phaser.GameObjects.Graphics

  constructor() {
    super('hud')
  }

  /**
   * Called by the play scene as it starts, before it launches this one. A
   * level that follows another finds the last level's HUD still up for one
   * more frame, and must not draw on it.
   */
  prepare() {
    this.ready = false
    this.values = { lit: 0, lanterns: 0, stage: 1, stages: 1 }
    this.countsVisible = true
    this.fuel = { ratio: 1, low: false }
    this.waiting = []
  }

  create() {
    const css = `#${HUD_COLOURS.text.toString(16).padStart(6, '0')}`
    const style = { fontFamily: FONT, fontSize: '8px', color: css, resolution: 1 }
    this.bars = this.add.graphics()
    this.lanternText = this.add.text(0, 0, '', style)
    this.stageText = this.add.text(0, 0, '', style)
    this.add.text(0, 0, '', style).setName('oil')
    this.gauge = this.add.graphics()
    this.ready = true
    this.drawBars()
    this.drawFuel()
    const waiting = this.waiting
    this.waiting = []
    for (const w of waiting) if (!w.handle.gone) w.handle.text = this.show(w.message, w.duration, w.top)
    this.events.once('shutdown', () => {
      this.ready = false
    })
  }

  /** What the top bar shows: lanterns lit on this stage, and which stage. */
  setValues(values: HudValues) {
    this.values = values
    if (this.ready) this.drawBars()
  }

  setCountsVisible(visible: boolean) {
    this.countsVisible = visible
    if (this.ready) this.drawBars()
  }

  private drawBars() {
    const l = layout(this.values, GBC_WIDTH, GBC_HEIGHT)
    const g = this.bars
    g.clear()
    for (const bar of [l.top, l.bottom]) {
      g.fillStyle(HUD_COLOURS.strip, 1)
      g.fillRect(bar.x, bar.y, bar.width, bar.height)
    }
    // The edge the forest meets: under the top bar, over the bottom one.
    g.fillStyle(HUD_COLOURS.edge, 1)
    g.fillRect(0, BAR - 1, GBC_WIDTH, 1)
    g.fillRect(0, GBC_HEIGHT - BAR, GBC_WIDTH, 1)
    this.lanternText.setPosition(l.lanterns.x, l.lanterns.y).setText(l.lanterns.text ?? '').setVisible(this.countsVisible)
    this.stageText.setPosition(l.stage.x, l.stage.y).setText(l.stage.text ?? '').setVisible(this.countsVisible)
    const oil = this.children.getByName('oil') as Phaser.GameObjects.Text
    oil.setPosition(l.oilLabel.x, l.oilLabel.y).setText(l.oilLabel.text ?? '')
  }

  /** The oil gauge, along the bottom: `ratio` of a tank, pale when `low`. */
  setFuel(ratio: number, low: boolean) {
    if (ratio === this.fuel.ratio && low === this.fuel.low) return
    this.fuel = { ratio, low }
    if (this.ready) this.drawFuel()
  }

  private drawFuel() {
    const { gauge } = layout(this.values, GBC_WIDTH, GBC_HEIGHT)
    const g = this.gauge
    g.clear()
    g.fillStyle(HUD_COLOURS.edge, 1)
    g.fillRect(gauge.x - 1, gauge.y - 1, gauge.width + 2, gauge.height + 2)
    g.fillStyle(HUD_COLOURS.empty, 1)
    g.fillRect(gauge.x, gauge.y, gauge.width, gauge.height)
    if (this.fuel.ratio > 0) {
      // Warm while there is oil, pale once it is nearly out — the palette has
      // no red, so the warning has to be a shift in value rather than in hue.
      g.fillStyle(this.fuel.low ? HUD_COLOURS.low : HUD_COLOURS.fill, 1)
      g.fillRect(gauge.x, gauge.y, Math.max(1, Math.round(gauge.width * this.fuel.ratio)), gauge.height)
    }
  }

  /**
   * A message across the screen. It fades after `duration` milliseconds, or
   * stays until destroyed when that is 0. `top` puts it under the count and
   * not along the bottom: the play scene asks for whichever the keeper is
   * not standing in.
   */
  toast(message: string, duration = 2000, top = false): HudToast {
    const handle: { text?: Phaser.GameObjects.Text; gone: boolean } = { gone: false }
    if (this.ready) handle.text = this.show(message, duration, top)
    else this.waiting.push({ message, duration, top, handle })
    return {
      destroy: () => {
        handle.gone = true
        handle.text?.destroy()
      },
    }
  }

  private show(message: string, duration: number, top: boolean): Phaser.GameObjects.Text {
    const text = this.add
      // Inside the forest, a little in from each bar.
      .text(GBC_WIDTH / 2, top ? BAR + 16 : GBC_HEIGHT - BAR - 18, message, {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#e0f8cf',
        backgroundColor: '#0f1a12',
        padding: { x: 4, y: 4 },
        resolution: 1,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: GBC_WIDTH - 24 },
      })
      .setOrigin(0.5)
    if (duration > 0) {
      this.time.delayedCall(duration, () => {
        this.tweens.add({ targets: text, alpha: 0, duration: 500, onComplete: () => text.destroy() })
      })
    }
    return text
  }
}
