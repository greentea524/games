import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL, WORLD_PALS } from '../constants'

type Facing = 'down' | 'up' | 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildPlayer(mode)
      for (let w = 1; w <= 5; w++) {
        this.buildTileset(mode, w)
        this.buildCrate(mode, w)
        this.buildTarget(mode, w)
        this.buildSpecialTerrain(mode, w)
      }
    })
    this.scene.start('mainmenu')
  }

  private buildTileset(mode: 'dmg' | 'gbc', world: number) {
    const keyPrefix = mode === 'gbc' ? `_w${world}` : ''
    if (this.textures.exists(`floor_${mode}${keyPrefix}`)) return

    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL

    // Floor
    const gFloor = this.make.graphics({}, false)
    if (mode === 'dmg') {
      gFloor.fillStyle(PAL.lightest); gFloor.fillRect(0, 0, TILE, TILE)
      gFloor.fillStyle(PAL.light); gFloor.fillRect(2, 2, 1, 1); gFloor.fillRect(12, 10, 1, 1)
    } else {
      gFloor.fillStyle(pal.bgPath); gFloor.fillRect(0, 0, TILE, TILE)
      gFloor.fillStyle(pal.detailPath); gFloor.fillRect(2, 2, 1, 1); gFloor.fillRect(12, 10, 1, 1)
    }
    gFloor.generateTexture(`floor_${mode}${keyPrefix}`, TILE, TILE)
    gFloor.destroy()

    // Wall
    const gWall = this.make.graphics({}, false)
    if (mode === 'dmg') {
      gWall.fillStyle(PAL.dark); gWall.fillRect(0, 0, TILE, TILE)
      gWall.fillStyle(PAL.darkest)
      for (let y = 0; y < TILE; y += 4) gWall.fillRect(0, y, TILE, 1)
      for (let x = 0; x < TILE; x += 8) gWall.fillRect(x, 0, 1, TILE)
    } else {
      gWall.fillStyle(pal.wallBg); gWall.fillRect(0, 0, TILE, TILE)
      gWall.fillStyle(pal.wallLine)
      for (let y = 0; y < TILE; y += 4) gWall.fillRect(0, y, TILE, 1)
      for (let x = 0; x < TILE; x += 8) gWall.fillRect(x, 0, 1, TILE)
    }
    gWall.generateTexture(`wall_${mode}${keyPrefix}`, TILE, TILE)
    gWall.destroy()
  }

  private buildSpecialTerrain(mode: 'dmg' | 'gbc', world: number) {
    const keyPrefix = mode === 'gbc' ? `_w${world}` : ''
    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL
    const g = this.make.graphics({}, false)
    const light = mode === 'dmg' ? PAL.lightest : 0xa0d8ef
    const dark = mode === 'dmg' ? PAL.dark : 0x4080a0
    const pitColor = mode === 'dmg' ? PAL.darkest : 0x141018

    // Ice Tile
    if (!this.textures.exists(`ice_${mode}${keyPrefix}`)) {
      g.clear()
      g.fillStyle(light); g.fillRect(0, 0, 16, 16)
      g.fillStyle(dark)
      g.fillRect(3, 4, 10, 1); g.fillRect(2, 9, 8, 1); g.fillRect(6, 13, 7, 1)
      g.generateTexture(`ice_${mode}${keyPrefix}`, 16, 16)
    }

    // Cracked Floor Tile
    if (!this.textures.exists(`cracked_${mode}${keyPrefix}`)) {
      g.clear()
      const floorBg = mode === 'dmg' ? PAL.lightest : pal.bgPath
      g.fillStyle(floorBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(dark)
      g.fillRect(4, 2, 2, 6); g.fillRect(6, 8, 5, 2); g.fillRect(11, 10, 2, 4)
      g.generateTexture(`cracked_${mode}${keyPrefix}`, 16, 16)
    }

    // Hole Pit Tile
    if (!this.textures.exists(`hole_${mode}${keyPrefix}`)) {
      g.clear()
      g.fillStyle(pitColor); g.fillRect(0, 0, 16, 16)
      g.fillStyle(0x000000); g.fillRect(2, 2, 12, 12)
      g.generateTexture(`hole_${mode}${keyPrefix}`, 16, 16)
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

  private buildCrate(mode: 'dmg' | 'gbc', world: number) {
    const keyPrefix = mode === 'gbc' ? `_w${world}` : ''
    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL
    const key = `crate_${mode}${keyPrefix}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    if (mode === 'dmg') {
      g.fillStyle(PAL.dark); g.fillRect(0, 0, 16, 16)
      g.fillStyle(PAL.darkest); g.strokeRect(0, 0, 16, 16)
      g.fillRect(2, 2, 12, 12)
      g.fillStyle(PAL.light); g.fillRect(4, 4, 8, 8)
    } else {
      g.fillStyle(pal.crateBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(pal.crateFrame); g.strokeRect(0, 0, 16, 16)
      g.fillRect(2, 2, 12, 12)
      g.fillStyle(pal.crateLight); g.fillRect(4, 4, 8, 8)
    }
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildTarget(mode: 'dmg' | 'gbc', world: number) {
    const keyPrefix = mode === 'gbc' ? `_w${world}` : ''
    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL
    const key = `target_${mode}${keyPrefix}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    if (mode === 'dmg') {
      g.fillStyle(PAL.dark)
      g.fillRect(3, 6, 10, 4)
      g.fillRect(6, 3, 4, 10)
      g.fillStyle(PAL.light)
      g.fillCircle(8, 8, 2)
    } else {
      g.fillStyle(pal.targetBg) 
      g.fillRect(3, 6, 10, 4)
      g.fillRect(6, 3, 4, 10)
      g.fillStyle(0xffffff)
      g.fillCircle(8, 8, 2)
    }
    g.generateTexture(key, 16, 16)
    g.destroy()
  }
}
