import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT } from '../constants'
import { GameState, TurnState } from '../state'
import { MapGenerator } from '../MapGenerator'
import { RNG } from '../rng'
import {
  AIType, AIContext, rollEnemies, getBiome,
  chaserAI, cowardAI, rangerAI, sleeperAI, splitterAI,
  ENEMY_DEFS,
} from '../enemies'
import { BossState, bossAI, getBossPhase } from '../boss'

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
  ai: AIType | 'boss'
  awake?: boolean       // For sleeper AI
  bossState?: BossState // For boss AI
  isSplit?: boolean     // Splitter children don't split again
}

export class DungeonScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite
  private playerTX = 2
  private playerTY = 2
  private facing: Facing = 'down'
  private mapWidth = 32
  private mapHeight = 32
  private grid: string[] = []
  private rng!: RNG

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
    this.rng = new RNG(GameState.seed + GameState.floorDepth)

    const generator = new MapGenerator(this.mapWidth, this.mapHeight, GameState.seed + GameState.floorDepth)
    const { grid, startX, startY } = generator.generate(GameState.floorDepth)
    this.grid = grid
    this.playerTX = startX
    this.playerTY = startY

    this.cameras.main.setBounds(0, 0, this.mapWidth * TILE, this.mapHeight * TILE)

    const biome = getBiome(GameState.floorDepth)
    const tileKey = mode === 'dmg' ? 'tiles_dmg' : `tiles_gbc_${biome}`

    // Render tiles
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.grid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        if (char === '#') {
          this.add.image(px, py, tileKey, 1)
        } else if (char === 'S') {
          this.add.image(px, py, tileKey, 2)
        } else {
          this.add.image(px, py, tileKey, 0)
        }
      }
    }

    // Spawn enemies using budget system
    const spawnList = rollEnemies(GameState.floorDepth, this.rng)
    
    // Collect all 'E' positions from the grid
    const spawnPositions: { x: number; y: number }[] = []
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (this.grid[y][x] === 'E') {
          spawnPositions.push({ x, y })
        }
      }
    }

    // Place enemies at spawn positions
    const shuffled = this.rng.shuffle(spawnPositions)
    for (let i = 0; i < Math.min(spawnList.length, shuffled.length); i++) {
      const pos = shuffled[i]
      const { defKey, def } = spawnList[i]
      const px = pos.x * TILE + TILE / 2
      const py = pos.y * TILE + TILE / 2
      const sprite = this.add.sprite(px, py, `${def.spriteKey}_${mode}`).setDepth(5)
      this.enemies.push({
        id: `${defKey}_${pos.x}_${pos.y}`,
        name: def.name,
        sprite,
        tx: pos.x,
        ty: pos.y,
        hp: def.hp,
        maxHp: def.hp,
        atk: def.atk,
        ai: def.ai,
        awake: def.ai !== 'sleeper',
      })
    }

    // Spawn boss on floor 12
    if (GameState.floorDepth === 12) {
      // Find the stairs position and place boss nearby
      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) {
          if (this.grid[y][x] === 'S') {
            // Place boss 2 tiles from stairs
            const bx = x - 2 >= 0 && this.grid[y][x - 2] !== '#' ? x - 2 : x
            const by = y
            const bpx = bx * TILE + TILE / 2
            const bpy = by * TILE + TILE / 2
            const bossSprite = this.add.sprite(bpx, bpy, `boss_${mode}`).setDepth(5)
            this.enemies.push({
              id: 'vault_guardian',
              name: 'Vault Guardian',
              sprite: bossSprite,
              tx: bx,
              ty: by,
              hp: 40,
              maxHp: 40,
              atk: 6,
              ai: 'boss',
              bossState: { phase: 'rage', summonCooldown: 3 },
            })
          }
        }
      }
    }

    // Place player sprite
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
          // Splitter: spawn 2 mini-slimes on death
          if (enemy.ai === 'splitter' && !enemy.isSplit) {
            this.spawnSplitChildren(enemy)
          }
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

  private spawnSplitChildren(parent: EnemyInstance) {
    const mode = GameState.paletteMode
    const offsets = [
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    ]
    let spawned = 0
    for (const off of offsets) {
      if (spawned >= 2) break
      const nx = parent.tx + off.dx
      const ny = parent.ty + off.dy
      if (nx >= 0 && nx < this.mapWidth && ny >= 0 && ny < this.mapHeight &&
          this.grid[ny][nx] !== '#' &&
          !this.enemies.some(e => e.tx === nx && e.ty === ny && e.hp > 0) &&
          !(nx === this.playerTX && ny === this.playerTY)) {
        const px = nx * TILE + TILE / 2
        const py = ny * TILE + TILE / 2
        const sprite = this.add.sprite(px, py, `slime_${mode}`).setDepth(5).setScale(0.7)
        this.enemies.push({
          id: `split_${nx}_${ny}_${Date.now()}`,
          name: 'Mini Slime',
          sprite,
          tx: nx,
          ty: ny,
          hp: 4,
          maxHp: 4,
          atk: 1,
          ai: 'chaser',
          isSplit: true,
        })
        spawned++
      }
    }
  }

  private processEnemyTurn() {
    GameState.turnState = TurnState.ENEMY_TURN

    const activeEnemies = this.enemies.filter((e) => e.hp > 0)
    if (activeEnemies.length === 0) {
      GameState.turnState = TurnState.PLAYER_TURN
      return
    }

    let completed = 0
    const total = activeEnemies.length

    const finishOne = () => {
      completed++
      if (completed >= total) GameState.turnState = TurnState.PLAYER_TURN
    }

    activeEnemies.forEach((enemy) => {
      const ctx: AIContext = {
        selfTX: enemy.tx,
        selfTY: enemy.ty,
        playerTX: this.playerTX,
        playerTY: this.playerTY,
        grid: this.grid,
        enemies: this.enemies.filter(e => e.hp > 0),
        rng: this.rng,
      }

      // --- Boss AI ---
      if (enemy.ai === 'boss' && enemy.bossState) {
        const { action, newState } = bossAI(
          enemy.tx, enemy.ty, this.playerTX, this.playerTY,
          enemy.hp, enemy.maxHp, enemy.bossState, this.grid,
          this.enemies.filter(e => e.hp > 0 && e.id !== enemy.id)
        )
        enemy.bossState = newState

        if (action.type === 'summon') {
          this.showDamageText(enemy.sprite.x, enemy.sprite.y - 8, 'SUMMON!', '#ff00ff')
          this.spawnBossMinion(enemy)
          finishOne()
          return
        }

        if (action.type === 'attack') {
          const dmg = enemy.bossState.phase === 'desperate' ? enemy.atk * 2 : enemy.atk
          GameState.playerHp = Math.max(0, GameState.playerHp - dmg)
          this.showDamageText(this.player.x, this.player.y - 6, `-${dmg}`, '#ffcc00')
          this.tweens.add({
            targets: enemy.sprite,
            x: enemy.sprite.x + (this.player.x - enemy.sprite.x) * 0.3,
            y: enemy.sprite.y + (this.player.y - enemy.sprite.y) * 0.3,
            duration: 60, yoyo: true,
            onComplete: finishOne,
          })
          return
        }

        // Charge / move
        if (action.dx !== 0 || action.dy !== 0) {
          const nx = enemy.tx + action.dx
          const ny = enemy.ty + action.dy
          enemy.tx = nx
          enemy.ty = ny
          this.tweens.add({
            targets: enemy.sprite,
            x: nx * TILE + TILE / 2,
            y: ny * TILE + TILE / 2,
            duration: 100,
            onComplete: finishOne,
          })
          return
        }

        finishOne()
        return
      }

      // --- Regular Enemy AI ---
      let result
      switch (enemy.ai) {
        case 'chaser':
          result = chaserAI(ctx)
          break
        case 'coward':
          result = cowardAI(ctx, enemy.hp, enemy.maxHp)
          break
        case 'ranger':
          result = rangerAI(ctx)
          break
        case 'sleeper': {
          const sleepResult = sleeperAI(ctx, enemy.awake ?? false)
          enemy.awake = sleepResult.nowAwake
          result = sleepResult
          break
        }
        case 'splitter':
          result = splitterAI(ctx)
          break
        default:
          result = chaserAI(ctx)
      }

      if (result.action === 'attack') {
        GameState.playerHp = Math.max(0, GameState.playerHp - enemy.atk)
        this.showDamageText(this.player.x, this.player.y - 6, `-${enemy.atk}`, '#ffcc00')
        this.tweens.add({
          targets: enemy.sprite,
          x: enemy.sprite.x + (this.player.x - enemy.sprite.x) * 0.3,
          y: enemy.sprite.y + (this.player.y - enemy.sprite.y) * 0.3,
          duration: 60, yoyo: true,
          onComplete: finishOne,
        })
      } else if (result.action === 'shoot') {
        // Ranged attack: deal damage from distance
        GameState.playerHp = Math.max(0, GameState.playerHp - enemy.atk)
        this.showDamageText(this.player.x, this.player.y - 6, `-${enemy.atk}`, '#ff8800')
        // Flash enemy to indicate shot
        this.tweens.add({
          targets: enemy.sprite,
          alpha: 0.3,
          duration: 80,
          yoyo: true,
          onComplete: finishOne,
        })
      } else if (result.action === 'idle') {
        // Sleeper idle - pulse alpha to hint it can wake
        if (!enemy.awake) {
          enemy.sprite.setAlpha(0.5)
        }
        finishOne()
      } else if (result.action === 'move' && (result.dx !== 0 || result.dy !== 0)) {
        const nextTX = enemy.tx + result.dx
        const nextTY = enemy.ty + result.dy
        if (!(nextTX === this.playerTX && nextTY === this.playerTY)) {
          enemy.tx = nextTX
          enemy.ty = nextTY
          if (!enemy.awake) {
            enemy.sprite.setAlpha(0.5)
          } else {
            enemy.sprite.setAlpha(1)
          }
          this.tweens.add({
            targets: enemy.sprite,
            x: nextTX * TILE + TILE / 2,
            y: nextTY * TILE + TILE / 2,
            duration: 100,
            onComplete: finishOne,
          })
        } else {
          finishOne()
        }
      } else {
        finishOne()
      }
    })
  }

  private spawnBossMinion(boss: EnemyInstance) {
    const mode = GameState.paletteMode
    const offsets = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }]
    for (const off of offsets) {
      const nx = boss.tx + off.dx
      const ny = boss.ty + off.dy
      if (nx >= 0 && nx < this.mapWidth && ny >= 0 && ny < this.mapHeight &&
          this.grid[ny][nx] !== '#' &&
          !this.enemies.some(e => e.tx === nx && e.ty === ny && e.hp > 0) &&
          !(nx === this.playerTX && ny === this.playerTY)) {
        const px = nx * TILE + TILE / 2
        const py = ny * TILE + TILE / 2
        const sprite = this.add.sprite(px, py, `rat_${mode}`).setDepth(5)
        this.enemies.push({
          id: `minion_${nx}_${ny}_${Date.now()}`,
          name: 'Summoned Rat',
          sprite,
          tx: nx,
          ty: ny,
          hp: 4,
          maxHp: 4,
          atk: 2,
          ai: 'chaser',
        })
        return // Only spawn 1 minion per summon
      }
    }
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
