import Phaser from 'phaser'
import { GBC_WIDTH } from '../constants'
import { GameState } from '../state'
import { sfx, music } from '../audio'

// Minimal title screen (#16): Continue restores the autosave; New Game
// clears it. Keyboard (arrows + Z/Enter) and tap both work.
export class TitleScene extends Phaser.Scene {
  private options: Phaser.GameObjects.Text[] = []
  private labels: string[] = []
  private selected = 0

  constructor() {
    super('title')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f380f')
    music.stop() // silence at the menu (resumes in-world after a keypress)

    const title = this.add
      .text(GBC_WIDTH / 2, 36, 'STATIC', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#9bbc0f',
        resolution: 1,
      })
      .setOrigin(0.5)
    // A nervous horizontal jitter, like a bad signal.
    this.time.addEvent({
      delay: 1400,
      loop: true,
      callback: () => {
        title.setX(GBC_WIDTH / 2 + 2)
        this.time.delayedCall(70, () => title.setX(GBC_WIDTH / 2 - 1))
        this.time.delayedCall(140, () => title.setX(GBC_WIDTH / 2))
      },
    })
    this.add
      .text(GBC_WIDTH / 2, 58, 'a small town is fading', {
        fontFamily: '"Press Start 2P"',
        fontSize: '7px',
        color: '#306230',
        resolution: 1,
      })
      .setOrigin(0.5)

    this.labels = GameState.hasSave() ? ['Continue', 'New Game'] : ['New Game']
    this.selected = 0
    this.options = this.labels.map((label, i) =>
      this.add
        .text(GBC_WIDTH / 2, 94 + i * 16, label, {
          fontFamily: '"Press Start 2P"',
          fontSize: '8px',
          color: '#8bac0f',
          resolution: 1,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.selected = i
          this.confirm()
        }),
    )
    this.refresh()
    this.input.keyboard!.on('keydown', this.onKey, this)
  }

  private refresh() {
    this.options.forEach((o, i) => {
      o.setColor(i === this.selected ? '#e0f8cf' : '#8bac0f')
      o.setText((i === this.selected ? '> ' : '') + this.labels[i])
    })
  }

  private onKey(e: KeyboardEvent) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const dir = e.code === 'ArrowDown' ? 1 : this.options.length - 1
      this.selected = (this.selected + dir) % this.options.length
      sfx.menuMove()
      this.refresh()
    } else if (e.code === 'Enter' || e.code === 'KeyZ') {
      this.confirm()
    }
  }

  private confirm() {
    sfx.menuSelect()
    this.input.keyboard!.off('keydown', this.onKey, this)
    if (this.labels[this.selected] === 'Continue' && GameState.load()) {
      const m = GameState.lastMap!
      this.scene.start('world', { mapKey: m.mapKey, tx: m.tx, ty: m.ty })
    } else {
      GameState.reset()
      // New game wakes up at home, next to the old TV.
      this.scene.start('world', { mapKey: 'house', tx: 4, ty: 5, facing: 'down' })
    }
  }
}
