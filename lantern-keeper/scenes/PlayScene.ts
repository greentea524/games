import Phaser from 'phaser'
import { sfx } from '../audio'
import {
  GBC_WIDTH,
  GBC_HEIGHT,
  GLOW,
  DASH,
  JUMP_ASSIST,
  WALL,
} from '../constants'

// Tuned to the KAN-110 movement budget: single jump ~2.8 tiles,
// double jump ~5.6 tiles, so the 5-tile cliff gate needs the Ember lantern.
const RUN_SPEED = 60
const JUMP_VELOCITY = -150
const LIGHT_TOUCH_DISTANCE = 10
const SPAWN_POINT = { x: 16, y: 120 }

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
  private dashKey!: Phaser.Input.Keyboard.Key
  private jumpKey!: Phaser.Input.Keyboard.Key
  private hasDoubleJump = false
  private hasDash = false
  private hasWallCling = false
  private jumpsLeft = 0
  private facing = 1
  private won = false
  
  private levelKey = 'level1'

  init(data: any) {
    this.levelKey = data?.levelKey || 'level1'
    this.hasDoubleJump = data?.hasDoubleJump || false
    this.hasDash = data?.hasDash || false
    this.hasWallCling = data?.hasWallCling || false
  }
  
  // Wall-cling state (KAN-115)
  private lastWallAt = -Infinity
  private lastWallDir = 0
  private wallJumpLockUntil = 0
  // Jump assist (coyote time + input buffer)
  private lastGroundedAt = 0
  private jumpBufferedUntil = 0
  // Dash state (KAN-114)
  private dashingUntil = 0
  private dashCooldownUntil = 0
  private dashBufferedUntil = 0
  private airDashUsed = false
  // Fading glow (KAN-113): fraction 1 -> 0; kept on the instance so it
  // stays tunable at runtime alongside the GLOW config.
  private glow = 1
  private glowDurationMs = GLOW.durationMs
  private respawnPoint = { ...SPAWN_POINT }
  
  private dashParticles!: Phaser.GameObjects.Particles.ParticleEmitter
  private sparkParticles!: Phaser.GameObjects.Particles.ParticleEmitter
  private groundLayer!: Phaser.Tilemaps.TilemapLayer

  constructor() {
    super('play')
  }

  create() {
    this.won = false
    this.jumpsLeft = 0
    this.dashingUntil = 0
    this.dashCooldownUntil = 0
    this.airDashUsed = false

    const map = this.make.tilemap({ key: this.levelKey })
    const tileset = map.addTilesetImage('tiles', 'tiles')!
    const ground = map.createLayer('ground', tileset)!
    ground.setCollisionBetween(1, 6)
    this.groundLayer = ground

    this.player = this.physics.add.sprite(SPAWN_POINT.x, SPAWN_POINT.y, 'player_idle')
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, ground)

    this.anims.create({
      key: 'walk',
      frames: [
        { key: 'player_walk1' },
        { key: 'player_idle' },
        { key: 'player_walk2' },
        { key: 'player_idle' },
      ],
      frameRate: 10,
      repeat: -1
    })

    this.dashParticles = this.add.particles(0, 0, 'particle', {
      lifespan: 200,
      alpha: { start: 1, end: 0 },
      scale: { start: 1, end: 0 },
      emitting: false
    })

    this.sparkParticles = this.add.particles(0, 0, 'spark', {
      lifespan: 300,
      speed: { min: 20, max: 50 },
      angle: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 },
      emitting: false
    })

    // Default TILE_BIAS (16) lets a jump that peaks just below a ledge
    // corner-snap on top, breaking ability gates. 8 still covers our max
    // fall speed (~3.5px/frame) with margin.
    this.physics.world.TILE_BIAS = 8
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
    this.dashKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.X,
    )
    this.jumpKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.Z,
    )

    this.darkness = this.add
      .renderTexture(0, 0, GBC_WIDTH, GBC_HEIGHT)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10)
    this.brush = new Phaser.GameObjects.Image(this, 0, 0, 'brush')
    this.brushBig = new Phaser.GameObjects.Image(this, 0, 0, 'brushBig')

    this.glow = 1
    this.respawnPoint = { ...SPAWN_POINT }
    this.lastGroundedAt = 0
    this.jumpBufferedUntil = 0
    this.dashingUntil = 0
    this.dashCooldownUntil = 0
    this.dashBufferedUntil = 0
  }

  private lightLantern(lantern: Lantern) {
    lantern.lit = true
    lantern.sprite.setTexture('lanternLit')
    this.respawnPoint = { x: lantern.sprite.x, y: lantern.sprite.y - 6 }
    
    if (lantern.name !== 'crown') {
      sfx.lantern()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 10)
    }

    if (lantern.name === 'ember') {
      this.hasDoubleJump = true
      this.toast('DOUBLE JUMP!')
    } else if (lantern.name === 'gale') {
      this.hasDash = true
      const isMobile = window.matchMedia('(pointer: coarse)').matches
      this.toast(isMobile ? 'DASH! (B)' : 'DASH! (X)')
      
      if (this.levelKey === 'level2') {
         this.won = true
         sfx.win()
         this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 50)
         this.toast('THE MARSH CLEARED', 0)
         this.tweens.add({ targets: this.darkness, alpha: 0, duration: 3000 })
         this.time.delayedCall(3000, () => {
           this.add.text(GBC_WIDTH / 2, GBC_HEIGHT - 20, 'PRESS ENTER TO RETURN TO MENU', {
             fontFamily: 'monospace', fontSize: '10px', color: '#e0f8cf',
             stroke: '#0f1a12', strokeThickness: 2, padding: { x: 4, y: 4 }
           }).setOrigin(0.5).setScrollFactor(0).setDepth(20)
           const enterKey = this.input.keyboard!.addKey('ENTER')
           enterKey.once('down', () => this.scene.start('menu'))
         })
      }
    } else if (lantern.name === 'root') {
      this.hasWallCling = true
      this.toast('WALL CLING!')
    } else if (lantern.name === 'crown') {
      this.won = true
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 50)
      this.toast('THE FOREST GLOWS AGAIN', 0)
      
      this.tweens.add({
        targets: this.darkness,
        alpha: 0,
        duration: 3000
      })
      
      this.time.delayedCall(3000, () => {
        this.add.text(GBC_WIDTH / 2, GBC_HEIGHT - 20, 'PRESS ENTER FOR LEVEL 2', {
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: '#000000',
          padding: { x: 3, y: 2 },
          resolution: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20)

        const enterKey = this.input.keyboard!.addKey('ENTER')
        enterKey.once('down', () => {
          this.scene.start('play', { 
            levelKey: 'level2',
            hasDoubleJump: this.hasDoubleJump,
            hasDash: this.hasDash,
            hasWallCling: this.hasWallCling
          })
        })
      })
    }
  }

  private toast(message: string, duration = 2000) {
    const text = this.add
      .text(GBC_WIDTH / 2, 28, message, {
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#e0f8cf',
        backgroundColor: '#0f1a12',
        padding: { x: 3, y: 2 },
        resolution: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20)
    if (duration > 0) {
      this.time.delayedCall(duration, () => text.destroy())
    }
  }

  private respawn() {
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y)
    this.player.setVelocity(0, 0)
    this.glow = 1
    sfx.die()
    this.toast('THE DARK CLOSES IN...', 1500)
  }

  update(time: number, delta: number) {
    const body = this.player.body

    const tileInside = this.groundLayer.getTileAtWorldXY(body.center.x, body.center.y, true)
    const tileBelow = this.groundLayer.getTileAtWorldXY(body.center.x, body.bottom - 1, true)
    const inMud = (tileInside && (tileInside.index === 7 || tileInside.index === 8)) ||
                  (tileBelow && (tileBelow.index === 7 || tileBelow.index === 8))

    if (inMud && body.velocity.y > 20) {
      this.player.setVelocityY(20)
    }

    if (this.won) {
      this.player.setVelocityX(0)
      this.redrawDarkness()
      return
    }

    const dashing = time < this.dashingUntil
    if (!dashing && !body.allowGravity) {
      body.setAllowGravity(true) // dash just ended
    }

    if (!dashing && time >= this.wallJumpLockUntil) {
      if (this.cursors.left.isDown) {
        this.player.setVelocityX(-RUN_SPEED)
        this.facing = -1
      } else if (this.cursors.right.isDown) {
        this.player.setVelocityX(RUN_SPEED)
        this.facing = 1
      } else {
        this.player.setVelocityX(0)
      }
    }

    const maxJumps = this.hasDoubleJump ? 2 : 1
    if (body.blocked.down || inMud) {
      if (this.jumpsLeft !== maxJumps && body.velocity.y > 0 && !inMud) {
        sfx.land()
      }
      this.jumpsLeft = maxJumps
      this.lastGroundedAt = time
      this.airDashUsed = false
    } else if (
      this.jumpsLeft === maxJumps &&
      time - this.lastGroundedAt > JUMP_ASSIST.coyoteMs
    ) {
      this.jumpsLeft = maxJumps - 1 // walked off a ledge past coyote time
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
      this.jumpBufferedUntil = time + JUMP_ASSIST.bufferMs
    }

    // Wall cling (KAN-115): hold toward a wall while airborne to slide
    // slowly; jump kicks away from the wall (with a short input lockout
    // so the kick isn't immediately overridden by the held arrow).
    const clinging =
      this.hasWallCling &&
      !body.blocked.down &&
      ((body.blocked.left && this.cursors.left.isDown) ||
        (body.blocked.right && this.cursors.right.isDown))
    if (clinging) {
      this.lastWallAt = time
      this.lastWallDir = body.blocked.left ? -1 : 1
      this.facing = this.lastWallDir
      if (body.velocity.y > WALL.slideSpeed) {
        this.player.setVelocityY(WALL.slideSpeed)
      }
    }
    const wallJumpReady =
      this.hasWallCling &&
      !body.blocked.down &&
      time - this.lastWallAt <= WALL.coyoteMs
    if (!dashing && time < this.jumpBufferedUntil && wallJumpReady) {
      this.player.setVelocity(-this.lastWallDir * WALL.jumpVx, WALL.jumpVy)
      this.facing = -this.lastWallDir
      this.wallJumpLockUntil = time + WALL.jumpLockMs
      this.jumpBufferedUntil = 0
      sfx.wallKick()
      this.dashParticles.emitParticleAt(this.player.x, this.player.y, 5)
    } else if (!dashing && time < this.jumpBufferedUntil && this.jumpsLeft > 0) {
      this.player.setVelocityY(inMud ? -110 : JUMP_VELOCITY)
      this.jumpsLeft === maxJumps ? sfx.jump() : sfx.doubleJump()
      this.jumpsLeft--
      this.jumpBufferedUntil = 0
    }

    // Dash (KAN-114): fixed distance burst, buffered input, cooldown,
    // one air dash per airtime, vertical velocity frozen while dashing.
    if (Phaser.Input.Keyboard.JustDown(this.dashKey)) {
      this.dashBufferedUntil = time + DASH.bufferMs
    }
    if (
      this.hasDash &&
      !dashing &&
      time < this.dashBufferedUntil &&
      time >= this.dashCooldownUntil &&
      (body.blocked.down || !this.airDashUsed)
    ) {
      this.dashingUntil = time + DASH.durationMs
      this.dashCooldownUntil = time + DASH.durationMs + DASH.cooldownMs
      this.dashBufferedUntil = 0
      if (!body.blocked.down) {
        this.airDashUsed = true
      }
      body.setAllowGravity(false)
      this.player.setVelocity(this.facing * DASH.speed, 0)
      sfx.dash()
      this.dashParticles.startFollow(this.player)
      this.dashParticles.start()
      this.time.delayedCall(DASH.durationMs, () => this.dashParticles.stop())
    }

    this.player.setFlipX(this.facing === -1)
    if (clinging) {
      this.player.setTexture('player_cling')
      this.player.stop()
    } else if (!body.blocked.down) {
      this.player.setTexture('player_idle')
      this.player.stop()
    } else if (body.velocity.x !== 0) {
      this.player.play('walk', true)
    } else {
      this.player.setTexture('player_idle')
      this.player.stop()
    }

    let nearLitLantern = false
    for (const lantern of this.lanterns) {
      const touching =
        Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          lantern.sprite.x,
          lantern.sprite.y,
        ) < LIGHT_TOUCH_DISTANCE
      if (touching && !lantern.lit) {
        this.lightLantern(lantern)
      }
      if (touching && lantern.lit) {
        nearLitLantern = true
      }
    }

    // Fading glow (KAN-113): decays over time, refills at lit lanterns,
    // full depletion sends the keeper back to the last lit lantern.
    if (nearLitLantern) {
      this.glow = 1
    } else {
      this.glow -= delta / this.glowDurationMs
      if (this.glow <= 0) {
        this.respawn()
      }
    }

    this.redrawDarkness()
  }

  private playerLightRadius(): number {
    return GLOW.minRadius + (GLOW.maxRadius - GLOW.minRadius) * Math.max(0, this.glow)
  }

  private redrawDarkness() {
    const cam = this.cameras.main
    const radius = this.playerLightRadius()
    this.darkness.clear()
    this.darkness.fill(0x000000, 1)
    // erase() honors the brush's center origin: pass the light's center
    this.brush.setDisplaySize(radius * 2, radius * 2)
    this.darkness.erase(
      this.brush,
      this.player.x - cam.scrollX,
      this.player.y - cam.scrollY,
    )
    for (const lantern of this.lanterns) {
      if (lantern.lit) {
        this.darkness.erase(
          this.brushBig,
          lantern.sprite.x - cam.scrollX,
          lantern.sprite.y - cam.scrollY,
        )
      }
    }
  }
}
