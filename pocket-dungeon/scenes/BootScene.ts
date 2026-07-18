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
    const key = `tiles_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    if (mode === 'dmg') {
      // 0: Dungeon Floor
      g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
      g.fillStyle(PAL.light); g.fillRect(at(0) + 3, 3, 1, 1); g.fillRect(at(0) + 11, 11, 1, 1)

      // 1: Dungeon Wall
      g.fillStyle(PAL.dark); g.fillRect(at(1), 0, T, T)
      g.fillStyle(PAL.darkest)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)

      // 2: Stairs Down
      g.fillStyle(PAL.lightest); g.fillRect(at(2), 0, T, T)
      g.fillStyle(PAL.dark)
      for (let y = 2; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 2)
    } else {
      // GBC Cellar
      // 0: Floor
      g.fillStyle(GBC_PAL.floorBg); g.fillRect(at(0), 0, T, T)
      g.fillStyle(GBC_PAL.floorDetail); g.fillRect(at(0) + 3, 3, 1, 1); g.fillRect(at(0) + 11, 11, 1, 1)

      // 1: Wall
      g.fillStyle(GBC_PAL.wallBg); g.fillRect(at(1), 0, T, T)
      g.fillStyle(GBC_PAL.wallLine)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)

      // 2: Stairs Down
      g.fillStyle(GBC_PAL.floorBg); g.fillRect(at(2), 0, T, T)
      g.fillStyle(GBC_PAL.stairsBg)
      for (let y = 2; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 2)
      g.fillStyle(GBC_PAL.stairsStep)
      for (let y = 3; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 1)
    }

    g.generateTexture(key, T * 3, T)
    g.destroy()
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
