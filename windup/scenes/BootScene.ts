import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'

import { GameState } from '../state'
import {
  SPRITE_PX, POSES, POSE_ROWS, KEY_FRAMES, KEY_W, KEY_H, PICTURES, HEAD_BOX, pixels,
} from '../sprites'
import {
  picture, PALETTES, stoneSheet, spikes, lava, LAVA_FRAMES, belt, BELT_FRAMES, spring, mover, pylon,
  farLayer, midLayer, nearLayer, gear, gearFrames, BIG_GEAR, SMALL_GEAR, GEAR_STEP, type Picture,
} from '../factory'


export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    GameState.loadSave()

    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildFactory(mode)
      this.buildSprites(mode)
      this.buildPuff(mode)
    })
    this.scene.start('mainmenu')
  }

  private buildTileset(mode: 'dmg' | 'gbc') {
    const key = `tiles_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)
    const T = TILE
    const at = (i: number) => i * T

    if (mode === 'dmg') {
      // 0: Grass Ground
      g.fillStyle(PAL.lightest); g.fillRect(at(0), 0, T, T)
      g.fillStyle(PAL.dark); g.fillRect(at(0), 0, T, 3)
      g.fillStyle(PAL.light); g.fillRect(at(0) + 2, 5, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1)

      // 1: Brick Wall
      g.fillStyle(PAL.dark); g.fillRect(at(1), 0, T, T)
      g.fillStyle(PAL.darkest)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)
      
      // 2: Spring Pad
      g.fillStyle(PAL.dark); g.fillRect(at(2), 12, T, 4)
      g.fillStyle(PAL.light)
      g.fillRect(at(2) + 2, 8, T - 4, 4)
      g.fillRect(at(2) + 4, 6, T - 8, 2)
      
      // 3: Moving Platform
      g.fillStyle(PAL.dark); g.fillRect(at(3), 0, T, 8)
      g.fillStyle(PAL.light); g.fillRect(at(3), 0, T, 2)
      g.fillStyle(PAL.light); g.fillRect(at(3), 6, T, 2)

      // 4: Spikes (#54). Points up, base sitting on the tile floor. Drawn in
      // the lightest tone the palette has: a hazard the player misses is a
      // hazard that feels unfair, so it is the highest-contrast thing on
      // screen after the toy itself.
      g.fillStyle(PAL.dark); g.fillRect(at(4), 12, T, 4)
      g.fillStyle(PAL.lightest)
      for (let i = 0; i < 4; i++) {
        const x = at(4) + i * 4
        g.fillRect(x + 1, 8, 2, 4)
        g.fillRect(x + 1, 6, 1, 2)
      }

      // 5: Lava. A surface, not a full tile — the drain happens on contact
      // with the top, and a solid block would read as standable.
      g.fillStyle(PAL.dark); g.fillRect(at(5), 0, T, T)
      g.fillStyle(PAL.light); g.fillRect(at(5), 0, T, 4)
      g.fillStyle(PAL.lightest)
      g.fillRect(at(5) + 1, 1, 3, 1); g.fillRect(at(5) + 8, 2, 4, 1)

      // 6-9: Conveyor (#55). Two frames per direction; cycling them is what
      // shows which way the belt runs, so the chevrons are offset by half
      // their spacing between frames rather than redrawn.
      for (let f = 0; f < 4; f++) {
        const i = 6 + f
        const dir = f < 2 ? 1 : -1
        const phase = (f % 2) * 4
        g.fillStyle(PAL.dark); g.fillRect(at(i), 0, T, T)
        g.fillStyle(PAL.darkest); g.fillRect(at(i), 0, T, 2); g.fillRect(at(i), T - 2, T, 2)
        g.fillStyle(PAL.lightest)
        for (let x = -8; x < T; x += 8) {
          const cx = at(i) + x + phase
          // A chevron: two diagonals meeting at the point, drawn as steps.
          for (let k = 0; k < 3; k++) {
            const px = dir > 0 ? cx + k : cx + 4 - k
            g.fillRect(px, 6 + k, 1, 1)
            g.fillRect(px, 10 - k, 1, 1)
          }
        }
      }
    } else {
      // GBC Color
      // 0: Grass Ground
      g.fillStyle(GBC_PAL.groundBg); g.fillRect(at(0), 0, T, T)
      g.fillStyle(GBC_PAL.groundDetail); g.fillRect(at(0), 0, T, 3)
      g.fillRect(at(0) + 2, 5, 2, 1); g.fillRect(at(0) + 10, 9, 2, 1)

      // 1: Brick Wall
      g.fillStyle(GBC_PAL.brickWall); g.fillRect(at(1), 0, T, T)
      g.fillStyle(GBC_PAL.brickLine)
      for (let y = 0; y < T; y += 4) g.fillRect(at(1), y, T, 1)
      for (let x = 0; x < T; x += 8) g.fillRect(at(1) + x, 0, 1, T)

      // 2: Spring Pad
      g.fillStyle(GBC_PAL.springBase); g.fillRect(at(2), 12, T, 4)
      g.fillStyle(GBC_PAL.springCoil)
      g.fillRect(at(2) + 2, 8, T - 4, 4)
      g.fillRect(at(2) + 4, 6, T - 8, 2)
      
      // 3: Moving Platform
      g.fillStyle(GBC_PAL.platformBody); g.fillRect(at(3), 0, T, 8)
      g.fillStyle(GBC_PAL.platformEdge); g.fillRect(at(3), 0, T, 2)
      g.fillStyle(GBC_PAL.platformEdge); g.fillRect(at(3), 6, T, 2)

      // 4: Spikes (#54)
      g.fillStyle(GBC_PAL.platformBody); g.fillRect(at(4), 12, T, 4)
      g.fillStyle(GBC_PAL.springCoil)
      for (let i = 0; i < 4; i++) {
        const x = at(4) + i * 4
        g.fillRect(x + 1, 8, 2, 4)
        g.fillRect(x + 1, 6, 1, 2)
      }

      // 5: Lava
      g.fillStyle(GBC_PAL.brickLine); g.fillRect(at(5), 0, T, T)
      g.fillStyle(GBC_PAL.brickWall); g.fillRect(at(5), 0, T, 4)
      g.fillStyle(GBC_PAL.stationBody)
      g.fillRect(at(5) + 1, 1, 3, 1); g.fillRect(at(5) + 8, 2, 4, 1)

      // 6-9: Conveyor (#55)
      for (let f = 0; f < 4; f++) {
        const i = 6 + f
        const dir = f < 2 ? 1 : -1
        const phase = (f % 2) * 4
        g.fillStyle(GBC_PAL.platformBody); g.fillRect(at(i), 0, T, T)
        g.fillStyle(GBC_PAL.brickLine); g.fillRect(at(i), 0, T, 2); g.fillRect(at(i), T - 2, T, 2)
        g.fillStyle(GBC_PAL.stationLight)
        for (let x = -8; x < T; x += 8) {
          const cx = at(i) + x + phase
          for (let k = 0; k < 3; k++) {
            const px = dir > 0 ? cx + k : cx + 4 - k
            g.fillRect(px, 6 + k, 1, 1)
            g.fillRect(px, 10 - k, 1, 1)
          }
        }
      }
    }

    g.generateTexture(key, T * 10, T)
    g.destroy()
    
    const tex = this.textures.get(key)
    for (let i = 0; i < 10; i++) {
      tex.add(i, 0, i * T, 0, T, T)
    }
  }

  /**
   * The toy, its key, the orb, the station and the goal (#168), from the
   * letter pictures in `sprites.ts`, at 24 pixels and shown at two thirds.
   */
  private buildSprites(mode: 'dmg' | 'gbc') {
    if (this.textures.exists(`robot_${mode}`)) return
    const pic = (rows: string[], w = SPRITE_PX, h = SPRITE_PX): Picture => {
      const p = picture(w, h)
      pixels(rows, mode, w, h).forEach((row, y) => row.forEach((c, x) => { if (c !== null) p.px[y * w + x] = c }))
      return p
    }
    this.sheet(`robot_${mode}`, POSES.map((pose) => pic(POSE_ROWS[pose])))
    this.sheet(`key_${mode}`, KEY_FRAMES.map((rows) => pic(rows, KEY_W, KEY_H)))
    for (const [name, rows] of Object.entries(PICTURES)) this.sheet(`${name}_${mode}`, [pic(rows)])

    // The HUD's portrait (#56): the head, cut out of the toy's own picture
    // rather than drawn twice. A texture of its own, not a frame on the toy's:
    // see the note on `sheet` about the first frame added.
    //
    // Without the outline (#169). It sits on the HUD's panel now, which on
    // the green screen is the outline's own tone, so the outline only melted
    // into it; `qa:contrast` counted 37 pixels of the head lost to the panel.
    const headKey = `windup_${mode}_head`
    const b = HEAD_BOX
    const head = picture(b.width, b.height)
    const idle = pic(POSE_ROWS.idle)
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      if (POSE_ROWS.idle[b.y + y][b.x + x] === '.') continue
      head.px[y * b.width + x] = idle.px[(b.y + y) * SPRITE_PX + b.x + x]
    }
    this.sheet(headKey, [head])
  }

  /**
   * The factory (#167): stone, hazards, machines and the hall behind, drawn
   * by `factory.ts` at 24 pixels to a tile and shown at two thirds.
   *
   * `tiles_<mode>` is still built and still what every body is made from, so
   * no hitbox moved: each sprite is created from its old 16-unit frame and
   * then given its picture.
   */
  private buildFactory(mode: 'dmg' | 'gbc') {
    if (this.textures.exists(`stone_${mode}`)) return
    const pal = PALETTES[mode]
    this.sheet(`stone_${mode}`, stoneSheet(pal))
    this.sheet(`spike_${mode}`, [spikes(pal)])
    this.sheet(`lava_${mode}`, Array.from({ length: LAVA_FRAMES }, (_, f) => lava(f, pal)))
    this.sheet(`belt_${mode}`, Array.from({ length: BELT_FRAMES }, (_, f) => belt(f, pal)))
    this.sheet(`spring_${mode}`, [spring(pal)])
    this.sheet(`mover_${mode}`, [mover(pal)])
    this.sheet(`pylon_${mode}`, [pylon(pal)])
    this.sheet(`bgfar_${mode}`, [farLayer(pal)])
    this.sheet(`bgmid_${mode}`, [midLayer(pal)])
    this.sheet(`bgnear_${mode}`, [nearLayer(pal)])
    // The small gear meshes with the big one, which has twice its teeth, so
    // it turns the other way and twice as far: its frames step backwards.
    this.sheet(`gearbig_${mode}`, Array.from({ length: gearFrames(BIG_GEAR) }, (_, f) => gear(BIG_GEAR, f * GEAR_STEP, pal)))
    this.sheet(`gearsmall_${mode}`, Array.from({ length: gearFrames(SMALL_GEAR) }, (_, f) => gear(SMALL_GEAR, -f * GEAR_STEP, pal)))
  }

  /**
   * One texture from pictures of one size, side by side, a numbered frame
   * each. A single picture gets no numbered frame: Phaser gives the first
   * frame added to every sprite that names none (see `buildPlayer`).
   */
  private sheet(key: string, pics: Picture[]) {
    const { w, h } = pics[0]
    const tex = this.textures.createCanvas(key, w * pics.length, h)!
    const img = tex.context.createImageData(w * pics.length, h)
    pics.forEach((pic, f) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = pic.px[y * w + x]
          if (c < 0) continue
          const i = (y * w * pics.length + f * w + x) * 4
          img.data[i] = (c >> 16) & 255
          img.data[i + 1] = (c >> 8) & 255
          img.data[i + 2] = c & 255
          img.data[i + 3] = 255
        }
      }
    })
    tex.context.putImageData(img, 0, 0)
    if (pics.length > 1) pics.forEach((_, f) => tex.add(f, 0, f * w, 0, w, h))
    tex.refresh()
  }

  /**
   * Steam puff (#53).
   *
   * Soft-edged by stacking two sizes rather than by alpha, because the games
   * are drawn at 160x144 and a genuinely feathered 4px sprite just reads as a
   * smudge. The emitter fades the whole particle instead.
   */
  private buildPuff(mode: 'dmg' | 'gbc') {
    const key = `puff_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const core = mode === 'dmg' ? PAL.light : 0xb8c8d8
    const halo = mode === 'dmg' ? PAL.dark : 0x60707c

    g.fillStyle(halo)
    g.fillRect(1, 0, 3, 5)
    g.fillRect(0, 1, 5, 3)
    g.fillStyle(core)
    g.fillRect(1, 1, 3, 3)

    g.generateTexture(key, 5, 5)
    g.destroy()
  }
}
