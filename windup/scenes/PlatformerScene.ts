import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, PAL, FONT, CSS_MID } from '../constants'
import { GameState } from '../state'
import { LEVELS } from '../levels'
import { sfx, music } from '../audio'
import { showRunSummary, formatRunTime } from '../../shared/runSummary'

type Facing = 'left' | 'right'

// Backdrop (#52).
//
// The issue asks for two parallax layers on `scrollFactor`. That cannot work
// here: every Windup level is exactly one screen (10x9 tiles at 16px = 160x144),
// the camera is bounded to those same dimensions and never follows the player,
// so nothing ever scrolls and `scrollFactor` is a no-op. Two layers set to
// 0.25 and 0.5 would sit perfectly still, relative to each other and to the
// foreground.
//
// What is used instead is the player's own position: each layer slides a few
// pixels against the toy as it crosses the room. That is the depth cue the
// issue was actually after, and on a fixed camera it is the only one
// available short of making the levels bigger than the screen.
const BACKDROP = {
  /** How far the far layer slides across the full width of the room. */
  farShiftPx: 3,
  /** The near layer moves further, which is what sells the depth. */
  nearShiftPx: 7,
  /** Seconds for a full turn of the large gear. The small one runs faster. */
  gearPeriodMs: 9000,
} as const

// Hazards (#54).
//
// Nothing here kills. Windup's whole loop is a draining energy budget, and
// the zero-energy respawn in update() is already the fail state — a hazard
// that killed outright would bypass the resource the game is about and add a
// second death path beside the one that exists.
//
// Since #68 the budget is continuous, so spending it has a graduated cost:
// a spike hit now visibly slows the toy and shortens its next jump, where
// before it would have changed nothing at all until the bar hit zero.
const HAZARD = {
  /** Energy taken by a spike or an arc, out of 100. */
  spikeCost: 22,
  arcCost: 26,
  /** Lava drains per second of contact rather than in one bite. */
  lavaCostPerSec: 45,
  knockbackX: 110,
  knockbackY: -150,
  /**
   * Invulnerability after a hit. This is what stops the acceptance
   * criterion's failure case: knocked into a second hazard, chain-drained to
   * zero with no chance to react.
   */
  invulnMs: 900,
  /** Arc cycle: telegraph, then live, then idle for the remainder. */
  arcPeriodMs: 2400,
  arcTelegraphMs: 400,
  arcLiveMs: 500,
} as const

/** Ground speed, px/s, at a full spring. */
const MOVE_SPEED = 80
/** Jump impulse, px/s, at a full spring. */
const JUMP_VELOCITY = 170

