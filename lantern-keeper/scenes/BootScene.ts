import Phaser from 'phaser'
import { TILE_SIZE, PAL, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GROUND, SCREEN_COLOURS, TITLE } from '../screens'
import { FONT, css, heading, screenForest } from './screenForest'
import {
  BACKDROP_PX, BIOMES, FRAME_COUNT, TILE_PX, WARM_GLOW, drawBackdrop, drawTileset, glowRows, type Biome, type Layer, type Painter,
} from '../forest'
import { HEART_TREE_PX, SPRITES, drawHeartTree, pixels } from '../sprites'
import level1Url from '../assets/level1.json?url'
import level2Url from '../assets/level2.json?url'
import level3Url from '../assets/level3.json?url'
import level4Url from '../assets/level4.json?url'
import groveUrl from '../assets/grove.json?url'
import climbUrl from '../assets/climb.json?url'
import bridgeUrl from '../assets/bridge.json?url'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('grove', groveUrl)
    this.load.tilemapTiledJSON('climb', climbUrl)
    this.load.tilemapTiledJSON('bridge', bridgeUrl)
    this.load.tilemapTiledJSON('level1', level1Url)
    this.load.tilemapTiledJSON('level2', level2Url)
    this.load.tilemapTiledJSON('level3', level3Url)
    this.load.tilemapTiledJSON('level4', level4Url)
  }

  create() {
    // Generate procedural textures first so preview sprites can be used
    this.generateProceduralTextures()

    // On the real screen (#175): the name, a lantern being lit, and the
    // progress. It said RETRO PAD over the game's name, in pale green.
    const W = GBC_WIDTH
    const H = GBC_HEIGHT
    screenForest(this, 'forest', 0.55)
    const titleW = TITLE.length * 16
    heading(this, { x: Math.round((W - titleW) / 2), y: 36, width: titleW, height: 16 }, TITLE)

    const cx = W / 2
    const cy = 104
    const glow = this.add.image(cx, cy, 'warm_glow').setDisplaySize(120, 120).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
    // The picture's own pixels, three to a screen pixel.
    const icon = this.add.image(cx, cy, 'lanternUnlit').setScale(3)

    const barW = 144
    const barX = Math.round((W - barW) / 2)
    const barY = H - GROUND - 34
    const bar = this.add.graphics()
    bar.fillStyle(SCREEN_COLOURS.panel, 1).fillRect(barX - 2, barY - 2, barW + 4, 10)
    bar.lineStyle(1, SCREEN_COLOURS.panelEdge, 1).strokeRect(barX - 1.5, barY - 1.5, barW + 3, 9)
    const barFill = this.add.graphics()
    const progressText = this.add
      .text(cx, barY + 14, '', { fontFamily: FONT, fontSize: '8px', color: css(SCREEN_COLOURS.title), resolution: 1 })
      .setOrigin(0.5, 0)

    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 1000,
      onUpdate: (tween) => {
        const val = tween.getValue() ?? 0
        barFill.clear()
        barFill.fillStyle(SCREEN_COLOURS.title, 1).fillRect(barX, barY, Math.floor((barW * val) / 100), 6)
        progressText.setText(`LIGHTING THE WAY ${Math.floor(val)}%`)
        // The lantern catches as the bar fills.
        if (val >= 60 && icon.texture.key !== 'lanternLit') icon.setTexture('lanternLit')
        glow.setAlpha(Math.max(0, (val - 60) / 40) * WARM_GLOW.alpha * 1.5)
      },
      onComplete: () => {
        this.cameras.main.fadeOut(300, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('menu')
        })
      },
    })
  }

  /**
   * The forest (#172): for each kind of place, the mossy stone as a strip of
   * pieces and the three layers of trees behind it; and the glow a light
   * throws. Drawn by `forest.ts` at the screen's resolution, on canvases,
   * since each is hundreds of rectangles.
   */
  private buildForest() {
    const canvas = (key: string, w: number, h: number, draw: (p: Painter, ctx: CanvasRenderingContext2D) => void) => {
      if (this.textures.exists(key)) return
      const el = document.createElement('canvas')
      el.width = w
      el.height = h
      const ctx = el.getContext('2d')
      if (!ctx) return
      draw((x, y, rw, rh, colour) => {
        ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`
        ctx.fillRect(x, y, rw, rh)
      }, ctx)
      this.textures.addCanvas(key, el)
    }
    for (const biome of Object.keys(BIOMES) as Biome[]) {
      const pal = BIOMES[biome]
      canvas(`stone_${biome}`, FRAME_COUNT * TILE_PX, TILE_PX, (p) => drawTileset(p, pal))
      for (const layer of ['far', 'mid', 'near'] as Layer[]) {
        canvas(`forest_${biome}_${layer}`, BACKDROP_PX, BACKDROP_PX, (p) => drawBackdrop(p, pal, layer, biome))
      }
    }
    const size = 64
    canvas('warm_glow', size, size, (_p, ctx) => {
      const r = (WARM_GLOW.colour >> 16) & 255
      const g = (WARM_GLOW.colour >> 8) & 255
      const b = WARM_GLOW.colour & 255
      glowRows(size).forEach((row, y) =>
        row.forEach((a, x) => {
          if (!a) return
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`
          ctx.fillRect(x, y, 1, 1)
        }),
      )
    })
  }

  /**
   * The keeper, the lanterns and the props, from `sprites.ts` (#173), and
   * the Heart Tree. All at two pixels to a world unit: whatever places one
   * shows it at half size.
   */
  private buildSprites() {
    const canvas = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
      if (this.textures.exists(key)) return
      const el = document.createElement('canvas')
      el.width = w
      el.height = h
      const ctx = el.getContext('2d')
      if (!ctx) return
      draw(ctx)
      this.textures.addCanvas(key, el)
    }
    const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`
    for (const name of Object.keys(SPRITES)) {
      const grid = pixels(name)
      canvas(name, grid[0].length, grid.length, (ctx) =>
        grid.forEach((row, y) =>
          row.forEach((colour, x) => {
            if (colour === null) return
            ctx.fillStyle = css(colour)
            ctx.fillRect(x, y, 1, 1)
          }),
        ),
      )
    }
    // The keeper's walk: the play scene and the forest path both use it.
    if (!this.anims.exists('walk')) {
      this.anims.create({
        key: 'walk',
        frames: [{ key: 'player_walk1' }, { key: 'player_idle' }, { key: 'player_walk2' }, { key: 'player_idle' }],
        frameRate: 10,
        repeat: -1,
      })
    }
    canvas('heart_tree_graphic', HEART_TREE_PX, HEART_TREE_PX, (ctx) =>
      drawHeartTree((x, y, w, h, colour) => {
        ctx.fillStyle = css(colour)
        ctx.fillRect(x, y, w, h)
      }),
    )
  }

  private generateProceduralTextures() {
    this.buildForest()
    this.buildSprites()
    const g = this.make.graphics({}, false)

    // Tileset texture: 6 tiles (Glade, Mossy Hollows, Rootspire)
    // Glade (tiles 1, 2)
    g.fillStyle(PAL.dark)
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.darkest)
    g.fillRect(1, 1, 1, 1)
    g.fillRect(5, 4, 1, 1)
    
    g.fillStyle(PAL.darkest)
    g.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE + 2, 1, 4, 6)
    
    // Mossy Hollows (tiles 3, 4)
    g.fillStyle(PAL.darkest)
    g.fillRect(TILE_SIZE * 2, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.light)
    g.fillRect(TILE_SIZE * 2 + 1, 2, 1, 1)
    g.fillRect(TILE_SIZE * 2 + 4, 5, 2, 1)
    g.fillRect(TILE_SIZE * 2 + 6, 1, 1, 1)
    
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE * 3, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.light)
    g.fillRect(TILE_SIZE * 3 + 2, 0, 4, 2)
    g.fillRect(TILE_SIZE * 3 + 1, 2, 3, 2)

    // Rootspire (tiles 5, 6)
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE * 4, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.darkest)
    g.fillRect(TILE_SIZE * 4 + 2, 0, 1, TILE_SIZE)
    g.fillRect(TILE_SIZE * 4 + 5, 0, 1, TILE_SIZE)
    
    g.fillStyle(PAL.darkest)
    g.fillRect(TILE_SIZE * 5, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE * 5 + 3, 0, 2, TILE_SIZE)

    // The Marsh (tiles 7, 8) - Mud and Water
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE * 6, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.darkest) // Mud ripples
    g.fillRect(TILE_SIZE * 6 + 1, 2, 4, 1)
    g.fillRect(TILE_SIZE * 6 + 3, 5, 3, 1)
    
    g.fillStyle(PAL.darkest)
    g.fillRect(TILE_SIZE * 7, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE * 7 + 2, 1, 4, 1)
    g.fillRect(TILE_SIZE * 7 + 0, 6, 3, 1)

    g.generateTexture('tiles', TILE_SIZE * 8, TILE_SIZE)
    g.clear()

    // Particles
    g.fillStyle(PAL.lightest)
    g.fillRect(0, 0, 2, 2)
    g.generateTexture('particle', 2, 2)
    g.clear()

    g.fillStyle(PAL.warm)
    g.fillRect(0, 0, 1, 1)
    g.generateTexture('spark', 1, 1)
    g.clear()

    // The light brushes for the darkness overlay (KAN-109) used to be built
    // here. shared/lighting.ts now generates one per radius on demand, so a
    // shrinking or growing light gets a native-size circle instead of a
    // scaled one.
    g.destroy()
  }
}
