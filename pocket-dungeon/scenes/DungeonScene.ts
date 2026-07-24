import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState, TurnState } from '../state'
import { MapGenerator } from '../MapGenerator'

type Facing = 'down' | 'up' | 'left' | 'right'

interface EnemyInstance {
  id: string
  name: string
  sprite: Phaser.GameObjects.Sprite
  tx: number
  ty: number
  hp: number
  maxHp: number
  atk: number
}

export class DungeonScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite
  private playerTX = 2
  private playerTY = 2
  private facing: Facing = 'down'
  private mapWidth = 32
  private mapHeight = 32
  private grid: string[] = []

  private enemies: EnemyInstance[] = []
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super('dungeon')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    this.renderDungeon()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  renderDungeon() {
    const mode = GameState.paletteMode
    this.enemies = []

    const generator = new MapGenerator(this.mapWidth, this.mapHeight, GameState.seed + GameState.floorDepth)
    const { grid, startX, startY } = generator.generate(GameState.floorDepth)
    this.grid = grid
    this.playerTX = startX
    this.playerTY = startY

    this.cameras.main.setBounds(0, 0, this.mapWidth * TILE, this.mapHeight * TILE)

    let biome = 'cellar'
    if (GameState.floorDepth > 4) biome = 'catacomb'
    if (GameState.floorDepth > 8) biome = 'vault'
    
    const tileKey = mode === 'dmg' ? 'tiles_dmg' : `tiles_gbc_${biome}`

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.grid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        if (char === '#') {
          this.add.image(px, py, tileKey, 1)
        } else if (char === 'S') {
          this.add.image(px, py, tileKey, 2) // Stairs
        } else {
          this.add.image(px, py, tileKey, 0) // Floor
        }

        if (char === 'E') {
          const ratSprite = this.add.sprite(px, py, `rat_${mode}`).setDepth(5)
          this.enemies.push({
            id: `rat_${x}_${y}`,
            name: 'Cellar Rat',
            sprite: ratSprite,
            tx: x,
            ty: y,
            hp: 8,
            maxHp: 8,
            atk: 2,
          })
        }
      }
    }

    const px = this.playerTX * TILE + TILE / 2
    const py = this.playerTY * TILE + TILE / 2
    this.player = this.add.sprite(px, py, `hero_${mode}_${this.facing}`).setDepth(10)
    
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
  }

  reloadPalette() {
    this.children.removeAll()
    this.renderDungeon()
  }

  update() {
    if (GameState.turnState !== TurnState.PLAYER_TURN || GameState.uiBlocking) return

    let dx = 0
    let dy = 0
    let nextFacing = this.facing

    if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A)) {
      dx = -1
      nextFacing = 'left'
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D)) {
      dx = 1
      nextFacing = 'right'
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W)) {
      dy = -1
      nextFacing = 'up'
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S)) {
      dy = 1
      nextFacing = 'down'
    }

    if (dx !== 0 || dy !== 0) {
      this.facing = nextFacing
      this.handlePlayerAction(dx, dy)
    }
  }

  private handlePlayerAction(dx: number, dy: number) {
    const targetTX = this.playerTX + dx
    const targetTY = this.playerTY + dy
    const mode = GameState.paletteMode

    // Check map bounds
    if (targetTX < 0 || targetTX >= this.mapWidth || targetTY < 0 || targetTY >= this.mapHeight) {
      this.player.setTexture(`hero_${mode}_${this.facing}`)
      return
    }

    // Check wall collision
    if (this.grid[targetTY][targetTX] === '#') {
      this.player.setTexture(`hero_${mode}_${this.facing}`)
      return
    }

    // Check enemy bump attack
    const enemyAtTarget = this.enemies.find((e) => e.tx === targetTX && e.ty === targetTY && e.hp > 0)
    if (enemyAtTarget) {
      this.player.setTexture(`hero_${mode}_${this.facing}`)
      this.executeMeleeAttack(enemyAtTarget)
      return
    }

    // Execute player grid step move
    GameState.turnState = TurnState.ANIMATING
    this.playerTX = targetTX
    this.playerTY = targetTY
    this.player.setTexture(`hero_${mode}_${this.facing}`)

    const px = targetTX * TILE + TILE / 2
    const py = targetTY * TILE + TILE / 2

    this.tweens.add({
      targets: this.player,
      x: px,
      y: py,
      duration: 100,
      onComplete: () => {
        if (this.grid[targetTY][targetTX] === 'S') {
          GameState.floorDepth++
          this.scene.restart()
          return
        }
        GameState.turnsCount++
        this.processEnemyTurn()
      },
    })
  }

  private executeMeleeAttack(enemy: EnemyInstance) {
    GameState.turnState = TurnState.ANIMATING
    const damage = GameState.playerAtk
    enemy.hp -= damage

    // Bump animation
    const origX = this.player.x
    const origY = this.player.y
    const targetX = enemy.sprite.x
    const targetY = enemy.sprite.y

    this.showDamageText(targetX, targetY - 6, `-${damage}`, '#ff4444')

    this.tweens.add({
      targets: this.player,
      x: origX + (targetX - origX) * 0.4,
      y: origY + (targetY - origY) * 0.4,
      duration: 60,
      yoyo: true,
      onComplete: () => {
        if (enemy.hp <= 0) {
          this.tweens.add({
            targets: enemy.sprite,
            alpha: 0,
            duration: 150,
            onComplete: () => {
              enemy.sprite.setVisible(false)
            },
          })
        }
        GameState.turnsCount++
        this.processEnemyTurn()
      },
    })
  }

  private processEnemyTurn() {
    GameState.turnState = TurnState.ENEMY_TURN

    const activeEnemies = this.enemies.filter((e) => e.hp > 0)
    if (activeEnemies.length === 0) {
      GameState.turnState = TurnState.PLAYER_TURN
      return
    }

    let completed = 0
    activeEnemies.forEach((enemy) => {
      const dist = Math.abs(enemy.tx - this.playerTX) + Math.abs(enemy.ty - this.playerTY)

      if (dist === 1) {
        // Enemy attacks player
        GameState.playerHp = Math.max(0, GameState.playerHp - enemy.atk)
        this.showDamageText(this.player.x, this.player.y - 6, `-${enemy.atk}`, '#ffcc00')

        // Enemy bump animation
        this.tweens.add({
          targets: enemy.sprite,
          x: enemy.sprite.x + (this.player.x - enemy.sprite.x) * 0.3,
          y: enemy.sprite.y + (this.player.y - enemy.sprite.y) * 0.3,
          duration: 60,
          yoyo: true,
          onComplete: () => {
            completed++
            if (completed >= activeEnemies.length) GameState.turnState = TurnState.PLAYER_TURN
          },
        })
      } else {
        // Enemy moves 1 step closer to player
        let dx = 0
        let dy = 0
        if (Math.abs(this.playerTX - enemy.tx) >= Math.abs(this.playerTY - enemy.ty)) {
          dx = this.playerTX > enemy.tx ? 1 : -1
        } else {
          dy = this.playerTY > enemy.ty ? 1 : -1
        }

        const nextTX = enemy.tx + dx
        const nextTY = enemy.ty + dy
        if (this.grid[nextTY][nextTX] !== '#' && !(nextTX === this.playerTX && nextTY === this.playerTY)) {
          enemy.tx = nextTX
          enemy.ty = nextTY
          this.tweens.add({
            targets: enemy.sprite,
            x: nextTX * TILE + TILE / 2,
            y: nextTY * TILE + TILE / 2,
            duration: 100,
            onComplete: () => {
              completed++
              if (completed >= activeEnemies.length) GameState.turnState = TurnState.PLAYER_TURN
            },
          })
        } else {
          completed++
          if (completed >= activeEnemies.length) GameState.turnState = TurnState.PLAYER_TURN
        }
      }
    })
  }

  private showDamageText(x: number, y: number, text: string, color: string) {
    const txt = this.add.text(x, y, text, {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: color,
      resolution: 2,
    }).setOrigin(0.5).setDepth(20)

    this.tweens.add({
      targets: txt,
      y: y - 10,
      alpha: 0,
      duration: 500,
      onComplete: () => txt.destroy(),
    })
  }
}