// The spring winds down (#68).
//
// Energy used to affect movement only as a cliff: `energy > 0 ? 1 : 0.2`, so
// the toy ran at identical speed at 100 power and at 1, then fell off. That
// made the HUD bar a countdown timer wearing a resource's clothes, and it is
// the wrong fantasy for a game whose whole premise is a windup toy.
//
// Both curves are deliberately 1.0 at full charge, which is the property that
// makes this safe to land against 32 levels tuned for constant speed: a fresh
// or freshly-refilled run plays exactly as it always did, and no level becomes
// unwinnable for a player who is not already drained. Levels only get harder
// as the spring runs down, which is the point.
//
// A drained player is never stuck, either. If a required jump is out of reach
// at low charge, moving drains to zero, and stopping on the ground respawns at
// the last checkpoint with a full spring (see `respawnAtCheckpoint`).
const SPEED_AT_EMPTY = 0.55
const JUMP_AT_EMPTY = 0.75

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
  /** Backdrop layers (#52); the far one slides less than the near one. */
  private backdropFar!: Phaser.GameObjects.Container
  private backdropNear!: Phaser.GameObjects.Container
  private gears: { sprite: Phaser.GameObjects.Image; periodMs: number; dir: number }[] = []
  /** Hazards (#54). */
  private spikes!: Phaser.Physics.Arcade.StaticGroup
  private lava!: Phaser.Physics.Arcade.StaticGroup
  private arcs: { a: { x: number; y: number }; b: { x: number; y: number } }[] = []
  private arcGfx!: Phaser.GameObjects.Graphics
  private invulnUntil = 0
  /**
   * Frame stamp of the last lava tick. Arcade fires the overlap callback once
   * per overlapping *tile*, so standing across a two-tile pool drained at
   * double the configured rate — 100 energy in a second instead of 45.
   */
  private lavaDrainedAt = -1

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

    this.renderBackdrop()
    this.renderLevel()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('A,D') as Record<string, Phaser.Input.Keyboard.Key>
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }

    const pauseHandler = () => {
      // sfx has named methods, not a play(name) dispatcher. This threw on the
      // first line of the handler, so scene.pause() below never ran and pause
      // did not work at all.
      sfx.menuSelect()
      // Stop the run clock while the menu is up. Pausing the 'ui' scene would
      // only freeze the display: the elapsed value is recomputed from the
      // wall clock, so it would jump forward the moment play resumed.
      GameState.speedrunBank()
      GameState.saveGame()
      this.scene.pause('platformer')
      this.scene.launch('pause')
    }
    
    this.input.keyboard!.on('keydown-ENTER', pauseHandler)
    this.input.keyboard!.on('keydown-ESC', pauseHandler)
  }

  renderLevel() {
    const mode = GameState.paletteMode

    music.play('game')
    this.platforms = this.physics.add.staticGroup()
    this.springs = this.physics.add.staticGroup()
    this.movingPlatforms = this.physics.add.group({ allowGravity: false, immovable: true })
    this.pickups = this.physics.add.staticGroup()
    this.stations = this.physics.add.staticGroup()
    this.goals = this.physics.add.staticGroup()
    this.spikes = this.physics.add.staticGroup()
    this.lava = this.physics.add.staticGroup()

    const level = LEVELS[GameState.levelIndex] || LEVELS[1]

    if (GameState.energy === GameState.maxEnergy && GameState.checkpointX === 32) {
      GameState.checkpointX = level.spawn.x
      GameState.checkpointY = level.spawn.y
    }
    
    // create() runs on every level restart; speedrunResume() is idempotent,
    // so this starts the clock on the first level and is a no-op after.
    GameState.speedrunResume()
    GameState.saveGame()

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

    // Hazards (#54). Spike bodies are shortened to the visible points so the
    // player is not hit by the empty air above them.
    level.spikes.forEach(p => {
      const sp = this.spikes.create(p.x, p.y, `tiles_${mode}`, 4) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      sp.body.setSize(14, 10).setOffset(1, 6)
      sp.body.updateFromGameObject()
    })
    level.lava.forEach(p => {
      const lv = this.lava.create(p.x, p.y, `tiles_${mode}`, 5) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      lv.body.setSize(16, 12).setOffset(0, 4)
      lv.body.updateFromGameObject()
    })
    // Emitters pair off in reading order; the bolt runs between each pair.
    this.arcs = []
    for (let i = 0; i + 1 < level.arcs.length; i += 2) {
      this.arcs.push({ a: level.arcs[i], b: level.arcs[i + 1] })
    }
    this.arcGfx = this.add.graphics().setDepth(5)
    this.invulnUntil = 0

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
    this.physics.add.overlap(this.player, this.stations, (_p, s) => this.reachStation(s as Phaser.Types.Physics.Arcade.SpriteWithStaticBody))

    this.physics.add.overlap(this.player, this.spikes, () => this.hitHazard(HAZARD.spikeCost))
    this.physics.add.overlap(this.player, this.lava, (_p, _l) => {
      // Continuous rather than a single bite, and it still respects the
      // i-frames from a spike so the two cannot stack into an instant drain.
      if (this.time.now < this.invulnUntil) return
      if (this.lavaDrainedAt === this.time.now) return // once per frame, not per tile
      this.lavaDrainedAt = this.time.now
      GameState.drainEnergy((this.game.loop.delta / 1000) * HAZARD.lavaCostPerSec)
      this.player.setTint(0xff8888)
      this.time.delayedCall(80, () => this.player.clearTint())
    })

    this.physics.add.overlap(this.player, this.springs, () => {
      this.player.setVelocityY(-350)
      this.coyoteTimer = 0
    })

    this.physics.add.overlap(this.player, this.pickups, (_p, pickup) => {
      pickup.destroy()
      GameState.addEnergy(20)
      GameState.energyPickups++
    })

    this.physics.add.overlap(this.player, this.goals, () => this.reachGoal())
  }

  private reachGoal() {
    if (this.isTransitioning) return
    this.isTransitioning = true
    if (GameState.levelIndex === 32) {
      // Run over: bank the last segment so the HUD freezes on the final time.
      GameState.speedrunBank()
      GameState.completed = true

      const runMs = GameState.speedrunElapsedMs
      const isBest = GameState.bestRunMs === null || runMs < GameState.bestRunMs
      const previousBest = GameState.bestRunMs
      if (isBest) GameState.bestRunMs = runMs
      GameState.saveGame()

      sfx.win()
      // The HUD is its own scene, so it renders above anything this one adds,
      // depth or not — the running timer would sit across the panel's top edge
      // showing the same number the panel does.
      this.scene.setVisible(false, 'ui')
      // The run summary replaces a bare VICTORY! and a three-second timer
      // (#66). The time has been tracked since #79 and was thrown away here.
      showRunSummary(this, {
        title: 'RUN COMPLETE',
        palette: PAL,
        stats: [
          { label: 'TIME', value: formatRunTime(runMs), highlight: isBest },
          { label: 'ENERGY', value: `${GameState.energyPickups}` },
          { label: 'DEATHS', value: `${GameState.deaths}` },
          {
            label: 'BEST',
            value: formatRunTime(isBest ? runMs : (previousBest ?? runMs)),
          },
        ],
        subtitle: isBest && previousBest !== null ? 'New best!' : undefined,
        onDismiss: () => {
          this.cameras.main.fadeOut(600)
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.setVisible(true, 'ui')
            GameState.reset()
            this.scene.restart()
          })
        },
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
      sfx.win()
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

    this.updateBackdrop(time)
    this.updateArcs(time)

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

    // Wind down continuously rather than falling off a cliff at zero (#68).
    const charge = this.chargeRatio()
    const moveSpeed = MOVE_SPEED * (SPEED_AT_EMPTY + (1 - SPEED_AT_EMPTY) * charge)

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
    const jumpVelocity =
      -JUMP_VELOCITY * (JUMP_AT_EMPTY + (1 - JUMP_AT_EMPTY) * charge)
    if (Phaser.Input.Keyboard.JustDown(this.jumpKey) && GameState.energy > 0) {
      if (canJump) {
        this.player.setVelocityY(jumpVelocity)
        this.coyoteTimer = 0
        GameState.drainEnergy(5) // Extra jump cost
        sfx.jump()
      } else if (isWalled) {
        // Wall Jump. The vertical impulse winds down with the spring like any
        // other jump, but the horizontal kick does not: it is what gets the
        // player off the wall, and input is locked out for 250ms after it, so
        // a weakened kick risks dropping them straight back against the same
        // wall with no way to steer out.
        this.player.setVelocityY(jumpVelocity)
        this.player.setVelocityX(isWalledLeft ? 150 : -150)
        this.facing = isWalledLeft ? 'right' : 'left'
        this.wallJumpTimer = time + 250 // Lock out D-pad for 250ms
        GameState.drainEnergy(5)
        sfx.jump()
      }
    }

    // Respawn if energy empty and player stops
    if (GameState.energy <= 0 && isGrounded && moveX === 0) {
      this.respawnAtCheckpoint()
    }
  }

  /**
   * Builds the factory behind the platforms (#52).
   *
   * Laid out by hand rather than scattered randomly: at 160x144 there is only
   * room for a handful of pieces, and where they sit decides whether the room
   * reads as a place or as noise. Everything is deliberately kept away from
   * the lower middle, which is where the levels put their platforms.
   */
  private renderBackdrop() {
    const mode = GameState.paletteMode
    this.gears = []

    this.backdropFar = this.add.container(0, 0).setDepth(-20)
    this.backdropNear = this.add.container(0, 0).setDepth(-10)

    // Far: the big machinery and the painted wall sign.
    const bigGear = this.add.image(30, 34, `bg_gear_lg_${mode}`)
    const smallGear = this.add.image(56, 22, `bg_gear_sm_${mode}`)
    this.gears.push({ sprite: bigGear, periodMs: BACKDROP.gearPeriodMs, dir: 1 })
    // Counter-rotating, because two gears turning the same way reads as two
    // wheels rather than as a mechanism.
    this.gears.push({ sprite: smallGear, periodMs: BACKDROP.gearPeriodMs * 0.62, dir: -1 })

    const sign = this.add
      .text(110, 46, 'WINDUP', {
        fontFamily: FONT,
        fontSize: '8px',
        color: mode === 'dmg' ? CSS_MID : '#2e3a52',
        resolution: 1,
      })
      .setOrigin(0.5)
    // Faded and slightly askew, like paint on brick rather than a UI label.
    sign.setAlpha(0.75).setRotation(-0.04)

    this.backdropFar.add([bigGear, smallGear, sign])

    // Near: pipework and structure, at the edges so the middle stays clear.
    const near: Phaser.GameObjects.GameObject[] = []
    for (let y = 0; y < GBC_HEIGHT; y += 16) {
      near.push(this.add.image(9, y + 8, `bg_pipe_${mode}`))
      near.push(this.add.image(GBC_WIDTH - 9, y + 8, `bg_pipe_${mode}`))
    }
    // y is kept below the HUD: the PWR bar and the run clock own the top ~24px,
    // and the first layout put the girders and the lamp straight behind them.
    near.push(this.add.image(26, 40, `bg_girder_${mode}`))
    near.push(this.add.image(GBC_WIDTH - 26, 64, `bg_girder_${mode}`))
    near.push(this.add.image(80, 30, `bg_lamp_${mode}`))
    this.backdropNear.add(near)
  }

  /** Slides the backdrop against the player, and turns the gears. */
  private updateBackdrop(time: number) {
    for (const gear of this.gears) {
      gear.sprite.setRotation(((time % gear.periodMs) / gear.periodMs) * Math.PI * 2 * gear.dir)
    }
    if (!this.player) return
    // -0.5 at the left wall, +0.5 at the right.
    const across = this.player.x / GBC_WIDTH - 0.5
    const rise = this.player.y / GBC_HEIGHT - 0.5
    this.backdropFar.setPosition(-across * BACKDROP.farShiftPx, -rise * BACKDROP.farShiftPx)
    this.backdropNear.setPosition(-across * BACKDROP.nearShiftPx, -rise * BACKDROP.nearShiftPx)
  }

  /**
   * Spends energy for touching a hazard, knocks the toy clear, and grants
   * invulnerability.
   *
   * No death here on purpose. Draining is the cost; if that empties the
   * spring, the existing zero-energy respawn in `update()` handles it, so
   * there is exactly one failure path in the game rather than two.
   */
  private hitHazard(cost: number) {
    if (this.time.now < this.invulnUntil) return
    this.invulnUntil = this.time.now + HAZARD.invulnMs
    GameState.drainEnergy(cost)
    // Away from the hazard, which is behind whichever way the toy was facing.
    this.player.setVelocity(
      this.facing === 'right' ? -HAZARD.knockbackX : HAZARD.knockbackX,
      HAZARD.knockbackY,
    )
    // The knockback would otherwise be overridden by a held arrow on the very
    // next frame; this reuses the wall-jump lockout for the same reason.
    this.wallJumpTimer = this.time.now + 200
    sfx.hit()
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 90,
      yoyo: true,
      repeat: 4,
      onComplete: () => this.player.setAlpha(1),
    })
  }

  /**
   * Runs the electric arcs.
   *
   * Telegraphed before it becomes dangerous, so it reads as a rhythm to time
   * rather than as a gotcha: the bolt is drawn faint for `arcTelegraphMs`
   * first, and only then does it start taking energy.
   */
  private updateArcs(time: number) {
    if (this.arcs.length === 0) return
    const phase = time % HAZARD.arcPeriodMs
    const telegraphing = phase < HAZARD.arcTelegraphMs
    const live = phase >= HAZARD.arcTelegraphMs && phase < HAZARD.arcTelegraphMs + HAZARD.arcLiveMs

    this.arcGfx.clear()
    if (!telegraphing && !live) return

    const mode = GameState.paletteMode
    const colour = mode === 'dmg' ? PAL.lightest : 0x8fd8ff
    this.arcGfx.lineStyle(live ? 2 : 1, colour, live ? 1 : 0.4)
    for (const arc of this.arcs) {
      this.arcGfx.beginPath()
      this.arcGfx.moveTo(arc.a.x, arc.a.y)
      // A couple of kinks, so it reads as electricity rather than a rod.
      const midX = (arc.a.x + arc.b.x) / 2
      const midY = (arc.a.y + arc.b.y) / 2
      const jitter = live ? 3 : 1
      this.arcGfx.lineTo(midX - 4, midY + Math.sin(time / 40) * jitter)
      this.arcGfx.lineTo(midX + 4, midY - Math.sin(time / 40) * jitter)
      this.arcGfx.lineTo(arc.b.x, arc.b.y)
      this.arcGfx.strokePath()
    }

    if (!live) return
    // Segment test against the player, so a bolt between two emitters hurts
    // anywhere along its length rather than only at the ends.
    for (const arc of this.arcs) {
      const line = new Phaser.Geom.Line(arc.a.x, arc.a.y, arc.b.x, arc.b.y)
      const body = this.player.body
      const rect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
      if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) {
        this.hitHazard(HAZARD.arcCost)
        return
      }
    }
  }

  /** Spring charge, 1 at full and 0 at empty. */
  private chargeRatio(): number {
    if (GameState.maxEnergy <= 0) return 0
    return Phaser.Math.Clamp(GameState.energy / GameState.maxEnergy, 0, 1)
  }

  private reachStation(station: Phaser.Types.Physics.Arcade.SpriteWithStaticBody) {
    if (station.getData('used')) return

    const mode = GameState.paletteMode
    station.setData('used', true)
    station.setTexture(`station_empty_${mode}`)

    if (GameState.energy < GameState.maxEnergy) {
      sfx.wind()
      GameState.refillEnergy()
      GameState.checkpointX = station.x
      GameState.checkpointY = station.y - 12
    }
  }

  private respawnAtCheckpoint() {
    sfx.hit()
    GameState.deaths++
    GameState.refillEnergy()
    this.player.setPosition(GameState.checkpointX, GameState.checkpointY)
    this.player.setVelocity(0, 0)
  }
}
