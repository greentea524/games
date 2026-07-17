import Phaser from 'phaser'
import { sfx } from '../audio'
import {
  GBC_WIDTH,
  GBC_HEIGHT,
  GLOW,
  DASH,
  JUMP_ASSIST,
  WALL,
  DARKNESS_ALPHA,
  DECO,
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
  private enterKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key
  private shiftKey!: Phaser.Input.Keyboard.Key
  private hasDoubleJump = false
  private hasDash = false
  private hasWallCling = false
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

    let spawnX = 32
    let spawnY = 72
    let title = 'THE FOREST'

    if (this.levelKey === 'level2') {
      spawnY = 72
      title = 'THE MARSH'
    } else if (this.levelKey === 'level3') {
      spawnY = 384
      title = 'THE CANOPY'
    } else if (this.levelKey === 'level4') {
      spawnY = 128
      title = 'THE HOLLOW'
    }
    const initialDarkness = DARKNESS_ALPHA[this.levelKey] ?? 0.85

    this.createBackground(map)
    this.decorate(map, ground)

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
      }
    }

    this.physics.add.collider(this.player, this.crumbleGroup, this.onCrumbleTouch, undefined, this)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.dashKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)

    // The same Enter/Esc/Shift press that resumes from the pause overlay
    // is still queued in Phaser and flushes as a JustDown on the first
    // update after resume — which would instantly re-open the overlay.
    // Swallow it (see the guard at the top of update()).
    this.events.on('resume', () => {
      this.justResumed = true
    })

    this.hudText = this.add.text(4, 3, '', {
      fontFamily: '"Press Start 2P"',
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
    
    this.guidanceArrow = this.add.image(0, 0, 'guidance_arrow')
    this.guidanceArrow.setOrigin(0.5, 0.5).setDepth(15).setVisible(false)

    this.updateHud()

    this.darkness = this.add
      .renderTexture(0, 0, GBC_WIDTH, GBC_HEIGHT)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(10)
    this.darkness.alpha = initialDarkness
    this.brush = new Phaser.GameObjects.Image(this, 0, 0, 'brush')
    this.brushBig = new Phaser.GameObjects.Image(this, 0, 0, 'brushBig')

    this.respawnPoint = { x: spawnX, y: spawnY }
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

  private lightLantern(lantern: Lantern) {
    lantern.lit = true
    if (lantern.name !== 'heart_tree') {
      lantern.sprite.setTexture('lanternLit')
    }
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
        this.time.delayedCall(4000, () => {
          this.cameras.main.fadeOut(1000, 0, 0, 0)
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('play', { 
              levelKey: 'level3',
              hasDoubleJump: this.hasDoubleJump,
              hasDash: this.hasDash,
              hasWallCling: this.hasWallCling
            })
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
          this.scene.start('play', { 
            levelKey: 'level2',
            hasDoubleJump: this.hasDoubleJump,
            hasDash: this.hasDash,
            hasWallCling: this.hasWallCling
          })
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
          this.scene.start('play', { 
            levelKey: 'level4',
            hasDoubleJump: this.hasDoubleJump,
            hasDash: this.hasDash,
            hasWallCling: this.hasWallCling
          })
        })
      })
    } else if (lantern.name === 'heart_tree') {
      this.won = true
      sfx.win()
      this.sparkParticles.emitParticleAt(lantern.sprite.x, lantern.sprite.y, 500)
      this.toast('THE HEART TREE IS RESTORED', 0)
      
      // Spawn hanging lanterns in the canopy
      for (let i = 0; i < 15; i++) {
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
        this.add.text(GBC_WIDTH / 2, GBC_HEIGHT - 16, 'GAME CLEARED\nTHANKS FOR PLAYING', {
          fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#e0f8cf',
          backgroundColor: '#0f1a12', padding: { x: 4, y: 4 },
          align: 'center', resolution: 1, lineSpacing: 4,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(20)
      })
    }
    
    this.updateHud()
  }

  private updateHud() {
    const regularLanterns = this.lanterns.filter(l => l.name !== 'heart_tree')
    if (regularLanterns.length === 0) {
      this.hudText.setText('') // no regular lanterns to collect
      return
    }
    const litCount = regularLanterns.filter(l => l.lit).length
    this.hudText.setText(`Lanterns: ${litCount}/${regularLanterns.length}`)
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

  private toast(message: string, duration = 2000) {
    const text = this.add
      .text(GBC_WIDTH / 2, GBC_HEIGHT - 32, message, {
        fontFamily: '"Press Start 2P"',
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
      this.time.delayedCall(duration, () => text.destroy())
    }
  }

  private respawn() {
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y)
    this.player.setVelocity(0, 0)
    sfx.die()
    this.toast('THE DARK CLOSES IN...', 1500)
  }

  update(time: number) {
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

  private playerLightRadius(): number {
    return GLOW.maxRadius
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
