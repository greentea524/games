import Phaser from 'phaser'
import { DECOR, DMG_DECOR, decorPalette, drawDecor, drawDecorFloor } from '../decor'
import { SPRITES, SPRITE_PX, pixels, textureKey, type Mode } from '../sprites'
import {
  CORNER, DMG as DMG_TILES, FLOOR, LIT_PX, TILE_PX, WALL_FRAMES, drawCorners, drawCracked, drawFloor, drawHole,
  drawIce, drawTarget, drawTargetLit, drawWalls, worldPalette, type Painter,
} from '../tiles'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildSprites(mode)
      for (let w = 1; w <= 5; w++) this.buildTiles(mode, w)
    })
    this.scene.start('mainmenu')
  }

  /**
   * The floor, walls, targets and special floor, from `tiles.ts` (#161).
   *
   * The green screen has one set; colour has one for each world.
   */
  private buildTiles(mode: 'dmg' | 'gbc', world: number) {
    const suffix = mode === 'gbc' ? `_gbc_w${world}` : '_dmg'
    if (this.textures.exists(`floor${suffix}`)) return
    const dmg = mode === 'dmg'
    const pal = dmg ? DMG_TILES : worldPalette(world)

    /** A texture `width` by `height`, cut into `TILE_PX` frames when a strip. */
    const make = (name: string, width: number, height: number, draw: (p: Painter) => void) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      draw((x, y, w, h, colour) => {
        ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`
        ctx.fillRect(x, y, w, h)
      })
      const texture = this.textures.addCanvas(`${name}${suffix}`, canvas)
      if (texture && width > height) {
        for (let i = 0; i < width / TILE_PX; i++) texture.add(i, 0, i * TILE_PX, 0, TILE_PX, TILE_PX)
      }
    }

    make('floor', FLOOR.count * TILE_PX, TILE_PX, (p) => drawFloor(p, pal, dmg))
    make('wall', WALL_FRAMES * TILE_PX, TILE_PX, (p) => drawWalls(p, pal))
    make('wallcorner', CORNER.count * TILE_PX, TILE_PX, (p) => drawCorners(p, pal))
    make('target', TILE_PX, TILE_PX, (p) => drawTarget(p, pal, dmg))
    make('target_lit', LIT_PX, LIT_PX, (p) => drawTargetLit(p, pal, dmg))
    make('ice', TILE_PX, TILE_PX, (p) => drawIce(p, pal))
    make('cracked', TILE_PX, TILE_PX, (p) => drawCracked(p, pal, dmg))
    make('hole', TILE_PX, TILE_PX, (p) => drawHole(p, pal, dmg))

    // The warehouse outside the level (#163), dimmed so it stays behind.
    const decor = dmg ? DMG_DECOR : decorPalette(world)
    make('decorfloor', 2 * TILE_PX, TILE_PX, (p) => drawDecorFloor(p, decor, dmg))
    make('decor', DECOR.count * TILE_PX, TILE_PX, (p) => drawDecor(p, decor))
  }

  /**
   * The fox and the crates, from the pictures in `sprites.ts` (#162). Each is
   * painted pixel by pixel into its own canvas. The fox has one set for all
   * worlds; a crate's key carries the world, as every tile's does.
   */
  private buildSprites(mode: Mode) {
    for (const name of Object.keys(SPRITES)) {
      const worlds = name.startsWith('player_') || mode === 'dmg' ? [1] : [1, 2, 3, 4, 5]
      for (const world of worlds) {
        const key = textureKey(name, mode, world)
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
  }
}
