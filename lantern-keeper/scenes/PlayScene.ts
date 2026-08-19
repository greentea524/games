import Phaser from 'phaser'
import { sfx, music, isMuted, setMuted } from '../audio'
import {
  GBC_WIDTH,
  GBC_HEIGHT,
  GLOW,
  FUEL,
  DASH,
  JUMP_ASSIST,
  WALL,
  DARKNESS_ALPHA,
  DECO,
  FIREFLY,
  SIGNPOST,
  PAL,
} from '../constants'
import { Darkness, type Light } from '../../shared/lighting'
import { STAGE_KEYS, stageFor } from '../stages'
import { prefersReducedMotion } from '../../shared/motion'
import { loadProgress, saveProgress } from '../progress'
import { showRunSummary, formatRunTime } from '../../shared/runSummary'

// Tuned to the KAN-110 movement budget: single jump ~2.8 tiles,
// double jump ~5.6 tiles, so the 5-tile cliff gate needs the Ember lantern.
const RUN_SPEED = 60
const JUMP_VELOCITY = -150
const LIGHT_TOUCH_DISTANCE = 10
const SPAWN_POINT = { x: 16, y: 120 }
// Was the size of the 'brushBig' texture, which lanterns stamped unscaled.
const LANTERN_GLOW_RADIUS = 28

interface Lantern {
  name: string
  sprite: Phaser.GameObjects.Image
  lit: boolean
}

