import Phaser from 'phaser'
import {
  GBC_WIDTH,
  GBC_HEIGHT,
  TILE,
  PLAYER_SPEED,
  SOLID_TILES,
  TILES,
  PAL,
  GBC_PAL,
} from '../constants'
import { GameState } from '../state'
import { StaticWorldFX } from '../fx/StaticWorldFX'
import { sfx } from '../audio'
import { NPCS } from '../dialogue'
import type { NpcDef } from '../dialogue'
import {
  VALVE_DEF,
  BAKER_NORMAL_DEF,
  VANISH_DEF,
  CH3_HINT_DEF,
  GUS_STATIC_DEF,
  GUS_VANISH_DEF,
  PATTERN_DEF,
  RACE_START_DEF,
  BEACON_DEF,
  ANCHOR_DEF,
  ENTITY_DEF,
  CH5_START_DEF,
} from '../dialogue'

// Small code-placed structures (Chapter 3): 3-wide huts with a 2-row
// roof and a door in the wall row. Cells listed for vanishing.
interface Structure {
  x0: number
  y0: number
  w: number
  roofRows: number
  wallRow: number
  doorX: number
}
const GUS_HUT: Structure = { x0: 2, y0: 11, w: 3, roofRows: 2, wallRow: 13, doorX: 3 }
const REN_HOUSE: Structure = { x0: 18, y0: 16, w: 3, roofRows: 2, wallRow: 18, doorX: 19 }
import type { UIScene } from './UIScene'

type Facing = 'down' | 'up' | 'left' | 'right'

interface Interactable {
  x: number
  y: number
  action: () => void
}

interface DoorData {
  zone: Phaser.GameObjects.Zone
  target: string
  tx: number
  ty: number
  returnTX?: number
  returnTY?: number
}

interface NpcInstance {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithStaticBody
  def: NpcDef
  facing: Facing
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private doors: DoorData[] = []
  private interactables: Interactable[] = []
  private npcGroup!: Phaser.Physics.Arcade.StaticGroup
  private groundLayer!: Phaser.Tilemaps.TilemapLayer
  private lastStepAt = 0
  private facing: Facing = 'down'
  private transitioning = false

  private npcs: NpcInstance[] = []
  private interactKey!: Phaser.Input.Keyboard.Key
  private prompt?: Phaser.GameObjects.Container

  // Minimap (only on maps larger than one screen)
  private blip?: Phaser.GameObjects.Graphics
  private miniScale = 0
  private miniOX = 0
  private miniOY = 0

  private mapKey = 'town'
  private spawnTX?: number
  private spawnTY?: number
  private spawnFacing?: Facing

  constructor() {
    super('world')
  }

  private returnTX?: number
  private returnTY?: number
  private doorLockUntil = 0

  init(data: {
    mapKey?: string
    tx?: number
    ty?: number
    facing?: Facing
    returnTX?: number
    returnTY?: number
  }) {
    this.mapKey = data.mapKey ?? 'town'
    this.spawnTX = data.tx
    this.spawnTY = data.ty
    this.spawnFacing = data.facing
    this.returnTX = data.returnTX
    this.returnTY = data.returnTY
  }

