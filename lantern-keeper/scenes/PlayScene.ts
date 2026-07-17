import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from '../constants'

// Tuned to the KAN-110 movement budget: single jump ~2.8 tiles,
// double jump ~5.6 tiles, so the 5-tile cliff gate needs the Ember lantern.
const RUN_SPEED = 60
const JUMP_VELOCITY = -150
const PLAYER_LIGHT_RADIUS = 24
const LANTERN_LIGHT_RADIUS = 28
const LIGHT_TOUCH_DISTANCE = 10

interface Lantern {
  name: string
  sprite: Phaser.GameObjects.Image
  lit: boolean
}

export class PlayScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private darkness!: Phaser.GameObjects.RenderTexture
  private brush!: Phaser.GameObjects.Image
  private brushBig!: Phaser.GameObjects.Image
  private lanterns: Lantern[] = []
  private hasDoubleJump = false
  private jumpsLeft = 0
  private won = false

  constructor() {
    super('play')
  }

  create() {
    const map = this.make.tilemap({ key: 'level1' })
    const tileset = map.addTilesetImage('tiles', 'tiles')!
    const ground = map.createLayer('ground', tileset)!
    ground.setCollisionBetween(1, 2)

    this.player = this.physics.add.sprite(16, 120, 'player')
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, ground)

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.startFollow(this.player, true)

    this.lanterns = (map.getObjectLayer('lanterns')?.objects ?? []).map(
      (obj) => ({
        name: obj.name,
        sprite: this.add.image(obj.x!, obj.y!, 'lanternUnlit'),
        lit: false,
      }),
    )

    this.cursors = this.input.keyboard!.createCursorKeys()

    this.darkness = this.add
      .renderTexture(0, 0, GBC_WIDTH, GBC_HEIGHT)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10)
    this.brush = new Phaser.GameObjects.Image(this, 0, 0, 'brush')
    this.brushBig = new Phaser.GameObjects.Image(this, 0, 0, 'brushBig')

    this.hasDoubleJump = false
    this.jumpsLeft = 0
    this.won = false
  }

  private lightLantern(lantern: Lantern) {
    lantern.lit = true
    lantern.sprite.setTexture('lanternLit')
    if (lantern.name === 'ember') {
      this.hasDoubleJump = true
      this.toast('DOUBLE JUMP!')
    } else if (lantern.name === 'goal') {
      this.won = true
      this.toast('FOREST FLOOR COMPLETE', 0)
    }
  }

  private toast(message: string, duration = 2000) {
    const text = this.add
      .text(GBC_WIDTH / 2, 28, message, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#e0f8cf',
        backgroundColor: '#0f1a12',
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20)
    if (duration > 0) {
      this.time.delayedCall(duration, () => text.destroy())
    }
  }

  update() {
    const body = this.player.body

    if (this.won) {
      this.player.setVelocityX(0)
      this.redrawDarkness()
      return
    }

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-RUN_SPEED)
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(RUN_SPEED)
    } else {
      this.player.setVelocityX(0)
    }

    if (body.blocked.down) {
      this.jumpsLeft = this.hasDoubleJump ? 2 : 1
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && this.jumpsLeft > 0) {
      this.player.setVelocityY(JUMP_VELOCITY)
      this.jumpsLeft--
    }

    for (const lantern of this.lanterns) {
      if (
        !lantern.lit &&
        Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          lantern.sprite.x,
          lantern.sprite.y,
        ) < LIGHT_TOUCH_DISTANCE
      ) {
        this.lightLantern(lantern)
      }
    }

    this.redrawDarkness()
  }

  private redrawDarkness() {
    const cam = this.cameras.main
    this.darkness.clear()
    this.darkness.fill(0x000000, 1)
    this.darkness.erase(
      this.brush,
      this.player.x - cam.scrollX - PLAYER_LIGHT_RADIUS,
      this.player.y - cam.scrollY - PLAYER_LIGHT_RADIUS,
    )
    for (const lantern of this.lanterns) {
      if (lantern.lit) {
        this.darkness.erase(
          this.brushBig,
          lantern.sprite.x - cam.scrollX - LANTERN_LIGHT_RADIUS,
          lantern.sprite.y - cam.scrollY - LANTERN_LIGHT_RADIUS,
        )
      }
    }
  }
}
