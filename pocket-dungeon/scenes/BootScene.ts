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
      this.buildHero(mode)
      this.buildRat(mode)
    })
    this.scene.start('dungeon')
  }

  private buildTileset(mode: 'dmg' | 'gbc') {
    const T = TILE
    const at = (i: number) => i * T

    const build = (key: string, colors: any, isDmg: boolean) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)

      // 0: Floor
      g.fillStyle(colors.floorBg); g.fillRect(at(0), 0, T, T)
      g.fillStyle(colors.floorDetail); g.fillRect(at(0) + 3, 3, 1, 1); g.fillRect(at(0) + 11, 11, 1, 1)

      // 1: Wall
      g.fillStyle(colors.wallBg); g.fillRect(at(1), 0, T, T)
      g.fillStyle(colors.wallLine)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)

      // 2: Stairs Down
      g.fillStyle(colors.floorBg); g.fillRect(at(2), 0, T, T)
      g.fillStyle(colors.stairsBg)
      for (let y = 2; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 2)
      if (!isDmg && colors.stairsStep) {
        g.fillStyle(colors.stairsStep)
        for (let y = 3; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 1)
      }

      g.generateTexture(key, T * 3, T)
      g.destroy()
    }

    if (mode === 'dmg') {
      build('tiles_dmg', {
        floorBg: PAL.lightest, floorDetail: PAL.light,
        wallBg: PAL.dark, wallLine: PAL.darkest,
        stairsBg: PAL.dark
      }, true)
    } else {
      build('tiles_gbc_cellar', {
        floorBg: GBC_PAL.floorBg, floorDetail: GBC_PAL.floorDetail,
        wallBg: GBC_PAL.wallBg, wallLine: GBC_PAL.wallLine,
        stairsBg: GBC_PAL.stairsBg, stairsStep: GBC_PAL.stairsStep
      }, false)
      
      build('tiles_gbc_catacomb', {
        floorBg: GBC_PAL.catacombFloorBg, floorDetail: GBC_PAL.catacombFloorDetail,
        wallBg: GBC_PAL.catacombWallBg, wallLine: GBC_PAL.catacombWallLine,
        stairsBg: GBC_PAL.stairsBg, stairsStep: GBC_PAL.stairsStep
      }, false)
      
      build('tiles_gbc_vault', {
        floorBg: GBC_PAL.vaultFloorBg, floorDetail: GBC_PAL.vaultFloorDetail,
        wallBg: GBC_PAL.vaultWallBg, wallLine: GBC_PAL.vaultWallLine,
        stairsBg: GBC_PAL.stairsBg, stairsStep: GBC_PAL.stairsStep
      }, false)
    }
  }

  private drawKnightHero(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    mode: 'dmg' | 'gbc',
  ) {
    if (this.textures.exists(key)) return
    g.clear()
    const cx = 8
    const armorColor = mode === 'dmg' ? PAL.dark : GBC_PAL.armorSilver
    const darkColor = mode === 'dmg' ? PAL.darkest : GBC_PAL.armorDark
    const capeColor = mode === 'dmg' ? PAL.dark : GBC_PAL.capeRed

    // Helmet
    g.fillStyle(armorColor); g.fillRect(cx - 4, 2, 8, 6)
    g.fillStyle(darkColor)
    if (facing === 'down') {
      g.fillRect(cx - 3, 5, 6, 2) // Visor slit
    } else if (facing === 'up') {
      g.fillRect(cx - 4, 2, 8, 2)
    } else if (facing === 'left') {
      g.fillRect(cx - 4, 5, 4, 2)
    } else {
      g.fillRect(cx, 5, 4, 2)
    }

    // Cape & Armor Body
    g.fillStyle(capeColor); g.fillRect(cx - 5, 8, 10, 5)
    g.fillStyle(armorColor); g.fillRect(cx - 3, 8, 6, 5)

    // Sword (Right side)
    g.fillStyle(darkColor)
    g.fillRect(cx + 4, 7, 2, 6)
    g.fillRect(cx + 3, 10, 4, 1)

    // Boots
    g.fillStyle(darkColor)
    g.fillRect(cx - 4, 13, 3, 3)
    g.fillRect(cx + 1, 13, 3, 3)

    g.generateTexture(key, 16, 16)
  }

  private buildHero(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.drawKnightHero(g, `hero_${mode}_${f}`, f, mode)
    })
    g.destroy()
  }

  private buildRat(mode: 'dmg' | 'gbc') {
    const key = `rat_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const fur = mode === 'dmg' ? PAL.dark : GBC_PAL.ratBrown
    const dark = mode === 'dmg' ? PAL.darkest : GBC_PAL.ratDark
    const eye = mode === 'dmg' ? PAL.lightest : GBC_PAL.ratEye

    // Body
    g.fillStyle(fur); g.fillRect(2, 6, 12, 7)
    // Snout
    g.fillStyle(dark); g.fillRect(12, 9, 3, 3)
    // Tail
    g.fillStyle(dark); g.fillRect(0, 10, 3, 1)
    // Eyes
    g.fillStyle(eye); g.fillRect(10, 7, 2, 2)
    // Feet
    g.fillStyle(dark); g.fillRect(3, 13, 2, 2); g.fillRect(9, 13, 2, 2)

    g.generateTexture(key, 16, 16)
    g.destroy()
  }
}
