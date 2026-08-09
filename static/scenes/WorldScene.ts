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
import { sfx, music } from '../audio'
import { NPCS, currentTarget } from '../dialogue'
import { Darkness, type Light } from '../../shared/lighting'
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
  STATIC_DOOR_DEF,
  BOOKSHELF_DEF,
  JOURNAL_DEF,
  BED_DEF,
  RUG_DEF,
  PLANT_DEF,
  BUSH_DEF,
  FOUNTAIN_DEF,
  BAKERY_PHOTO_DEF,
  GUS_STOVE_DEF,
  REN_DESK_DEF,
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
// Within this many tiles of the objective, the marker stops drawing — you can
// see the place by then, and a marker on top of you is noise.
const DESTINATION_NEAR_TILES = 4

/**
 * How far the player can see in a dark room (#73).
 *
 * A working flashlight lights the room; a dead one, or none at all, leaves
 * barely more than arm's reach. Deliberately the same for 'dead' and 'absent':
 * a broken light and no light should look identical, which is the joke.
 */
const LIGHT_RADIUS = { lit: 44, dim: 18 } as const

/**
 * The TV lights itself in a dark room (#89).
 *
 * It is the only crossing between the worlds, so it is the one thing the
 * player must never lose in the dark — a dead flashlight leaves barely more
 * than arm's reach, and the Static-side house is unlit. A screen full of
 * static is a light source anyway; the radius breathes so it reads as a
 * signal rather than a lamp.
 */
const TV_GLOW = { radius: 30, flicker: 4, periodMs: 140 } as const

const GUS_HUT: Structure = { x0: 2, y0: 11, w: 3, roofRows: 2, wallRow: 13, doorX: 3 }
const REN_HOUSE: Structure = { x0: 18, y0: 16, w: 3, roofRows: 2, wallRow: 18, doorX: 19 }
// Chapter 1's bakery is stamped in inline rather than via placeStructure
// (it has two wall rows), but still needs a door zone.
const BAKER_HOUSE: Structure = { x0: 3, y0: 16, w: 5, roofRows: 2, wallRow: 19, doorX: 5 }

/**
 * Where the Static-side copy of Gus stands (#93).
 *
 * He used to be at (4,14), inside the fence line, with all four neighbouring
 * tiles blocked — so he could not be examined, `seen_gus_static` could not be
 * set, `ch3_done` never fired, and Chapters 4 and 5 were unreachable. That is
 * the whole game, so this tile is load-bearing.
 *
 * (5,13) is against the hut's east wall, in the part of town that is reachable
 * from the player's spawn no matter what else changes. Deliberately not in the
 * hut's own front yard: that yard is only reachable through a corridor the
 * frozen Baker stands in, and a softlock fix should not depend on a second fix
 * staying correct.
 */
