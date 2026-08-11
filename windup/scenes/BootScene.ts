import Phaser from 'phaser'
import { TILE, PAL, GBC_PAL } from '../constants'

import { GameState } from '../state'

type Facing = 'left' | 'right'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot')
  }

  create() {
    GameState.loadSave()

    ;(['dmg', 'gbc'] as const).forEach((mode) => {
      this.buildTileset(mode)
      this.buildPlayer(mode)
      this.buildStation(mode)
      this.buildEnergy(mode)
      this.buildGoal(mode)
      this.buildBackdrop(mode)
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

  private drawWindupToy(
    g: Phaser.GameObjects.Graphics,
    key: string,
    facing: Facing,
    mode: 'dmg' | 'gbc',
  ) {
    if (this.textures.exists(key)) return
    g.clear()
    const cx = 8
    const bodyColor = mode === 'dmg' ? PAL.dark : GBC_PAL.robotBody
    const darkColor = mode === 'dmg' ? PAL.darkest : GBC_PAL.robotDark
    const keyColor = mode === 'dmg' ? PAL.lightest : GBC_PAL.windupKey
    const eyeColor = mode === 'dmg' ? PAL.lightest : GBC_PAL.eyeGlow

    // Brass Winding Key on back
    g.fillStyle(keyColor)
    if (facing === 'right') {
      g.fillRect(cx - 7, 5, 3, 4)
      g.fillRect(cx - 8, 4, 1, 6)
    } else {
      g.fillRect(cx + 4, 5, 3, 4)
      g.fillRect(cx + 7, 4, 1, 6)
    }

    // Robot Head & Body
    g.fillStyle(bodyColor); g.fillRect(cx - 4, 2, 8, 11)
    g.fillStyle(darkColor); g.strokeRect(cx - 4, 2, 8, 11)

    // Eye Slit & Eye
    g.fillStyle(darkColor); g.fillRect(cx - 3, 4, 6, 3)
    g.fillStyle(eyeColor)
    if (facing === 'right') {
      g.fillRect(cx, 5, 2, 1)
    } else {
      g.fillRect(cx - 2, 5, 2, 1)
    }

    // Feet / Tread
    g.fillStyle(darkColor)
    g.fillRect(cx - 4, 13, 3, 3)
    g.fillRect(cx + 1, 13, 3, 3)

    g.generateTexture(key, 16, 16)
  }

  private buildPlayer(mode: 'dmg' | 'gbc') {
    const g = this.make.graphics({}, false)
    ;(['left', 'right'] as const).forEach((f) => {
      this.drawWindupToy(g, `windup_${mode}_${f}`, f, mode)
    })
    g.destroy()
  }

  private buildStation(mode: 'dmg' | 'gbc') {
    const key = `station_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const body = mode === 'dmg' ? PAL.dark : GBC_PAL.stationBody
    const glow = mode === 'dmg' ? PAL.lightest : GBC_PAL.stationGlow
    const dark = mode === 'dmg' ? PAL.darkest : 0x303030

    g.fillStyle(dark); g.fillRect(2, 4, 12, 12)
    g.fillStyle(body); g.fillRect(3, 5, 10, 10)
    g.fillStyle(glow); g.fillCircle(8, 9, 3)

    g.generateTexture(key, 16, 16)
    g.clear()

    // Empty (Used) Station
    const emptyKey = `station_empty_${mode}`
    g.fillStyle(dark); g.fillRect(2, 4, 12, 12)
    g.fillStyle(body); g.fillRect(3, 5, 10, 10)
    // No glow in center, just a dark hole or dim color
    g.fillStyle(dark); g.fillCircle(8, 9, 3)

    g.generateTexture(emptyKey, 16, 16)
    g.destroy()
  }

  private buildEnergy(mode: 'dmg' | 'gbc') {
    const key = `energy_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const base = mode === 'dmg' ? PAL.dark : GBC_PAL.energyBase
    const glow = mode === 'dmg' ? PAL.light : GBC_PAL.energyGlow

    g.fillStyle(glow); g.fillCircle(8, 8, 6)
    g.fillStyle(base); g.fillRect(6, 4, 4, 8)
    g.fillStyle(base); g.fillRect(4, 6, 8, 4)

    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildGoal(mode: 'dmg' | 'gbc') {
    const key = `goal_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    const dark = mode === 'dmg' ? PAL.darkest : 0x000000
    const light = mode === 'dmg' ? PAL.lightest : 0xffffff
    const pole = mode === 'dmg' ? PAL.dark : 0x888888

    // Pole
    g.fillStyle(pole); g.fillRect(2, 0, 2, 16)
    // Checkered Flag
    g.fillStyle(light); g.fillRect(4, 0, 10, 8)
    g.fillStyle(dark)
    g.fillRect(4, 0, 5, 4); g.fillRect(9, 4, 5, 4)

    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  /**
   * The factory behind the platforms (#52).
   *
   * Windup was the only one of the five games with nothing at all behind its
   * tilemap — just `setBackgroundColor('#0b0f0c')`.
   *
   * Everything here is drawn in the two darkest tones available, and never in
   * the tones the tileset uses for solid ground. On a 160x144 screen a
   * backdrop that competes with the platforms is worse than no backdrop: the
   * player has to be able to tell in one glance what they can stand on.
   */
  private buildBackdrop(mode: 'dmg' | 'gbc') {
    if (this.textures.exists(`bg_gear_lg_${mode}`)) return
    const g = this.make.graphics({}, false)

    // Two tones, and in DMG the accent is the *background* colour rather than
    // a lighter green. The obvious choice there was PAL.dark — but that is
    // exactly the tone the tileset paints brick in, so pipe collars and rivets
    // came out the same shade as a platform and the backdrop started reading
    // as something you could stand on. Cutting the detail out in the camera's
    // own background colour keeps every backdrop pixel at or below `darkest`.
    const mass = mode === 'dmg' ? PAL.darkest : 0x1c2436
    const edge = mode === 'dmg' ? 0x0b0f0c : 0x2e3a52

    const gear = (size: number, teeth: number, key: string) => {
      const r = size / 2
      const c = r
      g.fillStyle(mass)
      g.fillCircle(c, c, r - 3)
      // Teeth as blocks around the rim, so the silhouette reads at this size
      // where a drawn cog outline would just alias into a circle.
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2
        g.fillRect(c + Math.cos(a) * (r - 3) - 2, c + Math.sin(a) * (r - 3) - 2, 4, 4)
      }
      g.fillStyle(edge)
      g.fillCircle(c, c, 2) // hub
      g.generateTexture(key, size, size)
      g.clear()
    }
    gear(28, 8, `bg_gear_lg_${mode}`)
    gear(18, 6, `bg_gear_sm_${mode}`)

    // Vertical pipe run, tiled down a wall.
    g.fillStyle(mass)
    g.fillRect(0, 0, 6, 16)
    g.fillStyle(edge)
    g.fillRect(0, 6, 6, 2) // collar
    g.generateTexture(`bg_pipe_${mode}`, 6, 16)
    g.clear()

    // Horizontal girder with rivets.
    g.fillStyle(mass)
    g.fillRect(0, 0, 32, 6)
    g.fillStyle(edge)
    for (let x = 3; x < 32; x += 7) g.fillRect(x, 2, 2, 2)
    g.generateTexture(`bg_girder_${mode}`, 32, 6)
    g.clear()

    // Hanging lamp: a stem and a shade. Unlit — it is scenery, and a glowing
    // lamp at this depth would pull the eye off the player.
    g.fillStyle(edge)
    g.fillRect(4, 0, 1, 5)
    g.fillStyle(mass)
    g.fillRect(1, 5, 8, 4)
    g.fillRect(3, 9, 4, 2)
    g.generateTexture(`bg_lamp_${mode}`, 10, 12)
    g.clear()

    g.destroy()
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
