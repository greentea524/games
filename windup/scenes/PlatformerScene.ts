import Phaser from 'phaser'
import { TILE, WORLD_WIDTH, WORLD_HEIGHT, VIEW_ZOOM, PAL } from '../constants'
import { GameState } from '../state'
import { LEVELS } from '../levels'
import { sfx, music } from '../audio'
import { showRunSummary, formatRunTime } from '../../shared/runSummary'
import { prefersReducedMotion } from '../../shared/motion'
import { POSES, ROBOT_BODY, keyRate, type Pose } from '../sprites'
import { BLEED, MID, LAVA_FRAMES, PALETTES, UP, RIGHT, DOWN, LEFT, stoneFrame } from '../factory'

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
  /** The middle layer, the gears, pipes and banner, between the two (#167). */
  midShiftPx: 5,
  /** The near layer moves further, which is what sells the depth. */
  nearShiftPx: 7,
  /**
   * ms between two frames of the gears. The big one turns `GEAR_STEP`
   * degrees a frame, a full turn in 9 s as before; the small one, with half
   * the teeth, turns twice as far the other way.
   */
  gearFrameMs: 125,
  /** ms between two frames of the lava's surface. */
  lavaFrameMs: 220,
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

// Steam (#53). Ambience only — low rate, slow drift, long fade.
const STEAM = {
  /** ms between puffs from one vent. Deliberately sparse. */
  frequencyMs: 900,
  lifespanMs: 1500,
  riseSpeed: { min: 10, max: 18 },
  drift: { min: -6, max: 6 },
} as const

// Conveyors (#55).
//
// The push is added to the player's own input rather than replacing it, so
// walking against a belt slows you to 40px/s instead of locking you in place.
// That keeps the belt a force in the world rather than a loss of control,
// which is the difference between a movement verb and a trap.
const CONVEYOR = {
  speed: 40,
  /** ms between chevron frames. Fast enough to read direction at a glance. */
  frameMs: 140,
} as const

