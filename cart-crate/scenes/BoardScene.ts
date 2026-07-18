import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState } from '../state'
import { MoveCommand, StepRecord } from '../commands'
import type { UIScene } from './UIScene'

type Facing = 'down' | 'up' | 'left' | 'right'

export interface CrateInstance {
  id: number
  sprite: Phaser.GameObjects.Sprite
  tx: number
  ty: number
  docked: boolean
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
  private crates: CrateInstance[] = []
  private undoStack: MoveCommand[] = []

  private undoKey!: Phaser.Input.Keyboard.Key
  private resetKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super('board')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    this.cameras.main.setBounds(0, 0, GBC_WIDTH, GBC_HEIGHT)

    this.setupLevelLayout()
    this.renderBoard()

    this.input.keyboard!.createCursorKeys()
    this.input.keyboard!.addKeys('W,A,S,D')

    this.undoKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.resetKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  setupLevelLayout() {
    this.playerTX = 2
    this.playerTY = 2
    this.facing = 'down'
    this.isMoving = false
    this.undoStack = []

    this.floorGrid = [
      ['#','#','#','#','#','#','#','#','#','#'],
      ['#','.','.','.','.','.','.','.','.','#'],
      ['#','.','.','.','.','.','.','.','.','#'],
      ['#','.','.','C','.','.','.','T','.','#'],
      ['#','.','.','.','.','.','.','.','.','#'],
      ['#','.','.','C','.','.','.','T','.','#'],
      ['#','.','.','.','.','.','.','.','.','#'],
      ['#','.','.','.','.','.','.','.','.','#'],
      ['#','#','#','#','#','#','#','#','#','#'],
    ]
  }

  renderBoard() {
    const mode = GameState.paletteMode
    this.crates = []
    let crateIdCounter = 1

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.floorGrid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        if (char === '#') {
          this.add.image(px, py, `tiles_${mode}`, 1)
        } else if (char === 'T') {
          this.add.image(px, py, `target_${mode}`)
        } else {
          this.add.image(px, py, `tiles_${mode}`, 0)
        }

        if (char === 'C') {
          this.floorGrid[y][x] = '.'
          const crateSprite = this.add.sprite(px, py, `crate_${mode}`).setDepth(5)
          this.crates.push({
            id: crateIdCounter++,
            sprite: crateSprite,
            tx: x,
            ty: y,
            docked: false,
          })
        }
      }
    }

    const px = this.playerTX * TILE + TILE / 2
    const py = this.playerTY * TILE + TILE / 2
    this.player = this.add.sprite(px, py, `player_${mode}_${this.facing}`).setDepth(10)
  }

  reloadPalette() {
    this.children.removeAll()
    this.renderBoard()
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
      uiScene.hideVictoryBanner()
    }
  }

  resetLevel() {
    if (this.isMoving) return
    this.children.removeAll()
    this.setupLevelLayout()
    this.renderBoard()
    GameState.movesCount = 0
    GameState.pushesCount = 0
    GameState.uiBlocking = false

    const uiScene = this.scene.get('ui') as UIScene
    if (uiScene) {
      uiScene.hideVictoryBanner()
    }
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.undoKey)) {
      this.undoMove()
      return
    }

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.resetLevel()
      return
    }

    if (this.isMoving || GameState.uiBlocking) return

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
    const targetTX = this.playerTX + dx
    const targetTY = this.playerTY + dy
    const mode = GameState.paletteMode

    if (targetTX < 0 || targetTX >= this.mapWidth || targetTY < 0 || targetTY >= this.mapHeight) {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    if (this.floorGrid[targetTY][targetTX] === '#') {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    const crateAtTarget = this.crates.find((c) => c.tx === targetTX && c.ty === targetTY)

    if (crateAtTarget) {
      const pushTX = targetTX + dx
      const pushTY = targetTY + dy

      if (pushTX < 0 || pushTX >= this.mapWidth || pushTY < 0 || pushTY >= this.mapHeight) {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }
      if (this.floorGrid[pushTY][pushTX] === '#') {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      const crateAtPush = this.crates.find((c) => c.tx === pushTX && c.ty === pushTY)
      if (crateAtPush) {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      // Record step command for UNDO
      const record: StepRecord = {
        playerPrevTX: this.playerTX,
        playerPrevTY: this.playerTY,
        playerNextTX: targetTX,
        playerNextTY: targetTY,
        facing: this.facing,
        crate: crateAtTarget,
        cratePrevTX: crateAtTarget.tx,
        cratePrevTY: crateAtTarget.ty,
        crateNextTX: pushTX,
        crateNextTY: pushTY,
        cratePrevDocked: crateAtTarget.docked,
        crateNextDocked: this.floorGrid[pushTY][pushTX] === 'T',
      }

      this.isMoving = true
      this.playerTX = targetTX
      this.playerTY = targetTY
      crateAtTarget.tx = pushTX
      crateAtTarget.ty = pushTY

      const isTarget = this.floorGrid[pushTY][pushTX] === 'T'
      crateAtTarget.docked = isTarget
      if (isTarget) {
        crateAtTarget.sprite.setTint(mode === 'dmg' ? 0x9bbc0f : 0xffff44)
      } else {
        crateAtTarget.sprite.clearTint()
      }

      this.player.setTexture(`player_${mode}_${this.facing}`)

      const playerPX = targetTX * TILE + TILE / 2
      const playerPY = targetTY * TILE + TILE / 2
      const cratePX = pushTX * TILE + TILE / 2
      const cratePY = pushTY * TILE + TILE / 2

      this.tweens.add({
        targets: this.player,
        x: playerPX,
        y: playerPY,
        duration: 120,
        ease: 'Linear',
      })

      this.tweens.add({
        targets: crateAtTarget.sprite,
        x: cratePX,
        y: cratePY,
        duration: 120,
        ease: 'Linear',
        onComplete: () => {
          this.isMoving = false
          GameState.movesCount++
          GameState.pushesCount++
          this.undoStack.push(new MoveCommand(this, record))
          this.checkWinCondition()
        },
      })
      return
    }

    // Standard player step move (no crate push)
    const record: StepRecord = {
      playerPrevTX: this.playerTX,
      playerPrevTY: this.playerTY,
      playerNextTX: targetTX,
      playerNextTY: targetTY,
      facing: this.facing,
      crate: null,
      cratePrevTX: null,
      cratePrevTY: null,
      crateNextTX: null,
      crateNextTY: null,
      cratePrevDocked: null,
      crateNextDocked: null,
    }

    this.isMoving = true
    this.playerTX = targetTX
    this.playerTY = targetTY
    this.player.setTexture(`player_${mode}_${this.facing}`)

    const targetPX = targetTX * TILE + TILE / 2
    const targetPY = targetTY * TILE + TILE / 2

    this.tweens.add({
      targets: this.player,
      x: targetPX,
      y: targetPY,
      duration: 120,
      ease: 'Linear',
      onComplete: () => {
        this.isMoving = false
        GameState.movesCount++
        this.undoStack.push(new MoveCommand(this, record))
      },
    })
  }

  private checkWinCondition() {
    const totalTargets = this.floorGrid.flat().filter((tile) => tile === 'T').length
    const dockedCrates = this.crates.filter((c) => c.docked).length

    if (totalTargets > 0 && dockedCrates === totalTargets) {
      GameState.uiBlocking = true
      const uiScene = this.scene.get('ui') as UIScene
      if (uiScene) {
        uiScene.showVictoryBanner()
      }
    }
  }
}
