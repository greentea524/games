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
        this.buildTargetLit(mode, w)
        this.buildSpecialTerrain(mode, w)
        this.buildBorderDressing(mode, w)
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

  private buildBorderDressing(mode: 'dmg' | 'gbc', world: number) {
    const keyPrefix = mode === 'gbc' ? `_w${world}` : ''
    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL
    const g = this.make.graphics({}, false)
    const wallBg = mode === 'dmg' ? PAL.dark : pal.wallBg
    const lineCol = mode === 'dmg' ? PAL.darkest : pal.wallLine

    // Shelf
    if (!this.textures.exists(`shelf_${mode}${keyPrefix}`)) {
      g.clear()
      g.fillStyle(wallBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(lineCol); g.fillRect(0, 12, 16, 2)
      g.fillStyle(mode === 'dmg' ? PAL.light : pal.bgPath)
      g.fillRect(2, 6, 6, 6); g.fillRect(9, 8, 5, 4)
      g.fillStyle(lineCol)
      g.fillRect(4, 8, 2, 2)
      g.generateTexture(`shelf_${mode}${keyPrefix}`, 16, 16)
    }

    // Pegboard
    if (!this.textures.exists(`pegboard_${mode}${keyPrefix}`)) {
      g.clear()
      g.fillStyle(wallBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(lineCol)
      for (let y = 2; y < 16; y += 4) {
        for (let x = 2; x < 16; x += 4) g.fillRect(x, y, 1, 1)
      }
      g.fillStyle(mode === 'dmg' ? PAL.lightest : 0xd0d0d0)
      g.fillRect(10, 4, 2, 8); g.fillRect(9, 3, 4, 2); g.fillRect(11, 2, 2, 1)
      g.generateTexture(`pegboard_${mode}${keyPrefix}`, 16, 16)
    }

    // Barrel / Canister
    if (!this.textures.exists(`barrel_${mode}${keyPrefix}`)) {
      g.clear()
      g.fillStyle(wallBg); g.fillRect(0, 0, 16, 16)
      g.fillStyle(mode === 'dmg' ? PAL.light : pal.bgPath)
      g.fillRect(4, 4, 8, 12)
      g.fillStyle(lineCol)
      g.fillRect(4, 6, 8, 2); g.fillRect(4, 12, 8, 2)
      g.generateTexture(`barrel_${mode}${keyPrefix}`, 16, 16)
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

  private buildTargetLit(mode: 'dmg' | 'gbc', world: number) {
    const keyPrefix = mode === 'gbc' ? `_w${world}` : ''
    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL
    const key = `target_lit_${mode}${keyPrefix}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    if (mode === 'dmg') {
      // DMG has no colour, so a lit pad has to read as *denser*, not lighter.
      //
      // The first version drew the cross in PAL.light with a PAL.lightest
      // dither and a PAL.lightest core — and the DMG floor is PAL.lightest,
      // so two of those three tones were the floor exactly. A docked pad was
      // a faint smudge you could not find on the board. Every check passed;
      // the screenshot is what showed it.
      //
      // Inverted here: the cross goes to the darkest tone the palette has,
      // the dithered halo spreads *outside* it in the mid tone so the glow
      // reads as spilling onto neighbouring floor, and the bright core sits
      // inside the dark cross where it finally has something to contrast
      // against. Empty stays a plain mid-tone cross, so lit is unmistakably
      // the stronger of the two.
      const inCross = (x: number, y: number) =>
        (x >= 3 && x < 13 && y >= 6 && y < 10) || (x >= 6 && x < 10 && y >= 3 && y < 13)

      // Halo: a dithered fringe on the floor around the cross.
      g.fillStyle(PAL.dark)
      for (let y = 1; y < 15; y++) {
        for (let x = 1; x < 15; x++) {
          if (inCross(x, y)) continue
          const near = inCross(x + 1, y) || inCross(x - 1, y) || inCross(x, y + 1) || inCross(x, y - 1)
          if (near && (x + y) % 2 === 0) g.fillRect(x, y, 1, 1)
        }
      }
      // The cross itself, at maximum contrast against the floor.
      g.fillStyle(PAL.darkest)
      g.fillRect(3, 6, 10, 4)
      g.fillRect(6, 3, 4, 10)
      // Dither inside the cross, one step up, so it is textured rather than
      // a flat block — this is the part the flipX cycling animates.
      g.fillStyle(PAL.dark)
      for (let y = 3; y < 13; y++) {
        for (let x = 3; x < 13; x++) {
          if (inCross(x, y) && (x + y) % 2 === 1) g.fillRect(x, y, 1, 1)
        }
      }
      // Lit core.
      g.fillStyle(PAL.lightest)
      g.fillCircle(8, 8, 2)
    } else {
      // Colour glow: a soft halo in the world's target colour around a bright core.
      g.fillStyle(pal.targetBg)
      g.fillRect(2, 6, 12, 4)
      g.fillRect(6, 2, 4, 12)
      g.fillStyle(0xffe8b0)
      g.fillRect(3, 6, 10, 4)
      g.fillRect(6, 3, 4, 10)
      g.fillStyle(0xffffff)
      g.fillCircle(8, 8, 3)
    }
    g.generateTexture(key, 16, 16)
    g.destroy()
  }
}
