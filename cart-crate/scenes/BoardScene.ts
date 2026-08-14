import Phaser from 'phaser'
import { TILE, FONT, PAL, GBC_PAL, WORLD_PALS } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import { SaveSystem } from '../save'
import { MoveCommand } from '../commands'
import type { StepRecord } from '../commands'
import type { UIScene } from './UIScene'
import { showRunSummary } from '../../shared/runSummary'

type Facing = 'down' | 'up' | 'left' | 'right'

export interface CrateInstance {
  id: number
  sprite: Phaser.GameObjects.Sprite
  tx: number
  ty: number
  docked: boolean
  destroyed?: boolean
}

export class BoardScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite
  private playerTX = 2
  private playerTY = 2
  private facing: Facing = 'down'
  private isMoving = false
  private isHintMode = false
  /**
   * True while the end-of-level summary is up (#66).
   *
   * The board has two long-standing "advance on any input" paths that trigger
   * on `uiBlocking` — a pointerup handler and an update() branch. Both would
   * fire on the same press that dismisses the panel, advancing two levels at
   * once, so while the panel is up it owns the input and they stand down.
   */
  private summaryOpen = false
  private mapWidth = 10
  private mapHeight = 9

  private floorGrid: string[][] = []
  private floorSprites: Phaser.GameObjects.Image[][] = []
  private targetSprites: (Phaser.GameObjects.Image | null)[][] = []
  private targetPulses = new Map<string, Phaser.Tweens.Tween>()
  private targetDitherEvents = new Map<string, Phaser.Time.TimerEvent>()
  private crates: CrateInstance[] = []
  private undoStack: MoveCommand[] = []

  private undoKey!: Phaser.Input.Keyboard.Key
  private undoKeyAlt!: Phaser.Input.Keyboard.Key
  private resetKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key
  private hintKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super('board')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    this.cameras.main.fadeIn(400, 0, 0, 0)

    this.setupLevelLayout()
    this.renderBoard()

    this.input.keyboard!.createCursorKeys()
    this.input.keyboard!.addKeys('W,A,S,D')

    this.undoKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.undoKeyAlt = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.hintKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.H)

    // Touch Swipe Gestures
    let touchStartX = 0
    let touchStartY = 0
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      touchStartX = pointer.x
      touchStartY = pointer.y
    })
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.summaryOpen) return
      if (GameState.uiBlocking) {
        const uiScene = this.scene.get('ui') as UIScene
        if (uiScene && uiScene.isPauseOpen()) return
        this.nextLevel()
        return
      }
      if (this.isMoving) return
      const dx = pointer.x - touchStartX
      const dy = pointer.y - touchStartY
      const minDistance = 15

      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > minDistance) {
          if (dx > 0) {
            this.facing = 'right'
            this.tryMovePlayer(1, 0)
          } else {
            this.facing = 'left'
            this.tryMovePlayer(-1, 0)
          }
        }
      } else {
        if (Math.abs(dy) > minDistance) {
          if (dy > 0) {
            this.facing = 'down'
            this.tryMovePlayer(0, 1)
          } else {
            this.facing = 'up'
            this.tryMovePlayer(0, -1)
          }
        }
      }
    })

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  setupLevelLayout() {
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
    this.facing = 'down'
    this.isMoving = false
    this.isHintMode = false
    this.summaryOpen = false
    this.undoStack = []
    GameState.resetStats()

    this.floorGrid = levelConfig.grid.map((row) => row.split(''))
    this.mapHeight = this.floorGrid.length
    this.mapWidth = this.floorGrid[0].length

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (this.floorGrid[y][x] === 'P') {
          this.playerTX = x
          this.playerTY = y
          this.floorGrid[y][x] = '.'
        } else if (this.floorGrid[y][x] === '+') {
          this.playerTX = x
          this.playerTY = y
          this.floorGrid[y][x] = 'T'
        }
      }
    }
  }

  getTextureKey(base: string) {
    const mode = GameState.paletteMode
    const world = CAMPAIGN_LEVELS[GameState.currentLevelIndex]?.world || 1
    return mode === 'gbc' ? `${base}_${mode}_w${world}` : `${base}_${mode}`
  }

  renderBoard() {
    const tKey = this.getTextureKey.bind(this)
    const mode = GameState.paletteMode
    this.crates = []
    this.floorSprites = Array(this.mapHeight).fill(null).map(() => Array(this.mapWidth).fill(null))
    this.targetSprites = Array(this.mapHeight).fill(null).map(() => Array(this.mapWidth).fill(null))
    this.targetPulses.clear()
    this.targetDitherEvents.clear()
    let crateIdCounter = 1

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.floorGrid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        if (char === '#') {
          let texKey = 'wall'
          if (y === 0) {
            texKey = (x % 2 === 0) ? 'shelf' : 'pegboard'
          } else if (y === this.mapHeight - 1 || x === 0 || x === this.mapWidth - 1) {
            texKey = 'barrel'
          }
          this.floorSprites[y][x] = this.add.image(px, py, tKey(texKey))
        } else if (char === 'T') {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('floor'))
          const targetSprite = this.add.image(px, py, tKey('target'))
          this.targetSprites[y][x] = targetSprite
          this.setTargetEmpty(x, y)
        } else if (char === 'I') {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('ice'))
        } else if (char === 'X') {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('cracked'))
        } else if (char === 'O') {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('hole'))
        } else {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('floor'))
        }

        if (char === 'C' || char === '*') {
          const isTarget = (char === '*')
          this.floorGrid[y][x] = isTarget ? 'T' : '.'
          
          if (isTarget) {
            this.add.image(px, py, tKey('floor'))
            const targetSprite = this.add.image(px, py, tKey('target'))
            this.targetSprites[y][x] = targetSprite
            this.setTargetLit(x, y, false, false)
          }
          
          const crateSprite = this.add.sprite(px, py, tKey('crate')).setDepth(5)
          this.crates.push({
            tx: x,
            ty: y,
            sprite: crateSprite,
            docked: isTarget,
            id: crateIdCounter++,
            destroyed: false,
          })
        }
      }
    }

    this.player = this.add.sprite(
      this.playerTX * TILE + TILE / 2,
      this.playerTY * TILE + TILE / 2,
      `player_${mode}_` + this.facing
    ).setDepth(10)

    this.updateCamera()
  }

  setTile(tx: number, ty: number, char: string) {
    this.floorGrid[ty][tx] = char
    const img = this.floorSprites[ty][tx]
    if (img) {
      if (char === 'O') img.setTexture(this.getTextureKey('hole'))
      else if (char === 'X') img.setTexture(this.getTextureKey('cracked'))
      else if (char === '.') img.setTexture(this.getTextureKey('floor'))
    }
  }

  reloadPalette() {
    const mode = GameState.paletteMode
    const tKey = this.getTextureKey.bind(this)

    this.children.each((child: Phaser.GameObjects.GameObject) => {
      if (child instanceof Phaser.GameObjects.Image) {
        const key = child.texture.key
        if (key.startsWith('floor_')) child.setTexture(tKey('floor'))
        else if (key.startsWith('wall_')) child.setTexture(tKey('wall'))
        else if (key.startsWith('ice_')) child.setTexture(tKey('ice'))
        else if (key.startsWith('cracked_')) child.setTexture(tKey('cracked'))
        else if (key.startsWith('hole_')) child.setTexture(tKey('hole'))
      } else if (child instanceof Phaser.GameObjects.Sprite) {
        const key = child.texture.key
        if (key.startsWith('crate_')) {
          child.setTexture(tKey('crate'))
        } else if (key.startsWith('player_')) {
          child.setTexture(`player_${mode}_${this.facing}`)
        }
      }
    })

    // Re-apply each pad's glow state (empty pulse vs. satisfied lit).
    this.targetSprites.forEach((row, y) => {
      row.forEach((sprite, x) => {
        if (!sprite) return
        const docked = this.crates.some((c) => !c.destroyed && c.docked && c.tx === x && c.ty === y)
        this.refreshTargetState(x, y, docked)
      })
    })

    const world = CAMPAIGN_LEVELS[GameState.currentLevelIndex]?.world || 1
    const pal = mode === 'gbc' ? (WORLD_PALS[world - 1] || GBC_PAL) : GBC_PAL

    this.crates.forEach((c) => {
      if (c.docked && !c.destroyed) {
        c.sprite.setTint(mode === 'dmg' ? 0x9bbc0f : pal.crateLight)
      } else {
        c.sprite.clearTint()
      }
    })

    this.updateCamera()
    
    this.cameras.main.setBackgroundColor(mode === 'dmg' ? '#0f380f' : '#181818')
  }

  private targetKey(tx: number, ty: number) {
    return `${tx},${ty}`
  }

  private stopTargetEffects(tx: number, ty: number) {
    const key = this.targetKey(tx, ty)
    const pulse = this.targetPulses.get(key)
    if (pulse) {
      pulse.stop()
      this.targetPulses.delete(key)
    }
    const dither = this.targetDitherEvents.get(key)
    if (dither) {
      dither.remove()
      this.targetDitherEvents.delete(key)
    }
  }

  private clearTargetEffects() {
    this.targetPulses.forEach((pulse) => pulse.stop())
    this.targetPulses.clear()
    this.targetDitherEvents.forEach((dither) => dither.remove())
    this.targetDitherEvents.clear()
  }

  private reducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private setTargetEmpty(tx: number, ty: number) {
    const sprite = this.targetSprites[ty]?.[tx]
    if (!sprite) return
    this.stopTargetEffects(tx, ty)
    sprite.setTexture(this.getTextureKey('target'))
    sprite.setAlpha(1)
    sprite.setScale(1)
    sprite.setFlipX(false)
    if (this.reducedMotion()) return
    const pulse = this.tweens.add({
      targets: sprite,
      alpha: 0.6,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.targetPulses.set(this.targetKey(tx, ty), pulse)
  }

  private setTargetLit(tx: number, ty: number, flash: boolean, isWin: boolean) {
    const sprite = this.targetSprites[ty]?.[tx]
    if (!sprite) return
    this.stopTargetEffects(tx, ty)
    sprite.setTexture(this.getTextureKey('target_lit'))
    sprite.setAlpha(1)
    sprite.setScale(1)
    sprite.setFlipX(false)

    if (GameState.paletteMode === 'dmg' && !this.reducedMotion()) {
      // DMG has no colour, so cycle the dither pattern to suggest glow.
      const dither = this.time.addEvent({
        delay: 450,
        loop: true,
        callback: () => sprite.setFlipX(!sprite.flipX),
      })
      this.targetDitherEvents.set(this.targetKey(tx, ty), dither)
    }

    if (flash && !this.reducedMotion()) {
      this.tweens.add({
        targets: sprite,
        scale: isWin ? 1.7 : 1.35,
        duration: isWin ? 320 : 150,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => sprite.setScale(1),
      })
    }
  }

  refreshTargetState(tx: number, ty: number, docked: boolean) {
    if (docked) this.setTargetLit(tx, ty, false, false)
    else this.setTargetEmpty(tx, ty)
  }

  private playWinFlourish(tx: number, ty: number) {
    const px = tx * TILE + TILE / 2
    const py = ty * TILE + TILE / 2
    const color = GameState.paletteMode === 'dmg' ? 0x9bbc0f : 0xffff88
    const ring = this.add.graphics().setDepth(20)
    const state = { radius: 2 }

    // Expanding shockwave ring, now sweeping across the whole board.
    this.tweens.add({
      targets: state,
      radius: 96,
      duration: 480,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        ring.clear()
        ring.lineStyle(2, color, Math.max(0, 1 - state.radius / 96))
        ring.strokeCircle(px, py, state.radius)
      },
      onComplete: () => ring.destroy(),
    })

    if (!this.reducedMotion()) {
      // Double full-board flash.
      const { r, g, b } = Phaser.Display.Color.IntegerToRGB(color)
      this.cameras.main.flash(300, r, g, b)
      this.time.delayedCall(170, () => this.cameras.main.flash(180, r, g, b))

      // Confetti bursting out of every docked crate.
      this.spawnCrateConfetti()
    }

    this.crates.forEach((c) => {
      if (!c.destroyed && c.docked) {
        const sprite = this.targetSprites[c.ty]?.[c.tx]
        if (sprite) {
          this.tweens.add({
            targets: sprite,
            scale: 1.35,
            duration: 140,
            yoyo: true,
            ease: 'Sine.easeInOut',
          })
        }
      }
    })
  }

  private spawnCrateConfetti() {
    const texKey = 'confetti'
    if (!this.textures.exists(texKey)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0xffffff, 1)
      g.fillRect(0, 0, 2, 2)
      g.generateTexture(texKey, 2, 2)
      g.destroy()
    }

    const colors = GameState.paletteMode === 'dmg'
      ? [0x9bbc0f, 0x8bac0f, 0x306230]
      : [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xff9ff3, 0xffffff]

    const sources = this.crates.filter((c) => !c.destroyed && c.docked)

    sources.forEach((c, i) => {
      this.time.delayedCall(i * 40, () => {
        const cx = c.tx * TILE + TILE / 2
        const cy = c.ty * TILE + TILE / 2
        const emitter = this.add.particles(cx, cy, texKey, {
          speed: { min: 60, max: 150 },
          angle: { min: 0, max: 360 },
          gravityY: 260,
          lifespan: { min: 500, max: 900 },
          quantity: 16,
          scale: { start: 1, end: 0.3 },
          rotate: { min: 0, max: 360 },
          alpha: { start: 1, end: 0 },
          tint: colors,
          emitting: false,
        }).setDepth(30)
        emitter.explode(16)
        this.time.delayedCall(1100, () => emitter.destroy())
      })
    })
  }

  private updateCamera() {
    const mapPixelWidth = this.mapWidth * TILE
    const mapPixelHeight = this.mapHeight * TILE

    if (mapPixelWidth > 160 || mapPixelHeight > 144) {
      this.cameras.main.setBounds(0, 0, Math.max(160, mapPixelWidth), Math.max(144, mapPixelHeight))
      this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    } else {
      const offsetX = (160 - mapPixelWidth) / 2
      const offsetY = (144 - mapPixelHeight) / 2
      this.cameras.main.setBounds(-offsetX, -offsetY, 160, 144)
      this.cameras.main.stopFollow()
      this.cameras.main.setScroll(-offsetX, -offsetY)
    }
  }

  setPlayerPos(tx: number, ty: number, facing: Facing) {
    const mode = GameState.paletteMode
    this.playerTX = tx
    this.playerTY = ty
    this.facing = facing
    this.player.setPosition(tx * TILE + TILE / 2, ty * TILE + TILE / 2)
    this.player.setTexture(`player_${mode}_${facing}`)
  }

  undoMove() {
    if (this.isMoving || this.undoStack.length === 0) return
    const cmd = this.undoStack.pop()
    if (!cmd) return

    cmd.undo()
    if (cmd.record.crate) {
      GameState.pushesCount = Math.max(0, GameState.pushesCount - 1)
    }
    GameState.movesCount = Math.max(0, GameState.movesCount - 1)
    GameState.uiBlocking = false

    const uiScene = this.scene.get('ui') as UIScene
    if (uiScene) {
      // no-op, victory banner removed
    }
  }

  resetLevel() {
    if (this.isMoving) return
    this.clearTargetEffects()
    this.children.removeAll()
    this.setupLevelLayout()
    this.renderBoard()

    const uiScene = this.scene.get('ui') as UIScene
    if (uiScene) {
      // no-op
    }
  }

  nextLevel() {
    if (GameState.currentLevelIndex < CAMPAIGN_LEVELS.length - 1) {
      GameState.currentLevelIndex++
      this.resetLevel()
    } else {
      this.scene.start('levelselect')
    }
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      const uiScene = this.scene.get('ui') as UIScene
      if (uiScene) uiScene.togglePauseMenu()
      return
    }

    if (GameState.uiBlocking) {
      if (this.summaryOpen) return
      const uiScene = this.scene.get('ui') as UIScene
      if (uiScene && uiScene.isPauseOpen()) return

      const kb = this.input.keyboard!
      if (
        Phaser.Input.Keyboard.JustDown(this.undoKey) ||
        Phaser.Input.Keyboard.JustDown(this.undoKeyAlt) ||
        Phaser.Input.Keyboard.JustDown(this.resetKey) ||
        kb.addKey('SPACE').isDown ||
        kb.addKey('ENTER').isDown
      ) {
        this.nextLevel()
      }
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.undoKey) || Phaser.Input.Keyboard.JustDown(this.undoKeyAlt)) {
      this.undoMove()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.resetLevel()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.hintKey)) {
      this.isHintMode = !this.isHintMode
      if (this.isHintMode) {
        this.showHint()
      } else {
        this.showToast('HINT MODE OFF')
      }
      return
    }

    if (this.isMoving) return

    const kb = this.input.keyboard!
    let dx = 0
    let dy = 0
    let nextFacing = this.facing

    const left = kb.addKey('LEFT').isDown || kb.addKey('A').isDown
    const right = kb.addKey('RIGHT').isDown || kb.addKey('D').isDown
    const up = kb.addKey('UP').isDown || kb.addKey('W').isDown
    const down = kb.addKey('DOWN').isDown || kb.addKey('S').isDown

    if (left) {
      dx = -1
      nextFacing = 'left'
    } else if (right) {
      dx = 1
      nextFacing = 'right'
    } else if (up) {
      dy = -1
      nextFacing = 'up'
    } else if (down) {
      dy = 1
      nextFacing = 'down'
    }

    if (dx !== 0 || dy !== 0) {
      this.facing = nextFacing
      this.tryMovePlayer(dx, dy)
    }
  }

  private tryMovePlayer(dx: number, dy: number) {
    let finalPlayerTX = this.playerTX + dx
    let finalPlayerTY = this.playerTY + dy
    const mode = GameState.paletteMode

    if (finalPlayerTX < 0 || finalPlayerTX >= this.mapWidth || finalPlayerTY < 0 || finalPlayerTY >= this.mapHeight) {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    const destTile = this.floorGrid[finalPlayerTY][finalPlayerTX]
    if (destTile === '#' || destTile === 'O') {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    const crateAtTarget = this.crates.find((c) => !c.destroyed && c.tx === finalPlayerTX && c.ty === finalPlayerTY)
    
    let crateFell = false
    let pushTX = -1
    let pushTY = -1

    if (crateAtTarget) {
      pushTX = finalPlayerTX + dx
      pushTY = finalPlayerTY + dy

      if (pushTX < 0 || pushTX >= this.mapWidth || pushTY < 0 || pushTY >= this.mapHeight) {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      let pushTile = this.floorGrid[pushTY][pushTX]
      if (pushTile === '#') {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      while (pushTile === 'I') {
        const nextTX = pushTX + dx
        const nextTY = pushTY + dy
        if (nextTX < 0 || nextTX >= this.mapWidth || nextTY < 0 || nextTY >= this.mapHeight) break
        const nextTile = this.floorGrid[nextTY][nextTX]
        if (nextTile === '#' || this.crates.some((c) => !c.destroyed && c.tx === nextTX && c.ty === nextTY)) break
        pushTX = nextTX
        pushTY = nextTY
        pushTile = nextTile
        if (pushTile === 'O') break // Slide into hole
      }

      const crateAtPush = this.crates.find((c) => !c.destroyed && c.tx === pushTX && c.ty === pushTY)
      if (crateAtPush) {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      if (pushTile === 'O') {
        crateFell = true
      }
    }

    while (this.floorGrid[finalPlayerTY][finalPlayerTX] === 'I') {
      const nextTX = finalPlayerTX + dx
      const nextTY = finalPlayerTY + dy
      if (nextTX < 0 || nextTX >= this.mapWidth || nextTY < 0 || nextTY >= this.mapHeight) break
      if (crateAtTarget && nextTX === pushTX && nextTY === pushTY && !crateFell) break
      const nextTile = this.floorGrid[nextTY][nextTX]
      if (nextTile === '#' || nextTile === 'O' || this.crates.some(c => !c.destroyed && c.tx === nextTX && c.ty === nextTY)) break
      finalPlayerTX = nextTX
      finalPlayerTY = nextTY
    }

    const crackedTiles: { tx: number; ty: number }[] = []
    
    if (this.floorGrid[this.playerTY][this.playerTX] === 'X') {
      this.setTile(this.playerTX, this.playerTY, 'O')
      crackedTiles.push({ tx: this.playerTX, ty: this.playerTY })
    }

    if (crateAtTarget && this.floorGrid[crateAtTarget.ty][crateAtTarget.tx] === 'X') {
      this.setTile(crateAtTarget.tx, crateAtTarget.ty, 'O')
      crackedTiles.push({ tx: crateAtTarget.tx, ty: crateAtTarget.ty })
    }

    const record: StepRecord = {
      playerPrevTX: this.playerTX,
      playerPrevTY: this.playerTY,
      playerNextTX: finalPlayerTX,
      playerNextTY: finalPlayerTY,
      facing: this.facing,
      crate: crateAtTarget || null,
      cratePrevTX: crateAtTarget ? crateAtTarget.tx : null,
      cratePrevTY: crateAtTarget ? crateAtTarget.ty : null,
      crateNextTX: crateAtTarget ? pushTX : null,
      crateNextTY: crateAtTarget ? pushTY : null,
      cratePrevDocked: crateAtTarget ? crateAtTarget.docked : null,
      crateNextDocked: crateAtTarget ? (this.floorGrid[pushTY][pushTX] === 'T' && !crateFell) : null,
      crackedTiles,
      crateDestroyed: crateFell,
    }

    this.isMoving = true
    this.playerTX = finalPlayerTX
    this.playerTY = finalPlayerTY
    
    if (crateAtTarget) {
      crateAtTarget.tx = pushTX
      crateAtTarget.ty = pushTY

      if (!crateFell) {
        const isTarget = this.floorGrid[pushTY][pushTX] === 'T'
        crateAtTarget.docked = isTarget
        if (isTarget) {
          crateAtTarget.sprite.setTint(mode === 'dmg' ? 0x9bbc0f : 0xffff44)
        } else {
          crateAtTarget.sprite.clearTint()
        }
      }

      // If the crate was docked and is now pushed off, the pad reverts to pulsing.
      if (!crateFell && record.cratePrevDocked && !crateAtTarget.docked && record.cratePrevTX !== null && record.cratePrevTY !== null) {
        this.setTargetEmpty(record.cratePrevTX, record.cratePrevTY)
      }
    }

    this.player.setTexture(`player_${mode}_${this.facing}`)

    const playerPX = finalPlayerTX * TILE + TILE / 2
    const playerPY = finalPlayerTY * TILE + TILE / 2

    import('../audio').then(a => crateAtTarget ? a.playPush() : a.playMove())

    this.tweens.add({
      targets: this.player,
      x: playerPX,
      y: playerPY,
      duration: 140,
      ease: 'Quad.easeOut',
    })

    if (crateAtTarget) {
      const cratePX = pushTX * TILE + TILE / 2
      const cratePY = pushTY * TILE + TILE / 2

      this.tweens.add({
        targets: crateAtTarget.sprite,
        x: cratePX,
        y: cratePY,
        duration: 140,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (crateFell) {
            import('../audio').then(a => a.playFall())
            this.cameras.main.shake(150, 0.01)
            this.tweens.add({
              targets: crateAtTarget.sprite,
              scale: 0,
              duration: 200,
              onComplete: () => {
                crateAtTarget.sprite.setVisible(false)
                crateAtTarget.destroyed = true
                this.setTile(pushTX, pushTY, '.')
                this.finishMove(record)
              }
            })
          } else {
            if (crateAtTarget.docked) {
              import('../audio').then(a => a.playDock())
              const totalTargets = this.floorGrid.flat().filter((t) => t === 'T').length
              const dockedCount = this.crates.filter((c) => !c.destroyed && c.docked).length
              const isWin = totalTargets > 0 && dockedCount === totalTargets
              this.setTargetLit(pushTX, pushTY, true, isWin)
              if (isWin) this.playWinFlourish(pushTX, pushTY)
              this.tweens.add({
                targets: crateAtTarget.sprite,
                scale: 1.2,
                duration: 80,
                yoyo: true,
                ease: 'Sine.easeInOut'
              })
            }
            this.finishMove(record)
          }
        },
      })
    } else {
      this.time.delayedCall(140, () => {
        this.finishMove(record)
      })
    }
  }

  private finishMove(record: StepRecord) {
    this.isMoving = false
    GameState.movesCount++
    if (record.crate) GameState.pushesCount++
    this.undoStack.push(new MoveCommand(this, record))
    this.checkWinCondition()
    
    if (this.isHintMode && !this.isMoving) {
      this.showHint()
    }
  }

  private checkWinCondition() {
    const totalTargets = this.floorGrid.flat().filter((tile) => tile === 'T').length
    const dockedCrates = this.crates.filter((c) => !c.destroyed && c.docked).length

    if (totalTargets > 0 && dockedCrates === totalTargets) {
      GameState.uiBlocking = true
      // Claimed here, not when the panel opens ~900ms later at the end of the
      // victory bounce. The advance-on-any-input paths key off `uiBlocking`,
      // so that gap was a window in which a tap cleared the level immediately
      // *and* left the fade to clear the next one — two stages from one press.
      // A touch player taps during the bounce constantly; on a keyboard you
      // would have to press a key during the animation to see it (#97).
      this.summaryOpen = true
      const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
      // Read before saving: afterwards `bestMoves` includes this attempt, and
      // every clear would look like a personal best.
      const previous = SaveSystem.getLevelData(levelConfig.id)
      const moves = GameState.movesCount
      const stars = SaveSystem.saveLevelCompletion(levelConfig.id, moves, levelConfig.parMoves)
      const isBest = !previous.completed || moves < previous.bestMoves

      const nextLevel = GameState.currentLevelIndex + 1
      const savedStr = localStorage.getItem('cart-crate-level')
      const savedLvl = savedStr ? parseInt(savedStr, 10) : 0
      if (nextLevel > savedLvl && nextLevel < CAMPAIGN_LEVELS.length) {
        localStorage.setItem('cart-crate-level', nextLevel.toString())
      }

      import('../audio').then(a => a.playWin())

      // 3 bouncy jumps for joy
      this.tweens.add({
        targets: this.player,
        y: this.player.y - 8,
        yoyo: true,
        repeat: 2,
        duration: 150,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          // The level used to fade straight into the next one, so the numbers
          // it already tracked — moves against par, stars, your best — were
          // never shown (#66).
          // The HUD is its own scene and renders above anything added here.
          this.scene.setVisible(false, 'ui')
          // Stars as a plain count, not glyphs: Press Start 2P has no U+2605,
          // so a row of them falls back to another face mid-panel.
          showRunSummary(this, {
            title: `LEVEL ${levelConfig.id} CLEAR`,
            palette: PAL,
            stats: [
              { label: 'MOVES', value: `${moves}`, highlight: isBest },
              { label: 'PAR', value: `${levelConfig.parMoves}` },
              { label: 'STARS', value: `${stars}/3` },
              {
                label: 'BEST',
                value: `${isBest ? moves : previous.bestMoves}`,
              },
            ],
            onDismiss: () => {
              // `summaryOpen` deliberately stays true here; `setupLevelLayout`
              // clears it when the next level builds.
              //
              // The panel dismisses on pointerdown. Clearing the gate here left
              // the matching *pointerup* — same tap, milliseconds later — to
              // find it already false and run the advance-on-any-input path on
              // top of the fade, so a tap cleared two levels at once. Keyboard
              // never saw it, because Z produces no pointerup (#97).
              this.scene.setVisible(true, 'ui')
              this.cameras.main.fadeOut(400, 0, 0, 0)
            },
          })
        }
      })

      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        GameState.currentLevelIndex++
        if (GameState.currentLevelIndex >= CAMPAIGN_LEVELS.length) {
          GameState.currentLevelIndex = 0
          this.scene.start('mainmenu')
        } else {
          this.scene.restart()
        }
      })
    }
  }

  skipLevel() {
    if (GameState.uiBlocking) return
    GameState.uiBlocking = true

    const nextLevel = GameState.currentLevelIndex + 1
    const savedStr = localStorage.getItem('cart-crate-level')
    const savedLvl = savedStr ? parseInt(savedStr, 10) : 0
    if (nextLevel > savedLvl && nextLevel < CAMPAIGN_LEVELS.length) {
      localStorage.setItem('cart-crate-level', nextLevel.toString())
    }

    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      GameState.currentLevelIndex++
      if (GameState.currentLevelIndex >= CAMPAIGN_LEVELS.length) {
        GameState.currentLevelIndex = 0
        this.scene.start('mainmenu')
      } else {
        this.scene.restart()
      }
    })
  }

  showHint() {
    if (this.isMoving || GameState.uiBlocking) return
    const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex]
    if (!levelConfig || !levelConfig.solution) {
      this.showToast('NO HINT AVAILABLE')
      this.isHintMode = false
      return
    }

    // Build the string of moves the player has made
    let path = ''
    for (const cmd of this.undoStack) {
      if (cmd.record.playerNextTX > cmd.record.playerPrevTX) path += 'R'
      else if (cmd.record.playerNextTX < cmd.record.playerPrevTX) path += 'L'
      else if (cmd.record.playerNextTY > cmd.record.playerPrevTY) path += 'D'
      else if (cmd.record.playerNextTY < cmd.record.playerPrevTY) path += 'U'
    }

    if (!levelConfig.solution.startsWith(path)) {
      this.showToast('UNDO TO GET BACK ON TRACK')
      return
    }

    if (path.length >= levelConfig.solution.length) {
      return // Already solved
    }

    const nextMove = levelConfig.solution[path.length]
    let arrowAngle = 0
    if (nextMove === 'R') arrowAngle = 0
    if (nextMove === 'D') arrowAngle = 90
    if (nextMove === 'L') arrowAngle = 180
    if (nextMove === 'U') arrowAngle = -90

    // Draw the glowing arrow on the player
    const arrow = this.add.graphics()
    arrow.fillStyle(0xffcc00, 1)
    
    // Draw a simple triangle arrow
    arrow.beginPath()
    arrow.moveTo(-4, -4)
    arrow.lineTo(4, 0)
    arrow.lineTo(-4, 4)
    arrow.closePath()
    arrow.fillPath()

    arrow.x = this.player.x
    arrow.y = this.player.y
    arrow.angle = arrowAngle
    arrow.setDepth(200)

    import('../audio').then(a => a.playMenuSelect())

    this.tweens.add({
      targets: arrow,
      alpha: 0,
      y: arrow.y + (nextMove === 'U' ? -6 : nextMove === 'D' ? 6 : 0),
      x: arrow.x + (nextMove === 'L' ? -6 : nextMove === 'R' ? 6 : 0),
      duration: 1000,
      ease: 'Quad.easeOut',
      onComplete: () => arrow.destroy()
    })
  }

  showToast(msg: string) {
    const toast = this.add.text(this.cameras.main.worldView.centerX, this.cameras.main.worldView.centerY - 20, msg, {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#ffcc00',
      backgroundColor: '#0f380f',
      padding: { x: 4, y: 2 },
      resolution: 2,
    }).setOrigin(0.5).setDepth(300)

    this.tweens.add({
      targets: toast,
      alpha: 0,
      y: toast.y - 10,
      delay: 1000,
      duration: 500,
      onComplete: () => toast.destroy()
    })
  }
}