  create() {
    this.transitioning = false
    this.doors = []
    this.doorLockUntil = this.time.now + 800
    this.cameras.main.fadeIn(250, 15, 56, 15)

    const mode = GameState.paletteMode
    // #15: on the Static-side, load the mirrored map variant when one
    // exists (town_static has the standing Baker house); other maps fall
    // back to their normal layout + the #47 post-FX.
    const variant = `${this.mapKey}_static`
    const resolvedKey =
      GameState.world === 'static' && this.cache.tilemap.exists(variant)
        ? variant
        : this.mapKey
    const map = this.make.tilemap({ key: resolvedKey })
    const tileset = map.addTilesetImage('tiles', `tiles_${mode}`)!
    const ground = map.createLayer('ground', tileset)!
    ground.setCollision(SOLID_TILES)

    // Spawn: prefer explicit door target, else the map's 'spawn' object.
    let sx = GBC_WIDTH / 2
    let sy = GBC_HEIGHT / 2
    let facing: Facing = this.spawnFacing ?? 'down'
    const objects = map.getObjectLayer('objects')?.objects ?? []
    if (this.spawnTX !== undefined && this.spawnTY !== undefined) {
      sx = this.spawnTX * TILE + TILE / 2
      sy = this.spawnTY * TILE + TILE / 2
    } else {
      const spawn = objects.find((o) => o.name === 'spawn')
      if (spawn) {
        sx = spawn.x! + TILE / 2
        sy = spawn.y! + TILE / 2
        const f = spawn.properties?.find((p: any) => p.name === 'facing')?.value
        if (f) facing = f as Facing
      }
    }
    this.facing = facing

    // Autosave checkpoint (#16): every map entry / world switch is a safe
    // point; Continue on the title screen restores here.
    GameState.checkpoint(
      this.mapKey,
      Math.floor(sx / TILE),
      Math.floor(sy / TILE),
    )

    this.player = this.physics.add.sprite(sx, sy, `kid_${mode}_${facing}_0`)
    this.player.setCollideWorldBounds(true)
    // A slightly slimmer body than the sprite so movement feels roomy.
    this.player.body.setSize(10, 10).setOffset(3, 5)
    this.physics.add.collider(this.player, ground)

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.startFollow(this.player, true)
    this.cameras.main.setRoundPixels(true)

    // Door trigger zones from the object layer.
    for (const o of objects) {
      if (o.name !== 'door') continue
      const target = o.properties?.find((p: any) => p.name === 'target')?.value
      if (!target) continue
      let tx = o.properties?.find((p: any) => p.name === 'tx')?.value ?? 0
      let ty = o.properties?.find((p: any) => p.name === 'ty')?.value ?? 0
      const returnTX = o.properties?.find((p: any) => p.name === 'returnTX')?.value
      const returnTY = o.properties?.find((p: any) => p.name === 'returnTY')?.value

      // If returning to town and we have a dynamic return position from the door entered
      if (target === 'town' && this.returnTX !== undefined && this.returnTY !== undefined) {
        tx = this.returnTX
        ty = this.returnTY
      }

      const zone = this.add.zone(o.x! + TILE / 2, o.y! + TILE / 2, TILE, TILE)
      this.physics.add.existing(zone, true)
      this.doors.push({ zone, target, tx, ty, returnTX, returnTY })
      this.physics.add.overlap(this.player, zone, () =>
        this.enterDoor(target, tx, ty, returnTX, returnTY),
      )
    }

    // NPCs from the object layer (solid; block the player).
    this.npcs = []
    const npcGroup = this.physics.add.staticGroup()
    for (const o of objects) {
      if (o.name !== 'npc') continue
      const id = o.properties?.find((p: any) => p.name === 'id')?.value
      const def = id ? NPCS[id] : undefined
      if (!def) continue
      const sprite = npcGroup.create(
        o.x! + TILE / 2,
        o.y! + TILE / 2,
        `npc_${mode}_${def.id}_down`,
      ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      sprite.body.setSize(12, 12).setOffset(2, 3)
      this.npcs.push({ sprite, def, facing: 'down' })
    }
    this.physics.add.collider(this.player, npcGroup)
    this.npcGroup = npcGroup

    // Dual-world: the Static-side runs the whole camera through a duotone
    // + CRT grain post-process (#47). Canvas renderer falls back to the
    // old flat tint. World is a global flag; no separate map files yet.
    this.ensureExtraTextures()
    if (GameState.world === 'static' || this.mapKey === 'core') {
      if (this.renderer.type === Phaser.WEBGL) {
        const pipelines = (this.renderer as Phaser.Renderer.WebGL.WebGLRenderer)
          .pipelines
        pipelines.addPostPipeline('StaticWorldFX', StaticWorldFX)
        this.cameras.main.setPostPipeline('StaticWorldFX')
      } else {
        this.add
          .rectangle(0, 0, GBC_WIDTH, GBC_HEIGHT, 0x5a6a9a)
          .setOrigin(0)
          .setScrollFactor(0)
          .setDepth(50)
          .setAlpha(0.42)
      }
    }
    // Interactables (face + press Z/A): the TV portal, and the Phase 3
    // props (fountain valve, cellar hatch, pickups).
    this.interactables = []
    if (this.mapKey === 'house') {
      const tv = this.add.image(7 * TILE + TILE / 2, 1 * TILE + TILE / 2, 'tv')
      this.interactables.push({ x: tv.x, y: tv.y, action: () => this.useTV() })
    }
    // Chapter 5 (#20): the entity at the heart of the static.
    if (this.mapKey === 'core') {
      const ex = 5 * TILE + TILE / 2
      const ey = 2 * TILE + TILE / 2
      const entity = this.physics.add.staticImage(ex, ey, 'entity')
      entity.body.setSize(14, 12).setOffset(1, 4)
      this.physics.add.collider(this.player, entity)
      this.interactables.push({
        x: ex,
        y: ey,
        action: () => this.openNarration(ENTITY_DEF),
      })
    }
    this.spawnPhase3Props(mode)
    this.groundLayer = ground
    this.applyStoryState(ground, mode)

    const promptLabel = window.matchMedia('(hover: hover) and (pointer: fine)')
      .matches
      ? 'Z'
      : 'A'

    const boxGfx = this.add.graphics()
    boxGfx.fillStyle(PAL.lightest, 1)
    boxGfx.fillRoundedRect(-6, -11, 12, 11, 2)
    boxGfx.lineStyle(1, PAL.darkest, 1)
    boxGfx.strokeRoundedRect(-6, -11, 12, 11, 2)

    const labelTxt = this.add.text(0, -6, promptLabel, {
      fontFamily: 'monospace',
      fontSize: '8px',
      fontStyle: 'bold',
      color: '#0f380f',
    }).setOrigin(0.5)

    this.prompt = this.add.container(0, 0, [boxGfx, labelTxt]).setDepth(2000).setVisible(false)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
    this.interactKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.Z,
    )

    this.buildMinimap(map, ground)

    if (!this.scene.isActive('ui')) this.scene.launch('ui')
  }

