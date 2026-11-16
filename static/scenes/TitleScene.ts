import Phaser from 'phaser'
import { GBC_WIDTH, TILE } from '../constants'
import { GameState } from '../state'
import { ENTITY_ROWS, crackleMs } from '../sprites'
import { SUBTITLE, TITLE, TITLE_SCALE, TITLE_THEME, css, titleLayout, type ScreenTheme } from '../screens'
import { prefersReducedMotion } from '../../shared/motion'
import { sfx, music } from '../audio'

const FONT = '"Press Start 2P", monospace'

// Minimal title screen (#16): Continue restores the autosave; New Game
// clears it. Keyboard (arrows + Z/Enter) and tap both work.
//
// Laid out on the real screen by `screens.ts`, in the palette chosen (#181).
// The palette switch restarts this scene, so `create` is the whole of it.
export class TitleScene extends Phaser.Scene {
  private options: Phaser.GameObjects.Text[] = []
  private labels: string[] = []
  private selected = 0
  private theme!: ScreenTheme

  constructor() {
    super('title')
  }

  create() {
    const mode = GameState.paletteMode
    const theme = (this.theme = TITLE_THEME[mode])
    this.cameras.main.setBackgroundColor(css(theme.background))
    music.stop() // silence at the menu (resumes in-world after a keypress)

    this.labels = GameState.hasSave() ? ['Continue', 'New Game'] : ['New Game']
    const at = titleLayout(GBC_WIDTH, this.labels, TILE, ENTITY_ROWS)
    const still = prefersReducedMotion()

    // The title twice: once in a second colour a pixel off, like a picture
    // out of register, and once on top.
    const size = `${8 * TITLE_SCALE}px`
    const ghost = this.add.text(at.title.x + 2, at.title.y + 1, TITLE, { fontFamily: FONT, fontSize: size, color: css(theme.ghost), resolution: 1 })
    const title = this.add.text(at.title.x, at.title.y, TITLE, { fontFamily: FONT, fontSize: size, color: css(theme.title), resolution: 1 })
    // A nervous horizontal jitter, like a bad signal. Decoration, so not
    // under reduced motion.
    if (!still) {
      this.time.addEvent({
        delay: 1400,
        loop: true,
        callback: () => {
          title.setX(at.title.x + 2)
          ghost.setX(at.title.x - 1)
          this.time.delayedCall(70, () => title.setX(at.title.x - 1))
          this.time.delayedCall(140, () => {
            title.setX(at.title.x)
            ghost.setX(at.title.x + 2)
          })
        },
      })
    }
    this.add.text(at.subtitle.x, at.subtitle.y, SUBTITLE, { fontFamily: FONT, fontSize: '8px', color: css(theme.subtitle), resolution: 1 })

    // A patch of lawn for them to stand on: see `TitleLayout.stage`.
    const g = this.add.graphics()
    g.fillStyle(theme.stageEdge, 1)
    g.fillRect(at.stage.x, at.stage.y, at.stage.width, at.stage.height)
    g.fillStyle(theme.stage, 1)
    g.fillRect(at.stage.x + 2, at.stage.y + 2, at.stage.width - 4, at.stage.height - 4)

    // The kid, and the thing at the heart of the static, its face crackling.
    this.add
      .sprite(at.kid.x, at.kid.y, `kid_${mode}_down_0`)
      .setOrigin(0)
      .setScale(at.kid.width / TILE)
      .play(`walk_${mode}_down`)
    const entity = this.add.image(at.entity.x, at.entity.y, `entity_${mode}`).setOrigin(0).setScale(at.entity.width / TILE)
    let frame = 0
    this.time.addEvent({
      delay: crackleMs(still),
      loop: true,
      callback: () => {
        frame = 1 - frame
        entity.setTexture(frame ? `entity_${mode}_b` : `entity_${mode}`)
      },
    })

    this.selected = 0
    this.options = this.labels.map((label, i) =>
      this.add
        .text(GBC_WIDTH / 2, at.options[i].y, label, { fontFamily: FONT, fontSize: '8px', color: css(theme.option), resolution: 1 })
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.selected = i
          this.confirm()
        }),
    )
    this.refresh()
    this.input.keyboard!.on('keydown', this.onKey, this)
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.onKey, this))
  }

  private refresh() {
    this.options.forEach((o, i) => {
      o.setColor(css(i === this.selected ? this.theme.selected : this.theme.option))
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
