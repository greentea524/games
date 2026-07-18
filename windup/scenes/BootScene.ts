import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'

type Facing = 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildPlayer(mode)
      this.buildStation(mode)
    })
    this.scene.start('platformer')
  }

  private buildTileset(mode: 'dmg' | 'gbc') {
    const key = `tiles_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    if (mode === 'dmg') {
      // 0: Grass Ground
      g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
      g.fillStyle(PAL.dark); g.fillRect(at(0), 0, T, 3)
      g.fillStyle(PAL.light); g.fillRect(at(0) + 2, 5, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1)

      // 1: Brick Wall
      g.fillStyle(PAL.dark); g.fillRect(at(1), 0, T, T)
      g.fillStyle(PAL.darkest)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)
    } else {
      // GBC Color
      // 0: Grass Ground
      g.fillStyle(GBC_PAL.groundBg); g.fillRect(at(0), 0, T, T)
      g.fillStyle(GBC_PAL.groundDetail); g.fillRect(at(0), 0, T, 3)
      g.fillRect(at(0) + 2, 5, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1)

      // 1: Brick Wall
      g.fillStyle(GBC_PAL.brickWall); g.fillRect(at(1), 0, T, T)
      g.fillStyle(GBC_PAL.brickLine)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)
    }

    g.generateTexture(key, T * 2, T)
    g.destroy()
  }

  private drawWindupToy(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    mode: 'dmg' | 'gbc',
  ) {
    if (this.textures.exists(key)) return
    g.clear()
    const cx = 8
    const bodyColor = mode === 'dmg' ? PAL.dark : GBC_PAL.robotBody
    const darkColor = mode === 'dmg' ? PAL.darkest : GBC_PAL.robotDark
    const keyColor = mode === 'dmg' ? PAL.lightest : GBC_PAL.windupKey
    const eyeColor = mode === 'dmg' ? PAL.lightest : GBC_PAL.eyeGlow

    // Brass Winding Key on back
    g.fillStyle(keyColor)
    if (facing === 'right') {
      g.fillRect(cx - 7, 5, 3, 4)
      g.fillRect(cx - 8, 4, 1, 6)
    } else {
      g.fillRect(cx + 4, 5, 3, 4)
      g.fillRect(cx + 7, 4, 1, 6)
    }

    // Robot Head & Body
    g.fillStyle(bodyColor); g.fillRect(cx - 4, 2, 8, 11)
    g.fillStyle(darkColor); g.strokeRect(cx - 4, 2, 8, 11)

    // Eye Slit & Eye
    g.fillStyle(darkColor); g.fillRect(cx - 3, 4, 6, 3)
    g.fillStyle(eyeColor)
    if (facing === 'right') {
      g.fillRect(cx, 5, 2, 1)
    } else {
      g.fillRect(cx - 2, 5, 2, 1)
    }

    // Feet / Tread
    g.fillStyle(darkColor)
    g.fillRect(cx - 4, 13, 3, 3)
    g.fillRect(cx + 1, 13, 3, 3)

    g.generateTexture(key, 16, 16)
  }

  private buildPlayer(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    ;(['left', 'right'] as const).forEach((f) => {
      this.drawWindupToy(g, `windup_${mode}_${f}`, f, mode)
    })
    g.destroy()
  }

  private buildStation(mode: 'dmg' | 'gbc') {
    const key = `station_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const body = mode === 'dmg' ? PAL.dark : GBC_PAL.stationBody
    const glow = mode === 'dmg' ? PAL.lightest : GBC_PAL.stationGlow
    const dark = mode === 'dmg' ? PAL.darkest : 0x303030

    g.fillStyle(dark); g.fillRect(2, 4, 12, 12)
    g.fillStyle(body); g.fillRect(3, 5, 10, 10)
    g.fillStyle(glow); g.fillCircle(8, 9, 3)

    g.generateTexture(key, 16, 16)
    g.destroy()
  }
}
