import Phaser from 'phaser'
import { GBC_HEIGHT, GBC_WIDTH, PAL } from '../constants'

const FONT = '"Press Start 2P", monospace'

/** Something on the HUD that can be taken off it again. */
export interface HudToast {
  destroy(): void
}

/**
 * The lantern count, the fuel gauge and the messages, over the forest (#171).
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
  private counts = ''
  private countsVisible = true
  private fuel = { ratio: 1, low: false }
  private waiting: { message: string; duration: number; top: boolean; handle: { text?: Phaser.GameObjects.Text; gone: boolean } }[] = []

  private text!: Phaser.GameObjects.Text
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
    this.counts = ''
    this.countsVisible = true
    this.fuel = { ratio: 1, low: false }
    this.waiting = []
  }

  create() {
    this.text = this.add.text(6, 8, '', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
      lineSpacing: 2,
      shadow: { offsetX: 1, offsetY: 1, color: '#0f1a12', fill: true },
    })
    this.gauge = this.add.graphics()
    this.ready = true
    this.text.setText(this.counts).setVisible(this.countsVisible)
    this.drawFuel()
    const waiting = this.waiting
    this.waiting = []
    for (const w of waiting) if (!w.handle.gone) w.handle.text = this.show(w.message, w.duration, w.top)
    this.events.once('shutdown', () => {
      this.ready = false
    })
  }

  /** The two lines in the top left: lanterns lit on this stage, and in all. */
  setCounts(text: string) {
    this.counts = text
    if (this.ready) this.text.setText(text)
  }

  setCountsVisible(visible: boolean) {
    this.countsVisible = visible
    if (this.ready) this.text.setVisible(visible)
  }

  /** The fuel gauge, top right: `ratio` of a tank, pale when `low`. */
  setFuel(ratio: number, low: boolean) {
    if (ratio === this.fuel.ratio && low === this.fuel.low) return
    this.fuel = { ratio, low }
    if (this.ready) this.drawFuel()
  }

  private drawFuel() {
    const w = 44
    const h = 6
    const x = GBC_WIDTH - w - 7
    const y = 9
    const g = this.gauge
    g.clear()
    g.fillStyle(PAL.darkest, 0.7)
    g.fillRect(x - 1, y - 1, w + 2, h + 2)
    g.lineStyle(1, PAL.light, 1)
    g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1)
    if (this.fuel.ratio > 0) {
      // Warm while there is fuel, pale once it is nearly out — the palette has
      // no red, so the warning has to be a shift in value rather than in hue.
      g.fillStyle(this.fuel.low ? PAL.lightest : PAL.warm, 1)
      g.fillRect(x, y, Math.max(1, Math.round(w * this.fuel.ratio)), h)
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
      // 40 from the bottom: clear of the shell's rounded corners at any
      // width. 46 from the top: under the two lines of the count.
      .text(GBC_WIDTH / 2, top ? 46 : GBC_HEIGHT - 40, message, {
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
