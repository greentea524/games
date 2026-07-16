import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from '../constants'

const RUN_SPEED = 60
const JUMP_VELOCITY = -170
const LIGHT_RADIUS = 24

export class PlayScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private darkness!: Phaser.GameObjects.RenderTexture
  private brush!: Phaser.GameObjects.Image

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

    this.cursors = this.input.keyboard!.createCursorKeys()

    this.darkness = this.add
      .renderTexture(0, 0, GBC_WIDTH, GBC_HEIGHT)
      .setOrigin(0)
      .setDepth(10)
    this.brush = new Phaser.GameObjects.Image(this, 0, 0, 'brush')
  }

  update() {
    const body = this.player.body

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-RUN_SPEED)
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(RUN_SPEED)
    } else {
      this.player.setVelocityX(0)
    }

    if (this.cursors.up.isDown && body.blocked.down) {
      this.player.setVelocityY(JUMP_VELOCITY)
    }

    this.darkness.clear()
    this.darkness.fill(0x000000, 1)
    this.darkness.erase(
      this.brush,
      this.player.x - LIGHT_RADIUS,
      this.player.y - LIGHT_RADIUS,
    )
  }
}
