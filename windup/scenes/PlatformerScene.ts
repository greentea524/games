import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState } from '../state'
import { LEVELS } from '../levels'

type Facing = 'left' | 'right'

export class PlatformerScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private springs!: Phaser.Physics.Arcade.StaticGroup
  private movingPlatforms!: Phaser.Physics.Arcade.Group
  private pickups!: Phaser.Physics.Arcade.StaticGroup
  private stations!: Phaser.Physics.Arcade.StaticGroup
  private goals!: Phaser.Physics.Arcade.StaticGroup
  private facing: Facing = 'right'
  private coyoteTimer = 0
  private wallJumpTimer = 0
  private isTransitioning = false

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
    this.isTransitioning = false

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
    this.stations = this.physics.add.staticGroup()
    this.goals = this.physics.add.staticGroup()

    const level = LEVELS[GameState.levelIndex] || LEVELS[1]

    if (GameState.energy === GameState.maxEnergy && GameState.checkpointX === 32) {
      GameState.checkpointX = level.spawn.x
      GameState.checkpointY = level.spawn.y
      
      // Reset speedrun timer when starting level 1
      if (GameState.levelIndex === 1) {
        GameState.speedrunStartTime = Date.now()
        GameState.speedrunTimeMillis = 0
        GameState.saveGame()
      }
    }

    level.platforms.forEach(p => this.platforms.create(p.x, p.y, `tiles_${mode}`, 1))
    level.springs.forEach(p => this.springs.create(p.x, p.y, `tiles_${mode}`, 2))
    level.pickups.forEach(p => this.pickups.create(p.x, p.y, `energy_${mode}`))
    
    level.stations.forEach(p => {
      const s = this.stations.create(p.x, p.y, `station_${mode}`) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      s.setData('used', false)
    })

    level.movingPlatforms.forEach(p => {
      const mp = this.movingPlatforms.create(p.x, p.y, `tiles_${mode}`, 3) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
      this.tweens.add({
        targets: mp,
        x: p.x + p.dx,
        y: p.y + p.dy,
        duration: p.duration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      })
    })

    this.goals.create(level.goal.x, level.goal.y, `goal_${mode}`)

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
    this.physics.add.overlap(this.player, this.stations, (p, s) => this.reachStation(s as Phaser.Types.Physics.Arcade.SpriteWithStaticBody))

    this.physics.add.overlap(this.player, this.springs, () => {
      this.player.setVelocityY(-350)
      this.coyoteTimer = 0
    })

    this.physics.add.overlap(this.player, this.pickups, (p, pickup) => {
      pickup.destroy()
      GameState.addEnergy(20)
    })

    this.physics.add.overlap(this.player, this.goals, () => this.reachGoal())
  }

  private reachGoal() {
    if (this.isTransitioning) return
    this.isTransitioning = true

    if (GameState.levelIndex === 32) {
      if (GameState.speedrunStartTime) {
        GameState.speedrunTimeMillis = Date.now() - GameState.speedrunStartTime
        GameState.speedrunStartTime = null
      }
      GameState.saveGame()

      this.cameras.main.fadeOut(2000)
      this.add.text(GBC_WIDTH / 2, GBC_HEIGHT / 2 - 10, 'VICTORY!', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '12px',
        color: mode === 'dmg' ? '#0f380f' : '#ffffff'
      }).setOrigin(0.5).setDepth(100)

      this.time.delayedCall(3000, () => {
        GameState.levelIndex = 1
        GameState.speedrunTimeMillis = 0
        GameState.saveGame()
        this.scene.restart()
      })
      return
    }

    GameState.levelIndex++
    if (!LEVELS[GameState.levelIndex]) GameState.levelIndex = 1

    const nextLevel = LEVELS[GameState.levelIndex]
    GameState.checkpointX = nextLevel.spawn.x
    GameState.checkpointY = nextLevel.spawn.y
    GameState.refillEnergy()
    GameState.saveGame()

    this.cameras.main.fadeOut(800)
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart()
    })
  }

  reloadPalette() {
    const mode = GameState.paletteMode
    this.player.setTexture(`windup_${mode}_${this.facing}`)

    this.stations.getChildren().forEach((s: any) => {
      s.setTexture(s.getData('used') ? `station_empty_${mode}` : `station_${mode}`)
    })

    const swapGroup = (group: Phaser.Physics.Arcade.Group | Phaser.Physics.Arcade.StaticGroup, key: string) => {
      group.getChildren().forEach((c: any) => {
        const frameName = c.frame.name === '__BASE' ? 0 : c.frame.name
        c.setTexture(key, frameName)
      })
    }

    swapGroup(this.platforms, `tiles_${mode}`)
    swapGroup(this.springs, `tiles_${mode}`)
    swapGroup(this.movingPlatforms, `tiles_${mode}`)
    
    this.pickups.getChildren().forEach((p: any) => p.setTexture(`energy_${mode}`))
    this.goals.getChildren().forEach((g: any) => g.setTexture(`goal_${mode}`))
  }

  update(time: number, delta: number) {
    if (GameState.uiBlocking || this.isTransitioning) {
      this.player.setVelocityX(0)
      return
    }

    const mode = GameState.paletteMode
    const isGrounded = this.player.body.blocked.down
    const isWalledLeft = this.player.body.blocked.left
    const isWalledRight = this.player.body.blocked.right
    const isWalled = !isGrounded && (isWalledLeft || isWalledRight)

    if (isGrounded) {
      this.coyoteTimer = time + 120
    }

    const isMovingTowardsWall = (isWalledLeft && (this.cursors.left.isDown || this.wasd.A.isDown)) || 
                                (isWalledRight && (this.cursors.right.isDown || this.wasd.D.isDown))

    if (isWalled && isMovingTowardsWall && this.player.body.velocity.y > 0) {
      this.player.setVelocityY(40) // Wall slide friction
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

    if (time > this.wallJumpTimer) {
      this.player.setVelocityX(moveX)
    }
    this.player.setTexture(`windup_${mode}_${this.facing}`)

    // Energy drain on movement
    if (moveX !== 0 && GameState.energy > 0) {
      GameState.drainEnergy((delta / 1000) * 8)
    }

    // Jump with Coyote Time & Wall Jump
    const canJump = isGrounded || time < this.coyoteTimer
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey) && GameState.energy > 0) {
      if (canJump) {
        this.player.setVelocityY(-170)
        this.coyoteTimer = 0
        GameState.drainEnergy(5) // Extra jump cost
      } else if (isWalled) {
        // Wall Jump
        this.player.setVelocityY(-170)
        this.player.setVelocityX(isWalledLeft ? 150 : -150)
        this.facing = isWalledLeft ? 'right' : 'left'
        this.wallJumpTimer = time + 250 // Lock out D-pad for 250ms
        GameState.drainEnergy(5)
      }
    }

    // Respawn if energy empty and player stops
    if (GameState.energy <= 0 && isGrounded && moveX === 0) {
      this.respawnAtCheckpoint()
    }
  }

  private reachStation(station: Phaser.Types.Physics.Arcade.SpriteWithStaticBody) {
    if (station.getData('used')) return

    const mode = GameState.paletteMode
    station.setData('used', true)
    station.setTexture(`station_empty_${mode}`)

    if (GameState.energy < GameState.maxEnergy) {
      GameState.refillEnergy()
      GameState.checkpointX = station.x
      GameState.checkpointY = station.y - 12
    }
  }

  private respawnAtCheckpoint() {
    GameState.refillEnergy()
    this.player.setPosition(GameState.checkpointX, GameState.checkpointY)
    this.player.setVelocity(0, 0)
  }
}
