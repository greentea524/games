import Phaser from 'phaser'
import { TILE, GBC_PAL } from '../constants'
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
    this.buildTileset()
    this.buildPlayer()
    this.buildNpcs()
    this.buildItems()
    this.scene.start('world', { mapKey: 'town' })
  }

  // 8 tiles laid out horizontally into one 128x16 'tiles' texture.
  private buildTileset() {
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    // 1 GRASS (vibrant GBC green)
    g.fillStyle(GBC_PAL.grassBg); g.fillRect(at(0), 0, T, T)
    g.fillStyle(GBC_PAL.grassDetail)
    g.fillRect(at(0) + 3, 4, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1); g.fillRect(at(0) + 6, 12, 1, 1)

    // 2 PATH (golden GBC dirt)
    g.fillStyle(GBC_PAL.pathBg); g.fillRect(at(1), 0, T, T)
    g.fillStyle(GBC_PAL.pathDetail)
    g.fillRect(at(1) + 2, 3, 1, 1); g.fillRect(at(1) + 8, 6, 1, 1); g.fillRect(at(1) + 5, 11, 1, 1)

    // 3 TREE (rich evergreen canopy + wood trunk)
    g.fillStyle(GBC_PAL.grassBg); g.fillRect(at(2), 0, T, T)
    g.fillStyle(GBC_PAL.treeDark); g.fillCircle(at(2) + 8, 7, 7)
    g.fillStyle(GBC_PAL.treeOutline); g.fillCircle(at(2) + 8, 6, 4)
    g.fillStyle(GBC_PAL.trunk); g.fillRect(at(2) + 7, 12, 2, 4)

    // 4 WALL (slate stone house body)
    g.fillStyle(GBC_PAL.wallBg); g.fillRect(at(3), 0, T, T)
    g.fillStyle(GBC_PAL.wallLine)
    for (let y = 0; y < T; y += 4) g.fillRect(at(3), y, T, 1)
    for (let x = 0; x < T; x += 8) g.fillRect(at(3) + x, 0, 1, T)
    g.fillRect(at(3) + 4, 4, 1, T)

    // 5 ROOF (terracotta GBC red)
    g.fillStyle(GBC_PAL.roofBg); g.fillRect(at(4), 0, T, T)
    g.fillStyle(GBC_PAL.roofLine)
    for (let y = 1; y < T; y += 3) g.fillRect(at(4), y, T, 1)

    // 6 DOOR (rich wood + brass knob)
    g.fillStyle(GBC_PAL.wallBg); g.fillRect(at(5), 0, T, T)
    g.fillStyle(GBC_PAL.doorBg); g.fillRect(at(5) + 3, 2, 10, 14)
    g.fillStyle(GBC_PAL.doorFrame); g.strokeRect(at(5) + 3, 2, 10, 14)
    g.fillStyle(GBC_PAL.knobGlow); g.fillRect(at(5) + 11, 9, 1, 2) // knob

    // 7 WATER (GBC azure ocean/pond blue)
    g.fillStyle(GBC_PAL.waterBg); g.fillRect(at(6), 0, T, T)
    g.fillStyle(GBC_PAL.waterWave)
    g.fillRect(at(6) + 2, 4, 4, 1); g.fillRect(at(6) + 9, 8, 4, 1); g.fillRect(at(6) + 4, 12, 4, 1)
    g.fillStyle(GBC_PAL.waterDeep)
    g.fillRect(at(6) + 3, 5, 2, 1); g.fillRect(at(6) + 10, 9, 2, 1)

    // 8 FLOOR (warm interior wood boards)
    g.fillStyle(GBC_PAL.floorBg); g.fillRect(at(7), 0, T, T)
    g.fillStyle(GBC_PAL.floorLine)
    for (let x = 0; x < T; x += 8) g.fillRect(at(7) + x, 0, 1, T)

    g.generateTexture('tiles', T * 8, T)
    g.destroy()
  }

  // Draws one 16x16 character frame with GBC color palettes.
  private drawCharacter(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    step: number,
    shirtColor: number,
    pantsColor: number,
    hairColor: number,
    skinColor = GBC_PAL.skin,
  ) {
    g.clear()
    const cx = 8
    // Pants
    g.fillStyle(pantsColor)
    g.fillRect(cx - 3 + step, 13, 2, 3)
    g.fillRect(cx + 1 - step, 13, 2, 3)
    // Shirt
    g.fillStyle(shirtColor); g.fillRect(cx - 3, 7, 6, 6)
    // Head / Skin
    g.fillStyle(skinColor); g.fillRect(cx - 3, 2, 6, 5)
    // Hair
    g.fillStyle(hairColor); g.fillRect(cx - 3, 2, 6, 2)
    // Eyes / Facing
    g.fillStyle(0x101820)
    if (facing === 'down') { g.fillRect(cx - 2, 5, 1, 1); g.fillRect(cx + 1, 5, 1, 1) }
    else if (facing === 'up') { g.fillStyle(hairColor); g.fillRect(cx - 3, 2, 6, 3) }
    else if (facing === 'left') { g.fillRect(cx - 3, 5, 1, 1) }
    else { g.fillRect(cx + 2, 5, 1, 1) }
    g.generateTexture(key, 16, 16)
  }

  // The player kid: Red cap/shirt + Denim blue pants.
  private buildPlayer() {
    const g = this.make.graphics({}, false)
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.drawCharacter(
        g,
        `kid_${f}_0`,
        f,
        0,
        GBC_PAL.shirtHero,
        GBC_PAL.pantsHero,
        GBC_PAL.hairDark,
      )
      this.drawCharacter(
        g,
        `kid_${f}_1`,
        f,
        1,
        GBC_PAL.shirtHero,
        GBC_PAL.pantsHero,
        GBC_PAL.hairDark,
      )
    })
    g.destroy()
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.anims.create({
        key: `walk_${f}`,
        frames: [{ key: `kid_${f}_0` }, { key: `kid_${f}_1` }],
        frameRate: 6,
        repeat: -1,
      })
    })
  }

  // Static idle facings for each NPC with distinct GBC outfits.
  private buildNpcs() {
    const g = this.make.graphics({}, false)
    const npcConfigs = {
      mom: { shirt: GBC_PAL.shirtMom, pants: 0x403050, hair: GBC_PAL.hairDark },
      ren: { shirt: GBC_PAL.shirtRen, pants: 0x283850, hair: GBC_PAL.hairGold },
      gus: { shirt: GBC_PAL.shirtGus, pants: 0x384038, hair: GBC_PAL.hairGrey },
    }

    for (const npc of Object.values(NPCS)) {
      const cfg = npcConfigs[npc.id as keyof typeof npcConfigs] ?? {
        shirt: 0x507090,
        pants: 0x203040,
        hair: GBC_PAL.hairDark,
      }
      ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
        this.drawCharacter(
          g,
          `npc_${npc.id}_${f}`,
          f,
          0,
          cfg.shirt,
          cfg.pants,
          cfg.hair,
        )
      })
    }
    g.destroy()
  }

  // Small inventory icons in full GBC color.
  private buildItems() {
    const g = this.make.graphics({}, false)
    // Flashlight
    g.fillStyle(GBC_PAL.flashlightBody); g.fillRect(2, 5, 8, 4)
    g.fillStyle(GBC_PAL.flashlightGlow); g.fillRect(9, 4, 4, 6)
    g.fillStyle(0xffffff); g.fillRect(12, 5, 2, 4)
    g.generateTexture('item_flashlight', 16, 16)
    g.clear()
    // Wilted flower
    g.fillStyle(GBC_PAL.flowerStem); g.fillRect(7, 6, 2, 8) // stem
    g.fillStyle(GBC_PAL.flowerBloom); g.fillCircle(8, 5, 3) // drooping bloom
    g.fillStyle(GBC_PAL.grassBg); g.fillRect(4, 9, 2, 1); g.fillRect(10, 10, 2, 1)
    g.generateTexture('item_flower', 16, 16)
    g.destroy()
  }
}
