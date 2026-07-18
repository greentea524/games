import Phaser from 'phaser'
import {
  GBC_WIDTH,
  GBC_HEIGHT,
  TILE,
  PLAYER_SPEED,
  SOLID_TILES,
  TILES,
  PAL,
} from '../constants'
import { GameState } from '../state'
import { NPCS } from '../dialogue'
import type { NpcDef } from '../dialogue'
import type { UIScene } from './UIScene'

type Facing = 'down' | 'up' | 'left' | 'right'

interface DoorData {
  zone: Phaser.GameObjects.Zone
  target: string
  tx: number
  ty: number
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
  private facing: Facing = 'down'
  private transitioning = false

  private npcs: NpcInstance[] = []
  private interactKey!: Phaser.Input.Keyboard.Key
  private prompt?: Phaser.GameObjects.Text

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

  init(data: { mapKey?: string; tx?: number; ty?: number; facing?: Facing }) {
    this.mapKey = data.mapKey ?? 'town'
    this.spawnTX = data.tx
    this.spawnTY = data.ty
    this.spawnFacing = data.facing
  }

  create() {
    this.transitioning = false
    this.doors = []
    this.cameras.main.fadeIn(250, 15, 56, 15)

    const map = this.make.tilemap({ key: this.mapKey })
    const tileset = map.addTilesetImage('tiles', 'tiles')!
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

    this.player = this.physics.add.sprite(sx, sy, `kid_${facing}_0`)
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
      const tx = o.properties?.find((p: any) => p.name === 'tx')?.value ?? 0
      const ty = o.properties?.find((p: any) => p.name === 'ty')?.value ?? 0
      const zone = this.add.zone(o.x! + TILE / 2, o.y! + TILE / 2, TILE, TILE)
      this.physics.add.existing(zone, true)
      this.doors.push({ zone, target, tx, ty })
      this.physics.add.overlap(this.player, zone, () =>
        this.enterDoor(target, tx, ty),
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
        `npc_${def.id}_down`,
      ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      sprite.body.setSize(12, 12).setOffset(2, 3)
      this.npcs.push({ sprite, def, facing: 'down' })
    }
    this.physics.add.collider(this.player, npcGroup)

    this.prompt = this.add
      .text(0, 0, 'A', {
        fontFamily: '"Press Start 2P"',
        fontSize: '8px',
        color: '#0f380f',
        backgroundColor: '#9bbc0f',
        padding: { x: 2, y: 2 },
        resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(900)
      .setVisible(false)

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
    n.sprite.setTexture(`npc_${n.def.id}_${n.facing}`)
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
          t.index === TILES.DOOR
        ) {
          color = PAL.light // buildings pop brightest
        } else if (t.index === TILES.TREE || t.index === TILES.WATER) {
          color = PAL.dark // natural obstacles, dimmer
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

  private enterDoor(target: string, tx: number, ty: number) {
    if (this.transitioning) return
    this.transitioning = true
    this.player.setVelocity(0, 0)
    this.cameras.main.fadeOut(250, 15, 56, 15)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart({ mapKey: target, tx, ty, facing: this.facing })
    })
  }

  update() {
    if (this.transitioning) return

    this.updateMinimap()

    // Consume the interact key every frame so a held key can't double-fire
    // across the dialogue open/close boundary.
    const interactPressed = Phaser.Input.Keyboard.JustDown(this.interactKey)

    // Frozen while a dialogue or menu is open.
    if (GameState.uiBlocking) {
      this.player.setVelocity(0, 0)
      this.player.anims.stop()
      this.player.setTexture(`kid_${this.facing}_0`)
      if (this.prompt) this.prompt.setVisible(false)
      return
    }

    const near = this.facingNpc()
    if (this.prompt) {
      if (near) {
        this.prompt.setVisible(true)
        this.prompt.setPosition(near.sprite.x, near.sprite.y - TILE / 2)
      } else {
        this.prompt.setVisible(false)
      }
    }

    // Interact (ignore briefly after a dialogue closes).
    if (
      interactPressed &&
      near &&
      this.time.now - GameState.uiClosedAt > 150
    ) {
      this.faceNpcToward(near)
      GameState.dialogueActive = true
      ;(this.scene.get('ui') as UIScene).startDialogue(near.def)
      this.player.setVelocity(0, 0)
      return
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
      this.player.anims.play(`walk_${this.facing}`, true)
    } else {
      this.player.setVelocity(0, 0)
      this.player.anims.stop()
      this.player.setTexture(`kid_${this.facing}_0`)
    }
  }
}
