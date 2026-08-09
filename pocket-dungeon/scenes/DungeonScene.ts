import Phaser from 'phaser'
import { TILE } from '../constants'

// Fog alphas, and how far a wall torch pushes a tile back toward lit.
//
// FOG_SIGHTED is the point of #57. It used to be 0: everything within the
// player's four tiles was fully lit, so a torch had no headroom to matter and
// the 'WALL TORCH / Lighting the way' text described something that was not
// happening. Giving the player's own light a floor above zero is what lets
// torchlight read as light.
const FOG_UNSEEN = 0.85
const FOG_EXPLORED = 0.55
const FOG_SIGHTED = 0.3
const TORCH_RADIUS = 3.5
const TORCH_LIFT = 0.42
const TORCH_FLICKER = 0.05
import { GameState, TurnState } from '../state'
import { MapGenerator } from '../MapGenerator'
import { RNG } from '../rng'
import type { AIType, AIContext } from '../enemies'
import {
  rollEnemies, getBiome,
  chaserAI, cowardAI, rangerAI, sleeperAI, splitterAI,
} from '../enemies'
import { music, sfx, setMuted, isMuted } from '../audio'
import { bossAI } from '../boss'
import type { BossState } from '../boss'
import { rollFloorItems } from '../items'
import type { ItemDef, TurnSnapshot } from '../items'

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
  private floorItems: { def: ItemDef; tx: number; ty: number; sprite: Phaser.GameObjects.Sprite }[] = []
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>
  private rewindKey!: Phaser.Input.Keyboard.Key

  constructor() {
    super('dungeon')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    this.renderDungeon()

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    // 'E' used to be registered here and never read — nothing responded to
    // it. Removed rather than left looking wired.
    this.rewindKey = this.input.keyboard!.addKey('R')

    GameState.actionHistory.resetForFloor()

    let touchStartX = 0
    let touchStartY = 0
    let touchStartTime = 0

    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      touchStartX = pointer.x
      touchStartY = pointer.y
      touchStartTime = Date.now()
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const dx = pointer.x - touchStartX
      const dy = pointer.y - touchStartY
      const dt = Date.now() - touchStartTime
      const dist = Math.hypot(dx, dy)

      if (dist > 25 && dt < 500) {
        if (GameState.turnState !== TurnState.PLAYER_TURN || GameState.uiBlocking) return
        let moveX = 0
        let moveY = 0
        if (Math.abs(dx) > Math.abs(dy)) {
          moveX = dx > 0 ? 1 : -1
          this.facing = dx > 0 ? 'right' : 'left'
        } else {
          moveY = dy > 0 ? 1 : -1
          this.facing = dy > 0 ? 'down' : 'up'
        }
        this.saveTurnSnapshot()
        this.handlePlayerAction(moveX, moveY)
      } else if (dist <= 15 && dt < 400) {
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
        const tapTX = Math.floor(worldPoint.x / TILE)
        const tapTY = Math.floor(worldPoint.y / TILE)

        if (tapTX >= 0 && tapTX < this.mapWidth && tapTY >= 0 && tapTY < this.mapHeight) {
          const adx = tapTX - this.playerTX
          const ady = tapTY - this.playerTY
          if (Math.abs(adx) + Math.abs(ady) === 1 && GameState.turnState === TurnState.PLAYER_TURN && !GameState.uiBlocking) {
            this.facing = adx === 1 ? 'right' : adx === -1 ? 'left' : ady === 1 ? 'down' : 'up'
            this.saveTurnSnapshot()
            this.handlePlayerAction(adx, ady)
          } else {
            this.inspectTile(tapTX, tapTY)
          }
        }
      }
    })

    if (!this.scene.isActive('ui')) {
      this.scene.launch('ui')
    }
  }

  private fogTiles: Phaser.GameObjects.Rectangle[][] = []
  /**
   * Light each tile receives from wall torches, 0..1, computed once per floor
   * (#57). Torches never move, so this is baked at generation rather than
   * recomputed per move — the per-move pass just reads it.
   */
  private torchLight: number[][] = []
  /** Only the tiles a torch actually reaches, so flicker does not walk 1024. */
  private litTiles: { x: number; y: number }[] = []
  /** Base fog alpha before flicker, so flicker is applied, not accumulated. */
  private fogBase: number[][] = []
  private explored: boolean[][] = []

  renderDungeon() {
    const mode = GameState.paletteMode
    this.enemies = []
    this.rng = new RNG(GameState.seed + GameState.floorDepth)

    if (GameState.floorDepth === 12) {
      music.play('boss')
    } else {
      music.play('dungeon')
    }

    const generator = new MapGenerator(this.mapWidth, this.mapHeight, GameState.seed + GameState.floorDepth)
    const { grid, startX, startY } = generator.generate(GameState.floorDepth)
    this.grid = grid
    this.playerTX = startX
    this.playerTY = startY

    this.cameras.main.setBounds(0, 0, this.mapWidth * TILE, this.mapHeight * TILE)

    const biome = getBiome(GameState.floorDepth)
    const tileKey = mode === 'dmg' ? 'tiles_dmg_v2' : `tiles_gbc_${biome}_v2`

    // Initialize explored grid & fog layer
    this.explored = Array.from({ length: this.mapHeight }, () => Array(this.mapWidth).fill(false))
    this.fogTiles = Array.from({ length: this.mapHeight }, () => Array(this.mapWidth))

    // Render rich tiles
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const char = this.grid[y][x]
        const px = x * TILE + TILE / 2
        const py = y * TILE + TILE / 2

        let frameIndex = 0
        if (char === ' ') frameIndex = -1
        else if (char === '#') frameIndex = 1
        else if (char === 'T') frameIndex = 5
        else if (char === 'B') frameIndex = 6
        else if (char === 'S') frameIndex = 2
        else if (char === 'c') frameIndex = 3
        else if (char === 'r') frameIndex = 7
        else if (char === 'k') frameIndex = 4
        else if (char === 'b') frameIndex = 8
        else frameIndex = 0

        if (frameIndex !== -1) {
          this.add.image(px, py, tileKey, frameIndex)
        }

        // Fog layer overlay
        const fog = this.add.rectangle(px, py, TILE, TILE, 0x050806).setDepth(15).setAlpha(0.85)
        this.fogTiles[y][x] = fog
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

    // Spawn floor items
    this.floorItems = []
    const itemDefs = rollFloorItems(GameState.floorDepth, this.rng)
    const floorTiles: { x: number; y: number }[] = []
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (this.grid[y][x] === '.' && !(x === startX && y === startY)) {
          floorTiles.push({ x, y })
        }
      }
    }
    const itemPositions = this.rng.shuffle(floorTiles)
    for (let i = 0; i < Math.min(itemDefs.length, itemPositions.length); i++) {
      const pos = itemPositions[i]
      const def = itemDefs[i]
      const ipx = pos.x * TILE + TILE / 2
      const ipy = pos.y * TILE + TILE / 2
      const spriteKey = `item_${def.category}_${mode}`
      const itemSprite = this.add.sprite(ipx, ipy, spriteKey).setDepth(3)
      this.floorItems.push({ def, tx: pos.x, ty: pos.y, sprite: itemSprite })
    }

    // Place player sprite
    const px = this.playerTX * TILE + TILE / 2
    const py = this.playerTY * TILE + TILE / 2
    this.player = this.add.sprite(px, py, `hero_${mode}_${this.facing}`).setDepth(10)

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)

    this.computeTorchLight()

    // Initial fog of war update
    this.updateFogOfWar()

    // Flicker on a timer rather than per frame: the eye reads ~8Hz as a live
    // flame, and the issue asks for subtle, not strobing.
    this.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => this.applyTorchFlicker(),
    })
  }

  reloadPalette() {
    this.children.removeAll()
    this.renderDungeon()
  }

  update() {
    if (GameState.turnState !== TurnState.PLAYER_TURN || GameState.uiBlocking) return

    // Rewind key (R)
    if (Phaser.Input.Keyboard.JustDown(this.rewindKey)) {
      if (GameState.inventory.has('hourglass') && GameState.actionHistory.canRewind()) {
        const snap = GameState.actionHistory.rewind()
        if (snap) {
          GameState.inventory.remove('hourglass')
          this.applyRewind(snap)
          return
        }
      }
    }

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
      this.saveTurnSnapshot()
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

    // Check wall/void collision
    if (this.grid[targetTY][targetTX] === '#' || this.grid[targetTY][targetTX] === ' ') {
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

    this.updateFogOfWar()

    const px = targetTX * TILE + TILE / 2
    const py = targetTY * TILE + TILE / 2

    this.tweens.add({
      targets: this.player,
      x: px,
      y: py,
      duration: 100,
      onComplete: () => {
        // Pickup item at this position
        this.tryPickupItem(targetTX, targetTY)

        if (this.grid[targetTY][targetTX] === 'S') {
          sfx.stairs()
          GameState.floorDepth++
          if (GameState.floorDepth > 12) {
            // Victory!
            this.scene.stop('ui')
            this.scene.start('gameover', { victory: true })
            return
          }
          GameState.turnState = TurnState.PLAYER_TURN
          this.scene.restart()
          return
        }
        GameState.turnsCount++
        GameState.drainHunger()
        this.processEnemyTurn()
      },
    })
  }

  private executeMeleeAttack(enemy: EnemyInstance) {
    sfx.attack()
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
          GameState.killsCount++
          // Gold drop
          const goldDrop = enemy.ai === 'boss' ? 20 : (enemy.isSplit ? 1 : 3)
          GameState.runGold += goldDrop
          this.showDamageText(targetX, targetY + 4, `+${goldDrop}g`, '#ffd700')

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
          this.grid[ny][nx] !== '#' && this.grid[ny][nx] !== ' ' &&
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
      if (completed >= total) {
        if (GameState.playerHp <= 0) {
          this.scene.stop('ui')
          this.scene.start('gameover', { victory: false })
          return
        }
        GameState.turnState = TurnState.PLAYER_TURN
      }
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
          sfx.hit()
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
        sfx.hit()
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
        sfx.hit()
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
          this.grid[ny][nx] !== '#' && this.grid[ny][nx] !== ' ' &&
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
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
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

  private tryPickupItem(tx: number, ty: number) {
    const idx = this.floorItems.findIndex(i => i.tx === tx && i.ty === ty)
    if (idx === -1) return

    const item = this.floorItems[idx]
    const def = item.def

    // Auto-use consumables, equip gear
    if (def.category === 'weapon') {
      GameState.equipWeapon(def)
      this.showDamageText(this.player.x, this.player.y - 10, def.name, '#88ccff')
    } else if (def.category === 'armor') {
      GameState.equipArmor(def)
      this.showDamageText(this.player.x, this.player.y - 10, def.name, '#88ccff')
    } else if (def.category === 'food') {
      GameState.hunger = Math.min(GameState.maxHunger, GameState.hunger + (def.hungerRestore ?? 0))
      this.showDamageText(this.player.x, this.player.y - 10, `+${def.hungerRestore} FOOD`, '#88ff88')
    } else if (def.category === 'potion') {
      GameState.playerHp = Math.min(GameState.maxHp, GameState.playerHp + (def.healAmount ?? 0))
      this.showDamageText(this.player.x, this.player.y - 10, `+${def.healAmount} HP`, '#ff88cc')
    } else if (def.category === 'scroll') {
      // Add to inventory for manual use later
      GameState.inventory.add(def)
      const displayName = GameState.scrollIdentifier.getDisplayName(def)
      this.showDamageText(this.player.x, this.player.y - 10, displayName, '#ffff88')
    } else if (def.category === 'rewind') {
      GameState.inventory.add(def)
      this.showDamageText(this.player.x, this.player.y - 10, 'HOURGLASS', '#ffd700')
    }
    
    sfx.pickup()
    item.sprite.destroy()
    this.floorItems.splice(idx, 1)
  }

  private saveTurnSnapshot() {
    const snapshot: TurnSnapshot = {
      playerTX: this.playerTX,
      playerTY: this.playerTY,
      playerHp: GameState.playerHp,
      hunger: GameState.hunger,
      turnsCount: GameState.turnsCount,
      enemyStates: this.enemies.filter(e => e.hp > 0).map(e => ({
        id: e.id, tx: e.tx, ty: e.ty, hp: e.hp,
      })),
    }
    GameState.actionHistory.save(snapshot)
  }

  private applyRewind(snap: TurnSnapshot) {
    this.showDamageText(this.player.x, this.player.y - 10, 'REWIND!', '#ffd700')

    this.playerTX = snap.playerTX
    this.playerTY = snap.playerTY
    GameState.playerHp = snap.playerHp
    GameState.hunger = snap.hunger
    GameState.turnsCount = snap.turnsCount

    // Move player sprite
    this.player.x = snap.playerTX * TILE + TILE / 2
    this.player.y = snap.playerTY * TILE + TILE / 2

    // Restore enemy positions and HP
    for (const es of snap.enemyStates) {
      const enemy = this.enemies.find(e => e.id === es.id)
      if (enemy) {
        enemy.tx = es.tx
        enemy.ty = es.ty
        enemy.hp = es.hp
        enemy.sprite.x = es.tx * TILE + TILE / 2
        enemy.sprite.y = es.ty * TILE + TILE / 2
        enemy.sprite.setVisible(es.hp > 0)
        enemy.sprite.setAlpha(es.hp > 0 ? 1 : 0)
      }
    }

    this.updateFogOfWar()
  }

  private inspectTile(tx: number, ty: number) {
    const px = tx * TILE + TILE / 2
    const py = ty * TILE + TILE / 2

    // Check enemy
    const enemy = this.enemies.find(e => e.tx === tx && e.ty === ty && e.hp > 0)
    if (enemy) {
      const aiName = typeof enemy.ai === 'string' ? enemy.ai.toUpperCase() : 'BOSS'
      this.showDamageText(px, py - 8, `${enemy.name}\nHP:${enemy.hp}/${enemy.maxHp} ATK:${enemy.atk}\nAI:${aiName}`, '#a0e0ff')
      return
    }

    // Check item
    const item = this.floorItems.find(i => i.tx === tx && i.ty === ty)
    if (item) {
      const name = item.def.category === 'scroll'
        ? GameState.scrollIdentifier.getDisplayName(item.def)
        : item.def.name
      this.showDamageText(px, py - 8, `${name}\n${item.def.description}`, '#ffffaa')
      return
    }

    // Check stairs / player / tile
    if (tx === this.playerTX && ty === this.playerTY) {
      this.showDamageText(px, py - 8, `YOU (${GameState.selectedClass.toUpperCase()})\nHP:${GameState.playerHp}/${GameState.maxHp} ATK:${GameState.playerAtk}`, '#88ff88')
      return
    }

    const char = this.grid[ty]?.[tx]
    if (char === 'S') {
      this.showDamageText(px, py - 8, `STAIRS DOWN\nTo Floor ${GameState.floorDepth + 1}`, '#ffd700')
    } else if (char === 'c') {
      this.showDamageText(px, py - 8, 'CORRIDOR PATH\nStone walkway', '#aa99bb')
    } else if (char === 'T') {
      this.showDamageText(px, py - 8, 'WALL TORCH\nLighting the way', '#ffa000')
    } else if (char === 'r') {
      this.showDamageText(px, py - 8, 'ROOM CARPET / RUG', '#ff88aa')
    } else if (char === 'k') {
      this.showDamageText(px, py - 8, 'CRACKED FLOOR', '#888888')
    } else if (char === 'b') {
      this.showDamageText(px, py - 8, 'SCATTERED BONES', '#e0d8c0')
    } else if (char === '#') {
      this.showDamageText(px, py - 8, 'DUNGEON WALL', '#aaaaaa')
    } else if (char === ' ') {
      this.showDamageText(px, py - 8, 'THE VOID\nImpassable darkness', '#555555')
    } else {
      this.showDamageText(px, py - 8, 'DUNGEON FLOOR', '#668866')
    }
  }

  private updateFogOfWar() {
    const sightRadius = 4
    const px = this.playerTX
    const py = this.playerTY

    // Mark sight radius as explored
    for (let y = Math.max(0, py - sightRadius); y <= Math.min(this.mapHeight - 1, py + sightRadius); y++) {
      for (let x = Math.max(0, px - sightRadius); x <= Math.min(this.mapWidth - 1, px + sightRadius); x++) {
        if (Math.hypot(x - px, y - py) <= sightRadius + 0.5) {
          this.explored[y][x] = true
        }
      }
    }

    // Update fog tile alphas
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        const fog = this.fogTiles[y]?.[x]
        if (!fog) continue

        const inSight = Math.hypot(x - px, y - py) <= sightRadius + 0.5
        const torch = this.torchLight[y]?.[x] ?? 0
        let alpha: number
        if (inSight) {
          // Lit enough to play by, brighter still under a torch.
          alpha = Math.max(0, FOG_SIGHTED - torch * TORCH_LIFT)
        } else if (this.explored[y][x]) {
          // Somewhere already seen. A torch nearby keeps it bright; a corridor
          // between torches falls back toward dark, which is the whole point.
          alpha = Math.max(0, FOG_EXPLORED - torch * TORCH_LIFT)
        } else {
          // Torchlight deliberately does not reach here. Brightening unseen
          // tiles would light up the floor plan and undo fog of war.
          alpha = FOG_UNSEEN
        }
        this.fogBase[y][x] = alpha
        fog.setAlpha(alpha)
      }
    }
  }

  /**
   * Bakes per-tile torch light for this floor.
   *
   * Levels are quantised to quarters rather than left as a smooth ramp: DMG
   * has four shades, so a continuous falloff bands badly there, and stepping
   * it deliberately reads as intentional rather than broken.
   */
  private computeTorchLight() {
    const torches: { x: number; y: number }[] = []
    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        if (this.grid[y]?.[x] === 'T') torches.push({ x, y })
      }
    }

    this.torchLight = Array.from({ length: this.mapHeight }, () =>
      Array(this.mapWidth).fill(0),
    )
    this.fogBase = Array.from({ length: this.mapHeight }, () =>
      Array(this.mapWidth).fill(FOG_UNSEEN),
    )
    this.litTiles = []

    for (let y = 0; y < this.mapHeight; y++) {
      for (let x = 0; x < this.mapWidth; x++) {
        let best = 0
        for (const t of torches) {
          const d = Math.hypot(x - t.x, y - t.y)
          if (d > TORCH_RADIUS) continue
          best = Math.max(best, 1 - d / TORCH_RADIUS)
        }
        const level = Math.round(best * 4) / 4
        this.torchLight[y][x] = level
        if (level > 0) this.litTiles.push({ x, y })
      }
    }
  }

  /** A shared, slow pulse over torch-lit tiles. Small on purpose. */
  private applyTorchFlicker() {
    const wobble = Math.sin(this.time.now / 380) * TORCH_FLICKER
    for (const { x, y } of this.litTiles) {
      const fog = this.fogTiles[y]?.[x]
      if (!fog) continue
      // Undiscovered tiles must not flicker. Torchlight is excluded from them
      // above precisely so it cannot hint at the floor plan, and a shimmer
      // there would give the same thing away through the fog.
      if (!this.explored[y]?.[x]) continue
      const base = this.fogBase[y]?.[x] ?? FOG_UNSEEN
      // Fully lit tiles have no fog to modulate; pulsing them would draw the
      // eye to wherever the player is standing.
      if (base <= 0) continue
      fog.setAlpha(Math.max(0, Math.min(1, base + wobble * this.torchLight[y][x])))
    }
  }
}
