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
      this.buildSkeleton(mode)
      this.buildCobweb(mode)
      this.buildBoss(mode)
      this.buildItems(mode)
      this.buildChests(mode)
      this.buildRelics(mode)
    })
    this.scene.start('title')
  }

  private buildTileset(mode: 'dmg' | 'gbc') {
    const T = TILE
    const at = (i: number) => i * T

    const build = (key: string, colors: any, isDmg: boolean) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)

      // 0: Room Floor
      g.fillStyle(colors.floorBg); g.fillRect(at(0), 0, T, T)
      g.fillStyle(colors.floorDetail); g.fillRect(at(0) + 3, 3, 1, 1); g.fillRect(at(0) + 11, 11, 1, 1)

      const drawRaisedWall = (offsetX: number) => {
        g.fillStyle(colors.wallLine); g.fillRect(offsetX, 0, T, T)
        g.fillStyle(colors.wallBg); g.fillRect(offsetX + 1, 1, T - 2, T - 2)
        // Alpha belongs in fillStyle. Graphics has no globalAlpha, so these
        // three assignments did nothing and the highlight and shadow were
        // painted at full strength.
        // Highlight
        g.fillStyle(isDmg ? PAL.lightest : 0xffffff, 0.25)
        g.fillRect(offsetX + 1, 1, T - 2, 1); g.fillRect(offsetX + 1, 1, 1, T - 2)
        // Shadow
        g.fillStyle(isDmg ? PAL.darkest : 0x000000, 0.4)
        g.fillRect(offsetX + 1, T - 2, T - 2, 1); g.fillRect(offsetX + T - 2, 1, 1, T - 2)
      }

      // 1: Wall (raised block)
      drawRaisedWall(at(1))

      // 2: Stairs Down
      g.fillStyle(colors.floorBg); g.fillRect(at(2), 0, T, T)
      g.fillStyle(colors.stairsBg)
      for (let y = 2; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 2)
      if (!isDmg && colors.stairsStep) {
        g.fillStyle(colors.stairsStep)
        for (let y = 3; y < T - 2; y += 3) g.fillRect(at(2) + 2, y, T - 4, 1)
      }

      // 3: Corridor / Path Tile (distinct paved stone walkway)
      const pathBg = isDmg ? PAL.light : colors.pathBg ?? 0x1e1828
      const pathLine = isDmg ? PAL.dark : colors.pathLine ?? 0x3d304a
      g.fillStyle(pathBg); g.fillRect(at(3), 0, T, T)
      g.fillStyle(pathLine)
      g.fillRect(at(3) + 1, 1, T - 2, 1); g.fillRect(at(3) + 1, T - 2, T - 2, 1) // top/bottom edge lines
      g.fillRect(at(3) + 3, 4, 4, 4); g.fillRect(at(3) + 9, 8, 4, 4) // stone paving slabs

      // 4: Cracked Floor Tile
      g.fillStyle(colors.floorBg); g.fillRect(at(4), 0, T, T)
      g.fillStyle(colors.floorDetail)
      g.fillRect(at(4) + 4, 3, 1, 4); g.fillRect(at(4) + 5, 6, 4, 1); g.fillRect(at(4) + 8, 7, 1, 4)

      // 5: Wall with Torch
      drawRaisedWall(at(5))
      // Torch bracket
      g.fillStyle(isDmg ? PAL.darkest : 0x201510); g.fillRect(at(5) + 7, 7, 2, 5)
      // Flame
      g.fillStyle(isDmg ? PAL.lightest : 0xffa000); g.fillRect(at(5) + 6, 4, 4, 4)
      g.fillStyle(isDmg ? PAL.light : 0xffff00); g.fillRect(at(5) + 7, 5, 2, 2)

      // 6: Wall with Banner / Shield
      drawRaisedWall(at(6))
      // Banner
      g.fillStyle(isDmg ? PAL.darkest : 0xaa2030); g.fillRect(at(6) + 5, 3, 6, 9)
      g.fillStyle(isDmg ? PAL.lightest : 0xffd700); g.fillRect(at(6) + 7, 5, 2, 5)

      // 7: Rug / Altar Floor (center room decoration)
      g.fillStyle(colors.floorBg); g.fillRect(at(7), 0, T, T)
      g.fillStyle(isDmg ? PAL.light : (colors.rugColor ?? 0x882035)); g.fillRect(at(7) + 2, 2, T - 4, T - 4)
      g.fillStyle(isDmg ? PAL.lightest : 0xffd700); g.fillRect(at(7) + 3, 3, T - 6, 1); g.fillRect(at(7) + 3, T - 4, T - 6, 1)

      // 8: Bones / Debris Floor
      g.fillStyle(colors.floorBg); g.fillRect(at(8), 0, T, T)
      g.fillStyle(isDmg ? PAL.lightest : 0xe0d8c0)
      g.fillRect(at(8) + 4, 5, 3, 2); g.fillRect(at(8) + 9, 10, 3, 2) // skulls/bones
      g.fillStyle(colors.floorDetail); g.fillRect(at(8) + 5, 6, 1, 1); g.fillRect(at(8) + 10, 11, 1, 1)

      g.generateTexture(key, T * 9, T)
      g.destroy()

      const tex = this.textures.get(key)
      for (let i = 0; i < 9; i++) {
        tex.add(i, 0, i * T, 0, T, T)
      }
    }

    if (mode === 'dmg') {
      build('tiles_dmg_v2', {
        floorBg: PAL.lightest, floorDetail: PAL.light,
        wallBg: PAL.dark, wallLine: PAL.darkest,
        stairsBg: PAL.dark
      }, true)
    } else {
      build('tiles_gbc_cellar_v2', {
        floorBg: GBC_PAL.floorBg, floorDetail: GBC_PAL.floorDetail,
        wallBg: GBC_PAL.wallBg, wallLine: GBC_PAL.wallLine,
        stairsBg: GBC_PAL.stairsBg, stairsStep: GBC_PAL.stairsStep,
        pathBg: 0x1d1626, pathLine: 0x3d304a, rugColor: 0x882035,
      }, false)
      
      build('tiles_gbc_catacomb_v2', {
        floorBg: GBC_PAL.catacombFloorBg, floorDetail: GBC_PAL.catacombFloorDetail,
        wallBg: GBC_PAL.catacombWallBg, wallLine: GBC_PAL.catacombWallLine,
        stairsBg: GBC_PAL.stairsBg, stairsStep: GBC_PAL.stairsStep,
        pathBg: 0x302418, pathLine: 0x584028, rugColor: 0x904020,
      }, false)
      
      build('tiles_gbc_vault_v2', {
        floorBg: GBC_PAL.vaultFloorBg, floorDetail: GBC_PAL.vaultFloorDetail,
        wallBg: GBC_PAL.vaultWallBg, wallLine: GBC_PAL.vaultWallLine,
        stairsBg: GBC_PAL.stairsBg, stairsStep: GBC_PAL.stairsStep,
        pathBg: 0x122430, pathLine: 0x306080, rugColor: 0x207090,
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

  private buildCobweb(mode: 'dmg' | 'gbc') {
    const key = `cobweb_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    // A quarter web filling one corner of a 16px tile. It is placed as an
    // overlay sprite rather than a grid character on purpose — walkability
    // here is `grid[y][x] !== '#'`, so inventing a wall-variant character
    // would have made the corner walkable.
    //
    // Plotted a pixel at a time rather than stroked. `lineStyle(1)` rasterises
    // diagonals two pixels wide, and at this size the five radials it produced
    // merged into a clot that read as foliage, not a web.
    //
    // The two modes need opposite ends of their ramp: GBC floors are near
    // black, DMG's floor is PAL.lightest. The first DMG attempt used PAL.light
    // — the floor's own detail tone — and the web vanished into the floor in
    // the screenshot while every functional check still passed.
    const thread = mode === 'dmg' ? PAL.dark : 0x9a94a8
    g.fillStyle(thread, 1)

    const painted = new Set<number>()
    const dot = (x: number, y: number) => {
      if (x < 0 || y < 0 || x > 15 || y > 15) return
      const k = y * 16 + x
      if (painted.has(k)) return
      painted.add(k)
      g.fillRect(x, y, 1, 1)
    }
    const stroke = (x0: number, y0: number, x1: number, y1: number) => {
      const dx = Math.abs(x1 - x0)
      const dy = Math.abs(y1 - y0)
      const sx = x0 < x1 ? 1 : -1
      const sy = y0 < y1 ? 1 : -1
      let err = dx - dy
      let x = x0
      let y = y0
      for (;;) {
        dot(x, y)
        if (x === x1 && y === y1) return
        const e2 = 2 * err
        if (e2 > -dy) { err -= dy; x += sx }
        if (e2 < dx) { err += dx; y += sy }
      }
    }

    // Three radials — the two tile edges and the diagonal between them. Five
    // were tried; three is what leaves room for the chords to read.
    const RADIUS = 11
    const rays: [number, number][] = [[1, 0], [1, 1], [0, 1]]
    const along = ([dx, dy]: [number, number], t: number): [number, number] => {
      const h = Math.hypot(dx, dy)
      return [Math.round((dx * t) / h), Math.round((dy * t) / h)]
    }
    for (const ray of rays) {
      const [x, y] = along(ray, RADIUS)
      stroke(0, 0, x, y)
    }
    // Chords strung straight between neighbouring radials. The triangular
    // cells they cut are the part that actually reads as a web — concentric
    // arcs alone came out looking like scratches.
    for (const t of [4, 8, RADIUS]) {
      for (let i = 0; i < rays.length - 1; i++) {
        const [ax, ay] = along(rays[i], t)
        const [bx, by] = along(rays[i + 1], t)
        stroke(ax, ay, bx, by)
      }
    }

    g.generateTexture(key, 16, 16)
    g.destroy()
  }

  private buildSkeleton(mode: 'dmg' | 'gbc') {
    const key = `skeleton_${mode}`
    if (this.textures.exists(key)) return
    const g = this.make.graphics({}, false)

    // Deliberately NOT the Skeleton Archer's silhouette. That one is tall,
    // narrow and vertical with a bow line down its right side; drawn the same
    // way, the two were indistinguishable at 16px in a side-by-side — which
    // is the whole problem this sprite has to avoid, since the game names
    // what you are fighting in a one-line banner and nothing else.
    //
    // So Bonepile is squat and horizontal: a low heap with the skull sunk
    // into it and arm bones jutting sideways. Same palette family, opposite
    // mass — that reads apart at a glance even at this size.
    const bone = mode === 'dmg' ? PAL.lightest : 0xd8d8c0
    const shade = mode === 'dmg' ? PAL.dark : 0x807860
    const socket = mode === 'dmg' ? PAL.darkest : 0x201810

    // #107: as with the archer, `bone` is the DMG floor tone. The heap and
    // the jaw survived because they are `shade`; the skull, the arm bones and
    // the bone chips along the top of the pile did not, and Bonepile reached
    // the player as two sockets over a bare slab. The bones keep their colour
    // and get an edge one pixel proud of each shape.
    if (mode === 'dmg') {
      g.fillStyle(PAL.darkest)
      g.fillRect(4, 4, 8, 7)    // skull
      g.fillRect(0, 8, 5, 4)    // left arm bone
      g.fillRect(11, 8, 5, 4)   // right arm bone
      g.fillRect(2, 10, 5, 2)   // bone chips along the heap
      g.fillRect(6, 10, 4, 2)
      g.fillRect(10, 10, 4, 2)
    }

    // The heap it rises from — wide and low, the read at a distance.
    g.fillStyle(shade); g.fillRect(2, 12, 12, 3)
    g.fillStyle(bone)
    g.fillRect(3, 11, 3, 1); g.fillRect(7, 11, 2, 1); g.fillRect(11, 11, 2, 1)

    // Arm bones jutting sideways, widening the silhouette further.
    g.fillStyle(bone); g.fillRect(1, 9, 3, 2); g.fillRect(12, 9, 3, 2)

    // Skull, sunk low into the pile rather than perched on a spine.
    g.fillStyle(bone); g.fillRect(5, 5, 6, 5)
    g.fillStyle(socket); g.fillRect(6, 7, 2, 2); g.fillRect(9, 7, 2, 2)
    g.fillStyle(shade); g.fillRect(7, 9, 2, 1) // jaw line

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
    // #107: `bone` is PAL.lightest in DMG, which is the dungeon floor
    // exactly. Every bone on this sprite — skull, ribs, legs — was drawn in
    // the colour of the ground it stands on, and what reached the player was
    // two eye sockets, two rib lines and a bow floating in mid-air. It cannot
    // be retoned: a skeleton whose bones are dark is not reading as bone. So
    // the bones keep their colour and get an edge, drawn one pixel proud of
    // each shape and covered by the fills below.
    if (mode === 'dmg') {
      g.fillStyle(PAL.darkest)
      g.fillRect(4, 0, 8, 8)    // skull
      g.fillRect(5, 6, 6, 7)    // ribcage
      g.fillRect(5, 11, 4, 5)   // left leg
      g.fillRect(8, 11, 4, 5)   // right leg
    }
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

    // The two earlier bosses (#85). Same silhouette language as the Guardian —
    // wide body, lit eyes — so they read as bosses at a glance, with the
    // headpiece carrying which one it is: horns for the Brute, a ring of
    // skulls for the Choir, a crown for the Guardian.
    //
    // All three are dark-bodied. The DMG floor is PAL.lightest, and the
    // repo's most repeated defect is a sprite drawn in its own background's
    // tone (see qa/contrast).
    const brute = `boss_brute_${mode}`
    if (!this.textures.exists(brute)) {
      const b = this.make.graphics({}, false)
      const hide = mode === 'dmg' ? PAL.dark : 0x7a4a2a
      const hideDark = mode === 'dmg' ? PAL.darkest : 0x4a2a16
      // The horns are the whole point of this silhouette, and they sit on the
      // floor rather than on the body — so in DMG they answer to the floor,
      // not to the hide. Drawn in PAL.lightest first, which is the DMG floor
      // exactly: the screenshot showed a hornless block. PAL.darkest reads
      // against both the floor and the hide.
      const horn = mode === 'dmg' ? PAL.darkest : 0xe8d8b0
      const eyeB = mode === 'dmg' ? PAL.lightest : 0xffa030
      b.fillStyle(horn); b.fillRect(2, 1, 2, 4); b.fillRect(12, 1, 2, 4)
      b.fillStyle(hide); b.fillRect(3, 4, 10, 5)
      b.fillStyle(eyeB); b.fillRect(5, 6, 2, 2); b.fillRect(9, 6, 2, 2)
      b.fillStyle(hide); b.fillRect(1, 9, 14, 4)
      b.fillStyle(hideDark); b.fillRect(4, 10, 8, 2)
      b.fillStyle(hideDark); b.fillRect(2, 13, 4, 3); b.fillRect(10, 13, 4, 3)
      b.generateTexture(brute, 16, 16)
      b.destroy()
    }

    const choir = `boss_choir_${mode}`
    if (!this.textures.exists(choir)) {
      const c = this.make.graphics({}, false)
      const bone = mode === 'dmg' ? PAL.dark : 0x9a94a8
      const boneDark = mode === 'dmg' ? PAL.darkest : 0x4a4658
      const eyeC = mode === 'dmg' ? PAL.lightest : 0x80ffd0
      c.fillStyle(bone)
      c.fillRect(2, 0, 2, 2); c.fillRect(7, 0, 2, 2); c.fillRect(12, 0, 2, 2)
      c.fillStyle(boneDark); c.fillRect(3, 3, 10, 6)
      c.fillStyle(eyeC); c.fillRect(5, 6, 2, 2); c.fillRect(9, 6, 2, 2)
      c.fillStyle(boneDark); c.fillRect(2, 9, 12, 4)
      c.fillStyle(bone); c.fillRect(4, 10, 2, 2); c.fillRect(7, 10, 2, 2); c.fillRect(10, 10, 2, 2)
      c.fillStyle(boneDark); c.fillRect(3, 13, 3, 3); c.fillRect(10, 13, 3, 3)
      c.generateTexture(choir, 16, 16)
      c.destroy()
    }
  }

  /**
   * Chest sprites (#83), closed and open, per tier.
   *
   * A closed chest has to be legible as "bump this" at 16px next to the item
   * bag, which is also a small box. The lid band, the seam and the lock plate
   * are what separate them — the bag has none of those.
   *
   * The first version distinguished the tiers by lightness, which works in
   * GBC and is actively wrong in DMG: the golden chest was drawn in PAL.light
   * and PAL.lightest, and the DMG floor *is* PAL.lightest, so the lid band
   * disappeared into the ground and the chest lost its silhouette. The
   * screenshot showed two floating bars. Both DMG tiers are dark against the
   * light floor now, and the tier reads from the accent and the studs
   * instead — the one axis that palette leaves free.
   */
  /**
   * The relic and the escape portal (#84).
   *
   * The relic is drawn twice at two sizes: a 16px world/summary icon and a
   * 6px HUD pip. A pip is not the icon scaled down — at 6px a scaled 16px
   * sprite is mush — so it is drawn as its own shape, filled for a relic held
   * and hollow for one still out there.
   *
   * Both are dark-bodied in DMG for the usual reason: the DMG floor is
   * PAL.lightest and this repo has shipped five sprites invisible into it.
   * The portal's *inner* ring is the light tone, which is safe because it is
   * enclosed by the dark rim rather than touching the floor.
   */
  private buildRelics(mode: 'dmg' | 'gbc') {
    const isDmg = mode === 'dmg'
    const rim = isDmg ? PAL.darkest : 0x6a4a90
    const body = isDmg ? PAL.dark : 0xd8b040
    const glow = isDmg ? PAL.lightest : 0xfff0a0

    const relic = `relic_${mode}`
    if (!this.textures.exists(relic)) {
      const g = this.make.graphics({}, false)
      // A faceted gem: dark rim all the way round so the silhouette holds
      // against a light floor, with the bright facet enclosed inside it.
      g.fillStyle(rim)
      g.fillRect(6, 2, 4, 1); g.fillRect(4, 3, 8, 2); g.fillRect(3, 5, 10, 5)
      g.fillRect(4, 10, 8, 2); g.fillRect(6, 12, 4, 2)
      g.fillStyle(body)
      g.fillRect(5, 4, 6, 2); g.fillRect(4, 6, 8, 4); g.fillRect(5, 10, 6, 1)
      g.fillStyle(glow)
      g.fillRect(6, 5, 2, 3)
      g.generateTexture(relic, 16, 16)
      g.destroy()
    }

    // HUD pips, 6x6. `_held` is the filled one.
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

    const portal = `portal_${mode}`
    if (!this.textures.exists(portal)) {
      const g = this.make.graphics({}, false)
      // A ring standing on the stairs. The rim is the darkest tone in both
      // palettes so the circle reads as a hole rather than a puddle.
      g.fillStyle(rim)
      g.fillRect(5, 1, 6, 1); g.fillRect(3, 2, 10, 1); g.fillRect(2, 3, 12, 2)
      g.fillRect(1, 5, 14, 6); g.fillRect(2, 11, 12, 2); g.fillRect(3, 13, 10, 1)
      g.fillRect(5, 14, 6, 1)
      g.fillStyle(isDmg ? PAL.light : 0x8060c0)
      g.fillRect(5, 3, 6, 1); g.fillRect(4, 4, 8, 2)
      g.fillRect(3, 6, 10, 4); g.fillRect(4, 10, 8, 2); g.fillRect(5, 12, 6, 1)
      g.fillStyle(glow)
      g.fillRect(6, 5, 4, 1); g.fillRect(5, 6, 6, 4); g.fillRect(6, 10, 4, 1)
      g.generateTexture(portal, 16, 16)
      g.destroy()
    }
  }

  private buildChests(mode: 'dmg' | 'gbc') {
    const isDmg = mode === 'dmg'
    interface ChestSkin {
      body: number
      trim: number
      shadow: number
      accent: number
      ornate: boolean
      /** Draws a hasp and shackle over the seam, marking it as needing a key. */
      padlock?: boolean
    }
    const build = (key: string, c: ChestSkin, open: boolean) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)
      if (open) {
        // Lid swung back, and the inside painted dark so the chest reads as
        // emptied rather than just recoloured.
        g.fillStyle(c.trim); g.fillRect(2, 3, 12, 3)
        g.fillStyle(c.shadow); g.fillRect(3, 6, 10, 3)
        g.fillStyle(c.body); g.fillRect(2, 9, 12, 5)
        g.fillStyle(c.trim); g.fillRect(2, 9, 12, 1)
        g.fillStyle(c.shadow); g.fillRect(2, 13, 12, 1)
        if (c.ornate) { g.fillStyle(c.accent); g.fillRect(4, 11, 8, 1) }
      } else {
        g.fillStyle(c.body); g.fillRect(2, 5, 12, 9)
        // Lid band, then the seam under it — the seam is what makes the lid
        // read as a separate part rather than as a stripe.
        g.fillStyle(c.trim); g.fillRect(2, 5, 12, 3)
        g.fillStyle(c.shadow); g.fillRect(2, 8, 12, 1)
        g.fillStyle(c.shadow); g.fillRect(2, 13, 12, 1)
        if (c.padlock) {
          // A padlock big enough to be the thing you notice. The first attempt
          // kept the ordinary lock plate and tucked a small lock under it,
          // and at 16px the locked chest was indistinguishable from the plain
          // golden one — which defeats the point, since the player has to know
          // which chest costs a key before walking to it.
          //
          // Shadow tone throughout, so it reads as an object bolted on rather
          // than as more of the chest's own gilt, with the shackle arching
          // clear above the lid band.
          g.fillStyle(c.shadow)
          g.fillRect(6, 4, 1, 5)
          g.fillRect(9, 4, 1, 5)
          g.fillRect(7, 3, 2, 1)
          g.fillRect(4, 9, 8, 5)
          g.fillStyle(c.accent)
          g.fillRect(7, 10, 2, 2)
          g.fillRect(7, 12, 2, 1)
        } else {
          // Lock plate, straddling the seam, in the accent so it survives on a
          // lid band that is otherwise the darkest tone available.
          g.fillStyle(c.accent); g.fillRect(7, 7, 2, 3)
        }
        if (c.ornate) {
          g.fillStyle(c.accent)
          g.fillRect(3, 6, 1, 1); g.fillRect(12, 6, 1, 1)
          // The inlay bar is what the padlock body would sit on top of, so it
          // is skipped there — drawn anyway, it cut a bright line straight
          // through the lock.
          if (!c.padlock) g.fillRect(4, 11, 8, 1)
        }
      }
      g.generateTexture(key, 16, 16)
      g.destroy()
    }

    const skins: Record<string, ChestSkin> = {
      wooden: {
        body: isDmg ? PAL.dark : 0x8a5a2b,
        trim: isDmg ? PAL.darkest : 0xc0903a,
        shadow: isDmg ? PAL.darkest : 0x4a2f18,
        accent: isDmg ? PAL.light : 0xffd98a,
        ornate: false,
      },
      golden: {
        body: isDmg ? PAL.dark : 0xd4a017,
        trim: isDmg ? PAL.darkest : 0xffe066,
        shadow: isDmg ? PAL.darkest : 0x8a6a10,
        accent: isDmg ? PAL.lightest : 0xfffbe0,
        ornate: true,
      },
      // Locked (#59). The same gilt as the golden chest, with a padlock — the
      // player has to be able to tell at a glance which chest costs a key,
      // from across a room, in both palettes.
      locked: {
        body: isDmg ? PAL.dark : 0xd4a017,
        trim: isDmg ? PAL.darkest : 0xffe066,
        shadow: isDmg ? PAL.darkest : 0x8a6a10,
        accent: isDmg ? PAL.lightest : 0xfffbe0,
        ornate: true,
        padlock: true,
      },
    }
    for (const [tier, skin] of Object.entries(skins)) {
      build(`chest_${tier}_closed_${mode}`, skin, false)
      build(`chest_${tier}_open_${mode}`, skin, true)
    }
  }

  private buildItems(mode: 'dmg' | 'gbc') {
    const T = 16
    // Generic item pickup sprite: a small glowing bag/chest
    const buildItem = (key: string, color: number, accent: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)
      // #107. Six bags share this shape and four of them had a piece missing
      // on the DMG floor: the scroll's whole lid band was PAL.lightest, the
      // floor tone exactly, and the accessory, food and potion bodies were
      // PAL.light, one notch off it and barely there. Retoning them would
      // have collapsed six categories onto the two dark tones — weapon and
      // armour already share theirs — so the bags keep their colours and get
      // an edge instead, drawn one pixel proud of body, lid and tie.
      if (mode === 'dmg') {
        g.fillStyle(PAL.darkest)
        g.fillRect(3, 5, 10, 10)
        g.fillRect(4, 3, 8, 4)
        g.fillRect(6, 2, 4, 4)
      }
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
    // #82. Without this the accessory pickups fall back to a missing texture,
    // since the drop sprite key is `item_${category}_${mode}`.
    buildItem(`item_accessory_${mode}`, isDmg ? PAL.light : 0xd0a020, isDmg ? PAL.darkest : 0x806010)
    buildItem(`item_food_${mode}`, isDmg ? PAL.light : 0xc09050, isDmg ? PAL.dark : 0x806030)
    buildItem(`item_potion_${mode}`, isDmg ? PAL.light : 0xff4060, isDmg ? PAL.dark : 0xa02040)
    // The scroll and hourglass bags had a PAL.lightest body on a PAL.lightest
    // floor (#106) — the bag *was* the floor, and all that showed was the 2x2
    // white shine: four pixels of real contrast on a 16x16 sprite. Both are
    // dark-bodied now. The GBC colours were always fine and are untouched.
    buildItem(`item_scroll_${mode}`, isDmg ? PAL.dark : 0xf0e8c0, isDmg ? PAL.lightest : 0xc0b080)
    // #59. The key is drawn as a key rather than as another bag: it is the one
    // pickup whose count the HUD shows, so it has to be identifiable on the
    // floor without walking onto it.
    const buildKey = (key: string, metal: number, shade: number) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({}, false)
      // Bow (the ring you hold), then the shaft, then two wards.
      g.fillStyle(metal)
      g.fillRect(4, 3, 5, 5)
      g.fillStyle(shade); g.fillRect(5, 4, 3, 3)
      g.fillStyle(metal)
      g.fillRect(6, 8, 2, 6)
      g.fillRect(8, 10, 3, 1)
      g.fillRect(8, 12, 2, 1)
      g.generateTexture(key, T, T)
      g.destroy()
    }
    buildKey(`item_key_${mode}`, isDmg ? PAL.dark : 0xd8d0a0, isDmg ? PAL.lightest : 0x6a6248)

    buildItem(`item_rewind_${mode}`, isDmg ? PAL.darkest : 0xffd700, isDmg ? PAL.light : 0xc0a000)
  }
}
