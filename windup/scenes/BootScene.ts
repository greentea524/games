import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'

import { GameState } from '../state'

type Facing = 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    GameState.loadSave()

    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildPlayer(mode)
      this.buildStation(mode)
      this.buildEnergy(mode)
      this.buildGoal(mode)
    })
    this.scene.start('mainmenu')
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
      
      // 2: Spring Pad
      g.fillStyle(PAL.dark); g.fillRect(at(2), 12, T, 4)
      g.fillStyle(PAL.light)
      g.fillRect(at(2) + 2, 8, T - 4, 4)
      g.fillRect(at(2) + 4, 6, T - 8, 2)
      
      // 3: Moving Platform
      g.fillStyle(PAL.dark); g.fillRect(at(3), 0, T, 8)
      g.fillStyle(PAL.light); g.fillRect(at(3), 0, T, 2)
      g.fillStyle(PAL.light); g.fillRect(at(3), 6, T, 2)
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

      // 2: Spring Pad
      g.fillStyle(GBC_PAL.springBase); g.fillRect(at(2), 12, T, 4)
      g.fillStyle(GBC_PAL.springCoil)
      g.fillRect(at(2) + 2, 8, T - 4, 4)
      g.fillRect(at(2) + 4, 6, T - 8, 2)
      
      // 3: Moving Platform
      g.fillStyle(GBC_PAL.platformBody); g.fillRect(at(3), 0, T, 8)
      g.fillStyle(GBC_PAL.platformEdge); g.fillRect(at(3), 0, T, 2)
      g.fillStyle(GBC_PAL.platformEdge); g.fillRect(at(3), 6, T, 2)
    }

    g.generateTexture(key, T * 4, T)
    g.destroy()
    
    const tex = this.textures.get(key)
    for (let i = 0; i < 4; i++) {
      tex.add(i, 0, i * T, 0, T, T)
    }
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
    g.clear()

    // Empty (Used) Station
    const emptyKey = `station_empty_${mode}`
    g.fillStyle(dark); g.fillRect(2, 4, 12, 12)
    g.fillStyle(body); g.fillRect(3, 5, 10, 10)
    // No glow in center, just a dark hole or dim color
    g.fillStyle(dark); g.fillCircle(8, 9, 3)

    g.generateTexture(emptyKey, 16, 16)
    g.destroy()
  }

  private buildEnergy(mode: 'dmg' | 'gbc') {
    const key = `energy_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const base = mode === 'dmg' ? PAL.dark : GBC_PAL.energyBase
    const glow = mode === 'dmg' ? PAL.light : GBC_PAL.energyGlow

    g.fillStyle(glow); g.fillCircle(8, 8, 6)
    g.fillStyle(base); g.fillRect(6, 4, 4, 8)
    g.fillStyle(base); g.fillRect(4, 6, 8, 4)

    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildGoal(mode: 'dmg' | 'gbc') {
    const key = `goal_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const dark = mode === 'dmg' ? PAL.darkest : 0x000000
    const light = mode === 'dmg' ? PAL.lightest : 0xffffff
    const pole = mode === 'dmg' ? PAL.dark : 0x888888

    // Pole
    g.fillStyle(pole); g.fillRect(2, 0, 2, 16)
    // Checkered Flag
    g.fillStyle(light); g.fillRect(4, 0, 10, 8)
    g.fillStyle(dark)
    g.fillRect(4, 0, 5, 4); g.fillRect(9, 4, 5, 4)

    g.generateTexture(key, 16, 16)
    g.destroy()
  }
}
