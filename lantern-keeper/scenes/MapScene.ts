import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, PAL } from '../constants'
import { STAGES, stageIndex } from '../stages'
import { sfx } from '../audio'

const FONT = '"Press Start 2P", monospace'

/**
 * The world map between stages (#88).
 *
 * Sits on every transition — menu to game, and stage to stage — and shows the
 * seven stages as nodes on a winding path, with the lantern marker walking
 * from the stage just finished to the one about to start. That walk is the
 * point: a static map would say where you are, and what the player actually
 * wants to know after clearing a stage is that they moved.
 *
 * The issue asked for four nodes named Glade / Overgrowth / Canopy / Heart
 * Tree. There are seven stages and only the Canopy matches; the names come
 * from the shared stage list rather than from the issue.
 */
export class MapScene extends Phaser.Scene {
  private payload!: {
    levelKey: string
    from?: string
    hasDoubleJump?: boolean
    hasDash?: boolean
    hasWallCling?: boolean
    totalLanternsLit?: number
  }

  constructor() {
    super('map')
  }

  init(data: MapScene['payload']) {
    this.payload = data
  }

  /**
   * Node positions, as a serpentine across the screen.
   *
   * Laid out by index rather than authored: seven fixed points would have to
   * be re-authored the next time a stage is added, which is the failure this
   * whole shared-list change exists to stop.
   */
  private nodeAt(i: number): { x: number; y: number } {
    const perRow = 4
    const row = Math.floor(i / perRow)
    const col = i % perRow
    // Alternate direction each row so the path reads as one continuous line.
    const c = row % 2 === 0 ? col : perRow - 1 - col
    const marginX = 26
    const spanX = GBC_WIDTH - marginX * 2
    return {
      x: marginX + (spanX * c) / (perRow - 1),
      // Measured against the 160x144 screen: the title sits at y=12 and the
      // stage label at y=120, so the two rows have to land between them
      // without crowding either.
      y: 52 + row * 38,
    }
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f1a12')

    const target = stageIndex(this.payload.levelKey)
    const from = this.payload.from ? stageIndex(this.payload.from) : target

    this.add
      .text(GBC_WIDTH / 2, 12, 'THE FOREST PATH', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#e0f8cf',
      })
      .setOrigin(0.5, 0)

    // The path, drawn behind the nodes.
    const path = this.add.graphics().setDepth(0)
    path.lineStyle(1, PAL.dark, 1)
    for (let i = 1; i < STAGES.length; i++) {
      const a = this.nodeAt(i - 1)
      const b = this.nodeAt(i)
      path.beginPath()
      path.moveTo(a.x, a.y)
      path.lineTo(b.x, b.y)
      path.strokePath()
    }

    // Nodes. Stages already passed are lit, the rest are unlit — the same
    // vocabulary the lanterns in the game itself use, so the map needs no key.
    STAGES.forEach((_, i) => {
      const p = this.nodeAt(i)
      const reached = i <= target
      this.add
        .image(p.x, p.y, reached && i < target ? 'lanternLit' : 'lanternUnlit')
        .setDepth(1)
    })

    const label = this.add
      .text(GBC_WIDTH / 2, GBC_HEIGHT - 24, '', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#ffcc66',
        align: 'center',
        wordWrap: { width: GBC_WIDTH - 8 },
      })
      .setOrigin(0.5, 0)

    // The marker: the player's own lantern, walking the path.
    const start = this.nodeAt(from)
    const marker = this.add.image(start.x, start.y - 10, 'lanternLit').setDepth(2)

    const finish = () => {
      label.setText(STAGES[target].title)
      this.time.delayedCall(1100, () => this.startStage())
    }

    if (from === target) {
      finish()
      return
    }

    // Walk one node at a time, so the distance travelled is legible rather
    // than a single slide across the screen.
    let step = from
    const hop = () => {
      if (step >= target) {
        finish()
        return
      }
      step++
      const p = this.nodeAt(step)
      sfx.lantern()
      this.tweens.add({
        targets: marker,
        x: p.x,
        y: p.y - 10,
        duration: 420,
        ease: 'Sine.easeInOut',
        onComplete: hop,
      })
    }
    // A beat before setting off, so the player sees where they started.
    this.time.delayedCall(500, hop)
  }

  private startStage() {
    this.scene.start('play', {
      levelKey: this.payload.levelKey,
      hasDoubleJump: this.payload.hasDoubleJump,
      hasDash: this.payload.hasDash,
      hasWallCling: this.payload.hasWallCling,
      totalLanternsLit: this.payload.totalLanternsLit,
    })
  }
}
