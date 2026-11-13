import Phaser from 'phaser'
// Drawn on the old 16-pixel grid and enlarged afterwards; see `enlarge`.
import { LEGACY_TILE as TILE, TILE as NEW_TILE, SCALE, PAL, GBC_PAL, WORLD_PALS } from '../constants'
import {
  CORNER, DMG as DMG_TILES, FLOOR, LIT_PX, TILE_PX, WALL_FRAMES, drawCorners, drawCracked, drawFloor, drawHole,
  drawIce, drawTarget, drawTargetLit, drawWalls, worldPalette, type Painter,
} from '../tiles'

type Facing = 'down' | 'up' | 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildPlayer(mode)
      for (let w = 1; w <= 5; w++) {
        this.buildCrate(mode, w)
      }
    })
    // Before the tiles are built: they are drawn at 24 and must not be
    // enlarged a second time.
    this.enlarge()
    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      for (let w = 1; w <= 5; w++) this.buildTiles(mode, w)
    })
    this.scene.start('mainmenu')
  }

  /**
   * Enlarges every texture drawn below from the old 16-pixel grid to the
   * 24-pixel tile (#160).
   *
   * This ticket changes the canvas and leaves the art alone, so the game is
   * whole at the new size before any of it is redrawn. One and a half is not
   * a whole number of pixels, so an enlarged sprite has pixels of two widths,
   * and it shows. That ends as #161 to #163 replace each builder with art
   * drawn at 24; when none are left, this goes.
   */
  private enlarge() {
    const reserved = new Set(['__DEFAULT', '__MISSING', '__WHITE', '__NORMAL'])
    for (const key of this.textures.getTextureKeys()) {
      if (reserved.has(key)) continue
      const source = this.textures.get(key).getSourceImage() as HTMLCanvasElement
      if (source.width !== TILE || source.height !== TILE) continue
      const copy = document.createElement('canvas')
      copy.width = copy.height = NEW_TILE
      const ctx = copy.getContext('2d')
      if (!ctx) continue
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(source, 0, 0, Math.round(TILE * SCALE), Math.round(TILE * SCALE))
      this.textures.remove(key)
      this.textures.addCanvas(key, copy)
    }
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
      // #107: the side snout is the one part of this sprite that sticks out
      // past the head, and `whiteColor` is PAL.lightest in DMG — the floor
      // tone exactly. Facing left or right the fox lost its muzzle and read
      // as a blunt-faced block. The forward-facing snout is safe because the
      // head and the body enclose it; these two need their own edge.
      g.fillStyle(darkColor); g.fillRect(cx - 7, 5, 6, 5)
      g.fillStyle(whiteColor); g.fillRect(cx - 6, 6, 4, 3)
      g.fillStyle(darkColor); g.fillRect(cx - 6, 6, 2, 2)
      g.fillRect(cx - 3, 4, 1, 1)
    } else {
      g.fillStyle(darkColor); g.fillRect(cx + 1, 5, 6, 5)
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


}
