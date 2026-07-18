import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState } from '../state'

type Facing = 'down' | 'up' | 'left' | 'right'

export class BoardScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite
  private playerTX = 2
  private playerTY = 2
  private facing: Facing = 'down'
  private isMoving = false
  private mapWidth = 10
  private mapHeight = 9
  private grid: string[] = [
    '##########',
    '#........#',
    '#.P......#',
    '#...C....#',
    '#...T....#',
    '#........#',
    '#........#',
    '#........#',
    '##########',
  ]

  private wallsLayer!: Phaser.GameObjects.Group
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('board')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')
    this.cameras.main.setBounds(0, 0, GBC_WIDTH, GBC_HEIGHT)

    this.renderBoard()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  renderBoard() {
    const mode = GameState.paletteMode

    // Draw background grid tiles
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.grid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        if (char === '#') {
          this.add.image(px, py, `tiles_${mode}`, 1)
        } else if (char === 'T') {
          this.add.image(px, py, `target_${mode}`)
        } else {
          this.add.image(px, py, `tiles_${mode}`, 0)
        }

        if (char === 'P') {
          this.playerTX = x
          this.playerTY = y
        }
      }
    }

    // Spawn player sprite
    const px = this.playerTX * TILE + TILE / 2
    const py = this.playerTY * TILE + TILE / 2
    this.player = this.add.sprite(px, py, `player_${mode}_${this.facing}`)
    this.player.setDepth(10)
  }

  reloadPalette() {
    const mode = GameState.paletteMode
    this.children.removeAll()
    this.renderBoard()
  }

  update() {
    if (this.isMoving || GameState.uiBlocking) return

    let dx = 0
    let dy = 0
    let nextFacing = this.facing

    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      dx = -1
      nextFacing = 'left'
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      dx = 1
      nextFacing = 'right'
    } else if (this.cursors.up.isDown || this.wasd.W.isDown) {
      dy = -1
      nextFacing = 'up'
    } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
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

    // Check map boundaries
    if (targetTX < 0 || targetTX >= this.mapWidth || targetTY < 0 || targetTY >= this.mapHeight) {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    // Check wall collision
    const targetTile = this.grid[targetTY][targetTX]
    if (targetTile === '#') {
      this.player.setTexture(`player_${mode}_${this.facing}`)
      return
    }

    // Execute smooth 16x16 tile step move
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
}
