import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { STAGES, stageIndex } from '../stages'
import { sfx } from '../audio'
import { MAP_TITLE, SCREEN_COLOURS, mapLayout, type MapLayout } from '../screens'
import { BIOMES, biomeFor } from '../forest'
import { FONT, css, heading, panel, screenForest } from './screenForest'

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
 *
 * On the real screen since #175, over the forest of the stage about to
 * start, and the marker is the keeper walking the path.
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

  /** Where everything goes; the touch suite reads it too. */
  layout!: MapLayout

  constructor() {
    super('map')
  }

  init(data: MapScene['payload']) {
    this.payload = data
  }

  /** A stage's place on the path: see `mapLayout`. */
  nodeAt(i: number): { x: number; y: number } {
    return this.layout.nodes[i]
  }

  create() {
    this.layout = mapLayout(GBC_WIDTH, GBC_HEIGHT, STAGES.length)
    const target = stageIndex(this.payload.levelKey)
    const from = this.payload.from ? stageIndex(this.payload.from) : target
    const biome = biomeFor(this.payload.levelKey)
    // The forest of the stage about to start, so the map says where you are
    // going as well as that you moved.
    screenForest(this, biome, 0.45)

    const t = this.layout.title
    panel(this, { x: t.x - 10, y: t.y - 6, width: t.width + 20, height: t.height + 12 })
    heading(this, t, MAP_TITLE, 1)

    // The path, drawn behind the nodes: a worn track with a pale edge.
    const pal = BIOMES[biome]
    const path = this.add.graphics()
    const segment = (width: number, colour: number) => {
      path.lineStyle(width, colour, 1)
      for (let i = 1; i < STAGES.length; i++) {
        const a = this.nodeAt(i - 1)
        const b = this.nodeAt(i)
        path.beginPath()
        path.moveTo(a.x, a.y)
        path.lineTo(b.x, b.y)
        path.strokePath()
      }
    }
    segment(6, pal.deepLine)
    segment(4, pal.stoneDark)
    segment(2, pal.stoneLight)

    // Nodes. Stages already passed are lit, the rest are unlit — the same
    // vocabulary the lanterns in the game itself use, so the map needs no key.
    STAGES.forEach((_, i) => {
      const p = this.nodeAt(i)
      const lit = i < target
      if (lit) {
        this.add.image(p.x, p.y, 'warm_glow').setDisplaySize(40, 40).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35)
      }
      this.add.image(p.x, p.y, lit ? 'lanternLit' : 'lanternUnlit')
    })

    const l = this.layout.label
    const labelPanel = panel(this, l).setVisible(false)
    const label = this.add
      .text(GBC_WIDTH / 2, l.y, '', { fontFamily: FONT, fontSize: '8px', color: css(SCREEN_COLOURS.title), align: 'center' })
      .setOrigin(0.5, 0)

    // The marker: the keeper, walking the path, standing over the node.
    const start = this.nodeAt(from)
    const above = (p: { x: number; y: number }) => p.y - 16
    const marker = this.add.sprite(start.x, above(start), 'player_idle').setOrigin(0.5, 1)

    const finish = () => {
      marker.stop().setTexture('player_idle')
      const name = STAGES[target].title
      label.setText(name)
      labelPanel.clear()
      labelPanel.setVisible(true)
      const w = name.length * 8 + 16
      labelPanel.fillStyle(SCREEN_COLOURS.panel, 0.92).fillRect(GBC_WIDTH / 2 - w / 2, l.y - 5, w, 18)
      labelPanel.lineStyle(1, SCREEN_COLOURS.panelEdge, 1).strokeRect(GBC_WIDTH / 2 - w / 2 + 0.5, l.y - 4.5, w - 1, 17)
      this.time.delayedCall(1100, () => this.startStage())
    }

    if (from === target) {
      finish()
      return
    }

    if (this.anims.exists('walk')) marker.play('walk')
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
      marker.setFlipX(p.x < marker.x)
      sfx.lantern()
      this.tweens.add({
        targets: marker,
        x: p.x,
        y: above(p),
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
