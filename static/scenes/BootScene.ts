import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'
import { NPCS } from '../dialogue'
import townUrl from '../assets/town.json?url'
import houseUrl from '../assets/house.json?url'
import house2Url from '../assets/house2.json?url'

type Facing = 'down' | 'up' | 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('town', townUrl)
    this.load.tilemapTiledJSON('house', houseUrl)
    this.load.tilemapTiledJSON('house2', house2Url)
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildPlayer(mode)
      this.buildNpcs(mode)
      this.buildItems(mode)
    })
    this.scene.start('world', { mapKey: 'town' })
  }

  private buildTileset(mode: 'dmg' | 'gbc') {
    const tileKey = `tiles_${mode}`
    if (this.textures.exists(tileKey)) return
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    if (mode === 'dmg') {
      // 1 GRASS
      g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
      g.fillStyle(PAL.light)
      g.fillRect(at(0) + 3, 4, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1); g.fillRect(at(0) + 6, 12, 1, 1)

      // 2 PATH
      g.fillStyle(PAL.light); g.fillRect(at(1), 0, T, T)
      g.fillStyle(PAL.dark)
      g.fillRect(at(1) + 2, 3, 1, 1); g.fillRect(at(1) + 8, 6, 1, 1); g.fillRect(at(1) + 5, 11, 1, 1)

      // 3 TREE
      g.fillStyle(PAL.lightest); g.fillRect(at(2), 0, T, T)
      g.fillStyle(PAL.dark); g.fillCircle(at(2) + 8, 7, 7)
      g.fillStyle(PAL.darkest); g.fillCircle(at(2) + 8, 6, 4)
      g.fillStyle(PAL.darkest); g.fillRect(at(2) + 7, 12, 2, 4)

      // 4 WALL
      g.fillStyle(PAL.light); g.fillRect(at(3), 0, T, T)
      g.fillStyle(PAL.dark)
      for (let y = 0; y < T; y += 4) g.fillRect(at(3), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(3) + x, 0, 1, T)

      // 5 ROOF
      g.fillStyle(PAL.dark); g.fillRect(at(4), 0, T, T)
      g.fillStyle(PAL.darkest)
      for (let y = 1; y < T; y += 3) g.fillRect(at(4), y, T, 1)

      // 6 DOOR
      g.fillStyle(PAL.light); g.fillRect(at(5), 0, T, T)
      g.fillStyle(PAL.darkest); g.fillRect(at(5) + 3, 2, 10, 14)
      g.fillStyle(PAL.light); g.fillRect(at(5) + 11, 9, 1, 2)

      // 7 WATER
      g.fillStyle(PAL.dark); g.fillRect(at(6), 0, T, T)
      g.fillStyle(PAL.light)
      g.fillRect(at(6) + 2, 4, 4, 1); g.fillRect(at(6) + 9, 8, 4, 1); g.fillRect(at(6) + 4, 12, 4, 1)

      // 8 FLOOR
      g.fillStyle(PAL.light); g.fillRect(at(7), 0, T, T)
      g.fillStyle(PAL.dark)
      for (let x = 0; x < T; x += 8) g.fillRect(at(7) + x, 0, 1, T)
    } else {
      // GBC COLOR
      g.fillStyle(GBC_PAL.grassBg); g.fillRect(at(0), 0, T, T)
      g.fillStyle(GBC_PAL.grassDetail)
      g.fillRect(at(0) + 3, 4, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1); g.fillRect(at(0) + 6, 12, 1, 1)

      g.fillStyle(GBC_PAL.pathBg); g.fillRect(at(1), 0, T, T)
      g.fillStyle(GBC_PAL.pathDetail)
      g.fillRect(at(1) + 2, 3, 1, 1); g.fillRect(at(1) + 8, 6, 1, 1); g.fillRect(at(1) + 5, 11, 1, 1)

      g.fillStyle(GBC_PAL.grassBg); g.fillRect(at(2), 0, T, T)
      g.fillStyle(GBC_PAL.treeDark); g.fillCircle(at(2) + 8, 7, 7)
      g.fillStyle(GBC_PAL.treeOutline); g.fillCircle(at(2) + 8, 6, 4)
      g.fillStyle(GBC_PAL.trunk); g.fillRect(at(2) + 7, 12, 2, 4)

      g.fillStyle(GBC_PAL.wallBg); g.fillRect(at(3), 0, T, T)
      g.fillStyle(GBC_PAL.wallLine)
      for (let y = 0; y < T; y += 4) g.fillRect(at(3), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(3) + x, 0, 1, T)

      g.fillStyle(GBC_PAL.roofBg); g.fillRect(at(4), 0, T, T)
      g.fillStyle(GBC_PAL.roofLine)
      for (let y = 1; y < T; y += 3) g.fillRect(at(4), y, T, 1)

      g.fillStyle(GBC_PAL.wallBg); g.fillRect(at(5), 0, T, T)
      g.fillStyle(GBC_PAL.doorBg); g.fillRect(at(5) + 3, 2, 10, 14)
      g.fillStyle(GBC_PAL.doorFrame); g.strokeRect(at(5) + 3, 2, 10, 14)
      g.fillStyle(GBC_PAL.knobGlow); g.fillRect(at(5) + 11, 9, 1, 2)

      g.fillStyle(GBC_PAL.waterBg); g.fillRect(at(6), 0, T, T)
      g.fillStyle(GBC_PAL.waterWave)
      g.fillRect(at(6) + 2, 4, 4, 1); g.fillRect(at(6) + 9, 8, 4, 1); g.fillRect(at(6) + 4, 12, 4, 1)
      g.fillStyle(GBC_PAL.waterDeep)
      g.fillRect(at(6) + 3, 5, 2, 1); g.fillRect(at(6) + 10, 9, 2, 1)

      g.fillStyle(GBC_PAL.floorBg); g.fillRect(at(7), 0, T, T)
      g.fillStyle(GBC_PAL.floorLine)
      for (let x = 0; x < T; x += 8) g.fillRect(at(7) + x, 0, 1, T)
    }

    g.generateTexture(tileKey, T * 8, T)
    g.destroy()
  }

  private drawCharacter(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    step: number,
    shirtColor: number,
    pantsColor: number,
    hairColor: number,
    skinColor: number,
  ) {
    if (this.textures.exists(key)) return
    g.clear()
    const cx = 8
    g.fillStyle(pantsColor)
    g.fillRect(cx - 3 + step, 13, 2, 3)
    g.fillRect(cx + 1 - step, 13, 2, 3)
    g.fillStyle(shirtColor); g.fillRect(cx - 3, 7, 6, 6)
    g.fillStyle(skinColor); g.fillRect(cx - 3, 2, 6, 5)
    g.fillStyle(hairColor); g.fillRect(cx - 3, 2, 6, 2)
    g.fillStyle(0x101820)
    if (facing === 'down') { g.fillRect(cx - 2, 5, 1, 1); g.fillRect(cx + 1, 5, 1, 1) }
    else if (facing === 'up') { g.fillStyle(hairColor); g.fillRect(cx - 3, 2, 6, 3) }
    else if (facing === 'left') { g.fillRect(cx - 3, 5, 1, 1) }
    else { g.fillRect(cx + 2, 5, 1, 1) }
    g.generateTexture(key, 16, 16)
  }

  private buildPlayer(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    const shirt = mode === 'dmg' ? PAL.dark : GBC_PAL.shirtHero
    const pants = mode === 'dmg' ? PAL.darkest : GBC_PAL.pantsHero
    const hair = mode === 'dmg' ? PAL.darkest : GBC_PAL.hairDark
    const skin = mode === 'dmg' ? PAL.lightest : GBC_PAL.skin

    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.drawCharacter(g, `kid_${mode}_${f}_0`, f, 0, shirt, pants, hair, skin)
      this.drawCharacter(g, `kid_${mode}_${f}_1`, f, 1, shirt, pants, hair, skin)
    })
    g.destroy()
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      const animKey = `walk_${mode}_${f}`
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: [{ key: `kid_${mode}_${f}_0` }, { key: `kid_${mode}_${f}_1` }],
          frameRate: 6,
          repeat: -1,
        })
      }
    })
  }

  private buildNpcs(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    const npcConfigs =
      mode === 'dmg'
        ? {
            mom: { shirt: PAL.dark, pants: PAL.darkest, hair: PAL.darkest, skin: PAL.lightest },
            ren: { shirt: PAL.darkest, pants: PAL.darkest, hair: PAL.darkest, skin: PAL.lightest },
            gus: { shirt: PAL.dark, pants: PAL.darkest, hair: PAL.light, skin: PAL.lightest },
          }
        : {
            mom: { shirt: GBC_PAL.shirtMom, pants: 0x403050, hair: GBC_PAL.hairDark, skin: GBC_PAL.skin },
            ren: { shirt: GBC_PAL.shirtRen, pants: 0x283850, hair: GBC_PAL.hairGold, skin: GBC_PAL.skin },
            gus: { shirt: GBC_PAL.shirtGus, pants: 0x384038, hair: GBC_PAL.hairGrey, skin: GBC_PAL.skin },
          }

    for (const npc of Object.values(NPCS)) {
      const cfg = npcConfigs[npc.id as keyof typeof npcConfigs] ?? {
        shirt: PAL.dark,
        pants: PAL.darkest,
        hair: PAL.darkest,
        skin: PAL.lightest,
      }
      ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
        this.drawCharacter(
          g,
          `npc_${mode}_${npc.id}_${f}`,
          f,
          0,
          cfg.shirt,
          cfg.pants,
          cfg.hair,
          cfg.skin,
        )
      })
    }
    g.destroy()
  }

  private buildItems(mode: 'dmg' | 'gbc') {
    if (mode === 'dmg') {
      const keyFlash = 'item_dmg_flashlight'
      if (!this.textures.exists(keyFlash)) {
        const g1 = this.make.graphics({}, false)
        g1.fillStyle(PAL.darkest); g1.fillRect(2, 5, 8, 4)
        g1.fillStyle(PAL.light); g1.fillRect(9, 4, 4, 6)
        g1.fillStyle(PAL.lightest); g1.fillRect(12, 5, 2, 4)
        g1.generateTexture(keyFlash, 16, 16)
        g1.destroy()
      }

      const keyFlower = 'item_dmg_flower'
      if (!this.textures.exists(keyFlower)) {
        const g2 = this.make.graphics({}, false)
        g2.fillStyle(PAL.dark); g2.fillRect(7, 6, 2, 8)
        g2.fillStyle(PAL.darkest); g2.fillCircle(8, 5, 3)
        g2.fillStyle(PAL.light); g2.fillRect(4, 9, 2, 1); g2.fillRect(10, 10, 2, 1)
        g2.generateTexture(keyFlower, 16, 16)
        g2.destroy()
      }
    } else {
      const keyFlash = 'item_gbc_flashlight'
      if (!this.textures.exists(keyFlash)) {
        const g1 = this.make.graphics({}, false)
        g1.fillStyle(GBC_PAL.flashlightBody); g1.fillRect(2, 5, 8, 4)
        g1.fillStyle(GBC_PAL.flashlightGlow); g1.fillRect(9, 4, 4, 6)
        g1.fillStyle(0xffffff); g1.fillRect(12, 5, 2, 4)
        g1.generateTexture(keyFlash, 16, 16)
        g1.destroy()
      }

      const keyFlower = 'item_gbc_flower'
      if (!this.textures.exists(keyFlower)) {
        const g2 = this.make.graphics({}, false)
        g2.fillStyle(GBC_PAL.flowerStem); g2.fillRect(7, 6, 2, 8)
        g2.fillStyle(GBC_PAL.flowerBloom); g2.fillCircle(8, 5, 3)
        g2.fillStyle(GBC_PAL.grassBg); g2.fillRect(4, 9, 2, 1); g2.fillRect(10, 10, 2, 1)
        g2.generateTexture(keyFlower, 16, 16)
        g2.destroy()
      }
    }
  }
}