/** The toy's look (#168). */
const TOY = {
  /** ms a stride lasts: one picture of the run, then the other. */
  strideMs: 130,
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
  /** The key on the toy's back, and how far it has turned, in pictures (#168). */
  private key!: Phaser.GameObjects.Image
  private keyTurn = 0
  private coyoteTimer = 0
  private wallJumpTimer = 0
  private isTransitioning = false
  /** Backdrop layers (#52, #167); the far one slides least, the near one most. */
  private backdropFar!: Phaser.GameObjects.Container
  private backdropMid!: Phaser.GameObjects.Container
  private backdropNear!: Phaser.GameObjects.Container
  /** The two gears, and how many frames each steps per tick. */
  private gears: { sprite: Phaser.GameObjects.Image; step: number }[] = []
  /** Frames the gears have turned through; held still under reduced motion. */
  gearTick = 0
  /** Hazards (#54). */
  private spikes!: Phaser.Physics.Arcade.StaticGroup
  private lava!: Phaser.Physics.Arcade.StaticGroup
  private arcs: { a: { x: number; y: number }; b: { x: number; y: number } }[] = []
  private arcGfx!: Phaser.GameObjects.Graphics
  private vents: Phaser.GameObjects.Particles.ParticleEmitter[] = []
  private conveyors!: Phaser.Physics.Arcade.StaticGroup
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
    this.cameras.main.setBackgroundColor(PALETTES[GameState.paletteMode].void)
    // The world is drawn at `VIEW_ZOOM`, from the top left, and nothing
    // under the camera changes (#166). A level fills the view exactly, so the
    // camera never scrolls: a thing fixed to it, as the backdrop's layers
    // are, lands where it would in the world.
    //
    // No bounds. Phaser clamps a bounded camera's scroll as if its origin
    // were the middle, and with the origin at the top left that clamp moved
    // the whole level a quarter of the screen down and right.
    this.cameras.main.setOrigin(0, 0).setZoom(VIEW_ZOOM).setScroll(0, 0)
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
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
    this.conveyors = this.physics.add.staticGroup()

    const level = LEVELS[GameState.levelIndex] || LEVELS[1]

    if (GameState.energy === GameState.maxEnergy && GameState.checkpointX === 32) {
      GameState.checkpointX = level.spawn.x
      GameState.checkpointY = level.spawn.y
    }
    
    // create() runs on every level restart; speedrunResume() is idempotent,
    // so this starts the clock on the first level and is a no-op after.
    GameState.speedrunResume()
    GameState.saveGame()

    // Every body is made from its old 16-unit frame of `tiles_<mode>`, exactly
    // as before, and then the sprite is given its picture from `factory.ts`,
    // drawn at 24 and shown at two thirds (#167). A static body does not
    // follow its sprite unless asked to, so no hitbox moves.
    const art = (o: Phaser.GameObjects.Sprite, key: string, frame?: number) =>
      o.setTexture(`${key}_${mode}`, frame).setScale(1 / VIEW_ZOOM)

    // A block's picture follows from which of its neighbours are stone.
    const cell = (x: number, y: number) => `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`
    const stone = new Set(level.platforms.map((p) => cell(p.x, p.y)))
    const solid = (cx: number, cy: number) => stone.has(`${cx},${cy}`)
    level.platforms.forEach(p => {
      const cx = Math.floor(p.x / TILE)
      const cy = Math.floor(p.y / TILE)
      const mask = (solid(cx, cy - 1) ? UP : 0) | (solid(cx + 1, cy) ? RIGHT : 0) |
        (solid(cx, cy + 1) ? DOWN : 0) | (solid(cx - 1, cy) ? LEFT : 0)
      art(this.platforms.create(p.x, p.y, `tiles_${mode}`, 1), 'stone', stoneFrame(mask, cx, cy))
    })
    level.springs.forEach(p => art(this.springs.create(p.x, p.y, `tiles_${mode}`, 2), 'spring'))
    // Drawn at 24 and shown at two thirds (#168). Made from the new picture,
    // so the static body is refreshed after the scale: at two thirds it is
    // the 16-unit square every one of these always had.
    const sized = <T extends Phaser.Physics.Arcade.Sprite>(o: T) => {
      o.setScale(1 / VIEW_ZOOM).refreshBody()
      return o
    }
    level.pickups.forEach(p => sized(this.pickups.create(p.x, p.y, `energy_${mode}`)))
    
    level.stations.forEach(p => {
      const s = sized(this.stations.create(p.x, p.y, `station_${mode}`)) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      s.setData('used', false)
    })

    level.movingPlatforms.forEach(p => {
      const mp = this.movingPlatforms.create(p.x, p.y, `tiles_${mode}`, 3) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
      // A moving body does follow its sprite's scale, so it is given the
      // whole new frame, which at two thirds is the old tile again.
      art(mp, 'mover')
      mp.body.setSize(TILE * VIEW_ZOOM, TILE * VIEW_ZOOM)
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

    // Conveyors (#55). Solid like a platform — the belt is something you
    // stand on — with the direction carried on the sprite.
    level.conveyors.forEach(p => {
      // Frames 0-1 of `belt_<mode>` run right and 2-3 run left (#167).
      const frame = p.dir > 0 ? 0 : 2
      const belt = this.conveyors.create(p.x, p.y, `tiles_${mode}`, 6) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      art(belt, 'belt', frame)
      belt.setData('dir', p.dir)
      belt.setData('baseFrame', frame)
    })
    if (level.conveyors.length > 0) {
      // Frame cycling rather than a tween: the chevrons are baked into the
      // tileset, and swapping frames is what makes the belt look like it is
      // running. Not gated on reduced motion — this is how the player reads
      // which way the belt pushes, not decoration.
      this.time.addEvent({
        delay: CONVEYOR.frameMs,
        loop: true,
        callback: () => {
          this.conveyors.getChildren().forEach((c) => {
            const belt = c as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
            const base = belt.getData('baseFrame') as number
            // Number(), not String(): frames added via `tex.add(i, ...)` carry
            // a numeric name, so comparing against a string never matched and
            // the belt sat on one frame forever.
            belt.setFrame(Number(belt.frame.name) === base ? base + 1 : base)
          })
        },
      })
    }

    // Hazards (#54). Spike bodies are shortened to the visible points so the
    // player is not hit by the empty air above them.
    level.spikes.forEach(p => {
      const sp = this.spikes.create(p.x, p.y, `tiles_${mode}`, 4) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      sp.body.setSize(14, 10).setOffset(1, 6)
      sp.body.updateFromGameObject()
      art(sp, 'spike')
    })
    level.lava.forEach(p => {
      const lv = this.lava.create(p.x, p.y, `tiles_${mode}`, 5) as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      lv.body.setSize(16, 12).setOffset(0, 4)
      lv.body.updateFromGameObject()
      art(lv, 'lava', 0)
    })
    // The surface rolls. Decoration: the pool is a hazard whether or not it
    // moves, so it holds still under reduced motion.
    if (level.lava.length > 0 && !prefersReducedMotion()) {
      let f = 0
      this.time.addEvent({
        delay: BACKDROP.lavaFrameMs,
        loop: true,
        callback: () => {
          f = (f + 1) % LAVA_FRAMES
          this.lava.getChildren().forEach((l) => (l as Phaser.GameObjects.Sprite).setFrame(f))
        },
      })
    }
    // Emitters pair off in reading order; the bolt runs between each pair.
    this.arcs = []
    for (let i = 0; i + 1 < level.arcs.length; i += 2) {
      this.arcs.push({ a: level.arcs[i], b: level.arcs[i + 1] })
    }
    this.arcGfx = this.add.graphics().setDepth(5)
    // Each end of a bolt has an emitter to come from (#167).
    level.arcs.forEach((p) => this.add.image(p.x, p.y, `pylon_${mode}`).setScale(1 / VIEW_ZOOM).setDepth(4))
    this.invulnUntil = 0

    sized(this.goals.create(level.goal.x, level.goal.y, `goal_${mode}`))

    // The key on the toy's back, behind it (#168). A sprite of its own: it
    // turns at a rate set by the energy left, whatever the toy is doing.
    this.key = this.add.image(0, 0, `key_${mode}`, 0).setScale(1 / VIEW_ZOOM)
    this.keyTurn = 0

    // Player. Drawn at 24 and shown at two thirds (#168). A moving body
    // follows its sprite's scale, so its size and offset are given in the
    // picture's pixels: `ROBOT_BODY` is the old 10 by 12 at 3, 4, times 1.5,
    // and at two thirds it is that box exactly.
    this.player = this.physics.add.sprite(
      GameState.checkpointX,
      GameState.checkpointY,
      `robot_${mode}`,
      0,
    ) as Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
    this.player.setScale(1 / VIEW_ZOOM)
    this.player.setCollideWorldBounds(true)
    this.player.body.setGravityY(400)
    this.player.body.setSize(ROBOT_BODY.width, ROBOT_BODY.height, false).setOffset(ROBOT_BODY.x, ROBOT_BODY.y)
    this.drawToy(0, 0, true, false, 0)

    this.physics.add.collider(this.player, this.platforms)
    this.physics.add.collider(this.player, this.movingPlatforms)
    this.physics.add.collider(this.player, this.conveyors)
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

  /**
   * Starts level `n` from its spawn. For the QA scripts, which need to stand
   * in a level with spikes, lava or belts without playing up to it (#167).
   */
  goToLevel(n: number) {
    if (!LEVELS[n]) return
    GameState.levelIndex = n
    GameState.checkpointX = LEVELS[n].spawn.x
    GameState.checkpointY = LEVELS[n].spawn.y
    GameState.refillEnergy()
    this.scene.restart()
  }

  reloadPalette() {
    const mode = GameState.paletteMode
    this.cameras.main.setBackgroundColor(PALETTES[mode].void)

    // Everything on the display list, by rewriting the palette in its key and
    // keeping its frame. This was a list of groups until #167, and the list
    // had missed the spikes, the lava and the belts since #54 and #55; the
    // backdrop was missed the same way until #134. A list is what happens
    // when a new kind arrives: every entry is one somebody had to remember.
    const repalette = (o: Phaser.GameObjects.GameObject) => {
      const s = o as Phaser.GameObjects.Sprite
      const key = s.texture?.key
      if (typeof key !== 'string' || typeof s.setTexture !== 'function') return
      const next = key.replace(/_(dmg|gbc)(?=_|$)/, `_${mode}`)
      if (next === key) return
      const frame = s.frame?.name
      s.setTexture(next, frame === undefined || frame === '__BASE' ? undefined : frame)
    }
    const walk = (list: Phaser.GameObjects.GameObject[]) => {
      for (const o of list) {
        repalette(o)
        const inner = (o as Phaser.GameObjects.Container).list
        if (Array.isArray(inner)) walk(inner as Phaser.GameObjects.GameObject[])
      }
    }
    walk(this.children.list)
  }

  update(time: number, delta: number) {
    if (GameState.uiBlocking || this.isTransitioning) {
      this.player.setVelocityX(0)
      return
    }

    this.updateBackdrop()
    this.updateArcs(time)

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
      // Added to the input, not substituted for it (#55).
      this.player.setVelocityX(moveX + this.conveyorPush())
    }
    this.drawToy(time, delta, isGrounded, isWalled && isMovingTowardsWall && this.player.body.velocity.y > 0, moveX)

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
   * Builds the factory behind the platforms (#52, #167).
   *
   * Three layers, each one picture from `factory.ts` the size of the screen
   * and a bleed: the far wall of sheds and chimneys, the middle distance of
   * pipes, the banner, the lamp and the two gears, and the near steelwork
   * with the pipes the steam comes from. They slide against the toy by
   * different amounts, which is the depth on a camera that never scrolls.
   */
  private renderBackdrop() {
    const mode = GameState.paletteMode
    const layer = (key: string, depth: number) => {
      const c = this.add.container(0, 0).setDepth(depth)
      c.add(this.add.image(-BLEED / VIEW_ZOOM, -BLEED / VIEW_ZOOM, `${key}_${mode}`).setOrigin(0).setScale(1 / VIEW_ZOOM))
      return c
    }
    this.backdropFar = layer('bgfar', -30)
    this.backdropMid = layer('bgmid', -20)
    this.backdropNear = layer('bgnear', -10)

    const big = this.add.image(MID.bigGear.x / VIEW_ZOOM, MID.bigGear.y / VIEW_ZOOM, `gearbig_${mode}`, 0).setScale(1 / VIEW_ZOOM)
    const small = this.add.image(MID.smallGear.x / VIEW_ZOOM, MID.smallGear.y / VIEW_ZOOM, `gearsmall_${mode}`, 0).setScale(1 / VIEW_ZOOM)
    this.backdropMid.add([big, small])
    // The small gear has half the teeth, so it turns twice as far a tick.
    this.gears = [{ sprite: big, step: 1 }, { sprite: small, step: 2 }]
    this.gearTick = 0
    // Decoration, so it stops under reduced motion (#167; the gears turned
    // regardless before, and only the steam was measured).
    if (!prefersReducedMotion()) {
      this.time.addEvent({
        delay: BACKDROP.gearFrameMs,
        loop: true,
        callback: () => {
          this.gearTick++
          for (const g of this.gears) {
            const frames = g.sprite.texture.frameTotal - 1
            g.sprite.setFrame((this.gearTick * g.step) % frames)
          }
        },
      })
    }

    this.renderVents(mode)
  }

  /**
   * Steam from the pipework (#53).
   *
   * Vents come from the level definition, with a default pair off the pipe
   * runs when a level declares none — every room gets steam without
   * hand-authoring 32 levels for something that is pure ambience.
   *
   * The emitters are added to the near backdrop container, so they inherit
   * its player-relative slide (#52) and stay attached to the pipes they are
   * meant to be venting from.
   */
  private renderVents(mode: 'dmg' | 'gbc') {
    this.vents = []
    // Decoration, so it is the kind of motion reduced-motion should remove.
    // Nothing the player reads to make a decision is gated on this.
    if (prefersReducedMotion()) return

    const level = LEVELS[GameState.levelIndex] || LEVELS[1]
    const points = level.vents.length > 0 ? level.vents : [
      { x: 9, y: WORLD_HEIGHT - 34 },
      { x: WORLD_WIDTH - 9, y: WORLD_HEIGHT - 58 },
    ]

    for (const p of points) {
      const emitter = this.add.particles(p.x, p.y, `puff_${mode}`, {
        frequency: STEAM.frequencyMs,
        quantity: 1,
        lifespan: STEAM.lifespanMs,
        speedY: { min: -STEAM.riseSpeed.max, max: -STEAM.riseSpeed.min },
        speedX: STEAM.drift,
        // Fades rather than pops: the texture has no soft edge of its own.
        alpha: { start: 0.55, end: 0 },
        scale: { start: 0.8, end: 1.6 },
      })
      emitter.setDepth(-10)
      this.backdropNear.add(emitter)
      this.vents.push(emitter)
    }
  }

  /** Slides the backdrop against the player. */
  private updateBackdrop() {
    if (!this.player) return
    // -0.5 at the left wall, +0.5 at the right.
    const across = this.player.x / WORLD_WIDTH - 0.5
    const rise = this.player.y / WORLD_HEIGHT - 0.5
    this.backdropFar.setPosition(-across * BACKDROP.farShiftPx, -rise * BACKDROP.farShiftPx)
    this.backdropMid.setPosition(-across * BACKDROP.midShiftPx, -rise * BACKDROP.midShiftPx)
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
    // A jagged bolt in a glow (#167), so it reads as electricity and not a
    // rod. The kinks move with the clock; the telegraph is faint and still.
    const kinks = 6
    const jitter = live ? 3 : 1
    for (const arc of this.arcs) {
      const dx = arc.b.x - arc.a.x
      const dy = arc.b.y - arc.a.y
      const len = Math.hypot(dx, dy) || 1
      // Across the bolt, at right angles to it.
      const nx = -dy / len
      const ny = dx / len
      const points = Array.from({ length: kinks + 1 }, (_, i) => {
        const t = i / kinks
        const off = i === 0 || i === kinks ? 0 : Math.sin(time / 40 + i * 2.3) * jitter * (i % 2 ? 1 : -1)
        return { x: arc.a.x + dx * t + nx * off, y: arc.a.y + dy * t + ny * off }
      })
      const stroke = (width: number, c: number, alpha: number) => {
        this.arcGfx.lineStyle(width, c, alpha)
        this.arcGfx.beginPath()
        this.arcGfx.moveTo(points[0].x, points[0].y)
        for (const p of points.slice(1)) this.arcGfx.lineTo(p.x, p.y)
        this.arcGfx.strokePath()
      }
      if (live && mode === 'gbc') stroke(4, 0x3a78d8, 0.45)
      stroke(live ? 2 : 1, colour, live ? 1 : 0.4)
      if (live && mode === 'gbc') stroke(1, 0xffffff, 1)
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

  /**
   * Sideways push from a belt the toy is standing on, or 0 (#55).
   *
   * Grounded only, as the issue asks: a belt should carry what rests on it,
   * not steer anything that happens to brush past in mid-air.
   */
  private conveyorPush(): number {
    const body = this.player.body
    if (!body.blocked.down) return 0
    for (const child of this.conveyors.getChildren()) {
      const belt = child as Phaser.Types.Physics.Arcade.SpriteWithStaticBody
      const bb = belt.body
      // Standing *on* it: feet within a couple of px of the belt's top.
      if (Math.abs(body.bottom - bb.top) > 2) continue
      if (body.right <= bb.left || body.left >= bb.right) continue
      return (belt.getData('dir') as number) * CONVEYOR.speed
    }
    return 0
  }

  /**
   * Picks the toy's pose, faces it, and turns its key (#168).
   *
   * The key turns at `keyRate` of the charge: brisk when wound, slowing as
   * it runs down, still at empty. It is how much is left, so it turns under
   * reduced motion too; the run cycle is how the toy moves, and does as well.
   */
  private drawToy(time: number, delta: number, grounded: boolean, sliding: boolean, moveX: number) {
    const vy = this.player.body.velocity.y
    let pose: Pose = 'idle'
    if (sliding) pose = 'slide'
    else if (!grounded) pose = vy < 0 ? 'jump' : 'fall'
    else if (moveX !== 0) pose = Math.floor(time / TOY.strideMs) % 2 ? 'runB' : 'runA'
    this.player.setFrame(POSES.indexOf(pose))
    const left = this.facing === 'left'
    this.player.setFlipX(left)

    this.keyTurn += (delta / 1000) * keyRate(this.chargeRatio())
    this.key.setFrame(Math.floor(this.keyTurn) % 4)
    this.key.setFlipX(left)
    // The shaft meets the toy's back: nine drawn pixels behind its middle,
    // three below, which is where the torso's back edge is.
    const behind = (9 / VIEW_ZOOM) * (left ? 1 : -1)
    this.key.setPosition(this.player.x + behind, this.player.y + 3 / VIEW_ZOOM)
    this.key.setAlpha(this.player.alpha)
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
