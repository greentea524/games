import Phaser from 'phaser'
import { TILE, PAL } from '../constants'
import townUrl from '../assets/town.json?url'
import houseUrl from '../assets/house.json?url'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('town', townUrl)
    this.load.tilemapTiledJSON('house', houseUrl)
  }

  create() {
    this.buildTileset()
    this.buildPlayer()
    this.scene.start('world', { mapKey: 'town' })
  }

  // 8 tiles laid out horizontally into one 128x16 'tiles' texture.
  private buildTileset() {
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    // 1 GRASS
    g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
    g.fillStyle(PAL.light)
    g.fillRect(at(0) + 3, 4, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1); g.fillRect(at(0) + 6, 12, 1, 1)

    // 2 PATH (dirt)
    g.fillStyle(PAL.light); g.fillRect(at(1), 0, T, T)
    g.fillStyle(PAL.dark)
    g.fillRect(at(1) + 2, 3, 1, 1); g.fillRect(at(1) + 8, 6, 1, 1); g.fillRect(at(1) + 5, 11, 1, 1)

    // 3 TREE
    g.fillStyle(PAL.lightest); g.fillRect(at(2), 0, T, T)
    g.fillStyle(PAL.dark); g.fillCircle(at(2) + 8, 7, 7)
    g.fillStyle(PAL.darkest); g.fillCircle(at(2) + 8, 6, 4)
    g.fillStyle(PAL.darkest); g.fillRect(at(2) + 7, 12, 2, 4)

    // 4 WALL (house body)
    g.fillStyle(PAL.light); g.fillRect(at(3), 0, T, T)
    g.fillStyle(PAL.dark)
    g.lineStyle(1, PAL.dark)
    for (let y = 0; y < T; y += 4) g.fillRect(at(3), y, T, 1)
    for (let x = 0; x < T; x += 8) g.fillRect(at(3) + x, 0, 1, T)
    g.fillRect(at(3) + 4, 4, 1, T)

    // 5 ROOF
    g.fillStyle(PAL.dark); g.fillRect(at(4), 0, T, T)
    g.fillStyle(PAL.darkest)
    for (let y = 1; y < T; y += 3) g.fillRect(at(4), y, T, 1)

    // 6 DOOR
    g.fillStyle(PAL.dark); g.fillRect(at(5), 0, T, T)
    g.fillStyle(PAL.darkest); g.fillRect(at(5) + 3, 2, 10, 14)
    g.fillStyle(PAL.light); g.fillRect(at(5) + 11, 9, 1, 2) // knob

    // 7 WATER
    g.fillStyle(PAL.dark); g.fillRect(at(6), 0, T, T)
    g.fillStyle(PAL.light)
    g.fillRect(at(6) + 2, 4, 4, 1); g.fillRect(at(6) + 9, 8, 4, 1); g.fillRect(at(6) + 4, 12, 4, 1)

    // 8 FLOOR (interior boards)
    g.fillStyle(PAL.light); g.fillRect(at(7), 0, T, T)
    g.fillStyle(PAL.dark)
    for (let x = 0; x < T; x += 8) g.fillRect(at(7) + x, 0, 1, T)

    g.generateTexture('tiles', T * 8, T)
    g.destroy()
  }

  // A 16x16 kid, 4 facings x 2 walk frames.
  private buildPlayer() {
    const g = this.make.graphics({}, false)
    const draw = (key: string, facing: 'down' | 'up' | 'left' | 'right', step: number) => {
      g.clear()
      const cx = 8
      // legs (alternate with step)
      g.fillStyle(PAL.darkest)
      g.fillRect(cx - 3 + step, 13, 2, 3)
      g.fillRect(cx + 1 - step, 13, 2, 3)
      // body / shirt
      g.fillStyle(PAL.dark); g.fillRect(cx - 3, 7, 6, 6)
      // head
      g.fillStyle(PAL.lightest); g.fillRect(cx - 3, 2, 6, 5)
      // hair
      g.fillStyle(PAL.darkest); g.fillRect(cx - 3, 2, 6, 2)
      // face detail per facing
      g.fillStyle(PAL.darkest)
      if (facing === 'down') { g.fillRect(cx - 2, 5, 1, 1); g.fillRect(cx + 1, 5, 1, 1) }
      else if (facing === 'up') { g.fillStyle(PAL.darkest); g.fillRect(cx - 3, 2, 6, 3) }
      else if (facing === 'left') { g.fillRect(cx - 3, 5, 1, 1) }
      else { g.fillRect(cx + 2, 5, 1, 1) }
      g.generateTexture(key, 16, 16)
    }
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      draw(`kid_${f}_0`, f, 0)
      draw(`kid_${f}_1`, f, 1)
    })
    g.destroy()

    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.anims.create({
        key: `walk_${f}`,
        frames: [{ key: `kid_${f}_0` }, { key: `kid_${f}_1` }],
        frameRate: 6,
        repeat: -1,
      })
    })
  }
}
