import Phaser from 'phaser'
import { TILE_SIZE, PAL } from '../constants'
import level1Url from '../assets/level1.json?url'
import level2Url from '../assets/level2.json?url'
import level3Url from '../assets/level3.json?url'
import level4Url from '../assets/level4.json?url'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('level1', level1Url)
    this.load.tilemapTiledJSON('level2', level2Url)
    this.load.tilemapTiledJSON('level3', level3Url)
    this.load.tilemapTiledJSON('level4', level4Url)
  }

  create() {
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

    // Player Textures (Idle, Walk1, Walk2, Cling)
    const drawPlayer = (key: string, drawFn: () => void) => {
      drawFn()
      g.generateTexture(key, 6, 6)
      g.clear()
    }
    
    drawPlayer('player_idle', () => {
      g.fillStyle(PAL.lightest)
      g.fillRect(1, 0, 4, 6)
      g.fillStyle(PAL.darkest)
      g.fillRect(2, 1, 1, 1)
      g.fillRect(4, 1, 1, 1)
    })
    
    drawPlayer('player_walk1', () => {
      g.fillStyle(PAL.lightest)
      g.fillRect(1, 1, 4, 5)
      g.fillStyle(PAL.darkest)
      g.fillRect(2, 2, 1, 1)
      g.fillRect(4, 2, 1, 1)
    })
    
    drawPlayer('player_walk2', () => {
      g.fillStyle(PAL.lightest)
      g.fillRect(2, 0, 4, 6)
      g.fillStyle(PAL.darkest)
      g.fillRect(3, 1, 1, 1)
      g.fillRect(5, 1, 1, 1)
    })
    
    drawPlayer('player_cling', () => {
      g.fillStyle(PAL.lightest)
      g.fillRect(0, 0, 3, 6)
      g.fillStyle(PAL.darkest)
      g.fillRect(1, 1, 1, 1)
      g.fillRect(1, 4, 1, 1)
    })

    // Stage decorations (issue #7)
    g.fillStyle(PAL.light) // grass tuft: three blades
    g.fillRect(1, 1, 1, 3)
    g.fillRect(3, 0, 1, 4)
    g.fillRect(5, 2, 1, 2)
    g.generateTexture('deco_grass', 8, 4)
    g.clear()

    g.fillStyle(PAL.dark) // fern: stem + fronds
    g.fillRect(3, 0, 1, 5)
    g.fillStyle(PAL.light)
    g.fillRect(1, 1, 2, 1)
    g.fillRect(4, 2, 2, 1)
    g.fillRect(1, 3, 2, 1)
    g.generateTexture('deco_fern', 7, 5)
    g.clear()

    g.fillStyle(PAL.lightest) // tiny mushroom
    g.fillRect(1, 0, 3, 2)
    g.fillStyle(PAL.light)
    g.fillRect(2, 2, 1, 2)
    g.generateTexture('deco_shroom', 5, 4)
    g.clear()

    g.fillStyle(PAL.dark) // hanging vine segment with a leaf
    g.fillRect(1, 0, 1, 8)
    g.fillStyle(PAL.light)
    g.fillRect(0, 3, 1, 1)
    g.fillRect(2, 6, 1, 1)
    g.generateTexture('deco_vine', 3, 8)
    g.clear()

    // Bouncy Mushroom (12x8)
    g.fillStyle(PAL.darkest) // cap outline
    g.fillRect(1, 2, 10, 4)
    g.fillRect(2, 1, 8, 5)
    g.fillStyle(PAL.warm) // cap top
    g.fillRect(3, 1, 6, 4)
    g.fillRect(2, 2, 8, 3)
    g.fillStyle(PAL.lightest) // cap spots
    g.fillRect(4, 2, 1, 1)
    g.fillRect(7, 2, 2, 1)
    g.fillStyle(PAL.lightest) // stem
    g.fillRect(5, 4, 2, 4)
    g.generateTexture('bouncy_shroom', 12, 8)
    g.clear()

    // Background Tree Trunk (8x24)
    g.fillStyle(PAL.darkest)
    g.fillRect(3, 0, 2, 24) // trunk
    g.fillStyle(PAL.dark) // texture highlights
    g.fillRect(3, 4, 1, 3)
    g.fillRect(4, 12, 1, 5)
    g.generateTexture('bg_tree_trunk', 8, 24)
    g.clear()

    // Background Tree Canopy (24x24)
    g.fillStyle(PAL.dark) // round canopy shape
    g.fillCircle(12, 12, 11)
    g.fillStyle(PAL.darkest)
    g.fillCircle(10, 10, 8)
    g.fillStyle(PAL.light) // highlight top leaf layers
    g.fillRect(8, 2, 8, 2)
    g.fillRect(6, 4, 12, 2)
    g.generateTexture('bg_tree_canopy', 24, 24)
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

    // Lanterns (unlit / lit)
    g.fillStyle(PAL.light)
    g.fillRect(2, 0, 2, 2)
    g.fillStyle(PAL.darkest)
    g.fillRect(1, 2, 4, 4)
    g.generateTexture('lanternUnlit', 6, 6)
    g.clear()
    g.fillStyle(PAL.light)
    g.fillRect(2, 0, 2, 2)
    g.fillStyle(PAL.warm)
    g.fillRect(1, 2, 4, 4)
    g.generateTexture('lanternLit', 6, 6)
    g.clear()

    // Light brushes for the darkness-overlay reveal (KAN-109 decision)
    g.fillStyle(0xffffff)
    g.fillCircle(24, 24, 24)
    g.generateTexture('brush', 48, 48)
    g.clear()
    g.fillStyle(0xffffff)
    g.fillCircle(28, 28, 28)
    g.generateTexture('brushBig', 56, 56)
    g.destroy()

    this.scene.start('menu')
  }
}
