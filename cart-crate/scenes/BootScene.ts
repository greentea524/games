import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'

type Facing = 'down' | 'up' | 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildPlayer(mode)
      this.buildCrate(mode)
      this.buildTarget(mode)
      this.buildSpecialTerrain(mode)
    })
    this.scene.start('board')
  }

  private buildTileset(mode: 'dmg' | 'gbc') {
    const key = `tiles_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    if (mode === 'dmg') {
      // 0: Floor
      g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
      g.fillStyle(PAL.light); g.fillRect(at(0) + 2, 2, 1, 1); g.fillRect(at(0) + 12, 10, 1, 1)

      // 1: Wall
      g.fillStyle(PAL.dark); g.fillRect(at(1), 0, T, T)
      g.fillStyle(PAL.darkest)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)

      // 2: Target Dot
      g.fillStyle(PAL.lightest); g.fillRect(at(2), 0, T, T)
      g.fillStyle(PAL.dark); g.fillCircle(at(2) + 8, 8, 4)
      g.fillStyle(PAL.darkest); g.fillCircle(at(2) + 8, 8, 2)
    } else {
      // GBC COLOR
      // 0: Floor
      g.fillStyle(GBC_PAL.bgPath); g.fillRect(at(0), 0, T, T)
      g.fillStyle(GBC_PAL.detailPath); g.fillRect(at(0) + 2, 2, 1, 1); g.fillRect(at(0) + 12, 10, 1, 1)

      // 1: Wall
      g.fillStyle(GBC_PAL.wallBg); g.fillRect(at(1), 0, T, T)
      g.fillStyle(GBC_PAL.wallLine)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)

      // 2: Target Dot
      g.fillStyle(GBC_PAL.bgPath); g.fillRect(at(2), 0, T, T)
      g.fillStyle(GBC_PAL.targetBg); g.fillCircle(at(2) + 8, 8, 4)
      g.fillStyle(GBC_PAL.targetBorder); g.strokeCircle(at(2) + 8, 8, 4)
    }

    g.generateTexture(key, T * 4, T)
    g.destroy()
  }

  private buildSpecialTerrain(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    const light = mode === 'dmg' ? PAL.lightest : 0xa0d8ef
    const dark = mode === 'dmg' ? PAL.dark : 0x4080a0
    const pitColor = mode === 'dmg' ? PAL.darkest : 0x141018

    // Ice Tile
    if (!this.textures.exists(`ice_${mode}`)) {
      g.clear()
      g.fillStyle(light); g.fillRect(0, 0, 16, 16)
      g.fillStyle(dark)
      g.fillRect(3, 4, 10, 1); g.fillRect(2, 9, 8, 1); g.fillRect(6, 13, 7, 1)
      g.generateTexture(`ice_${mode}`, 16, 16)
    }

    // Cracked Floor Tile
    if (!this.textures.exists(`cracked_${mode}`)) {
      g.clear()
      const floorBg = mode === 'dmg' ? PAL.lightest : GBC_PAL.bgPath
      g.fillStyle(floorBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(dark)
      g.fillRect(4, 2, 2, 6); g.fillRect(6, 8, 5, 2); g.fillRect(11, 10, 2, 4)
      g.generateTexture(`cracked_${mode}`, 16, 16)
    }

    // Hole Pit Tile
    if (!this.textures.exists(`hole_${mode}`)) {
      g.clear()
      g.fillStyle(pitColor); g.fillRect(0, 0, 16, 16)
      g.fillStyle(0x000000); g.fillRect(2, 2, 12, 12)
      g.generateTexture(`hole_${mode}`, 16, 16)
    }

    g.destroy()
  }

  private drawFoxPlayer(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    mode: 'dmg' | 'gbc',
  ) {
    if (this.textures.exists(key)) return
    g.clear()
    const cx = 8
    const furColor = mode === 'dmg' ? PAL.dark : GBC_PAL.furOrange
    const shirtColor = mode === 'dmg' ? PAL.darkest : GBC_PAL.shirtBlue
    const whiteColor = mode === 'dmg' ? PAL.lightest : GBC_PAL.furWhite
    const darkColor = mode === 'dmg' ? PAL.darkest : GBC_PAL.furDark

    // Ears
    g.fillStyle(furColor)
    g.fillRect(cx - 5, 1, 3, 3)
    g.fillRect(cx + 2, 1, 3, 3)
    g.fillStyle(whiteColor)
    g.fillRect(cx - 4, 2, 1, 2)
    g.fillRect(cx + 3, 2, 1, 2)

    // Head
    g.fillStyle(furColor); g.fillRect(cx - 5, 3, 10, 6)

    // Snout / Face
    if (facing === 'down') {
      g.fillStyle(whiteColor); g.fillRect(cx - 3, 6, 6, 3)
      g.fillStyle(darkColor); g.fillRect(cx - 1, 6, 2, 2)
      g.fillRect(cx - 3, 4, 1, 1); g.fillRect(cx + 2, 4, 1, 1)
    } else if (facing === 'up') {
      g.fillStyle(furColor); g.fillRect(cx - 5, 3, 10, 6)
    } else if (facing === 'left') {
      g.fillStyle(whiteColor); g.fillRect(cx - 6, 6, 4, 3)
      g.fillStyle(darkColor); g.fillRect(cx - 6, 6, 2, 2)
      g.fillRect(cx - 3, 4, 1, 1)
    } else {
      g.fillStyle(whiteColor); g.fillRect(cx + 2, 6, 4, 3)
      g.fillStyle(darkColor); g.fillRect(cx + 4, 6, 2, 2)
      g.fillRect(cx + 2, 4, 1, 1)
    }

    // Shirt / Body
    g.fillStyle(shirtColor); g.fillRect(cx - 4, 9, 8, 4)

    // Paws / Feet
    g.fillStyle(darkColor)
    g.fillRect(cx - 4, 13, 3, 3)
    g.fillRect(cx + 1, 13, 3, 3)

    g.generateTexture(key, 16, 16)
  }

  private buildPlayer(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.drawFoxPlayer(g, `player_${mode}_${f}`, f, mode)
    })
    g.destroy()
  }

  private buildCrate(mode: 'dmg' | 'gbc') {
    const key = `crate_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    if (mode === 'dmg') {
      g.fillStyle(PAL.dark); g.fillRect(0, 0, 16, 16)
      g.fillStyle(PAL.darkest); g.strokeRect(0, 0, 16, 16)
      g.fillRect(2, 2, 12, 12)
      g.fillStyle(PAL.light); g.fillRect(4, 4, 8, 8)
    } else {
      g.fillStyle(GBC_PAL.crateBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(GBC_PAL.crateFrame); g.strokeRect(0, 0, 16, 16)
      g.fillRect(2, 2, 12, 12)
      g.fillStyle(GBC_PAL.crateLight); g.fillRect(4, 4, 8, 8)
    }
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildTarget(mode: 'dmg' | 'gbc') {
    const key = `target_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    if (mode === 'dmg') {
      g.fillStyle(PAL.lightest); g.fillRect(0, 0, 16, 16)
      g.fillStyle(PAL.dark); g.fillCircle(8, 8, 5)
      g.fillStyle(PAL.darkest); g.fillCircle(8, 8, 2)
    } else {
      g.fillStyle(GBC_PAL.bgPath); g.fillRect(0, 0, 16, 16)
      g.fillStyle(GBC_PAL.targetBg); g.fillCircle(8, 8, 5)
      g.fillStyle(GBC_PAL.targetBorder); g.strokeCircle(8, 8, 5)
      g.fillStyle(0xffffff); g.fillCircle(8, 8, 2)
    }
    g.generateTexture(key, 16, 16)
    g.destroy()
  }
}
