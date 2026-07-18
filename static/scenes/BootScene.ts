import Phaser from 'phaser'
import { TILE, PAL } from '../constants'
import { NPCS } from '../dialogue'
import townUrl from '../assets/town.json?url'
import houseUrl from '../assets/house.json?url'

type Facing = 'down' | 'up' | 'left' | 'right'
type Shade = 'lightest' | 'light' | 'dark' | 'darkest'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  preload() {
    this.load.tilemapTiledJSON('town', townUrl)
    this.load.tilemapTiledJSON('house', houseUrl)
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

    // 1 GRASS
    g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
    g.fillStyle(PAL.light)
    g.fillRect(at(0) + 3, 4, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1); g.fillRect(at(0) + 6, 12, 1, 1)

    // 2 PATH (dirt)
    g.fillStyle(PAL.light); g.fillRect(at(1), 0, T, T)
    g.fillStyle(PAL.dark)
    g.fillRect(at(1) + 2, 3, 1, 1); g.fillRect(at(1) + 8, 6, 1, 1); g.fillRect(at(1) + 5, 11, 1, 1)

    // 3 TREE
    g.fillStyle(PAL.lightest); g.fillRect(at(2), 0, T, T)
    g.fillStyle(PAL.dark); g.fillCircle(at(2) + 8, 7, 7)
    g.fillStyle(PAL.darkest); g.fillCircle(at(2) + 8, 6, 4)
    g.fillStyle(PAL.darkest); g.fillRect(at(2) + 7, 12, 2, 4)

    // 4 WALL (house body)
    g.fillStyle(PAL.light); g.fillRect(at(3), 0, T, T)
    g.fillStyle(PAL.dark)
    g.lineStyle(1, PAL.dark)
    for (let y = 0; y < T; y += 4) g.fillRect(at(3), y, T, 1)
    for (let x = 0; x < T; x += 8) g.fillRect(at(3) + x, 0, 1, T)
    g.fillRect(at(3) + 4, 4, 1, T)

    // 5 ROOF
    g.fillStyle(PAL.dark); g.fillRect(at(4), 0, T, T)
    g.fillStyle(PAL.darkest)
    for (let y = 1; y < T; y += 3) g.fillRect(at(4), y, T, 1)

    // 6 DOOR
    g.fillStyle(PAL.dark); g.fillRect(at(5), 0, T, T)
    g.fillStyle(PAL.darkest); g.fillRect(at(5) + 3, 2, 10, 14)
    g.fillStyle(PAL.light); g.fillRect(at(5) + 11, 9, 1, 2) // knob

    // 7 WATER
    g.fillStyle(PAL.dark); g.fillRect(at(6), 0, T, T)
    g.fillStyle(PAL.light)
    g.fillRect(at(6) + 2, 4, 4, 1); g.fillRect(at(6) + 9, 8, 4, 1); g.fillRect(at(6) + 4, 12, 4, 1)

    // 8 FLOOR (interior boards)
    g.fillStyle(PAL.light); g.fillRect(at(7), 0, T, T)
    g.fillStyle(PAL.dark)
    for (let x = 0; x < T; x += 8) g.fillRect(at(7) + x, 0, 1, T)

    g.generateTexture('tiles', T * 8, T)
    g.destroy()
  }

  // Draws one 16x16 character frame with the given shirt/hair shades.
  private drawCharacter(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    step: number,
    shirt: Shade,
    hair: Shade,
  ) {
    g.clear()
    const cx = 8
    g.fillStyle(PAL.darkest)
    g.fillRect(cx - 3 + step, 13, 2, 3)
    g.fillRect(cx + 1 - step, 13, 2, 3)
    g.fillStyle(PAL[shirt]); g.fillRect(cx - 3, 7, 6, 6)
    g.fillStyle(PAL.lightest); g.fillRect(cx - 3, 2, 6, 5)
    g.fillStyle(PAL[hair]); g.fillRect(cx - 3, 2, 6, 2)
    g.fillStyle(PAL.darkest)
    if (facing === 'down') { g.fillRect(cx - 2, 5, 1, 1); g.fillRect(cx + 1, 5, 1, 1) }
    else if (facing === 'up') { g.fillStyle(PAL[hair]); g.fillRect(cx - 3, 2, 6, 3) }
    else if (facing === 'left') { g.fillRect(cx - 3, 5, 1, 1) }
    else { g.fillRect(cx + 2, 5, 1, 1) }
    g.generateTexture(key, 16, 16)
  }

  // The player kid: 4 facings x 2 walk frames + walk anims.
  private buildPlayer() {
    const g = this.make.graphics({}, false)
    ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
      this.drawCharacter(g, `kid_${f}_0`, f, 0, 'dark', 'darkest')
      this.drawCharacter(g, `kid_${f}_1`, f, 1, 'dark', 'darkest')
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

  // Static idle facings for each NPC (no walk cycle needed).
  private buildNpcs() {
    const g = this.make.graphics({}, false)
    for (const npc of Object.values(NPCS)) {
      ;(['down', 'up', 'left', 'right'] as const).forEach((f) => {
        this.drawCharacter(g, `npc_${npc.id}_${f}`, f, 0, npc.shirt, npc.hair)
      })
    }
    g.destroy()
  }

  // Small inventory icons.
  private buildItems() {
    const g = this.make.graphics({}, false)
    // flashlight
    g.fillStyle(PAL.darkest); g.fillRect(2, 5, 8, 4)
    g.fillStyle(PAL.light); g.fillRect(9, 4, 4, 6)
    g.fillStyle(PAL.lightest); g.fillRect(12, 5, 2, 4)
    g.generateTexture('item_flashlight', 16, 16)
    g.clear()
    // wilted flower
    g.fillStyle(PAL.dark); g.fillRect(7, 6, 2, 8) // stem
    g.fillStyle(PAL.darkest); g.fillCircle(8, 5, 3) // drooping bloom
    g.fillStyle(PAL.light); g.fillRect(4, 9, 2, 1); g.fillRect(10, 10, 2, 1)
    g.generateTexture('item_flower', 16, 16)
    g.destroy()
  }
}
