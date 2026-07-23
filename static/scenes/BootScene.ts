import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'
import { NPCS } from '../dialogue'
import townUrl from '../assets/town.json?url'
import houseUrl from '../assets/house.json?url'
import house2Url from '../assets/house2.json?url'
import townStaticUrl from '../assets/town_static.json?url'
import cellarUrl from '../assets/cellar.json?url'
import coreUrl from '../assets/core.json?url'

type Facing = 'down' | 'up' | 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('town', townUrl)
    this.load.tilemapTiledJSON('house', houseUrl)
    this.load.tilemapTiledJSON('house2', house2Url)
    this.load.tilemapTiledJSON('town_static', townStaticUrl)
    this.load.tilemapTiledJSON('cellar', cellarUrl)
    this.load.tilemapTiledJSON('core', coreUrl)
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildPlayer(mode)
      this.buildNpcs(mode)
      this.buildItems(mode)
      this.buildProps(mode)
    })
    this.scene.start('title')
  }

  // Phase 3 props: fountain (full/drained), cellar hatch, and the
  // crossover/payoff item icons.
  private buildProps(mode: 'dmg' | 'gbc') {
    const p = mode === 'dmg'
      ? { stone: PAL.dark, stoneDark: PAL.darkest, water: PAL.light, glint: PAL.lightest, wood: PAL.dark, accent: PAL.light }
      : { stone: GBC_PAL.wallBg, stoneDark: GBC_PAL.wallLine, water: GBC_PAL.waterBg, glint: GBC_PAL.waterWave, wood: GBC_PAL.doorBg, accent: GBC_PAL.knobGlow }
    const g = this.make.graphics({}, false)
    const tex = (key: string, w: number, h: number) => {
      if (!this.textures.exists(key)) g.generateTexture(key, w, h)
      g.clear()
    }

    // fountain 32x32 (2x2 tiles): stone ring, water center
    g.fillStyle(p.stone); g.fillCircle(16, 16, 14)
    g.fillStyle(p.stoneDark); g.fillCircle(16, 16, 11)
    g.fillStyle(p.water); g.fillCircle(16, 16, 8)
    g.fillStyle(p.glint); g.fillRect(11, 12, 5, 2); g.fillRect(17, 19, 4, 2)
    tex(`fountain_full_${mode}`, 32, 32)

    // drained: same basin, dry cracked bottom + valve wheel
    g.fillStyle(p.stone); g.fillCircle(16, 16, 14)
    g.fillStyle(p.stoneDark); g.fillCircle(16, 16, 11)
    g.fillStyle(p.wood); g.fillCircle(16, 16, 8)
    g.fillStyle(p.stoneDark); g.fillRect(10, 15, 12, 1); g.fillRect(15, 10, 1, 12)
    g.fillStyle(p.accent); g.fillCircle(24, 24, 3)
    tex(`fountain_drained_${mode}`, 32, 32)

    // hatch 16x16: wooden trapdoor with ring
    g.fillStyle(p.wood); g.fillRect(1, 1, 14, 14)
    g.fillStyle(p.stoneDark)
    g.fillRect(1, 1, 14, 1); g.fillRect(1, 14, 14, 1); g.fillRect(1, 1, 1, 14); g.fillRect(14, 1, 1, 14)
    g.fillRect(5, 5, 1, 1); g.fillRect(10, 5, 1, 1)
    g.fillStyle(p.accent); g.fillRect(6, 8, 4, 2)
    tex(`hatch_${mode}`, 16, 16)

    // item: fresh flower (upright, bright bloom)
    g.fillStyle(mode === 'dmg' ? PAL.dark : GBC_PAL.flowerStem); g.fillRect(7, 7, 2, 7)
    g.fillStyle(mode === 'dmg' ? PAL.lightest : GBC_PAL.flowerBloom); g.fillCircle(8, 4, 3)
    g.fillStyle(mode === 'dmg' ? PAL.light : GBC_PAL.knobGlow); g.fillRect(7, 3, 2, 2)
    g.fillStyle(mode === 'dmg' ? PAL.light : GBC_PAL.grassBg); g.fillRect(4, 9, 3, 1); g.fillRect(9, 10, 3, 1)
    tex(`item_${mode}_flower_fresh`, 16, 16)

    // item: keepsake photo (small framed picture)
    g.fillStyle(p.wood); g.fillRect(3, 3, 10, 10)
    g.fillStyle(mode === 'dmg' ? PAL.lightest : 0xf0f0e0); g.fillRect(5, 5, 6, 6)
    g.fillStyle(p.stoneDark); g.fillRect(6, 7, 2, 2); g.fillRect(9, 6, 1, 1)
    tex(`item_${mode}_photo`, 16, 16)

    // item: cellar ledger (worn book)
    g.fillStyle(p.stoneDark); g.fillRect(3, 4, 10, 9)
    g.fillStyle(mode === 'dmg' ? PAL.light : 0xb0a890); g.fillRect(4, 5, 8, 7)
    g.fillStyle(p.stoneDark); g.fillRect(5, 7, 6, 1); g.fillRect(5, 9, 4, 1)
    tex(`item_${mode}_ledger`, 16, 16)

    // the entity: a dark figure with a static-filled screen for a face
    if (!this.textures.exists('entity')) {
      g.fillStyle(0x141820); g.fillRect(3, 4, 10, 14)
      g.fillStyle(0x0a0c10); g.fillRect(2, 2, 12, 4)
      for (let y = 6; y < 12; y++)
        for (let x = 5; x < 11; x++) {
          g.fillStyle(Math.random() < 0.5 ? 0x1a2438 : 0xc0ccdc)
          g.fillRect(x, y, 1, 1)
        }
      g.generateTexture('entity', 16, 18)
    }
    g.clear()

    // static beacon: a pale pulsing pillar (mode-agnostic, made once)
    if (!this.textures.exists('beacon')) {
      g.fillStyle(0xaab4cc); g.fillRect(6, 2, 4, 14)
      g.fillStyle(0xe0f0ff); g.fillRect(7, 3, 2, 12)
      g.fillStyle(0x88a0c0); g.fillRect(5, 6, 1, 1); g.fillRect(10, 10, 1, 1)
      g.generateTexture('beacon', 16, 18)
    }
    g.clear()

    // item: Ren's key (old brass key)
    g.fillStyle(p.accent); g.fillCircle(5, 6, 3)
    g.fillStyle(p.stoneDark); g.fillCircle(5, 6, 1)
    g.fillStyle(p.accent); g.fillRect(7, 5, 6, 2)
    g.fillRect(11, 7, 1, 2); g.fillRect(9, 7, 1, 2)
    tex(`item_${mode}_ren_key`, 16, 16)

    g.destroy()
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

    // Worn Static-side variants (#15), columns 8-11 (GIDs 9-12).
    // Shape-level decay so it reads through the #47 duotone.
    const c =
      mode === 'dmg'
        ? { bg: PAL.lightest, mid: PAL.light, dark: PAL.dark, darkest: PAL.darkest, wall: PAL.light, floor: PAL.light }
        : { bg: GBC_PAL.grassBg, mid: GBC_PAL.grassDetail, dark: GBC_PAL.treeDark, darkest: GBC_PAL.treeOutline, wall: GBC_PAL.wallBg, floor: GBC_PAL.floorBg }

    // 9 DEAD_TREE: bare trunk + skeletal branches
    g.fillStyle(c.bg); g.fillRect(at(8), 0, T, T)
    g.fillStyle(c.darkest)
    g.fillRect(at(8) + 7, 4, 2, 12)
    g.fillRect(at(8) + 3, 5, 4, 1); g.fillRect(at(8) + 3, 3, 1, 3)
    g.fillRect(at(8) + 9, 7, 4, 1); g.fillRect(at(8) + 12, 4, 1, 4)
    g.fillRect(at(8) + 5, 9, 2, 1)

    // 10 CRACKED_WALL: wall with cracks + boarded window
    g.fillStyle(c.wall); g.fillRect(at(9), 0, T, T)
    g.fillStyle(mode === 'dmg' ? PAL.dark : GBC_PAL.wallLine)
    for (let y = 0; y < T; y += 4) g.fillRect(at(9), y, T, 1)
    g.fillStyle(c.darkest)
    g.fillRect(at(9) + 3, 1, 1, 6); g.fillRect(at(9) + 4, 6, 1, 4)
    g.fillRect(at(9) + 11, 8, 1, 7); g.fillRect(at(9) + 10, 3, 1, 3)
    g.fillRect(at(9) + 5, 11, 6, 3) // boarded hole
    g.fillStyle(c.mid)
    g.fillRect(at(9) + 5, 12, 6, 1)

    // 11 ROTTED_FLOOR: floorboards with holes and warps
    g.fillStyle(c.floor); g.fillRect(at(10), 0, T, T)
    g.fillStyle(mode === 'dmg' ? PAL.dark : GBC_PAL.floorLine)
    for (let x = 0; x < T; x += 8) g.fillRect(at(10) + x, 0, 1, T)
    g.fillStyle(c.darkest)
    g.fillRect(at(10) + 3, 3, 4, 2); g.fillRect(at(10) + 10, 9, 3, 3)
    g.fillRect(at(10) + 2, 12, 2, 1)

    // 12 CRACKED_GRASS: dying ground, fissures
    g.fillStyle(c.bg); g.fillRect(at(11), 0, T, T)
    g.fillStyle(c.darkest)
    g.fillRect(at(11) + 2, 4, 6, 1); g.fillRect(at(11) + 7, 5, 1, 4)
    g.fillRect(at(11) + 10, 10, 4, 1); g.fillRect(at(11) + 12, 7, 1, 3)
    g.fillStyle(c.mid)
    g.fillRect(at(11) + 4, 12, 2, 1)

    g.generateTexture(tileKey, T * 12, T)
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
            baker: { shirt: PAL.light, pants: PAL.dark, hair: PAL.lightest, skin: PAL.lightest },
          }
        : {
            mom: { shirt: GBC_PAL.shirtMom, pants: 0x403050, hair: GBC_PAL.hairDark, skin: GBC_PAL.skin },
            ren: { shirt: GBC_PAL.shirtRen, pants: 0x283850, hair: GBC_PAL.hairGold, skin: GBC_PAL.skin },
            gus: { shirt: GBC_PAL.shirtGus, pants: 0x384038, hair: GBC_PAL.hairGrey, skin: GBC_PAL.skin },
            baker: { shirt: 0xd8d8e0, pants: 0x685848, hair: GBC_PAL.hairGrey, skin: GBC_PAL.skin },
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
