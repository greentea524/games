import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, GLOW, DASH, JUMP_ASSIST } from '../constants'

// Tuned to the KAN-110 movement budget: single jump ~2.8 tiles,
// double jump ~5.6 tiles, so the 5-tile cliff gate needs the Ember lantern.
const RUN_SPEED = 60
const JUMP_VELOCITY = -150
const LANTERN_LIGHT_RADIUS = 28
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
  private hasDoubleJump = false
  private hasDash = false
  private jumpsLeft = 0
  private facing = 1
  private won = false
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

  constructor() {
    super('play')
  }

  create() {
    const map = this.make.tilemap({ key: 'level1' })
    const tileset = map.addTilesetImage('tiles', 'tiles')!
    const ground = map.createLayer('ground', tileset)!
    ground.setCollisionBetween(1, 2)

    this.player = this.physics.add.sprite(SPAWN_POINT.x, SPAWN_POINT.y, 'player')
    this.player.setCollideWorldBounds(true)
    this.physics.add.collider(this.player, ground)

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

    this.darkness = this.add
      .renderTexture(0, 0, GBC_WIDTH, GBC_HEIGHT)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10)
    this.brush = new Phaser.GameObjects.Image(this, 0, 0, 'brush')
    this.brushBig = new Phaser.GameObjects.Image(this, 0, 0, 'brushBig')

    this.hasDoubleJump = false
    this.hasDash = false
    this.jumpsLeft = 0
    this.facing = 1
    this.won = false
    this.glow = 1
    this.respawnPoint = { ...SPAWN_POINT }
    this.lastGroundedAt = 0
    this.jumpBufferedUntil = 0
    this.dashingUntil = 0
    this.dashCooldownUntil = 0
    this.dashBufferedUntil = 0
    this.airDashUsed = false
  }

  private lightLantern(lantern: Lantern) {
    lantern.lit = true
    lantern.sprite.setTexture('lanternLit')
    this.respawnPoint = { x: lantern.sprite.x, y: lantern.sprite.y - 6 }
    if (lantern.name === 'ember') {
      this.hasDoubleJump = true
      this.toast('DOUBLE JUMP!')
    } else if (lantern.name === 'gale') {
      this.hasDash = true
      this.toast('DASH! (X)')
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

  private respawn() {
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y)
    this.player.setVelocity(0, 0)
    this.glow = 1
    this.toast('THE DARK CLOSES IN...', 1500)
  }

  update(time: number, delta: number) {
    const body = this.player.body

    if (this.won) {
      this.player.setVelocityX(0)
      this.redrawDarkness()
      return
    }

    const dashing = time < this.dashingUntil
    if (!dashing && !body.allowGravity) {
      body.setAllowGravity(true) // dash just ended
    }

    if (!dashing) {
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
    if (body.blocked.down) {
      this.jumpsLeft = maxJumps
      this.lastGroundedAt = time
      this.airDashUsed = false
    } else if (
      this.jumpsLeft === maxJumps &&
      time - this.lastGroundedAt > JUMP_ASSIST.coyoteMs
    ) {
      this.jumpsLeft = maxJumps - 1 // walked off a ledge past coyote time
    }
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.jumpBufferedUntil = time + JUMP_ASSIST.bufferMs
    }
    if (!dashing && time < this.jumpBufferedUntil && this.jumpsLeft > 0) {
      this.player.setVelocityY(JUMP_VELOCITY)
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
    this.brush.setDisplaySize(radius * 2, radius * 2)
    this.darkness.erase(
      this.brush,
      this.player.x - cam.scrollX - radius,
      this.player.y - cam.scrollY - radius,
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
