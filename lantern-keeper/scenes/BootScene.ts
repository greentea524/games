import Phaser from 'phaser'
import { TILE_SIZE, PAL, LEGACY_WIDTH as GBC_WIDTH, LEGACY_ZOOM } from '../constants'
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
    // Still laid out for 160×144 (#171): see `LEGACY_ZOOM`.
    this.cameras.main.setOrigin(0, 0).setZoom(LEGACY_ZOOM)
    this.cameras.main.setBackgroundColor('#0f1a12')

    // Generate procedural textures first so preview sprites can be used
    this.generateProceduralTextures()

    // Title / Header
    this.add.text(GBC_WIDTH / 2, 24, 'RETRO PAD', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5)

    this.add.text(GBC_WIDTH / 2, 38, 'LANTERN KEEPER', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5)

    // Animated glowing lantern preview icon
    // The picture's own pixels, two to a screen pixel.
    const icon = this.add.sprite(GBC_WIDTH / 2, 62, 'lanternLit').setScale(2 / LEGACY_ZOOM)
    this.tweens.add({
      targets: icon,
      alpha: { from: 0.6, to: 1 },
      scale: { from: 2.8, to: 3.2 },
      duration: 400,
      yoyo: true,
      repeat: -1,
    })

    // Progress Bar Border
    const barBox = this.add.graphics()
    barBox.fillStyle(0x0f1a12, 1)
    barBox.fillRect(28, 90, 104, 10)
    barBox.lineStyle(1, 0x86b06a, 1)
    barBox.strokeRect(28, 90, 104, 10)

    // Progress Fill
    const barFill = this.add.graphics()

    // Progress Text
    const progressText = this.add.text(GBC_WIDTH / 2, 112, 'SYSTEM INIT... 0%', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5)

    // Smooth Progress Bar Animation
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 1000,
      onUpdate: (tween) => {
        const val = tween.getValue() ?? 0
        const fillW = Math.floor((100 * val) / 100)
        barFill.clear()
        if (fillW > 0) {
          barFill.fillStyle(0xe0f8cf, 1)
          barFill.fillRect(30, 92, fillW, 6)
        }
        progressText.setText(`SYSTEM INIT... ${Math.floor(val)}%`)
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
