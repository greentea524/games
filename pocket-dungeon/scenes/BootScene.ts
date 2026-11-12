import Phaser from 'phaser'
import { TILE, PAL } from '../constants'
import { ICONS, iconKey } from '../hud'
import { SPRITES, SPRITE_PX, pixels, textureKey, type Mode } from '../sprites'
import { CATACOMB, CELLAR, DMG as DMG_TILES, FRAME, TILE_PX, VAULT, drawTileset, type TilePalette } from '../tiles'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildSprites(mode)
      this.buildRelicPips(mode)
      this.buildHudIcons(mode)
    })
    this.scene.start('title')
  }

  /**
   * The hero, monsters, items and props, from the pictures in `sprites.ts`
   * (#157). Each is painted pixel by pixel into its own canvas.
   */
  private buildSprites(mode: Mode) {
    for (const name of Object.keys(SPRITES)) {
      const key = textureKey(name, mode)
      if (this.textures.exists(key)) continue
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = SPRITE_PX
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      pixels(name, mode).forEach((row, y) =>
        row.forEach((colour, x) => {
          if (colour === null) return
          ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`
          ctx.fillRect(x, y, 1, 1)
        }),
      )
      this.textures.addCanvas(key, canvas)
    }
  }

  /**
   * The HUD's heart and slot pictures, 8x8 (#158). One colour each; on the
   * green screen that colour is the lightest tone, against the dark bar.
   */
  private buildHudIcons(mode: Mode) {
    for (const [name, icon] of Object.entries(ICONS)) {
      const key = iconKey(name, mode)
      if (this.textures.exists(key)) continue
      const g = this.make.graphics({}, false)
      g.fillStyle(mode === 'dmg' ? PAL.lightest : icon.gbc)
      icon.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1)
      })
      g.generateTexture(key, icon.rows[0].length, icon.rows.length)
      g.destroy()
    }
  }

  /**
   * The HUD's relic pips, 6x6 (#84). `_held` is the filled one.
   *
   * A pip is not the relic scaled down — at 6px a scaled sprite is mush — so
   * it is its own shape, filled for a relic held and hollow for one still out
   * there.
   */
  private buildRelicPips(mode: Mode) {
    const isDmg = mode === 'dmg'
    for (const held of [true, false]) {
      const key = `relicpip_${held ? 'held' : 'empty'}_${mode}`
      if (this.textures.exists(key)) continue
      const g = this.make.graphics({}, false)
      // The pips sit on the black status bar, not on the dungeon floor, so
      // they answer to *it*. Drawn in PAL.darkest and PAL.dark first, which is
      // the same mistake as the floor sprites with the surface swapped: both
      // tones vanished into the bar. A held pip is the lightest tone the ramp
      // has; an empty one is a dimmer outline, and the fill-vs-outline shape
      // is what separates them at 6px rather than the tone alone.
      const tone = isDmg ? (held ? PAL.lightest : PAL.dark) : held ? 0xffd700 : 0x8a7a50
      g.fillStyle(tone)
      if (held) {
        g.fillRect(2, 0, 2, 6); g.fillRect(1, 1, 4, 4); g.fillRect(0, 2, 6, 2)
      } else {
        g.fillRect(2, 0, 2, 1); g.fillRect(1, 1, 1, 1); g.fillRect(4, 1, 1, 1)
        g.fillRect(0, 2, 1, 2); g.fillRect(5, 2, 1, 2)
        g.fillRect(1, 4, 1, 1); g.fillRect(4, 4, 1, 1); g.fillRect(2, 5, 2, 1)
      }
      g.generateTexture(key, 6, 6)
      g.destroy()
    }
  }

  /**
   * Floors and walls, drawn at the new tile size by `tiles.ts` (#156).
   */
  private buildTileset(mode: 'dmg' | 'gbc') {
    const sets: [string, TilePalette, boolean][] =
      mode === 'dmg'
        ? [['tiles_dmg_v2', DMG_TILES, true]]
        : [
            ['tiles_gbc_cellar_v2', CELLAR, false],
            ['tiles_gbc_catacomb_v2', CATACOMB, false],
            ['tiles_gbc_vault_v2', VAULT, false],
          ]
    for (const [key, palette, dmg] of sets) {
      if (this.textures.exists(key)) continue
      const canvas = document.createElement('canvas')
      canvas.width = TILE_PX * FRAME.count
      canvas.height = TILE_PX
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      drawTileset(ctx, palette, dmg)
      const texture = this.textures.addCanvas(key, canvas)
      if (!texture) continue
      for (let i = 0; i < FRAME.count; i++) texture.add(i, 0, i * TILE_PX, 0, TILE_PX, TILE_PX)
    }
    if (mode === 'gbc' && !this.textures.exists('torchglow')) this.buildTorchGlow()
  }

  /**
   * A soft warm pool for under a wall torch (#156): a radial gradient, white
   * at the middle so the colour comes from the tint it is drawn with.
   */
  private buildTorchGlow() {
    const size = TILE * 7
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    this.textures.addCanvas('torchglow', canvas)
  }
}