  private ensureExtraTextures() {
    if (!this.textures.exists('tv')) {
      const g = this.make.graphics({}, false)
      g.fillStyle(PAL.darkest, 1); g.fillRect(1, 3, 14, 11)
      g.fillStyle(PAL.light, 1); g.fillRect(3, 5, 8, 7)
      g.fillStyle(PAL.lightest, 1); g.fillRect(3, 5, 8, 3)
      g.fillStyle(PAL.darkest, 1); g.fillRect(12, 6, 2, 5)
      g.generateTexture('tv', 16, 16); g.destroy()
    }
    if (!this.textures.exists('noise')) {
      const g = this.make.graphics({}, false)
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          g.fillStyle(Math.random() < 0.5 ? 0x1a2438 : 0xaab4cc, 1)
          g.fillRect(x, y, 1, 1)
        }
      g.generateTexture('noise', 32, 32); g.destroy()
    }
  }

  private facingInteractable(): Interactable | undefined {
    const f = this.frontPoint()
    let best: Interactable | undefined
    let bestD = TILE * 0.9
    for (const it of this.interactables) {
      const d = Phaser.Math.Distance.Between(f.x, f.y, it.x, it.y)
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    return best
  }

  private openNarration(def: NpcDef) {
    GameState.dialogueActive = true
    ;(this.scene.get('ui') as UIScene).startDialogue(def)
    this.player.setVelocity(0, 0)
  }

  // Phase 3 (#15) conditional props: fountain (both worlds), the valve
  // (Static-side), the cellar hatch (normal, once drained), the keepsake
  // photo payoff (Thread A), and the cellar ledger (Thread B).
  private spawnPhase3Props(mode: 'dmg' | 'gbc') {
    const world = GameState.world
    if (this.mapKey === 'town') {
      const fx = 16 * TILE
      const fy = 18 * TILE
      const drained = world === 'static' || GameState.getFlag('fountain_drained')
      const fountain = this.physics.add.staticImage(
        fx,
        fy,
        drained ? `fountain_drained_${mode}` : `fountain_full_${mode}`,
      )
      fountain.body.setSize(28, 26)
      this.physics.add.collider(this.player, fountain)

      if (world === 'static') {
        this.interactables.push({
          x: fx + 8,
          y: fy + 8,
          action: () => this.openNarration(VALVE_DEF),
        })
      }
      if (world === 'normal' && GameState.getFlag('fountain_drained')) {
        const hx = 17 * TILE + TILE / 2
        const hy = 17 * TILE + TILE / 2
        this.add.image(hx, hy, `hatch_${mode}`)
        this.interactables.push({
          x: hx,
          y: hy,
          action: () => this.enterDoor('cellar', 5, 7),
        })
      }
      if (
        world === 'normal' &&
        GameState.getFlag('flower_delivered') &&
        !GameState.getFlag('thread_flower_done')
      ) {
        this.spawnPickup(5, 19, 'photo', 'thread_flower_done', mode)
      }
    }
    if (this.mapKey === 'cellar' && !GameState.getFlag('thread_fountain_done')) {
      this.spawnPickup(5, 3, 'ledger', 'thread_fountain_done', mode)
    }
  }

  // Chapter beats (#16/#18): the world reflects story flags on every map load.
  private applyStoryState(ground: Phaser.Tilemaps.TilemapLayer, mode: 'dmg' | 'gbc') {
    // Chapter reconciliation from flags (covers loaded saves too).
    if (GameState.getFlag('ch4_done') && GameState.chapter < 5) {
      GameState.chapter = 5
    } else if (GameState.getFlag('ch3_done') && GameState.chapter < 4) {
      GameState.chapter = 4
    } else if (GameState.getFlag('chapter2_done') && GameState.chapter < 3) {
      GameState.chapter = 3
    } else if (GameState.getFlag('heard_about_house') && GameState.chapter < 2) {
      GameState.chapter = 2
    }

    if (this.mapKey !== 'town') return

    // ---- Static-side Chapter 3 content (#18) ----
    if (GameState.world === 'static') {
      if (GameState.getFlag('gus_hut_vanished')) {
        // The lost hut stands here, worn, with a frozen copy of Gus.
        this.placeStructure(ground, GUS_HUT, true)
        ground.setCollision(SOLID_TILES)
        const sprite = this.npcGroup.create(
          4 * TILE + TILE / 2,
          14 * TILE + TILE / 2,
          `npc_${mode}_gus_down`,
        ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
        sprite.body.setSize(12, 12).setOffset(2, 3)
        this.npcs.push({ sprite, def: GUS_STATIC_DEF, facing: 'down' })

        // The pattern clicks once both standing houses have been examined.
        if (
          GameState.getFlag('seen_baker_static') &&
          GameState.getFlag('seen_gus_static') &&
          !GameState.getFlag('ch3_done')
        ) {
          this.time.delayedCall(800, () => {
            if (GameState.uiBlocking || this.transitioning) return
            this.openNarration(PATTERN_DEF)
          })
        }
      }
      // Chapter 4 (#19): Ren's house half-written on the static side,
      // with the beacon copying it at the door.
      if (GameState.getFlag('ch3_done') && !GameState.getFlag('ch4_done')) {
        this.placeStructure(ground, REN_HOUSE, true)
        ground.setCollision(SOLID_TILES)
        const bx = REN_HOUSE.doorX * TILE + TILE / 2
        const by = REN_HOUSE.wallRow * TILE + TILE / 2
        this.add.image(bx, by - 4, 'beacon')
        this.interactables.push({
          x: bx,
          y: by,
          action: () => this.openNarration(BEACON_DEF),
        })
      }
      return
    }

    // Chapter 1: the Baker house still stands until the vanishing.
    if (!GameState.getFlag('baker_vanished')) {
      for (let c = 3; c <= 7; c++) {
        ground.putTileAt(TILES.ROOF, c, 16)
        ground.putTileAt(TILES.ROOF, c, 17)
        ground.putTileAt(TILES.WALL, c, 18)
        ground.putTileAt(TILES.WALL, c, 19)
      }
      ground.putTileAt(TILES.DOOR, 5, 19)
      ground.setCollision(SOLID_TILES)

      const sprite = this.npcGroup.create(
        7 * TILE + TILE / 2,
        20 * TILE + TILE / 2,
        `npc_${mode}_baker_down`,
      ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      sprite.body.setSize(12, 12).setOffset(2, 3)
      this.npcs.push({ sprite, def: BAKER_NORMAL_DEF, facing: 'down' })

      // The vanishing triggers shortly after the player has the
      // flashlight (i.e. talked to Mom) and is out in town.
      if (GameState.getFlag('got_flashlight')) {
        this.time.delayedCall(1200, () => this.vanishBakerHouse())
      }
    }

    // Chapter 3 hook after the first crossover puzzle is solved.
    if (
      GameState.getFlag('chapter2_done') &&
      !GameState.getFlag('ch3_hint_shown')
    ) {
      this.time.delayedCall(800, () => {
        if (GameState.uiBlocking) return
        GameState.setFlag('ch3_hint_shown')
        this.openNarration(CH3_HINT_DEF)
      })
    }

    // ---- Chapter 3 (#18): more of the town, and the second vanishing ----
    // Ren's house always stands (it's the *next* target, for #19).
    this.placeStructure(ground, REN_HOUSE, false)
    if (!GameState.getFlag('gus_hut_vanished')) {
      this.placeStructure(ground, GUS_HUT, false)
    }
    ground.setCollision(SOLID_TILES)
    if (
      GameState.chapter >= 3 &&
      GameState.getFlag('ch3_hint_shown') &&
      !GameState.getFlag('gus_hut_vanished')
    ) {
      this.time.delayedCall(1500, () =>
        this.vanishStructure(GUS_HUT, 'gus_hut_vanished', GUS_VANISH_DEF),
      )
    }

    // ---- Chapter 4 (#19): the race to anchor Ren's house ----
    if (GameState.getFlag('ch3_done') && !GameState.getFlag('ch4_done')) {
      // One-time urgency beat when the race begins.
      if (!GameState.getFlag('race_started')) {
        this.time.delayedCall(900, () => {
          if (GameState.uiBlocking || this.transitioning) return
          GameState.setFlag('race_started')
          this.openNarration(RACE_START_DEF)
        })
      }
      // The anchoring act at Ren's door (gated by key + beacon_found).
      this.interactables.push({
        x: REN_HOUSE.doorX * TILE + TILE / 2,
        y: REN_HOUSE.wallRow * TILE + TILE / 2,
        action: () => this.openNarration(ANCHOR_DEF),
      })
    }

    // ---- Chapter 5 (#20): the calling. Point the player home. ----
    if (
      GameState.getFlag('ch4_done') &&
      !GameState.getFlag('game_ended') &&
      !GameState.getFlag('ch5_started')
    ) {
      this.time.delayedCall(900, () => {
        if (GameState.uiBlocking || this.transitioning) return
        GameState.setFlag('ch5_started')
        this.openNarration(CH5_START_DEF)
      })
    }
  }

  private placeStructure(
    ground: Phaser.Tilemaps.TilemapLayer,
    s: Structure,
    worn: boolean,
  ) {
    const wallTile = worn ? TILES.CRACKED_WALL : TILES.WALL
    for (let c = s.x0; c < s.x0 + s.w; c++) {
      for (let r = s.y0; r < s.y0 + s.roofRows; r++) {
        ground.putTileAt(TILES.ROOF, c, r)
      }
      ground.putTileAt(wallTile, c, s.wallRow)
    }
    ground.putTileAt(TILES.DOOR, s.doorX, s.wallRow)
  }

  private flashStatic() {
    const noise = this.add
      .image(0, 0, 'noise')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setAlpha(0)
      .setDisplaySize(GBC_WIDTH, GBC_HEIGHT)
    this.tweens.add({
      targets: noise,
      alpha: 0.6,
      duration: 110,
      yoyo: true,
      repeat: 2,
      onComplete: () => noise.destroy(),
    })
  }

  private vanishStructure(s: Structure, flag: string, def: NpcDef) {
    if (GameState.getFlag(flag) || this.transitioning) return
    if (GameState.uiBlocking) {
      this.time.delayedCall(600, () => this.vanishStructure(s, flag, def))
      return
    }
    GameState.setFlag(flag)
    sfx.switchWorld()
    this.flashStatic()
    this.time.delayedCall(380, () => {
      for (let c = s.x0; c < s.x0 + s.w; c++) {
        for (let r = s.y0; r <= s.wallRow; r++) {
          this.groundLayer.putTileAt(TILES.GRASS, c, r)
        }
      }
      this.openNarration(def)
    })
  }

  private vanishBakerHouse() {
    if (GameState.getFlag('baker_vanished') || this.transitioning) return
    if (GameState.uiBlocking) {
      this.time.delayedCall(600, () => this.vanishBakerHouse())
      return
    }
    GameState.setFlag('baker_vanished')
    sfx.switchWorld()
    this.flashStatic()
    this.time.delayedCall(380, () => {
      // The lot returns to plain grass; the Baker is gone.
      for (let c = 3; c <= 7; c++) {
        for (let r = 16; r <= 19; r++) this.groundLayer.putTileAt(TILES.GRASS, c, r)
      }
      const baker = this.npcs.find(n => n.def.id === 'baker')
      if (baker) {
        baker.sprite.destroy()
        this.npcs = this.npcs.filter(n => n !== baker)
      }
      this.openNarration(VANISH_DEF)
    })
  }

  private spawnPickup(
    tx: number,
    ty: number,
    itemId: string,
    doneFlag: string,
    mode: 'dmg' | 'gbc',
  ) {
    const px = tx * TILE + TILE / 2
    const py = ty * TILE + TILE / 2
    const img = this.add.image(px, py, `item_${mode}_${itemId}`)
    const zone = this.add.zone(px, py, TILE, TILE)
    this.physics.add.existing(zone, true)
    this.physics.add.overlap(this.player, zone, () => {
      if (GameState.getFlag(doneFlag)) return
      GameState.setFlag(doneFlag)
      GameState.setFlag('chapter2_done')
      GameState.addItem(itemId)
      sfx.pickup()
      ;(this.scene.get('ui') as UIScene).showItemToast(itemId)
      img.destroy()
      zone.destroy()
    })
  }

  // In Chapter 5 the TV pulls the player into the finale room; otherwise
  // it flips worlds as before.
  private useTV() {
    if (
      GameState.getFlag('ch4_done') &&
      !GameState.getFlag('game_ended') &&
      !this.transitioning
    ) {
      this.transitioning = true
      sfx.switchWorld()
      this.flashStatic()
      GameState.world = 'static'
      this.time.delayedCall(320, () =>
        this.scene.restart({ mapKey: 'core', tx: 5, ty: 8, facing: 'up' }),
      )
      return
    }
    this.switchWorld()
  }

  private playEnding() {
    if (GameState.getFlag('game_ended')) return
    GameState.setFlag('game_ended')
    this.transitioning = true
    this.player.setVelocity(0, 0)
    if (this.prompt) this.prompt.setVisible(false)
    this.cameras.main.resetPostPipeline() // finale escapes the duotone
    sfx.sting()

    const empathy = GameState.getFlag('ending_empathy')
    const bgColor = empathy ? 0xe0f0d0 : 0x08080e
    const textColor = empathy ? '#0f380f' : '#9bbc0f'
    const body = empathy
      ? 'You step into the static\nand stay.\n\nThe lonely thing is\nlonely no more.\n\nThe town remembers\neverything it lost.'
      : 'You tear the signal loose.\n\nThe static screams,\nthen falls silent.\n\nThe town is safe, sealed.\n\nBut the vanished stay gone —\nand something blinks out,\nalone.'

    const bg = this.add
      .rectangle(0, 0, GBC_WIDTH, GBC_HEIGHT, bgColor)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(0)
    const txt = this.add
      .text(GBC_WIDTH / 2, GBC_HEIGHT / 2 - 6, body, {
        fontFamily: '"Press Start 2P"',
        fontSize: '7px',
        color: textColor,
        align: 'center',
        lineSpacing: 3,
        resolution: 1,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3001)
      .setAlpha(0)
    this.tweens.add({ targets: [bg, txt], alpha: 1, duration: 1600 })

    this.time.delayedCall(3200, () => {
      const prompt = this.add
        .text(GBC_WIDTH / 2, GBC_HEIGHT - 12, 'Z: title', {
          fontFamily: '"Press Start 2P"',
          fontSize: '7px',
          color: textColor,
          resolution: 1,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(3001)
      this.tweens.add({ targets: prompt, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 })
      this.input.keyboard!.once('keydown-Z', () => this.scene.start('title'))
      this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('title'))
      this.input.once('pointerdown', () => this.scene.start('title'))
    })
  }

  private switchWorld() {
    if (this.transitioning) return
    this.transitioning = true
    sfx.switchWorld()
    this.player.setVelocity(0, 0)
    if (this.prompt) this.prompt.setVisible(false)
    const noise = this.add
      .image(0, 0, 'noise')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2000)
      .setDisplaySize(GBC_WIDTH, GBC_HEIGHT)
    this.tweens.add({ targets: noise, alpha: 0.5, duration: 120, yoyo: true, repeat: 1 })
    this.time.delayedCall(260, () => {
      GameState.toggleWorld()
      this.scene.restart({
        mapKey: this.mapKey,
        tx: Math.floor(this.player.x / TILE),
        ty: Math.floor(this.player.y / TILE),
        facing: this.facing,
      })
    })
  }

  // The tile-center point directly in front of the player.
  private frontPoint(): { x: number; y: number } {
    const p = this.player
    if (this.facing === 'up') return { x: p.x, y: p.y - TILE }
    if (this.facing === 'down') return { x: p.x, y: p.y + TILE }
    if (this.facing === 'left') return { x: p.x - TILE, y: p.y }
    return { x: p.x + TILE, y: p.y }
  }

  // NPC standing on the tile the player faces, if any.
  private facingNpc(): NpcInstance | undefined {
    const f = this.frontPoint()
    let best: NpcInstance | undefined
    let bestD = TILE * 0.9
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(f.x, f.y, n.sprite.x, n.sprite.y)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best
  }

  private faceNpcToward(n: NpcInstance) {
    if (n.def.frozen) return // Static-side figures never react
    const dx = this.player.x - n.sprite.x
    const dy = this.player.y - n.sprite.y
    n.facing =
      Math.abs(dx) > Math.abs(dy)
        ? dx < 0
          ? 'left'
          : 'right'
        : dy < 0
          ? 'up'
          : 'down'
    const mode = GameState.paletteMode
    const key = `npc_${mode}_${n.def.id}_${n.facing}`
    if (this.textures.exists(key)) {
      n.sprite.setTexture(key)
    }
  }

  public reloadPalette() {
    this.scene.restart({
      mapKey: this.mapKey,
      tx: Math.floor(this.player.x / TILE),
      ty: Math.floor(this.player.y / TILE),
      facing: this.facing,
      returnTX: this.returnTX,
      returnTY: this.returnTY,
    })
  }

  // A corner minimap showing buildings/water/trees + a blinking player
  // blip. Skipped on maps that already fit one screen (e.g. interiors).
  private buildMinimap(
    map: Phaser.Tilemaps.Tilemap,
    ground: Phaser.Tilemaps.TilemapLayer,
  ) {
    this.blip = undefined
    const mapW = map.width
    const mapH = map.height
    if (mapW * TILE <= GBC_WIDTH && mapH * TILE <= GBC_HEIGHT) return

    const pad = 2
    const scale = 40 / Math.max(mapW, mapH)
    const panelW = mapW * scale + pad * 2
    const panelH = mapH * scale + pad * 2
    const ox = GBC_WIDTH - panelW - 3
    const oy = 3
    this.miniScale = scale
    this.miniOX = ox + pad
    this.miniOY = oy + pad

    const gfx = this.add.graphics().setScrollFactor(0).setDepth(1000)
    gfx.fillStyle(PAL.darkest, 0.72)
    gfx.fillRoundedRect(ox, oy, panelW, panelH, 2)
    gfx.lineStyle(1, PAL.light, 0.9)
    gfx.strokeRoundedRect(ox, oy, panelW, panelH, 2)

    const cell = Math.max(1, Math.ceil(scale))
    for (let r = 0; r < mapH; r++) {
      for (let c = 0; c < mapW; c++) {
        const t = ground.getTileAt(c, r)
        if (!t || t.index < 1) continue
        let color: number | null = null
        if (
          t.index === TILES.WALL ||
          t.index === TILES.ROOF ||
          t.index === TILES.DOOR ||
          t.index === TILES.CRACKED_WALL
        ) {
          color = GBC_PAL.roofBg // buildings pop in terracotta red
        } else if (t.index === TILES.WATER) {
          color = GBC_PAL.waterBg // water in GBC azure blue
        } else if (t.index === TILES.TREE || t.index === TILES.DEAD_TREE) {
          color = GBC_PAL.treeDark // trees in deep evergreen
        }
        if (color === null) continue
        gfx.fillStyle(color, 0.95)
        gfx.fillRect(this.miniOX + c * scale, this.miniOY + r * scale, cell, cell)
      }
    }

    this.blip = this.add.graphics().setScrollFactor(0).setDepth(1001)
  }

  private updateMinimap() {
    if (!this.blip) return
    this.blip.clear()
    // Blink so the player reads clearly against static building pixels.
    if (Math.floor(this.time.now / 280) % 2 === 0) {
      const bx = this.miniOX + (this.player.x / TILE) * this.miniScale
      const by = this.miniOY + (this.player.y / TILE) * this.miniScale
      this.blip.fillStyle(PAL.lightest, 1)
      this.blip.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3)
    }
  }

  private enterDoor(
    target: string,
    tx: number,
    ty: number,
    returnTX?: number,
    returnTY?: number,
  ) {
    if (this.transitioning || this.time.now < this.doorLockUntil) return
    this.transitioning = true
    sfx.door()
    this.player.setVelocity(0, 0)
    this.cameras.main.fadeOut(250, 15, 56, 15)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart({
        mapKey: target,
        tx,
        ty,
        facing: this.facing,
        returnTX,
        returnTY,
      })
    })
  }

  update() {
    // Finale: once the entity choice is made, play the ending.
    if (
      this.mapKey === 'core' &&
      !GameState.getFlag('game_ended') &&
      !GameState.uiBlocking &&
      (GameState.getFlag('ending_empathy') || GameState.getFlag('ending_severance'))
    ) {
      this.playEnding()
      return
    }

    if (this.transitioning) return

    this.updateMinimap()

    // Consume the interact key every frame so a held key can't double-fire
    // across the dialogue open/close boundary.
    const interactPressed = Phaser.Input.Keyboard.JustDown(this.interactKey)

    // Frozen while a dialogue or menu is open.
    if (GameState.uiBlocking) {
      const mode = GameState.paletteMode
      this.player.setVelocity(0, 0)
      this.player.anims.stop()
      this.player.setTexture(`kid_${mode}_${this.facing}_0`)
      if (this.prompt) this.prompt.setVisible(false)
      return
    }

    const near = this.facingNpc()
    const nearIt = !near ? this.facingInteractable() : undefined
    if (this.prompt) {
      if (near) {
        this.prompt.setVisible(true)
        this.prompt.setPosition(near.sprite.x, near.sprite.y - TILE / 2)
      } else if (nearIt) {
        this.prompt.setVisible(true)
        this.prompt.setPosition(nearIt.x, nearIt.y - TILE / 2)
      } else {
        this.prompt.setVisible(false)
      }
    }

    // Interact (ignore briefly after a dialogue closes).
    if (interactPressed && this.time.now - GameState.uiClosedAt > 150) {
      if (near) {
        this.faceNpcToward(near)
        GameState.dialogueActive = true
        ;(this.scene.get('ui') as UIScene).startDialogue(near.def)
        this.player.setVelocity(0, 0)
        return
      }
      if (nearIt) {
        nearIt.action()
        return
      }
    }

    const left = this.cursors.left.isDown || this.wasd.A.isDown
    const right = this.cursors.right.isDown || this.wasd.D.isDown
    const up = this.cursors.up.isDown || this.wasd.W.isDown
    const down = this.cursors.down.isDown || this.wasd.S.isDown

    let vx = 0
    let vy = 0
    if (left) vx -= 1
    if (right) vx += 1
    if (up) vy -= 1
    if (down) vy += 1

    const moving = vx !== 0 || vy !== 0
    if (moving) {
      const len = Math.hypot(vx, vy) || 1
      this.player.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED)
      // Facing: vertical intent wins ties so up/down feel deliberate.
      if (vy < 0) this.facing = 'up'
      else if (vy > 0) this.facing = 'down'
      else if (vx < 0) this.facing = 'left'
      else if (vx > 0) this.facing = 'right'
      const mode = GameState.paletteMode
      this.player.anims.play(`walk_${mode}_${this.facing}`, true)
      // Subtle footstep taps in time with the walk cycle.
      if (this.time.now - this.lastStepAt > 260) {
        sfx.footstep()
        this.lastStepAt = this.time.now
      }
    } else {
      const mode = GameState.paletteMode
      this.player.setVelocity(0, 0)
      this.player.anims.stop()
      this.player.setTexture(`kid_${mode}_${this.facing}_0`)
    }
  }
}