export class PlayScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private darkness!: Darkness
  private lanterns: Lantern[] = []
  /** Ambient fireflies (#65); rebuilt with each level. */
  private fireflies: {
    sprite: Phaser.GameObjects.Image
    homeX: number
    homeY: number
    phase: number
    lantern: Lantern
  }[] = []
  private dashKey!: Phaser.Input.Keyboard.Key
  private jumpKey!: Phaser.Input.Keyboard.Key
  private enterKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key
  private shiftKey!: Phaser.Input.Keyboard.Key
  private hasDoubleJump = false
  private hasDash = false
  private hasWallCling = false
  private totalLanternsLit = 0
  private jumpsLeft = 0
  private facing = 1
  private won = false
  private justResumed = false
  
  private levelKey = 'level1'
  
  init(data: any) {
    this.levelKey = data?.levelKey || 'level1'
    this.hasDoubleJump = data?.hasDoubleJump || false
    this.hasDash = data?.hasDash || false
    this.hasWallCling = data?.hasWallCling || false
    this.totalLanternsLit = data?.totalLanternsLit || 0
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
  private respawnPoint = { ...SPAWN_POINT }
  /**
   * Lantern fuel remaining, in ms (#70). Drains on a timer rather than on
   * movement, so standing still is not a way to conserve it.
   */
  // Annotated: `FUEL.maxMs` is a literal type through `as const`, so an
  // inferred field would be typed `30000` and reject every later assignment.
  private fuelMs: number = FUEL.maxMs
  /** So the low-fuel cue sounds once per tank, not once per frame. */
  private lowFuelCued = false
  private fuelGfx!: Phaser.GameObjects.Graphics
  private flasks: { sprite: Phaser.GameObjects.Image; taken: boolean }[] = []
  /** Wall-clock start of this level's play segment, banked by persist() (#66). */
  private segmentStartedAt = 0
  private runElapsedMs = 0
  private deaths = 0
  
  private dashParticles!: Phaser.GameObjects.Particles.ParticleEmitter
  private sparkParticles!: Phaser.GameObjects.Particles.ParticleEmitter
  private groundLayer!: Phaser.Tilemaps.TilemapLayer
  private crumbleGroup!: Phaser.Physics.Arcade.StaticGroup
  private hudText!: Phaser.GameObjects.Text
  private guidanceArrow!: Phaser.GameObjects.Image

  constructor() {
    super('play')
  }

  create() {
    const saved = loadProgress()
    this.runElapsedMs = saved.elapsedMs
    this.deaths = saved.deaths
    this.segmentStartedAt = Date.now()
    this.persist()
    music.play('adventure')
    this.cameras.main.fadeIn(500, 0, 0, 0)
    
    this.won = false
    this.jumpsLeft = 0
    this.dashingUntil = 0
    this.dashCooldownUntil = 0
    this.airDashUsed = false

    const map = this.make.tilemap({ key: this.levelKey })
    const tileset = map.addTilesetImage('tiles', 'tiles')!
    const ground = map.createLayer('ground', tileset)!
    ground.setCollisionBetween(1, 8)
    this.groundLayer = ground

    // Title and spawn come from the shared stage list (#88); they used to be
    // an if-chain here, which is one of the five places a new stage had to be
    // registered.
    const stage = stageFor(this.levelKey)
    const spawnX = stage.spawnX
    const spawnY = stage.spawnY
    const title = stage.title

    const initialDarkness = DARKNESS_ALPHA[this.levelKey] ?? 0.85

    this.createBackground(map)
    this.decorate(map, ground)
    this.placeSignposts(map, ground)

    this.player = this.physics.add.sprite(spawnX, spawnY, 'player_idle')
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
    const cameraOffsetY = this.levelKey === 'level3' ? -30 : 0
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1, 0, cameraOffsetY)

    this.crumbleGroup = this.physics.add.staticGroup()
    this.lanterns = []
    const mapObjects = map.getObjectLayer('lanterns')?.objects ?? []
    
    for (const obj of mapObjects) {
      if (obj.name === 'mushroom') {
        const m = this.add.image(obj.x! + 6, obj.y! - 4, 'bouncy_shroom')
        m.setDepth(-0.1) // drawn as decoration behind player but in front of background
      } else if (obj.name === 'crumble') {
        const c = this.add.rectangle(obj.x!, obj.y!, obj.width!, obj.height!, 0x553311).setOrigin(0, 1)
        this.crumbleGroup.add(c)
      } else {
        const isHeartTree = obj.name === 'heart_tree'
        const texture = isHeartTree ? 'heart_tree_graphic' : 'lanternUnlit'
        const sprite = this.add.image(obj.x!, obj.y!, texture)
        if (isHeartTree) {
          sprite.setOrigin(0.5, 1)
          sprite.setDepth(-0.5)
        }
        this.lanterns.push({
          name: obj.name,
          sprite: sprite,
          lit: false,
        })
        
        if (!isHeartTree) {
          this.tweens.add({
            targets: sprite,
            y: sprite.y - 3,
            yoyo: true,
            repeat: -1,
            duration: Phaser.Math.Between(1200, 1600),
            ease: 'Sine.easeInOut'
          })
        }
      }
    }

    // Oil flasks (#70) live in their own object layer rather than in
    this.spawnFireflies()

    // `lanterns`. Membership of that layer is decided by exclusion — anything
    // not a mushroom, a crumble or the heart tree is a lantern — so a flask
    // dropped in there would silently count toward the stage's lantern total
    // and the "all lanterns lit" gate.
    this.flasks = []
    for (const obj of map.getObjectLayer('flasks')?.objects ?? []) {
      const sprite = this.add.image(obj.x!, obj.y!, 'oil_flask')
      this.tweens.add({
        targets: sprite,
        y: sprite.y - 2,
        yoyo: true,
        repeat: -1,
        duration: Phaser.Math.Between(1100, 1500),
        ease: 'Sine.easeInOut',
      })
      this.flasks.push({ sprite, taken: false })
    }

    this.physics.add.collider(this.player, this.crumbleGroup, this.onCrumbleTouch, undefined, this)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.dashKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)

    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)

    // The same Enter/Esc/Shift press that resumes from the pause overlay
    // is still queued in Phaser and flushes as a JustDown on the first
    // update after resume — which would instantly re-open the overlay.
    // Swallow it (see the guard at the top of update()).
    this.events.on('resume', () => {
      this.justResumed = true
    })

    this.hudText = this.add.text(4, 8, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
      shadow: {
        offsetX: 1,
        offsetY: 1,
        color: '#0f1a12',
        fill: true
      }
    })
    this.hudText.setScrollFactor(0).setDepth(30)

    // Fuel gauge (#70). A gauge rather than the carried-lantern-dimming the
    // issue preferred: the player sprite is drawn procedurally with no lantern
    // in hand to dim, and inventing one would change the character silhouette
    // in every frame of the walk cycle to serve a HUD readout.
    //
    // The shrinking light radius is the real feedback; this only answers "how
    // much is left", which the radius alone cannot at a glance.
    this.fuelGfx = this.add.graphics().setScrollFactor(0).setDepth(30)
    
    this.guidanceArrow = this.add.image(0, 0, 'guidance_arrow')
    this.guidanceArrow.setOrigin(0.5, 0.5).setDepth(15).setVisible(false)

    this.updateHud()

    this.darkness = new Darkness(this, {
      width: GBC_WIDTH,
      height: GBC_HEIGHT,
      depth: 10,
      alpha: initialDarkness,
    })

    this.respawnPoint = { x: spawnX, y: spawnY }
    // Every level starts on a full tank. `create()` runs on level advance and
    // on restart alike, so this is the one place that needs to say so.
    this.refillFuel()
    this.lastGroundedAt = 0
    this.jumpBufferedUntil = 0
    this.dashingUntil = 0
    this.dashCooldownUntil = 0
    this.dashBufferedUntil = 0

    this.toast(title, 3000)
  }

  private createBackground(map: Phaser.Tilemaps.Tilemap) {
    const levelWidth = map.widthInPixels
    const levelHeight = map.heightInPixels
    const rng = new Phaser.Math.RandomDataGenerator([this.levelKey + '_bg'])

    if (this.levelKey === 'level1') {
      const treeCount = 18
      for (let i = 0; i < treeCount; i++) {
        const x = rng.between(20, levelWidth - 40)
        const canopyY = rng.between(20, 60)
        const canopy = this.add.image(x, canopyY, 'bg_tree_canopy')
        canopy.setDepth(-2)
        canopy.setScrollFactor(0.7, 1)
        
        let trunkY = canopyY + 12
        while (trunkY < levelHeight) {
          const trunk = this.add.image(x, trunkY + 12, 'bg_tree_trunk')
          trunk.setDepth(-1)
          trunk.setScrollFactor(0.7, 1)
          trunkY += 24
        }
      }
    } else if (this.levelKey === 'level2') {
      const treeCount = 15
      for (let i = 0; i < treeCount; i++) {
        const x = rng.between(20, levelWidth - 40)
        const treeY = levelHeight - 16
        let trunkY = treeY - 12
        while (trunkY > 40) {
          const trunk = this.add.image(x, trunkY, 'bg_swamp_trunk')
          trunk.setDepth(-1)
          trunk.setScrollFactor(0.6, 1)
          trunkY -= 24
        }
        
        if (rng.frac() < 0.5) {
          const mossX = x + rng.between(-10, 10)
          const mossY = rng.between(10, 30)
          const moss = this.add.image(mossX, mossY, 'bg_moss')
          moss.setDepth(-1.5)
          moss.setScrollFactor(0.6, 1)
          if (rng.frac() < 0.3) {
            const moss2 = this.add.image(mossX, mossY + 16, 'bg_moss')
            moss2.setDepth(-1.5)
            moss2.setScrollFactor(0.6, 1)
          }
        }
      }
    } else if (this.levelKey === 'level3') {
      const cloudCount = 20
      for (let i = 0; i < cloudCount; i++) {
        const x = rng.between(20, levelWidth - 40)
        const y = rng.between(40, levelHeight - 40)
        const scale = rng.between(7, 13) / 10
        
        const cloud = this.add.image(x, y, 'bg_leaf_cloud')
        cloud.setDepth(-1)
        cloud.setScale(scale)
        cloud.setScrollFactor(0.5, 0.7)
      }
    } else if (this.levelKey === 'level4') {
      const rootCount = 12
      for (let i = 0; i < rootCount; i++) {
        const x = rng.between(20, levelWidth - 40)
        let rootY = rng.between(10, 50)
        while (rootY < levelHeight) {
          const root = this.add.image(x, rootY, 'bg_hollow_root')
          root.setDepth(-1)
          root.setScrollFactor(0.4, 0.4)
          rootY += 24
        }
      }
      
      const stalactiteCount = 20
      for (let i = 0; i < stalactiteCount; i++) {
        const x = rng.between(10, levelWidth - 10)
        const y = rng.between(10, 40)
        
        const stalactite = this.add.image(x, y, 'bg_stalactite')
        stalactite.setDepth(-1.5)
        stalactite.setScrollFactor(0.4, 0.4)
      }
    }
  }

  // Stage decorations (issue #7): derived from the tilemap itself, so
  // every level gets dressed without touching the level JSONs. Seeded by
  // levelKey so the layout is stable between plays.
  private decorate(
    map: Phaser.Tilemaps.Tilemap,
    ground: Phaser.Tilemaps.TilemapLayer,
  ) {
    const rng = new Phaser.Math.RandomDataGenerator([this.levelKey])
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
      const t = ground.getTileAt(x, y)
      return !!t && t.index >= 1
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!solid(x, y)) continue
        const px = x * 8 + 4
        // exposed top surface: plant something
        if (!solid(x, y - 1) && rng.frac() < DECO.topDensity) {
          const r = rng.frac()
          const key =
            r < 0.5 ? 'deco_grass' : r < 0.8 ? 'deco_fern' : 'deco_shroom'
          const h = key === 'deco_fern' ? 5 : 4
          this.add.image(px + rng.between(-2, 2), y * 8 - h / 2, key)
        }
        // exposed underside: hang a vine (1-2 segments)
        if (!solid(x, y + 1) && rng.frac() < DECO.vineDensity) {
          this.add.image(px, y * 8 + 12, 'deco_vine')
          if (rng.frac() < 0.4 && !solid(x, y + 2)) {
            this.add.image(px, y * 8 + 20, 'deco_vine')
          }
        }
      }
    }
  }

  /**
   * DANGER signposts beside real drops (#65).
   *
   * Derived from the tilemap the same way `decorate` is, so no level JSON has
   * to be touched. A ledge qualifies when the tile beside it is empty and
   * stays empty for SIGNPOST.minDrop tiles down — this game's only hazard is
   * a fall, so that is what "before a hazard" means here.
   *
   * The sign goes on the ledge side, which is the side the player is standing
   * on when they need it. A sign on the far side of a gap is a sign you read
   * after you have already jumped.
   */
  private placeSignposts(
    map: Phaser.Tilemaps.Tilemap,
    ground: Phaser.Tilemaps.TilemapLayer,
  ) {
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
      const t = ground.getTileAt(x, y)
      return !!t && t.index >= 1
    }
    // A drop is only a hazard if it goes all the way down. This game has no
    // fall damage — landing six tiles lower costs nothing, and the only fall
    // that hurts is one that reaches the world-bounds floor and respawns you
    // (see the void-floor check in `update`). The first version of this signed
    // any drop of six tiles or more, which put warnings on ledges that are
    // completely safe to step off; a sign that cries wolf is worse than none.
    const isVoid = (x: number, y: number) => {
      // Out of bounds is not a void. `solid` returns false past the edge of
      // the map, so without this the outermost column of every level looks
      // like a bottomless drop and the map border gets signposted — which is
      // exactly what happened: level 1's only sign was on its right-hand wall,
      // and the Mossy Bridge put both of its signs on the cliff faces instead
      // of on the deck. The player cannot walk off the side of the world.
      if (x < 0 || x >= map.width) return false
      for (let d = y + 1; d < map.height; d++) {
        if (solid(x, d)) return false
      }
      return map.height - y >= SIGNPOST.minDrop
    }
    let lastX = -Infinity
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!solid(x, y) || solid(x, y - 1)) continue // needs an exposed top
        // A ledge: open air to one side, with a long fall under it.
        const leftEdge = !solid(x - 1, y) && isVoid(x - 1, y)
        const rightEdge = !solid(x + 1, y) && isVoid(x + 1, y)
        if (!leftEdge && !rightEdge) continue
        if (x - lastX < SIGNPOST.minSpacing) continue
        lastX = x
        // Stand it a little back from the lip, on the solid side.
        const sign = this.add.image(x * 8 + 4, y * 8 - 6, 'signpost')
        sign.setFlipX(leftEdge && !rightEdge)
        // Behind the player, in front of the parallax — the same band the
        // other world decorations use. No physics body: it is scenery, and a
        // sign you can stand on is a platform.
        sign.setDepth(-0.1)
      }
    }
  }

  /**
   * Fireflies drifting around the lanterns (#65).
   *
   * Spawned near lanterns rather than uniformly, which is what makes their
   * density track the light, and drawn *below* the darkness overlay so an
   * unlit corner dims its own fireflies for free — no per-firefly lighting
   * maths, and it stays correct when a lantern is lit mid-level.
   *
   * Capped hard. Every one of these is moved every frame, and a density that
   * looks right on level 1 puts hundreds on level 4.
   */
  private spawnFireflies() {
    for (const f of this.fireflies) f.sprite.destroy()
    this.fireflies = []
    if (this.lanterns.length === 0) return

    const rng = new Phaser.Math.RandomDataGenerator([`${this.levelKey}-fireflies`])
    for (const lantern of this.lanterns) {
      for (let i = 0; i < FIREFLY.perLantern; i++) {
        if (this.fireflies.length >= FIREFLY.max) return
        const homeX = lantern.sprite.x + rng.between(-FIREFLY.spread, FIREFLY.spread)
        const homeY = lantern.sprite.y + rng.between(-FIREFLY.spread, FIREFLY.spread)
        const sprite = this.add
          .image(homeX, homeY, 'particle')
          .setDepth(5)
          .setAlpha(FIREFLY.alpha)
        this.fireflies.push({
          sprite,
          homeX,
          homeY,
          phase: rng.frac() * Math.PI * 2,
          lantern,
        })
      }
    }
  }

  /**
   * Drifts the fireflies and tracks their lantern's state (#65).
   *
   * Reduced motion stops the drift but keeps the fireflies: they are part of
   * the scene's light, and removing them would take away information about
   * where the lanterns are. Only the movement is decoration.
   */
  private updateFireflies(time: number) {
    if (this.fireflies.length === 0) return
    const still = prefersReducedMotion()
    for (const f of this.fireflies) {
      const target = f.lantern.lit ? FIREFLY.alphaLit : FIREFLY.alpha
      f.sprite.setAlpha(target)
      if (still) continue
      const t = (time / FIREFLY.periodMs) * Math.PI * 2 + f.phase
      f.sprite.x = f.homeX + Math.sin(t) * FIREFLY.driftX
      // A different multiple on each axis, so the path is a slow figure
      // rather than a circle — a circle reads as a mechanism, not an insect.
      f.sprite.y = f.homeY + Math.sin(t * 1.7) * FIREFLY.driftY
    }
  }

  private lightLantern(lantern: Lantern) {
    if (lantern.lit) return
    lantern.lit = true
    if (lantern.name !== 'heart_tree') {
      lantern.sprite.setTexture('lanternLit')
      this.totalLanternsLit++
    }
    this.respawnPoint = { x: lantern.sprite.x, y: lantern.sprite.y - 6 }
    // Lanterns are already the checkpoints; #70 makes them the supply too, so
    // running for the next one is a real decision rather than a guess.
    this.refillFuel()

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
        this.time.delayedCall(4000, () => {
          this.cameras.main.fadeOut(1000, 0, 0, 0)
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.advanceTo('climb')
          })
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
      
      this.time.delayedCall(4000, () => {
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.advanceTo('grove')
        })
      })
    } else if (lantern.name === 'bridge_end') {
      // The far side of the Mossy Bridge (#92). The last stage before the
      // Hollow, so this one does not clear the darkness the way the earlier
      // breathers do — the approach should hand over to the finale still dim.
      this.won = true
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 80)
      this.toast('THE FAR SIDE', 0)
      this.tweens.add({ targets: this.darkness, alpha: 0.4, duration: 3000 })
      this.time.delayedCall(4000, () => {
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.advanceTo('level4')
        })
      })
    } else if (lantern.name === 'climb_summit') {
      // The Quiet Climb's summit (#91). Grants nothing, same as the Grove's
      // closer: this is a breather between the Marsh and the Canopy.
      this.won = true
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 50)
      this.toast('THE CLIMB IS LIT', 0)
      this.tweens.add({ targets: this.darkness, alpha: 0, duration: 3000 })
      this.time.delayedCall(4000, () => {
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.advanceTo('level3')
        })
      })
    } else if (lantern.name === 'grove_heart') {
      // The Firefly Grove's closing lantern (#90). It grants no ability:
      // every traversal upgrade is already in hand by the end of level 1, and
      // a breather stage is not where a new mechanic belongs.
      this.won = true
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 50)
      this.toast('THE GROVE IS ALIGHT', 0)
      this.tweens.add({ targets: this.darkness, alpha: 0, duration: 3000 })
      this.time.delayedCall(4000, () => {
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.advanceTo('level2')
        })
      })
    } else if (lantern.name === 'canopy_grand') {
      this.won = true
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 100)
      this.toast('THE CANOPY GLOWS AGAIN', 3000)
      
      this.tweens.add({
        targets: this.darkness,
        alpha: 0,
        duration: 3000
      })
      
      this.time.delayedCall(1000, () => {
        // Spawn bridge across bottomless pit
        for (let x = 90; x <= 99; x++) {
          this.time.delayedCall((x - 90) * 100, () => {
            this.groundLayer.putTileAt(5, x, 16)
            this.sparkParticles.emitParticleAt(x * 8 + 4, 16 * 8 + 4, 10)
            sfx.lantern()
          })
        }
      })
      
      this.time.delayedCall(5000, () => {
        this.cameras.main.fadeOut(1000, 0, 0, 0)
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.advanceTo('bridge')
        })
      })
    } else if (lantern.name === 'heart_tree') {
      this.won = true
      this.persist(true)
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 500)
      const treeToast = this.toast('THE HEART TREE IS RESTORED', 0)
      
      // Spawn hanging lanterns in the canopy
      for (let i = 0; i < this.totalLanternsLit; i++) {
        const lx = lantern.sprite.x + Phaser.Math.Between(-26, 26)
        const ly = lantern.sprite.y + Phaser.Math.Between(-28, 4)
        const l = this.add.image(lx, ly, 'lanternLit').setDepth(lantern.sprite.depth + 1)
        this.tweens.add({
          targets: l,
          y: ly - 2,
          yoyo: true,
          repeat: -1,
          duration: Phaser.Math.Between(1000, 2000),
          ease: 'Sine.easeInOut',
          delay: Phaser.Math.Between(0, 1000)
        })
      }
      
      this.tweens.add({
        targets: this.darkness,
        alpha: 0,
        duration: 4000
      })
      
      this.time.delayedCall(5000, () => {
        if (treeToast) treeToast.destroy()
        this.hudText.setVisible(false)

        // Replaces a static GAME CLEARED card that reported nothing about the
        // run it had just ended (#66).
        const total = this.countAllLanterns()
        showRunSummary(this, {
          title: 'GAME CLEARED',
          palette: PAL,
          subtitle: 'The tree burns',
          stats: [
            { label: 'TIME', value: formatRunTime(this.runElapsedMs) },
            {
              label: 'LANTERNS',
              value: total > 0 ? `${this.totalLanternsLit}/${total}` : `${this.totalLanternsLit}`,
              highlight: total > 0 && this.totalLanternsLit >= total,
            },
            { label: 'DEATHS', value: `${this.deaths}` },
          ],
          // No `prompt` override: the panel picks 'Z: continue' or 'Tap to
          // continue' from the pointer type. Hardcoding the key spelled out an
          // input a phone does not have, on the last screen of the game (#97).
          onDismiss: () => this.scene.start('menu'),
        })
      })
    }
    
    this.updateHud()
  }

  /**
   * Every lightable lantern in the game, across all four levels.
   *
   * All four maps are preloaded in BootScene, so this counts from the tilemap
   * cache rather than hardcoding a number that would drift the moment a level
   * was edited.
   *
   * The rule has to match how `create()` reads the same layer, which is by
   * exclusion: anything in `lanterns` that is not a mushroom, a crumbling
   * platform or the Heart Tree becomes a lantern. There is no `name: lantern`
   * to look for — most are named for what they are ('ember', 'gale',
   * 'canopy_grand') and several have no name at all.
   *
   * Returns 0 if the cache is not shaped as expected, and the summary then
   * shows a bare count rather than a wrong denominator.
   */
  private countAllLanterns(): number {
    const notLanterns = new Set(['mushroom', 'crumble', 'heart_tree'])
    let total = 0
    for (const key of STAGE_KEYS) {
      const data = this.cache.tilemap.get(key)?.data as
        | { layers?: { name?: string; objects?: { name?: string }[] }[] }
        | undefined
      for (const layer of data?.layers ?? []) {
        if (layer.name !== 'lanterns') continue
        for (const obj of layer.objects ?? []) {
          if (!notLanterns.has(obj.name ?? '')) total++
        }
      }
    }
    return total
  }

  /**
   * Writes the run's progress. `completed` is sticky: once the Heart Tree has
   * been reached it stays set, because it records that this player finished
   * the game rather than the state of the current run.
   */
  private persist(completed = false) {
    // Bank the segment as we write, so `elapsedMs` is always the total played
    // and never double-counts: the marker resets on every call.
    const now = Date.now()
    if (this.segmentStartedAt > 0) {
      this.runElapsedMs += now - this.segmentStartedAt
      this.segmentStartedAt = now
    }
    saveProgress({
      levelKey: this.levelKey,
      hasDoubleJump: this.hasDoubleJump,
      hasDash: this.hasDash,
      hasWallCling: this.hasWallCling,
      totalLanternsLit: this.totalLanternsLit,
      elapsedMs: this.runElapsedMs,
      deaths: this.deaths,
      completed: completed || loadProgress().completed,
    })
  }

  /** Saves, then moves to the next level. */
  private advanceTo(levelKey: string) {
    const from = this.levelKey
    this.levelKey = levelKey
    this.persist()
    // Through the world map (#88) rather than straight into the next stage,
    // so the player sees the move they just earned.
    this.scene.start('map', {
      from,
      levelKey,
      hasDoubleJump: this.hasDoubleJump,
      hasDash: this.hasDash,
      hasWallCling: this.hasWallCling,
      totalLanternsLit: this.totalLanternsLit,
    })
  }

  private updateHud() {
    const regularLanterns = this.lanterns.filter(l => l.name !== 'heart_tree')
    if (regularLanterns.length === 0) {
      this.hudText.setText('') // no regular lanterns to collect
      return
    }
    const litCount = regularLanterns.filter(l => l.lit).length
    this.hudText.setText(`Stage: ${litCount}/${regularLanterns.length}\nTotal: ${this.totalLanternsLit}`)
  }

  private onCrumbleTouch(player: any, platform: any) {
    if (player.body.bottom <= platform.body.top && player.body.velocity.y >= 0) {
      if (!platform.getData('crumbling')) {
        platform.setData('crumbling', true)
        
        this.tweens.add({
          targets: platform,
          alpha: 0.2,
          duration: 100,
          yoyo: true,
          repeat: 4,
          onComplete: () => {
            platform.body.enable = false
            platform.setVisible(false)
            this.sparkParticles.emitParticleAt(platform.x + platform.width/2, platform.y - platform.height/2, 20)
            
            this.time.delayedCall(3000, () => {
              platform.body.enable = true
              platform.setVisible(true)
              platform.alpha = 1
              platform.setData('crumbling', false)
            })
          }
        })
      }
    }
  }

  private toast(message: string, duration = 2000): Phaser.GameObjects.Text {
    const text = this.add
      .text(GBC_WIDTH / 2, GBC_HEIGHT - 32, message, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#e0f8cf',
        backgroundColor: '#0f1a12',
        padding: { x: 3, y: 3 },
        resolution: 1,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: GBC_WIDTH - 16 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20)
    if (duration > 0) {
      this.time.delayedCall(duration, () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          duration: 500,
          onComplete: () => text.destroy(),
        })
      })
    }
    return text
  }

  private respawn() {
    this.deaths++
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y)
    this.player.setVelocity(0, 0)
    // Respawning puts you back at a lantern, so the tank comes back with you.
    // Without this, dying on a low tank would hand the player a fresh attempt
    // they had no light to make.
    this.refillFuel()
    sfx.die()
    this.toast('THE DARK CLOSES IN...', 1500)
  }

  update(time: number, delta: number) {
    // Ambience first, and unguarded by the pause checks below: fireflies
    // should keep drifting while the info overlay is up, the same way the
    // parallax does.
    this.updateFireflies(time)

    if (this.justResumed) {
      this.justResumed = false
      // Consume the stale pause/info keys queued during the pause so they
      // don't immediately re-trigger the overlay on this first frame.
      Phaser.Input.Keyboard.JustDown(this.enterKey)
      Phaser.Input.Keyboard.JustDown(this.escKey)
      Phaser.Input.Keyboard.JustDown(this.shiftKey)
      this.redrawDarkness()
      return
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      if (typeof (window as any).toggleOverlay === 'function') {
        (window as any).toggleOverlay('pause')
      }
      return
    }
    if (Phaser.Input.Keyboard.JustDown(this.shiftKey)) {
      if (typeof (window as any).toggleOverlay === 'function') {
        (window as any).toggleOverlay('info')
      }
      return
    }

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

    // Burn fuel (#70). On the clock, not on distance — draining per-pixel
    // would make standing still a conserving strategy, and a game about
    // pushing on into the dark should never reward waiting.
    if (this.fuelMs > 0) {
      this.fuelMs = Math.max(0, this.fuelMs - delta)
      if (!this.lowFuelCued && this.fuelRatio() <= FUEL.lowRatio) {
        this.lowFuelCued = true
        sfx.lowFuel()
      }
    }
    this.collectFlasks()
    this.drawFuelGauge()

    // Instant hazard respawn (replaces the old 30s glow-timeout death —
    // no more waiting in the dark): landing on the bare world-bounds
    // floor after falling past all terrain, or the Hollow's mud pit.
    const onVoidFloor =
      body.blocked.down && body.bottom >= this.physics.world.bounds.bottom
    if (onVoidFloor || (inMud && this.levelKey === 'level4')) {
      this.respawn()
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

    // Guidance logic
    let target = null
    let minDistSq = Infinity
    const regularLanterns = this.lanterns.filter(l => l.name !== 'heart_tree')
    const allRegularLit = regularLanterns.length > 0 && regularLanterns.every(l => l.lit)

    if (allRegularLit || regularLanterns.length === 0) {
      const exit = this.lanterns.find(l => l.name === 'heart_tree')
      if (exit) {
        target = exit
      }
    } else {
      for (const l of regularLanterns) {
        if (!l.lit) {
          const distSq = Phaser.Math.Distance.Squared(this.player.x, this.player.y, l.sprite.x, l.sprite.y)
          if (distSq < minDistSq) {
            minDistSq = distSq
            target = l
          }
        }
      }
    }

    if (target && !this.won) {
      const dist = Math.sqrt(minDistSq)
      if (dist > 60) {
        this.guidanceArrow.setVisible(true)
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y - 8, target.sprite.x, target.sprite.y - 8)
        this.guidanceArrow.setPosition(this.player.x + Math.cos(angle) * 28, this.player.y - 8 + Math.sin(angle) * 28)
        this.guidanceArrow.setRotation(angle)
      } else {
        this.guidanceArrow.setVisible(false)
      }
    } else {
      this.guidanceArrow.setVisible(false)
    }

    this.redrawDarkness()
  }

  /** Fuel remaining as a fraction of a tank, 1 full and 0 empty. */
  private fuelRatio(): number {
    return Phaser.Math.Clamp(this.fuelMs / FUEL.maxMs, 0, 1)
  }

  private playerLightRadius(): number {
    // Empty is `GLOW.minRadius` — under a tile, so near-blind — but never
    // zero, and never a death. The level darkness tops out at 0.82 alpha, so
    // terrain outlines stay faintly readable and a dry player can still feel
    // their way back to a lit lantern, which keeps its own glow forever.
    return GLOW.minRadius + (GLOW.maxRadius - GLOW.minRadius) * this.fuelRatio()
  }

  /** Fills the tank and re-arms the low-fuel cue. */
  private refillFuel(): void {
    this.fuelMs = FUEL.maxMs
    this.lowFuelCued = false
  }

  /**
   * Draws the fuel gauge, top-right so it does not collide with the two lines
   * of lantern-count text at the top-left.
   */
  private drawFuelGauge(): void {
    const ratio = this.fuelRatio()
    const w = 30
    const h = 4
    const x = GBC_WIDTH - w - 4
    const y = 9
    this.fuelGfx.clear()
    this.fuelGfx.fillStyle(PAL.darkest, 0.7)
    this.fuelGfx.fillRect(x - 1, y - 1, w + 2, h + 2)
    this.fuelGfx.lineStyle(1, PAL.light, 1)
    this.fuelGfx.strokeRect(x - 1, y - 1, w + 2, h + 2)
    if (ratio > 0) {
      // Warm while there is fuel, pale once it is nearly out — the palette has
      // no red, so the warning has to be a shift in value rather than in hue.
      this.fuelGfx.fillStyle(ratio <= FUEL.lowRatio ? PAL.lightest : PAL.warm, 1)
      this.fuelGfx.fillRect(x, y, Math.max(1, Math.round(w * ratio)), h)
    }
  }

  /** Oil flasks top the tank up between lanterns. */
  private collectFlasks(): void {
    for (const flask of this.flasks) {
      if (flask.taken) continue
      const d = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        flask.sprite.x,
        flask.sprite.y,
      )
      if (d > LIGHT_TOUCH_DISTANCE) continue
      flask.taken = true
      flask.sprite.setVisible(false)
      this.fuelMs = Math.min(FUEL.maxMs, this.fuelMs + FUEL.maxMs * FUEL.flaskRatio)
      if (this.fuelRatio() > FUEL.lowRatio) this.lowFuelCued = false
      sfx.flask()
      this.sparkParticles.emitParticleAt(flask.sprite.x, flask.sprite.y, 4)
    }
  }

  private redrawDarkness() {
    const lights: Light[] = [
      { x: this.player.x, y: this.player.y, radius: this.playerLightRadius() },
    ]
    for (const lantern of this.lanterns) {
      if (lantern.lit) {
        lights.push({
          x: lantern.sprite.x,
          y: lantern.sprite.y,
          radius: LANTERN_GLOW_RADIUS,
        })
      }
    }
    this.darkness.redraw(lights)
  }
}
