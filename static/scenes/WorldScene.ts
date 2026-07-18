import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, TILE, PLAYER_SPEED, SOLID_TILES } from '../constants'

type Facing = 'down' | 'up' | 'left' | 'right'

interface DoorData {
  zone: Phaser.GameObjects.Zone
  target: string
  tx: number
  ty: number
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private doors: DoorData[] = []
  private facing: Facing = 'down'
  private transitioning = false

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

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >
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
