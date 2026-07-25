import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState } from '../state'

type Facing = 'left' | 'right'

export class PlatformerScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private springs!: Phaser.Physics.Arcade.StaticGroup
  private movingPlatforms!: Phaser.Physics.Arcade.Group
  private pickups!: Phaser.Physics.Arcade.StaticGroup
  private station!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody
  private facing: Facing = 'right'
  private coyoteTimer = 0

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private jumpKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super('platformer')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    this.cameras.main.setBounds(0, 0, GBC_WIDTH, GBC_HEIGHT)
    this.physics.world.setBounds(0, 0, GBC_WIDTH, GBC_HEIGHT)

    this.renderLevel()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('A,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  renderLevel() {
    const mode = GameState.paletteMode
    this.platforms = this.physics.add.staticGroup()
    this.springs = this.physics.add.staticGroup()
    this.movingPlatforms = this.physics.add.group({ allowGravity: false, immovable: true })
    this.pickups = this.physics.add.staticGroup()

    // Ground floor (y = 128)
    for (let x = 0; x < 10; x++) {
      this.platforms.create(x * TILE + TILE / 2, 136, `tiles_${mode}`, 0)
    }

    // Elevated platforms
    this.platforms.create(4 * TILE + TILE / 2, 96, `tiles_${mode}`, 1)
    this.platforms.create(5 * TILE + TILE / 2, 96, `tiles_${mode}`, 1)
    this.platforms.create(8 * TILE + TILE / 2, 72, `tiles_${mode}`, 1)

    // Springs
    this.springs.create(3 * TILE + TILE / 2, 128, `tiles_${mode}`, 2)

    // Moving Platform
    const mp = this.movingPlatforms.create(6 * TILE + TILE / 2, 112, `tiles_${mode}`, 3) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
    this.tweens.add({
      targets: mp,
      x: mp.x + 3 * TILE,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    // Pickups
    this.pickups.create(5 * TILE + TILE / 2, 64, `energy_${mode}`)

    // Winding Station Checkpoint
    this.station = this.physics.add.staticSprite(
      8 * TILE + TILE / 2,
      56,
      `station_${mode}`,
    ) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody

    // Player
    this.player = this.physics.add.sprite(
      GameState.checkpointX,
      GameState.checkpointY,
      `windup_${mode}_${this.facing}`,
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
    this.player.setCollideWorldBounds(true)
    this.player.body.setGravityY(400)
    this.player.body.setSize(10, 12).setOffset(3, 4)

    this.physics.add.collider(this.player, this.platforms)
    this.physics.add.collider(this.player, this.movingPlatforms)
    this.physics.add.overlap(this.player, this.station, () => this.reachStation())

    this.physics.add.overlap(this.player, this.springs, () => {
      this.player.setVelocityY(-350)
      this.coyoteTimer = 0
    })

    this.physics.add.overlap(this.player, this.pickups, (p, pickup) => {
      pickup.destroy()
      GameState.addEnergy(20)
    })
  }

  reloadPalette() {
    const mode = GameState.paletteMode
    this.children.removeAll()
    this.renderLevel()
  }

  update(time: number, delta: number) {
    if (GameState.uiBlocking) return

    const mode = GameState.paletteMode
    const isGrounded = this.player.body.blocked.down

    if (isGrounded) {
      this.coyoteTimer = time + 120
    }

    // Moving Platform Sticky Friction
    this.movingPlatforms.getChildren().forEach((plat: any) => {
      if (plat.prevX !== undefined) {
        const dx = plat.x - plat.prevX
        const isAbove = this.player.body.bottom <= plat.body.top + 2 && this.player.body.bottom >= plat.body.top - 2
        const isWithin = this.player.body.right > plat.body.left && this.player.body.left < plat.body.right
        if (isAbove && isWithin && this.player.body.velocity.y >= 0) {
          this.player.x += dx
        }
      }
      plat.prevX = plat.x
    })

    // Zero-Energy Speed Drain Penalty
    const speedMultiplier = GameState.energy > 0 ? 1 : 0.2
    const moveSpeed = 80 * speedMultiplier

    let moveX = 0
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      moveX = -moveSpeed
      this.facing = 'left'
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      moveX = moveSpeed
      this.facing = 'right'
    }

    this.player.setVelocityX(moveX)
    this.player.setTexture(`windup_${mode}_${this.facing}`)

    // Energy drain on movement
    if (moveX !== 0 && GameState.energy > 0) {
      GameState.drainEnergy((delta / 1000) * 8)
    }

    // Jump with Coyote Time
    const canJump = isGrounded || time < this.coyoteTimer
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey) && canJump && GameState.energy > 0) {
      this.player.setVelocityY(-170)
      this.coyoteTimer = 0
      GameState.drainEnergy(5) // Extra jump cost
    }

    // Respawn if energy empty and player stops
    if (GameState.energy <= 0 && isGrounded && moveX === 0) {
      this.respawnAtCheckpoint()
    }
  }

  private reachStation() {
    if (GameState.energy < GameState.maxEnergy) {
      GameState.refillEnergy()
      GameState.checkpointX = this.station.x
      GameState.checkpointY = this.station.y - 12
    }
  }

  private respawnAtCheckpoint() {
    GameState.refillEnergy()
    this.player.setPosition(GameState.checkpointX, GameState.checkpointY)
    this.player.setVelocity(0, 0)
  }
}
