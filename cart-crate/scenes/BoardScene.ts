import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState } from '../state'
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

  // Base floor tilemap grid (# wall, . floor, T target)
  private floorGrid: string[][] = [
    ['#','#','#','#','#','#','#','#','#','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','.','.','.','.','.','.','.','.','#'],
    ['#','#','#','#','#','#','#','#','#','#'],
  ]

  private crates: CrateInstance[] = []

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

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  setupLevelLayout() {
    // Initial Level Layout:
    // P at (2, 2), Crate 1 at (4, 3) -> Target at (7, 3)
    // Crate 2 at (4, 5) -> Target at (7, 5)
    this.playerTX = 2
    this.playerTY = 2
    this.facing = 'down'
    this.isMoving = false

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
          // Normalize floorGrid to '.' and place Crate entity
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

    // Spawn player sprite
    const px = this.playerTX * TILE + TILE / 2
    const py = this.playerTY * TILE + TILE / 2
    this.player = this.add.sprite(px, py, `player_${mode}_${this.facing}`).setDepth(10)
  }

  reloadPalette() {
    this.children.removeAll()
    this.renderBoard()
  }

  update() {
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

    // Map boundary check
    if (targetTX < 0 || targetTX >= this.mapWidth || targetTY < 0 || targetTY >= this.mapHeight) {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    // Wall collision check
    if (this.floorGrid[targetTY][targetTX] === '#') {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    // Crate collision check
    const crateAtTarget = this.crates.find((c) => c.tx === targetTX && c.ty === targetTY)

    if (crateAtTarget) {
      const pushTX = targetTX + dx
      const pushTY = targetTY + dy

      // Check push space boundaries & walls
      if (pushTX < 0 || pushTX >= this.mapWidth || pushTY < 0 || pushTY >= this.mapHeight) {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }
      if (this.floorGrid[pushTY][pushTX] === '#') {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      // Check if another crate blocks the push (cannot push 2 crates)
      const crateAtPush = this.crates.find((c) => c.tx === pushTX && c.ty === pushTY)
      if (crateAtPush) {
        this.player.setTexture(`player_${mode}_${this.facing}`)
        return
      }

      // PUSH IS VALID!
      this.isMoving = true
      this.playerTX = targetTX
      this.playerTY = targetTY
      crateAtTarget.tx = pushTX
      crateAtTarget.ty = pushTY

      // Check if crate lands on target tile
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

      // Animate player move
      this.tweens.add({
        targets: this.player,
        x: playerPX,
        y: playerPY,
        duration: 120,
        ease: 'Linear',
      })

      // Animate crate push
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
          this.checkWinCondition()
        },
      })
      return
    }

    // Standard player step move (no crate push)
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
