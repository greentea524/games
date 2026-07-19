import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import { SaveSystem } from '../save'
import { MoveCommand, StepRecord } from '../commands'
import type { UIScene } from './UIScene'

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
  private mapWidth = 10
  private mapHeight = 9

  private floorGrid: string[][] = []
  private floorSprites: Phaser.GameObjects.Image[][] = []
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
    let crateIdCounter = 1

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.floorGrid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        if (char === '#') {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('wall'))
        } else if (char === 'T') {
          this.floorSprites[y][x] = this.add.image(px, py, tKey('floor'))
          const targetSprite = this.add.image(px, py, tKey('target'))
          this.tweens.add({
            targets: targetSprite,
            alpha: 0.2,
            duration: 800,
            yoyo: true,
            repeat: -1,
          })
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
            this.tweens.add({
              targets: targetSprite,
              alpha: 0.2,
              duration: 800,
              yoyo: true,
              repeat: -1,
            })
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
        else if (key.startsWith('target_')) child.setTexture(tKey('target'))
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
      this.showHint()
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
  }

  private checkWinCondition() {
    const totalTargets = this.floorGrid.flat().filter((tile) => tile === 'T').length
    const dockedCrates = this.crates.filter((c) => !c.destroyed && c.docked).length

    if (totalTargets > 0 && dockedCrates === totalTargets) {
      GameState.uiBlocking = true
      const levelConfig = CAMPAIGN_LEVELS[GameState.currentLevelIndex] || CAMPAIGN_LEVELS[0]
      SaveSystem.saveLevelCompletion(levelConfig.id, GameState.movesCount, levelConfig.parMoves)

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
          this.cameras.main.fadeOut(400, 0, 0, 0)
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
      return
    }

    // Build the string of moves the player has made
    let path = ''
    for (const record of this.undoStack) {
      if (record.playerNextTX > record.playerPrevTX) path += 'R'
      else if (record.playerNextTX < record.playerPrevTX) path += 'L'
      else if (record.playerNextTY > record.playerPrevTY) path += 'D'
      else if (record.playerNextTY < record.playerPrevTY) path += 'U'
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
      fontSize: '6px',
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
