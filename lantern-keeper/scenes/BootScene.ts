import Phaser from 'phaser'
import { TILE_SIZE, PAL } from '../constants'
import levelUrl from '../assets/level1.json?url'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('level1', levelUrl)
  }

  create() {
    const g = this.make.graphics({}, false)

    // Tileset texture: 2 tiles side by side (gid 1 = ground, gid 2 = accent)
    g.fillStyle(PAL.dark)
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.darkest)
    g.fillRect(1, 1, 1, 1)
    g.fillRect(5, 4, 1, 1)
    g.fillStyle(PAL.darkest)
    g.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE)
    g.fillStyle(PAL.dark)
    g.fillRect(TILE_SIZE + 2, 1, 4, 6)
    g.generateTexture('tiles', TILE_SIZE * 2, TILE_SIZE)
    g.clear()

    // Player
    g.fillStyle(PAL.lightest)
    g.fillRect(1, 0, 4, 6)
    g.fillStyle(PAL.darkest)
    g.fillRect(2, 1, 1, 1)
    g.fillRect(4, 1, 1, 1)
    g.generateTexture('player', 6, 6)
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

    this.scene.start('play')
  }
}
