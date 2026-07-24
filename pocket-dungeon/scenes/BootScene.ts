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
      this.buildBat(mode)
      this.buildArcher(mode)
      this.buildSpider(mode)
      this.buildSlime(mode)
      this.buildBoss(mode)
      this.buildItems(mode)
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

  private buildBat(mode: 'dmg' | 'gbc') {
    const key = `bat_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const body = mode === 'dmg' ? PAL.dark : 0x6040a0
    const wing = mode === 'dmg' ? PAL.darkest : 0x4020708
    const eye = mode === 'dmg' ? PAL.lightest : 0xff6600
    // Wings
    g.fillStyle(wing); g.fillRect(0, 4, 5, 6); g.fillRect(11, 4, 5, 6)
    // Body
    g.fillStyle(body); g.fillRect(5, 5, 6, 7)
    // Eyes
    g.fillStyle(eye); g.fillRect(6, 6, 2, 2); g.fillRect(10, 6, 2, 2)
    // Fangs
    g.fillStyle(0xffffff); g.fillRect(7, 10, 1, 2); g.fillRect(10, 10, 1, 2)
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildArcher(mode: 'dmg' | 'gbc') {
    const key = `archer_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const bone = mode === 'dmg' ? PAL.lightest : 0xe8e0d0
    const dark = mode === 'dmg' ? PAL.darkest : 0x483828
    const bow = mode === 'dmg' ? PAL.dark : 0x906840
    // Skull
    g.fillStyle(bone); g.fillRect(5, 1, 6, 6)
    g.fillStyle(dark); g.fillRect(6, 3, 2, 2); g.fillRect(10, 3, 2, 2)
    g.fillStyle(dark); g.fillRect(7, 5, 3, 1)
    // Ribcage body
    g.fillStyle(bone); g.fillRect(6, 7, 4, 5)
    g.fillStyle(dark); g.fillRect(7, 8, 2, 1); g.fillRect(7, 10, 2, 1)
    // Bow
    g.fillStyle(bow); g.fillRect(11, 3, 1, 8)
    g.fillStyle(bow); g.fillRect(12, 4, 1, 1); g.fillRect(12, 9, 1, 1)
    // Legs
    g.fillStyle(bone); g.fillRect(6, 12, 2, 3); g.fillRect(9, 12, 2, 3)
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildSpider(mode: 'dmg' | 'gbc') {
    const key = `spider_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const body = mode === 'dmg' ? PAL.darkest : 0x282028
    const legs = mode === 'dmg' ? PAL.dark : 0x504050
    const eye = mode === 'dmg' ? PAL.lightest : 0xff2020
    // Legs
    g.fillStyle(legs)
    g.fillRect(1, 5, 3, 1); g.fillRect(1, 7, 3, 1); g.fillRect(1, 9, 3, 1); g.fillRect(1, 11, 3, 1)
    g.fillRect(12, 5, 3, 1); g.fillRect(12, 7, 3, 1); g.fillRect(12, 9, 3, 1); g.fillRect(12, 11, 3, 1)
    // Body
    g.fillStyle(body); g.fillRect(4, 4, 8, 9)
    // Eyes (4 pairs)
    g.fillStyle(eye)
    g.fillRect(5, 5, 1, 1); g.fillRect(7, 5, 1, 1); g.fillRect(9, 5, 1, 1); g.fillRect(11, 5, 1, 1)
    g.fillRect(5, 7, 1, 1); g.fillRect(7, 7, 1, 1); g.fillRect(9, 7, 1, 1); g.fillRect(11, 7, 1, 1)
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildSlime(mode: 'dmg' | 'gbc') {
    const key = `slime_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const body = mode === 'dmg' ? PAL.light : 0x40c040
    const dark = mode === 'dmg' ? PAL.dark : 0x208020
    const eye = mode === 'dmg' ? PAL.darkest : 0x103010
    // Body blob
    g.fillStyle(body); g.fillRect(3, 6, 10, 8)
    g.fillStyle(body); g.fillRect(5, 4, 6, 2)
    // Darker base
    g.fillStyle(dark); g.fillRect(3, 12, 10, 2)
    // Eyes
    g.fillStyle(eye); g.fillRect(5, 8, 2, 2); g.fillRect(9, 8, 2, 2)
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildBoss(mode: 'dmg' | 'gbc') {
    const key = `boss_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const armor = mode === 'dmg' ? PAL.darkest : 0x4060a0
    const dark = mode === 'dmg' ? PAL.dark : 0x203050
    const eye = mode === 'dmg' ? PAL.lightest : 0xff3030
    const crown = mode === 'dmg' ? PAL.light : 0xffd700
    // Crown
    g.fillStyle(crown); g.fillRect(4, 0, 2, 3); g.fillRect(7, 0, 2, 3); g.fillRect(10, 0, 2, 3)
    g.fillStyle(crown); g.fillRect(3, 2, 10, 2)
    // Head
    g.fillStyle(armor); g.fillRect(3, 4, 10, 5)
    g.fillStyle(eye); g.fillRect(5, 5, 2, 2); g.fillRect(9, 5, 2, 2)
    // Body
    g.fillStyle(armor); g.fillRect(2, 9, 12, 4)
    g.fillStyle(dark); g.fillRect(5, 10, 6, 2)
    // Legs
    g.fillStyle(dark); g.fillRect(3, 13, 3, 3); g.fillRect(10, 13, 3, 3)
    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildItems(mode: 'dmg' | 'gbc') {
    const T = 16
    // Generic item pickup sprite: a small glowing bag/chest
    const buildItem = (key: string, color: number, accent: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)
      // Bag body
      g.fillStyle(color); g.fillRect(4, 6, 8, 8)
      g.fillStyle(accent); g.fillRect(5, 4, 6, 2)
      // Tie
      g.fillStyle(accent); g.fillRect(7, 3, 2, 2)
      // Shine
      g.fillStyle(0xffffff); g.fillRect(5, 7, 2, 2)
      g.generateTexture(key, T, T)
      g.destroy()
    }

    const isDmg = mode === 'dmg'
    buildItem(`item_weapon_${mode}`, isDmg ? PAL.dark : 0xc0c0c0, isDmg ? PAL.darkest : 0x808080)
    buildItem(`item_armor_${mode}`, isDmg ? PAL.dark : 0x6080a0, isDmg ? PAL.darkest : 0x304060)
    buildItem(`item_food_${mode}`, isDmg ? PAL.light : 0xc09050, isDmg ? PAL.dark : 0x806030)
    buildItem(`item_potion_${mode}`, isDmg ? PAL.light : 0xff4060, isDmg ? PAL.dark : 0xa02040)
    buildItem(`item_scroll_${mode}`, isDmg ? PAL.lightest : 0xf0e8c0, isDmg ? PAL.light : 0xc0b080)
    buildItem(`item_rewind_${mode}`, isDmg ? PAL.lightest : 0xffd700, isDmg ? PAL.light : 0xc0a000)
  }
}
