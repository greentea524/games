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