const GUS_STATIC_TILE = { tx: 5, ty: 13 }
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

  // Story beats re-check themselves whenever a flag changes (#95).
  private unsubscribeFlags?: () => void
  private armedBeats = new Set<string>()
  private beaconPlaced = false

  // Darkness overlay, only on maps flagged `dark`/`darkInStatic` in Tiled (#73, #89)
  private darkness?: Darkness
  // Where the TV is on this map, if it has one — it lights itself (#89).
  private tvPos?: { x: number; y: number }

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
    this.tvPos = undefined
    this.armedBeats.clear()
    this.beaconPlaced = false
    this.doorLockUntil = this.time.now + 800

    // Re-check the chapter beats whenever a flag changes, not only here (#95).
    // Dropped on shutdown, and on re-entry to create(), so a scene restart
    // cannot leave an old subscription pointed at a dead scene.
    this.unsubscribeFlags?.()
    this.unsubscribeFlags = GameState.onFlagChange(() => this.checkStoryBeats())
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeFlags?.()
      this.unsubscribeFlags = undefined
    })
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
    this.player.setDepth(10)
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
      sprite.setDepth(10)
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
      this.tvPos = { x: tv.x, y: tv.y }
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
    this.placeDecorations(mode)
    this.groundLayer = ground
    this.applyStoryState(ground, mode)

    // Background music (#21): town theme in the normal world, the same
    // melody detuned/degraded on the Static-side + in the finale room.
    if (!GameState.getFlag('game_ended')) {
      music.play(GameState.world === 'static' || this.mapKey === 'core' ? 'static' : 'town')
    }

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

    this.buildDarkness(map)
    this.buildMinimap(map, ground)

    if (!this.scene.isActive('ui')) this.scene.launch('ui')
    this.announceLocation()
    this.checkStoryBeats()
  }

  // Human-readable name per map. The Static-side suffix is only used where
  // the copy is reachable, keeping the card short enough to clear the
  // minimap.
  private static readonly LOCATIONS: Record<string, string> = {
    town: 'TOWN',
    town_static: 'TOWN',
    house: 'HOME',
    house2: 'NEIGHBOUR HOUSE',
    bakery: 'BAKERY',
    gus_hut: "GUS'S HUT",
    ren_house: "REN'S HOUSE",
    cellar: 'CELLAR',
  }

  // Remembered across scene.restart() so re-entering the same map (world
  // toggle aside) or a palette reload doesn't re-announce it.
  private static lastLocation = ''

  private announceLocation() {
    const base = WorldScene.LOCATIONS[this.mapKey]
    if (!base) return // the finale room announces itself
    const label =
      GameState.world === 'static' ? `${base} / STATIC` : base
    if (label === WorldScene.lastLocation) return
    WorldScene.lastLocation = label
    this.time.delayedCall(140, () => {
      const ui = this.scene.get('ui') as UIScene | undefined
      if (ui && ui.scene.isActive()) ui.showLocationBanner(label)
    })
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
  /**
   * A solid prop occupying a `w`x`h` tile footprint with its top-left at
   * (tx,ty), placed so its collision box covers exactly the tiles it is drawn
   * on (#94).
   *
   * Centred on the footprint, deliberately. The old form — `staticImage` at
   * the tile corner followed by `setOrigin(0, 0)` — built the body while the
   * image still had its default 0.5 origin, so the body stayed centred on the
   * corner while the sprite moved down and right. Every prop then collided
   * half its own size up and to the left of where it appeared: invisible walls
   * beside each one, and no collision at all on the half you could see. Three
   * fences overlapping that way is what sealed the frozen Gus in (#93).
   *
   * This is how the fountain has always been placed; the props now match it.
   */
  private solidProp(tx: number, ty: number, w: number, h: number, key: string) {
    const prop = this.physics.add.staticImage(
      tx * TILE + (w * TILE) / 2,
      ty * TILE + (h * TILE) / 2,
      key,
    )
    prop.body.setSize(w * TILE, h * TILE)
    this.physics.add.collider(this.player, prop)
    return prop
  }

  // Add decorative props to the map based on the mapKey
  private placeDecorations(mode: string) {
    const interiors = ['house', 'house2', 'bakery', 'gus_hut', 'ren_house']
    if (interiors.includes(this.mapKey)) {
      // Bed top left corner
      this.solidProp(2, 2, 2, 2, `prop_bed_${mode}`)

      // Rug in middle (no body — the player walks over it)
      this.add.image(4 * TILE, 4 * TILE, `prop_rug_${mode}`).setOrigin(0, 0)

      // Bookshelf top right
      this.solidProp(8, 2, 1, 2, `prop_bookshelf_${mode}`)

      // Plant bottom left
      this.solidProp(2, 7, 1, 1, `prop_plant_${mode}`)

      // Examine points sit ON the prop, so the player triggers them by
      // standing on the adjacent floor tile and facing it. These tiles are
      // floor in every interior layout.
      this.examine(2, 3, BED_DEF)
      this.examine(5, 5, RUG_DEF)
      this.examine(2, 7, PLANT_DEF)

      // The shelf carries the house-specific beat.
      const shelfDef =
        this.mapKey === 'ren_house'
          ? REN_DESK_DEF
          : this.mapKey === 'gus_hut'
            ? GUS_STOVE_DEF
            : BOOKSHELF_DEF
      this.examine(8, 3, shelfDef)

      // One extra prop per story house, drawn so it can actually be seen.
      if (this.mapKey === 'house') {
        // The notebook is the always-available objective reminder.
        this.add.image(6 * TILE + TILE / 2, 2 * TILE + TILE / 2, `item_${mode}_ledger`)
        this.examine(6, 2, JOURNAL_DEF)
      } else if (this.mapKey === 'bakery') {
        this.add.image(6 * TILE + TILE / 2, 2 * TILE + TILE / 2, `item_${mode}_photo`)
        this.examine(6, 2, BAKERY_PHOTO_DEF)
      }
    } else if (this.mapKey === 'town' || this.mapKey === 'town_static') {
      // Add bushes. Two constraints, both of which the original five broke:
      // the town is 24x22, so anything past (23,21) is off the map entirely,
      // and a hedge has to sit on ground the player can stand beside — (5,5)
      // was a ROOF tile, so it drew a hedge on top of a house and registered
      // an examine point with no reachable approach (#94).
      const bushCoords = [[9, 4], [6, 15]]
      for (const [bx, by] of bushCoords) {
        this.solidProp(bx, by, 1, 1, `prop_bush_${mode}`)
        this.examine(bx, by, BUSH_DEF)
      }

      // Add flowers (no bodies — dressing only). Same bounds problem: the last
      // two sat off the south edge.
      const flwCoords = [[8, 6], [9, 6], [7, 7], [22, 10], [23, 11]]
      for (const [fx, fy] of flwCoords) {
        this.add.image(fx * TILE, fy * TILE, `prop_flower_${mode}`).setOrigin(0, 0)
      }

      // Add a small fence near Gus's hut (x0: 2, y0: 11). The gap at (3,14) is
      // the way in to the hut door — keep it, and keep the Static-side Gus off
      // the fence line (see GUS_STATIC_TILE).
      const fenceCoords = [[1, 14], [2, 14], [4, 14], [5, 14], [1, 15], [5, 15]]
      for (const [fx, fy] of fenceCoords) {
        this.solidProp(fx, fy, 1, 1, `prop_fence_${mode}`)
      }
    }
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
      } else {
        this.interactables.push({
          x: fx + 8,
          y: fy + 8,
          action: () => this.openNarration(FOUNTAIN_DEF),
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
        this.spawnPickup(5, 19, 'photo', 'thread_flower_done', mode, 'chapter2_done')
      }
    }
    if (this.mapKey === 'cellar' && !GameState.getFlag('thread_fountain_done')) {
      this.spawnPickup(5, 3, 'ledger', 'thread_fountain_done', mode, 'chapter2_done')
    }
  }

  /**
   * Brings `GameState.chapter` in line with the flags that have been set.
   *
   * Runs on map entry and on every flag change, not just on entry: the flag
   * that advances a chapter is usually set out in the world (the photo pickup
   * ends Chapter 2), and a stale chapter number gates the next beat.
   */
  private reconcileChapter() {
    if (GameState.getFlag('ch4_done') && GameState.chapter < 5) {
      GameState.chapter = 5
    } else if (GameState.getFlag('ch3_done') && GameState.chapter < 4) {
      GameState.chapter = 4
    } else if (GameState.getFlag('chapter2_done') && GameState.chapter < 3) {
      GameState.chapter = 3
    } else if (GameState.getFlag('heard_about_house') && GameState.chapter < 2) {
      GameState.chapter = 2
    }
  }

  // Chapter beats (#16/#18): the world reflects story flags on every map load.
  private applyStoryState(ground: Phaser.Tilemaps.TilemapLayer, mode: 'dmg' | 'gbc') {
    this.reconcileChapter()

    if (this.mapKey !== 'town') return

    // ---- Static-side Chapter 3 content (#18) ----
    if (GameState.world === 'static') {
      if (GameState.getFlag('gus_hut_vanished')) {
        // The lost hut stands here, worn, with a frozen copy of Gus.
        this.placeStructure(ground, GUS_HUT, true)
        ground.setCollision(SOLID_TILES)
        this.addStructureDoor(GUS_HUT, 'gus_hut')
        const sprite = this.npcGroup.create(
          GUS_STATIC_TILE.tx * TILE + TILE / 2,
          GUS_STATIC_TILE.ty * TILE + TILE / 2,
          `npc_${mode}_gus_down`,
        ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
        sprite.body.setSize(12, 12).setOffset(2, 3)
        this.npcs.push({ sprite, def: GUS_STATIC_DEF, facing: 'down' })
      }
      // Chapter 4 (#19): Ren's house half-written on the static side, with the
      // beacon copying it at the door. The pattern that unlocks it fires on
      // this same map, so it is placed on demand rather than only here.
      this.placeStaticBeacon()
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
      // Visiting the bakery before it goes makes the loss concrete.
      this.addStructureDoor(BAKER_HOUSE, 'bakery')

      const sprite = this.npcGroup.create(
        7 * TILE + TILE / 2,
        20 * TILE + TILE / 2,
        `npc_${mode}_baker_down`,
      ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      sprite.body.setSize(12, 12).setOffset(2, 3)
      this.npcs.push({ sprite, def: BAKER_NORMAL_DEF, facing: 'down' })
    }

    // ---- Chapter 3 (#18): more of the town, and the second vanishing ----
    // Ren's house always stands (it's the *next* target, for #19).
    this.placeStructure(ground, REN_HOUSE, false)
    if (!GameState.getFlag('gus_hut_vanished')) {
      this.placeStructure(ground, GUS_HUT, false)
      this.addStructureDoor(GUS_HUT, 'gus_hut')
    }
    ground.setCollision(SOLID_TILES)
    // During the Chapter 4 race the same tile is the anchoring act, so the
    // entry zone is registered everywhere except that window.
    const renAnchorActive =
      GameState.getFlag('ch3_done') && !GameState.getFlag('ch4_done')
    if (!renAnchorActive) {
      this.addStructureDoor(REN_HOUSE, 'ren_house')
    }

    // ---- Chapter 4 (#19): the race to anchor Ren's house ----
    if (GameState.getFlag('ch3_done') && !GameState.getFlag('ch4_done')) {
      // The anchoring act at Ren's door (gated by key + beacon_found).
      this.interactables.push({
        x: REN_HOUSE.doorX * TILE + TILE / 2,
        y: REN_HOUSE.wallRow * TILE + TILE / 2,
        action: () => this.openNarration(ANCHOR_DEF),
      })
    }

  }

  /**
   * Chapter 4's beacon, and the Static-side copy of Ren's house it is writing.
   *
   * Split out of `applyStoryState` because `ch3_done` is set by PATTERN_DEF,
   * which fires on this very map — so on the visit where the pattern lands,
   * the beacon has to appear without waiting for a rebuild. The journal sends
   * the player straight to Ren's house to find it (#95).
   *
   * Idempotent: a later map entry re-runs it and it does nothing.
   */
  private placeStaticBeacon() {
    if (this.beaconPlaced) return
    if (!GameState.getFlag('ch3_done') || GameState.getFlag('ch4_done')) return
    this.beaconPlaced = true
    this.placeStructure(this.groundLayer, REN_HOUSE, true)
    this.groundLayer.setCollision(SOLID_TILES)
    const bx = REN_HOUSE.doorX * TILE + TILE / 2
    const by = REN_HOUSE.wallRow * TILE + TILE / 2
    this.add.image(bx, by - 4, 'beacon')
    this.interactables.push({
      x: bx,
      y: by,
      action: () => this.openNarration(BEACON_DEF),
    })
  }

  /**
   * The chapter beats that are pure consequence — the narrations and the
   * vanishings — as opposed to the world building in `applyStoryState`, which
   * needs a freshly created map to stamp tiles into.
   *
   * Runs on map entry *and* on every flag change (#95). It used to run only on
   * entry, which meant a beat whose trigger flag was set while the player was
   * already standing on the map it belongs to was never seen. That was five
   * beats in a single playthrough — both vanishings among them — because the
   * flags are typically set by something on that same map: Mom hands over the
   * flashlight in town, the photo is picked up in town, the pattern needs two
   * figures examined in the Static town. The player was told to go somewhere
   * they already were, and only a chance walk through a door unstuck it.
   *
   * Every beat is guarded by its own done-flag, so repeated runs are a no-op
   * once each has fired. `armedBeats` exists only to stop duplicate timers
   * stacking while one is pending.
   */
  private checkStoryBeats() {
    this.reconcileChapter()
    // No isActive() guard here on purpose: during create() the scene's status
    // is still CREATING, so isActive() is false and the entry-time call would
    // do nothing — leaving beats that have no accompanying flag change (the
    // Chapter 4 race, armed by a flag set over in the other world) unarmed
    // forever. The subscription is dropped on shutdown, so a dead scene is
    // never called here anyway.
    if (this.mapKey !== 'town') return

    if (GameState.world === 'static') {
      // The pattern clicks once both standing houses have been examined.
      if (
        GameState.getFlag('gus_hut_vanished') &&
        GameState.getFlag('seen_baker_static') &&
        GameState.getFlag('seen_gus_static') &&
        !GameState.getFlag('ch3_done')
      ) {
        this.armBeat('pattern', 800, () => this.openNarration(PATTERN_DEF))
      }
      this.placeStaticBeacon()
      return
    }

    // Chapter 1: the vanishing, once the player has the flashlight and is out
    // in town. Mom stands in town, so this is normally armed by her dialogue.
    if (GameState.getFlag('got_flashlight') && !GameState.getFlag('baker_vanished')) {
      this.armBeat('baker_vanish', 1200, () => this.vanishBakerHouse())
    }

    // Chapter 3 hook after the first crossover puzzle is solved.
    if (GameState.getFlag('chapter2_done') && !GameState.getFlag('ch3_hint_shown')) {
      this.armBeat('ch3_hint', 800, () => {
        GameState.setFlag('ch3_hint_shown')
        this.openNarration(CH3_HINT_DEF)
      })
    }

    // Chapter 3: the second vanishing. Chained off the hook above — setting
    // `ch3_hint_shown` re-enters this method, which is what arms it.
    if (
      GameState.chapter >= 3 &&
      GameState.getFlag('ch3_hint_shown') &&
      !GameState.getFlag('gus_hut_vanished')
    ) {
      this.armBeat('gus_vanish', 1500, () =>
        this.vanishStructure(GUS_HUT, 'gus_hut_vanished', GUS_VANISH_DEF),
      )
    }

    // Chapter 4: the urgency beat when the race begins.
    if (
      GameState.getFlag('ch3_done') &&
      !GameState.getFlag('ch4_done') &&
      !GameState.getFlag('race_started')
    ) {
      this.armBeat('race_start', 900, () => {
        GameState.setFlag('race_started')
        this.openNarration(RACE_START_DEF)
      })
    }

    // Chapter 5: the calling. Point the player home.
    if (
      GameState.getFlag('ch4_done') &&
      !GameState.getFlag('game_ended') &&
      !GameState.getFlag('ch5_started')
    ) {
      this.armBeat('ch5_start', 900, () => {
        GameState.setFlag('ch5_started')
        this.openNarration(CH5_START_DEF)
      })
    }
  }

  /**
   * Schedules a beat, once.
   *
   * Waits rather than gives up when the player is mid-dialogue. The old code
   * dropped a beat that came due behind an open dialogue box, and with beats
   * now driven by flag changes there is nothing to retrigger a dropped one —
   * so dropping it would be a fresh way to stall the story.
   */
  private armBeat(id: string, delay: number, fn: () => void) {
    if (this.armedBeats.has(id)) return
    this.armedBeats.add(id)
    const run = () => {
      if (!this.scene.isActive()) {
        this.armedBeats.delete(id)
        return
      }
      if (GameState.uiBlocking || this.transitioning) {
        this.time.delayedCall(400, run)
        return
      }
      this.armedBeats.delete(id)
      fn()
    }
    this.time.delayedCall(delay, run)
  }

  // Structures stamped in by code (Baker/Gus/Ren) paint a DOOR tile but
  // have no object-layer door, so they need their trigger zone registered
  // here or they read as broken scenery.
  private addStructureDoor(s: Structure, target: string) {
    const dx = s.doorX * TILE + TILE / 2
    const dy = s.wallRow * TILE + TILE / 2
    // Static-side copies are a recording: the door never opens.
    if (GameState.world === 'static') {
      this.interactables.push({
        x: dx,
        y: dy,
        action: () => this.openNarration(STATIC_DOOR_DEF),
      })
      return
    }
    const zone = this.add.zone(dx, dy, TILE, TILE)
    this.physics.add.existing(zone, true)
    // Step back out onto the tile below the door.
    const backTX = s.doorX
    const backTY = s.wallRow + 1
    this.doors.push({ zone, target, tx: 5, ty: 7, returnTX: backTX, returnTY: backTY })
    this.physics.add.overlap(this.player, zone, () =>
      this.enterDoor(target, 5, 7, backTX, backTY),
    )
  }

  // A vanished house must take its door with it, or the player walks onto
  // bare grass and gets teleported into an interior that no longer exists.
  private removeDoorAt(tileX: number, tileY: number) {
    const cx = tileX * TILE + TILE / 2
    const cy = tileY * TILE + TILE / 2
    this.doors = this.doors.filter((d) => {
      if (Math.abs(d.zone.x - cx) < 1 && Math.abs(d.zone.y - cy) < 1) {
        d.zone.destroy()
        return false
      }
      return true
    })
    this.interactables = this.interactables.filter(
      (it) => Math.abs(it.x - cx) >= 1 || Math.abs(it.y - cy) >= 1,
    )
  }

  private examine(tx: number, ty: number, def: NpcDef) {
    this.interactables.push({
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      action: () => this.openNarration(def),
    })
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
      this.removeDoorAt(s.doorX, s.wallRow)
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
      this.removeDoorAt(BAKER_HOUSE.doorX, BAKER_HOUSE.wallRow)
      const baker = this.npcs.find(n => n.def.id === 'baker')
      if (baker) {
        baker.sprite.destroy()
        this.npcs = this.npcs.filter(n => n !== baker)
      }
      this.openNarration(VANISH_DEF)
    })
  }

  /**
   * Places a one-time item pickup on the map.
   *
   * `chapterFlag` is the story beat this pickup completes, and it is explicit
   * because it used to be hardcoded to 'chapter2_done' here — correct for the
   * two Chapter 2 payoffs below, but it meant any pickup added later would
   * silently advance the chapter. This is the only writer of that flag;
   * `applyStoryState` reads it to move GameState.chapter to 3.
   */
  private spawnPickup(
    tx: number,
    ty: number,
    itemId: string,
    doneFlag: string,
    mode: 'dmg' | 'gbc',
    chapterFlag?: string,
  ) {
    const px = tx * TILE + TILE / 2
    const py = ty * TILE + TILE / 2
    const img = this.add.image(px, py, `item_${mode}_${itemId}`)
    const zone = this.add.zone(px, py, TILE, TILE)
    this.physics.add.existing(zone, true)
    this.physics.add.overlap(this.player, zone, () => {
      if (GameState.getFlag(doneFlag)) return
      GameState.setFlag(doneFlag)
      if (chapterFlag) GameState.setFlag(chapterFlag)
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
    music.stop() // silence for the ending card
    sfx.sting()

    const empathy = GameState.getFlag('ending_empathy')
    const bgColor = empathy ? 0xe0f0d0 : 0x08080e
    const textColor = empathy ? '#0f380f' : '#9bbc0f'
    // Hard-wrapped to 18 characters. At the font's native 8px that is 144px
    // on a 160px screen; the old wrapping ran to 196px and was being clipped
    // off both edges even at 7px.
    const body = empathy
      ? 'You step into the\nstatic and stay.\n\nThe lonely thing\nis lonely no more.\n\nThe town remembers\nall it lost.'
      : 'You tear the\nsignal loose.\n\nThe static\nscreams, then\nfalls silent.\n\nThe town is safe.\n\nBut the vanished\nstay gone.'

    const bg = this.add
      .rectangle(0, 0, GBC_WIDTH, GBC_HEIGHT, bgColor)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(3000)
      .setAlpha(0)
    const txt = this.add
      .text(GBC_WIDTH / 2, GBC_HEIGHT / 2 - 6, body, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: textColor,
        align: 'center',
        // 1, not 3: at 8px the extra leading pushed the card past 144px tall.
        lineSpacing: 1,
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
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '8px',
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
      const changed = GameState.toggleWorld()
      // UIScene is a separate scene and survives this one's restart, so the
      // toast outlives the transition and is still up as the new world fades in.
      if (changed.length > 0) {
        ;(this.scene.get('ui') as UIScene).showTransformToast(changed[0])
      }
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

  /**
   * Darkness overlay for maps flagged dark in Tiled (#73, #89).
   *
   * Two flags, because a room can be dark in one world and not the other:
   * - `dark` / `darkAlpha` — unlit in both worlds (the cellar, town_static).
   * - `darkInStatic` / `darkInStaticAlpha` — unlit only on the Static side.
   *
   * The second exists so the interiors can keep their lights in the normal
   * world and lose them across the crossing, without a duplicate map file per
   * house. It is what makes "Flashlight dies." a thing the player watches
   * happen rather than a caption: the TV is in the living room, so every
   * crossing takes place in a room that goes dark on the way over and comes
   * back up on the way home.
   *
   * Depth 20 puts it over the world and the player but under the minimap
   * (1000), the interact prompt (2000) and the dialogue box, so the UI stays
   * readable in the dark.
   */
  private buildDarkness(map: Phaser.Tilemaps.Tilemap) {
    this.darkness = undefined
    // Phaser hands back an array of {name, value} for a map that has Tiled
    // properties, but a plain object for one that has none — so this must
    // check the shape, not just for absence. Assuming the array crashed every
    // unmarked map, which is most of them.
    const raw = map.properties as unknown
    const props = Array.isArray(raw) ? (raw as { name: string; value: unknown }[]) : []
    const prop = (n: string) => props.find((x) => x.name === n)?.value
    const num = (n: string) => (typeof prop(n) === 'number' ? (prop(n) as number) : undefined)

    const alwaysDark = prop('dark') === true
    const darkHere = GameState.world === 'static' && prop('darkInStatic') === true
    if (!alwaysDark && !darkHere) return

    const alpha = (darkHere ? num('darkInStaticAlpha') : undefined) ?? num('darkAlpha') ?? 0.9
    this.darkness = new Darkness(this, {
      width: GBC_WIDTH,
      height: GBC_HEIGHT,
      depth: 20,
      alpha,
    })
  }

  /**
   * How far the player can see. A working flashlight lights the room; a dead
   * one is worth no more than none at all.
   *
   * Note this reads the item, not the `got_flashlight` flag — the flag records
   * that Mom handed it over and stays set forever, including on the static
   * side where the thing in your hands does not work.
   */
  private playerLightRadius(): number {
    return GameState.hasItem('flashlight') ? LIGHT_RADIUS.lit : LIGHT_RADIUS.dim
  }

  private redrawDarkness() {
    if (!this.darkness) return
    const lights: Light[] = [
      { x: this.player.x, y: this.player.y, radius: this.playerLightRadius() },
    ]
    // The TV is the only way between the worlds. Leaving it to be found by a
    // dead flashlight in an unlit room is how a dark house turns into a
    // softlock, so it carries its own glow — reachable from anywhere in the
    // room, and the correct look for a screen showing nothing but static.
    if (this.tvPos) {
      const flicker = Math.sin(this.time.now / TV_GLOW.periodMs) * TV_GLOW.flicker
      lights.push({ x: this.tvPos.x, y: this.tvPos.y, radius: TV_GLOW.radius + flicker })
    }
    this.darkness.redraw(lights)
  }

  // Deliberately no interaction gating here.
  //
  // #73 proposed hiding the interact prompt for targets outside the lit
  // radius, so light would be a key rather than a filter. That is unsafe on
  // town_static: reaching Chapter 3 requires examining the Baker's house and
  // Gus's hut on that side, and the flashlight is dead there — gating would
  // make the game unfinishable. Darkness affects what you can see, not what
  // you can touch.
  //
  // A future dark room that is genuinely optional could gate its own props
  // via a per-interactable flag. Nothing today needs it.

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

    // The destination first, so the player's own blip draws over it if they
    // happen to overlap.
    this.drawDestinationBlip()

    // Blink so the player reads clearly against static building pixels.
    if (Math.floor(this.time.now / 280) % 2 === 0) {
      const bx = this.miniOX + (this.player.x / TILE) * this.miniScale
      const by = this.miniOY + (this.player.y / TILE) * this.miniScale
      this.blip.fillStyle(PAL.lightest, 1)
      this.blip.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3)
    }
  }

  /**
   * Marks where the current objective is (#78).
   *
   * Targets are town tiles, so this only draws on the town maps — the other
   * maps are a single screen and get no minimap at all. It stops drawing once
   * the player is near, borrowing the rule from Lantern Keeper's guidance
   * arrow: direction is only useful until you have arrived.
   */
  private drawDestinationBlip() {
    if (this.mapKey !== 'town' && this.mapKey !== 'town_static') return
    const target = currentTarget()
    if (!target || !this.blip) return

    const ptx = this.player.x / TILE
    const pty = this.player.y / TILE
    const dx = target.tx - ptx
    const dy = target.ty - pty
    if (Math.hypot(dx, dy) <= DESTINATION_NEAR_TILES) return

    // A slower blink than the player's 280ms, and off-phase from it, so the
    // two markers never pulse together and cannot be read as one thing.
    if (Math.floor(this.time.now / 460) % 2 !== 0) return

    const bx = this.miniOX + (target.tx + 0.5) * this.miniScale
    const by = this.miniOY + (target.ty + 0.5) * this.miniScale
    // Brass yellow: distinct from the player's pale green and from the
    // terracotta the buildings are drawn in.
    this.blip.fillStyle(GBC_PAL.knobGlow, 1)
    this.blip.fillRect(Math.round(bx) - 2, Math.round(by), 5, 1)
    this.blip.fillRect(Math.round(bx), Math.round(by) - 2, 1, 5)
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
    this.redrawDarkness()

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
