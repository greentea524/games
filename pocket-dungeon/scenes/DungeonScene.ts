import Phaser from 'phaser'
import { TILE, GBC_WIDTH, GBC_HEIGHT, FONT, CSS_LIGHTEST } from '../constants'

/**
 * How many usable items the gear panel shows at once (#105).
 *
 * The band between the two HUD bars is y=16 to y=129, and a 7px line with
 * lineSpacing 1 costs 8px. Four gear lines and two headers leave room for
 * five entries plus an overflow marker.
 */
const MAX_VISIBLE_USABLE = 5

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
  rollEnemies, getBiome, REVIVE_HP_FRACTION,
  chaserAI, cowardAI, rangerAI, sleeperAI, splitterAI,
} from '../enemies'
import { music, sfx, setMuted, isMuted } from '../audio'
import { rollModifier, modifierSeed, type Modifier } from '../modifiers'
import { bossAI } from '../boss'
import type { BossState } from '../boss'
import { rollFloorItems, ITEMS } from '../items'
import { rollChests, rollChestLoot, keysForFloor, type ChestTier } from '../chests'
import {
  SCROLL_SPECS, FIRE_RADIUS, FIRE_DAMAGE, STRENGTH_BONUS,
  blastTargets, teleportCandidates,
} from '../scrolls'
import type { ItemDef, TurnSnapshot } from '../items'

/** What `GameState.hungerDrainRate` is on an unmodified floor (#69). */
const BASE_HUNGER_DRAIN = 1

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
  /** #60: a reviving enemy has not yet used its one comeback. */
  canRevive?: boolean
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
    // After the fade-in, so the banner is not competing with the floor
    // appearing underneath it.
    this.time.delayedCall(400, () => this.announceModifier())

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>
    // 'E' used to be registered here and never read — nothing responded to
    // it. Removed rather than left looking wired.
    this.rewindKey = this.input.keyboard!.addKey('R')

    GameState.actionHistory.resetForFloor()

    // Phaser reuses the scene instance across `restart()`, so field
    // initialisers do not re-run and `gearPanel` would keep pointing at the
    // destroyed panel from the previous floor — leaving uiBlocking stuck on
    // and the game unplayable.
    this.gearPanel = null
    GameState.uiBlocking = false

    let touchStartX = 0
    let touchStartY = 0
    let touchStartTime = 0

    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))

    // B on the shell, which sends KeyX (#82).
    const gearKey = this.input.keyboard!.addKey('X')
    gearKey.on('down', () => this.toggleGearPanel())

    // Panel navigation (#105). These have to be listeners rather than polls in
    // `update()`, because `update()` returns early while `uiBlocking` is set —
    // which is exactly when the panel is open. Each one is a no-op unless the
    // panel is up, so the arrow keys still mean "walk" the rest of the time.
    const useKey = this.input.keyboard!.addKey('Z')
    useKey.on('down', () => {
      if (this.gearPanel) this.useSelectedItem()
    })
    this.cursors.up.on('down', () => {
      if (this.gearPanel) this.moveGearCursor(-1)
    })
    this.cursors.down.on('down', () => {
      if (this.gearPanel) this.moveGearCursor(1)
    })
    this.wasd.W.on('down', () => {
      if (this.gearPanel) this.moveGearCursor(-1)
    })
    this.wasd.S.on('down', () => {
      if (this.gearPanel) this.moveGearCursor(1)
    })

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

  /** This floor's modifier, or null for an ordinary floor (#69). */
  private modifier: Modifier | null = null

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
  /** Cobweb overlays (#58); cleared and rebuilt with each floor. */
  private cobwebs: Phaser.GameObjects.Image[] = []
  /** The gear panel (#82), while it is open. */
  private gearPanel: Phaser.GameObjects.Container | null = null
  /** Which usable item the panel's cursor is on (#105). */
  private gearCursor = 0
  /** Chests on this floor (#83); rebuilt with each floor. */
  private chests: {
    tier: ChestTier
    tx: number
    ty: number
    opened: boolean
    sprite: Phaser.GameObjects.Sprite
  }[] = []

  renderDungeon() {
    const mode = GameState.paletteMode
    this.enemies = []
    this.rng = new RNG(GameState.seed + GameState.floorDepth)

    if (GameState.floorDepth === 12) {
      music.play('boss')
    } else {
      music.play('dungeon')
    }

    // This floor's modifier (#69). Rolled from a stream of its own rather
    // than from `this.rng`: taking a draw from the generator's stream would
    // shift every value after it and change the dungeon that every existing
    // seed produces.
    this.modifier = rollModifier(
      GameState.floorDepth,
      new RNG(modifierSeed(GameState.seed, GameState.floorDepth)),
    )

    // `hungerDrainRate` is a static that nothing else ever resets, so Famine
    // would follow the player down for the rest of the run if this were not
    // reasserted on every floor.
    GameState.hungerDrainRate = BASE_HUNGER_DRAIN * (this.modifier?.hungerRateMultiplier ?? 1)

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
        else if (char === 'S') frameIndex = this.modifier?.hideStairs ? 0 : 2
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
    this.renderCobwebs(mode)

    const spawnList = rollEnemies(GameState.floorDepth, this.rng, this.modifier?.spawnBudgetBonus ?? 0)
    
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
        // Silent Halls holds every enemy unaware, whatever its AI would
        // normally do on spawn.
        awake: this.modifier?.enemiesStartAsleep ? false : def.ai !== 'sleeper',
        canRevive: def.revives === true,
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
    const itemDefs = rollFloorItems(GameState.floorDepth, this.rng, {
      extra: this.modifier?.extraItems,
      suppressFood: this.modifier?.suppressFood,
      guaranteedRare: this.modifier?.guaranteedRare,
    })
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

    this.placeChests(mode, itemPositions.slice(itemDefs.length))

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

    // Check chest bump (#83). Before the enemy check: nothing spawns on a
    // chest tile, so the two can never both match, and putting it first keeps
    // the closed-chest block in one place.
    const chestAtTarget = this.chests.find(
      (c) => c.tx === targetTX && c.ty === targetTY && !c.opened,
    )
    if (chestAtTarget) {
      this.player.setTexture(`hero_${mode}_${this.facing}`)
      if (chestAtTarget.tier === 'locked' && !GameState.inventory.has('key')) {
        // Costs no turn, the same as walking into a wall. Probing a locked
        // chest to find out it is locked should not hand the floor a free
        // round of attacks.
        this.showDamageText(this.player.x, this.player.y - 10, 'NEED A KEY', '#ff8888')
        sfx.menuCancel()
        return
      }
      this.openChest(chestAtTarget)
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
        if (GameState.advanceTurn()) this.showRegenTick()
        GameState.drainHunger()
        this.processEnemyTurn()
      },
    })
  }

  private executeMeleeAttack(enemy: EnemyInstance) {
    sfx.attack()
    GameState.turnState = TurnState.ANIMATING
    const damage = this.scaleDamage(GameState.playerAtk)
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
        if (enemy.hp <= 0 && enemy.canRevive) {
          // #60: gets back up once, at half HP. Spent here rather than on
          // death so it never stacks with the splitter path below, and so a
          // reviving enemy cannot also drop gold twice.
          enemy.canRevive = false
          enemy.hp = Math.max(1, Math.round(enemy.maxHp * REVIVE_HP_FRACTION))
          sfx.revive()
          this.showDamageText(targetX, targetY - 6, 'IT RISES', '#d8d8c0')
          // Collapse and reassemble, so the player sees what happened rather
          // than just watching the health bar refill.
          this.tweens.add({
            targets: enemy.sprite,
            scaleY: 0.2,
            alpha: 0.4,
            duration: 140,
            yoyo: true,
            onComplete: () => {
              enemy.sprite.setScale(1).setAlpha(1)
            },
          })
        } else if (enemy.hp <= 0) {
          GameState.killsCount++
          // Gold drop
          const goldDrop = enemy.ai === 'boss' ? 20 : (enemy.isSplit ? 1 : 3)
          // The Lucky Coin's multiplier is applied inside addGold, and the
          // banked figure is what gets shown — otherwise the float and the
          // counter disagree.
          const banked = GameState.addGold(goldDrop)
          this.showDamageText(targetX, targetY + 4, `+${banked}g`, '#ffd700')

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
        if (GameState.advanceTurn()) this.showRegenTick()
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
          const dmg = this.scaleDamage(
            enemy.bossState.phase === 'desperate' ? enemy.atk * 2 : enemy.atk,
          )
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
        GameState.playerHp = Math.max(0, GameState.playerHp - this.scaleDamage(enemy.atk))
        this.showDamageText(this.player.x, this.player.y - 6, `-${this.scaleDamage(enemy.atk)}`, '#ffcc00')
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
        GameState.playerHp = Math.max(0, GameState.playerHp - this.scaleDamage(enemy.atk))
        this.showDamageText(this.player.x, this.player.y - 6, `-${this.scaleDamage(enemy.atk)}`, '#ff8800')
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

  /**
   * Cobwebs in the inside corners of rooms (#58).
   *
   * Everything else the issue asked for already existed: cracked floor `k`,
   * bone debris `b` and the room carpet `r` are all generated in
   * MapGenerator and drawn here. Cobwebs were the genuinely missing piece.
   *
   * Overlay sprites rather than grid characters, deliberately. Walkability
   * across this codebase is `grid[y][x] !== '#'`, so a wall-variant character
   * would have quietly made the corner walkable — and a decoration that
   * changes collision is exactly what the issue warns against.
   *
   * Only plain floor `.` qualifies, so a web can never land on the stairs, an
   * item, an enemy spawn or a torch.
   */
  private renderCobwebs(mode: 'dmg' | 'gbc') {
    for (const w of this.cobwebs) w.destroy()
    this.cobwebs = []

    // Seeded so a floor looks the same when revisited, and on its own stream:
    // drawing from `this.rng` would shift every later value and change the
    // enemies each existing seed produces (the lesson from #69).
    const rng = new RNG(modifierSeed(GameState.seed ^ 0x5eed, GameState.floorDepth))
    const isWall = (x: number, y: number) =>
      this.grid[y]?.[x] === undefined || this.grid[y][x] === '#'

    for (let y = 1; y < this.mapHeight - 1; y++) {
      for (let x = 1; x < this.mapWidth - 1; x++) {
        if (this.grid[y][x] !== '.') continue
        // An inside corner: walls on two perpendicular sides.
        const corners: [boolean, number, number][] = [
          [isWall(x - 1, y) && isWall(x, y - 1), 0, 0],   // top-left
          [isWall(x + 1, y) && isWall(x, y - 1), 1, 0],   // top-right
          [isWall(x - 1, y) && isWall(x, y + 1), 0, 1],   // bottom-left
          [isWall(x + 1, y) && isWall(x, y + 1), 1, 1],   // bottom-right
        ]
        for (const [isCorner, fx, fy] of corners) {
          if (!isCorner) continue
          if (rng.nextFloat(0, 1) > 0.35) continue
          const img = this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, `cobweb_${mode}`)
          // The texture is drawn into its top-left corner, so flip it into
          // whichever corner of the tile the walls actually meet in.
          img.setFlipX(fx === 1).setFlipY(fy === 1)
          img.setAlpha(0.8)
          // Above the floor, below anything the player interacts with.
          img.setDepth(0.5)
          this.cobwebs.push(img)
        }
      }
    }
  }

  /**
   * Applies the floor's damage modifier (#69). Brittle doubles it in both
   * directions, so fights end in a turn or two either way — which is only
   * fair if the player's own hits scale too.
   */
  private scaleDamage(amount: number): number {
    return Math.max(1, Math.round(amount * (this.modifier?.damageMultiplier ?? 1)))
  }

  /**
   * Announces the floor's modifier, in the banner style the game already uses
   * for tile descriptions.
   */
  private announceModifier() {
    if (!this.modifier) return
    // Same look as the tile-description banners, but not `showDamageText`:
    // that fades in 500ms, which is right for a damage number and far too
    // brief for two lines of 8px text the player has to carry for a whole
    // floor. Screen-space, so it does not drift with the camera.
    const text = this.add
      .text(TILE * 2, 24, `${this.modifier.name}\n${this.modifier.blurb}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '8px',
        color: '#ffd700',
        align: 'center',
        resolution: 1,
        shadow: { offsetX: 1, offsetY: 1, color: '#000000', fill: true },
      })
      .setScrollFactor(0)
      .setDepth(60)
    text.setX((this.cameras.main.width - text.width) / 2)
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 2000,
      duration: 600,
      onComplete: () => text.destroy(),
    })
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

  /**
   * Where a chest's contents land (#59).
   *
   * One item sits on the chest's own tile. A locked chest yields two, and
   * stacking both on one tile hides the second — the sprite is drawn over and
   * the player has to step off and back on to collect it. So extras spill
   * onto adjacent walkable tiles that nothing else occupies, falling back to
   * the chest tile only when the chest is genuinely boxed in.
   */
  private lootSpots(tx: number, ty: number, count: number): { x: number; y: number }[] {
    const spots = [{ x: tx, y: ty }]
    const around = [
      { x: tx + 1, y: ty }, { x: tx - 1, y: ty },
      { x: tx, y: ty + 1 }, { x: tx, y: ty - 1 },
    ]
    for (const p of around) {
      if (spots.length >= count) break
      const cell = this.grid[p.y]?.[p.x]
      if (cell === undefined || cell === '#' || cell === ' ' || cell === 'S') continue
      if (this.floorItems.some((i) => i.tx === p.x && i.ty === p.y)) continue
      if (this.chests.some((c) => c.tx === p.x && c.ty === p.y)) continue
      spots.push(p)
    }
    while (spots.length < count) spots.push({ x: tx, y: ty })
    return spots
  }

  /**
   * Places this floor's chests (#83).
   *
   * Rooms only — corridor tiles are excluded. A closed chest blocks its tile,
   * and a chest sitting in a one-wide corridor would wall off everything
   * behind it until the player happened to walk into it. Opening one does
   * clear the block, so this is belt and braces rather than a fix for a
   * softlock, but a corridor chest is also just worse to come across.
   *
   * @param spare Floor tiles the item pass did not consume, already shuffled,
   *   so a chest can never land on top of an item or on the player's start.
   */
  private placeChests(mode: 'dmg' | 'gbc', spare: { x: number; y: number }[]) {
    for (const c of this.chests) c.sprite.destroy()
    this.chests = []

    const tiers = rollChests(GameState.floorDepth, this.rng, this.modifier?.guaranteedRare)
    const inRoom = spare.filter(
      (p) =>
        this.grid[p.y][p.x] === '.' &&
        !this.enemies.some((e) => e.tx === p.x && e.ty === p.y),
    )
    for (let i = 0; i < Math.min(tiers.length, inRoom.length); i++) {
      const pos = inRoom[i]
      const tier = tiers[i]
      const sprite = this.add
        .sprite(pos.x * TILE + TILE / 2, pos.y * TILE + TILE / 2, `chest_${tier}_closed_${mode}`)
        .setDepth(3)
      this.chests.push({ tier, tx: pos.x, ty: pos.y, opened: false, sprite })
    }

    // One key per locked chest actually placed, not per locked chest rolled —
    // if the floor ran out of room and a locked chest was never built, its key
    // would be a loose item with nothing to open on this floor.
    const keyCount = keysForFloor(this.chests.map((c) => c.tier))
    const keySpots = inRoom.slice(this.chests.length)
    for (let i = 0; i < Math.min(keyCount, keySpots.length); i++) {
      const pos = keySpots[i]
      const sprite = this.add
        .sprite(pos.x * TILE + TILE / 2, pos.y * TILE + TILE / 2, `item_key_${mode}`)
        .setDepth(3)
      this.floorItems.push({ def: { ...ITEMS.key }, tx: pos.x, ty: pos.y, sprite })
    }
  }

  /**
   * Opens a chest and drops its contents onto its own tile (#83).
   *
   * The loot becomes an ordinary floor item rather than going straight into
   * the player's hands, so it goes through the same pickup path as everything
   * else — including the no-downgrade rule from #82. Opening a golden chest
   * holding a Rusty Sword must not strip the Flame Brand off your back.
   *
   * Costs a turn, the same as an attack: bumping a chest while an enemy is
   * closing in should be a decision.
   */
  private openChest(chest: {
    tier: ChestTier
    tx: number
    ty: number
    opened: boolean
    sprite: Phaser.GameObjects.Sprite
  }) {
    chest.opened = true
    const mode = GameState.paletteMode
    if (chest.tier === 'locked') {
      GameState.inventory.remove('key')
      this.showDamageText(this.player.x, this.player.y - 10, 'UNLOCKED', '#ffd700')
    }
    chest.sprite.setTexture(`chest_${chest.tier}_open_${mode}`)
    sfx.pickup()

    const loot = rollChestLoot(chest.tier, this.rng)
    const px = chest.tx * TILE + TILE / 2
    const py = chest.ty * TILE + TILE / 2
    // A locked chest yields two, so they are fanned across neighbouring tiles
    // rather than stacked: two floor items on one tile means the second is
    // invisible and takes a second walk-off-and-back to collect.
    const spots = this.lootSpots(chest.tx, chest.ty, loot.length)
    loot.forEach((def, i) => {
      const spot = spots[i] ?? { x: chest.tx, y: chest.ty }
      const dx = spot.x * TILE + TILE / 2
      const dy = spot.y * TILE + TILE / 2
      const sprite = this.add.sprite(px, py - 6, `item_${def.category}_${mode}`).setDepth(4)
      this.floorItems.push({ def, tx: spot.x, ty: spot.y, sprite })
      // Pops up out of the chest and settles onto its tile, so it is clear the
      // item came from the chest rather than having always been there.
      this.tweens.add({ targets: sprite, x: dx, y: dy, duration: 220, ease: 'Bounce.easeOut' })
    })
    this.showDamageText(px, py - 14, loot.map((d) => d.name).join(' + '), '#ffd700')

    GameState.turnState = TurnState.ANIMATING
    this.time.delayedCall(220, () => {
      if (GameState.advanceTurn()) this.showRegenTick()
      this.processEnemyTurn()
    })
  }

  /** The Mending Band's +1, floated like every other HP change (#82). */
  private showRegenTick() {
    this.showDamageText(this.player.x, this.player.y - 10, '+1 HP', '#88ffcc')
  }

  /**
   * The three equip slots, on B (#82).
   *
   * B, A and START are all dead keys inside the dungeon today, so this costs
   * no existing binding. Screen-space and depth 60, matching the modifier
   * banner. It is a panel rather than a HUD row because the bottom bar has
   * roughly two free character cells between the gold and ATK readouts, which
   * is not enough for three item names.
   */
  /** Everything the panel can act on: consumables held in the inventory. */
  private usableItems(): { def: ItemDef; quantity: number }[] {
    return GameState.inventory.items.filter(
      (i) => i.def.category === 'potion' || i.def.category === 'scroll',
    )
  }

  private toggleGearPanel() {
    if (this.gearPanel) {
      this.closeGearPanel()
      return
    }
    this.gearCursor = 0
    this.drawGearPanel()
    // Movement is suppressed while it is open, the same way every other
    // blocking overlay in this game does it.
    GameState.uiBlocking = true
  }

  private closeGearPanel() {
    this.gearPanel?.destroy()
    this.gearPanel = null
    GameState.uiBlocking = false
  }

  /**
   * The three equip slots, the key count, and the usable items (#82, #59, #105).
   *
   * Redrawn rather than mutated on every cursor move: the panel is a handful
   * of short text lines, so rebuilding it is cheaper than keeping a parallel
   * set of Text objects in sync, and there is no animation to preserve.
   *
   * B, A and START were all dead keys inside the dungeon before #82. B opens
   * and closes, up/down move the cursor, A uses.
   */
  private drawGearPanel() {
    this.gearPanel?.destroy()
    const inv = GameState.inventory
    const slot = (label: string, def: { name: string } | null) =>
      `${label} ${def ? def.name : '--'}`
    const keys = inv.count('key')
    const gear = [
      slot('WPN', inv.equippedWeapon),
      slot('ARM', inv.equippedArmor),
      slot('ACC', inv.equippedAccessory),
      // Keys (#59) live here rather than in the HUD. Measured, not assumed:
      // with "STARVING!" and a four-digit gold count on screen, the bottom bar
      // leaves 18px between the gold readout and ATK, and "K:2" renders at
      // 20px — so a HUD counter overlaps ATK at values the game actually
      // reaches. The issue's premise that the HUD already displays keys was
      // not true; there was no key counter, and there is no room for one.
      `KEY ${keys > 0 ? `x${keys}` : '--'}`,
    ].join('\n')

    const usable = this.usableItems()
    this.gearCursor = usable.length
      ? Math.max(0, Math.min(this.gearCursor, usable.length - 1))
      : 0

    // Scrolls show whatever name they have earned. An unidentified one keeps
    // its cryptic label, which is the whole point of the mechanic — you find
    // out what FROTZ does by using it.
    // The list is windowed. Five scrolls plus a potion is six lines, and with
    // the four gear lines and two headers above them the panel ran off the
    // bottom of the screen and under the HUD bar — "Health Potion" was drawn
    // entirely behind it. Measured: the usable band is y=16 to y=129, which is
    // 113px, and a line costs 8px here.
    const first = Math.max(
      0,
      Math.min(this.gearCursor - MAX_VISIBLE_USABLE + 1, usable.length - MAX_VISIBLE_USABLE),
    )
    const window = usable.slice(first, first + MAX_VISIBLE_USABLE)
    const usableLines = usable.length
      ? window
          .map((i, n) => {
            const idx = first + n
            const name =
              i.def.category === 'scroll'
                ? GameState.scrollIdentifier.getDisplayName(i.def)
                : i.def.name
            const qty = i.quantity > 1 ? ` x${i.quantity}` : ''
            return `${idx === this.gearCursor ? '>' : ' '}${name}${qty}`
          })
          .concat(usable.length > first + MAX_VISIBLE_USABLE ? [' ...'] : [])
          .join('\n')
      : ' nothing to use'

    const body = [gear, '- USE - (A)', usableLines].join('\n')

    const panel = this.add.container(0, 0).setScrollFactor(0).setDepth(60)
    // Near-opaque. At 0.85 the dungeon read straight through the panel and
    // item names sat on top of the red carpet tiles, which the screenshot
    // made obvious and no functional check would ever have caught.
    const backdrop = this.add
      .rectangle(0, 0, GBC_WIDTH, GBC_HEIGHT, 0x000000, 0.97)
      .setOrigin(0, 0)
    const text = this.add.text(8, 17, `- GEAR -\n${body}`, {
      fontFamily: FONT,
      fontSize: '7px',
      color: CSS_LIGHTEST,
      align: 'left',
      // Names run past 20 characters at 7px on a 160px screen, and an
      // unwrapped line just leaves the screen.
      wordWrap: { width: GBC_WIDTH - 16 },
      resolution: 2,
      lineSpacing: 1,
    })
    panel.add([backdrop, text])
    this.gearPanel = panel
  }

  private moveGearCursor(delta: number) {
    const usable = this.usableItems()
    if (usable.length === 0) return
    this.gearCursor = (this.gearCursor + delta + usable.length) % usable.length
    sfx.menuMove()
    this.drawGearPanel()
  }

  /**
   * Uses whatever the panel's cursor is on (#105).
   *
   * Costs a turn, like attacking or opening a chest, and closes the panel —
   * an effect the player cannot see because a full-screen backdrop is over it
   * is not feedback.
   */
  private useSelectedItem() {
    const usable = this.usableItems()
    const entry = usable[this.gearCursor]
    if (!entry) return
    const def = entry.def
    this.closeGearPanel()

    if (def.category === 'potion') {
      const healed = Math.min(GameState.maxHp - GameState.playerHp, def.healAmount ?? 0)
      GameState.playerHp = Math.min(GameState.maxHp, GameState.playerHp + (def.healAmount ?? 0))
      GameState.inventory.remove(def.id)
      this.showDamageText(this.player.x, this.player.y - 10, `+${healed} HP`, '#ff88cc')
    } else if (def.category === 'scroll' && def.scrollEffect) {
      const effect = def.scrollEffect
      GameState.inventory.remove(def.id)
      // Identify on use — the one call that was missing. Without it
      // getDisplayName could only ever return the cryptic label, so
      // SCROLL_REAL_NAMES was unreachable and the player could never learn
      // what any scroll was.
      GameState.scrollIdentifier.identify(effect)
      this.applyScroll(effect)
    } else {
      return
    }

    sfx.pickup()
    GameState.turnState = TurnState.ANIMATING
    this.time.delayedCall(160, () => {
      if (GameState.advanceTurn()) this.showRegenTick()
      this.processEnemyTurn()
    })
  }

  private applyScroll(effect: string) {
    const spec = SCROLL_SPECS[effect]
    if (spec) {
      this.showDamageText(this.player.x, this.player.y - 18, spec.banner, '#ffff88')
    }

    if (effect === 'fire') {
      const hits = blastTargets(this.playerTX, this.playerTY, this.enemies, FIRE_RADIUS)
      for (const i of hits) {
        const enemy = this.enemies[i]
        const damage = this.scaleDamage(FIRE_DAMAGE)
        enemy.hp -= damage
        this.showDamageText(enemy.sprite.x, enemy.sprite.y - 6, `-${damage}`, '#ffaa44')
        if (enemy.hp <= 0) {
          // Same bookkeeping as a melee kill, so a scroll kill still counts
          // and still pays out. Reviving enemies are deliberately not spared
          // here: the revive is spent on the melee path, and letting fire
          // bypass it would make the scroll strictly better than a sword
          // against exactly the enemy it should struggle with.
          GameState.killsCount++
          const banked = GameState.addGold(enemy.ai === 'boss' ? 20 : enemy.isSplit ? 1 : 3)
          this.showDamageText(enemy.sprite.x, enemy.sprite.y + 4, `+${banked}g`, '#ffd700')
          enemy.sprite.setVisible(false)
        }
      }
      this.cameras.main.shake(180, 0.006)
      return
    }

    if (effect === 'teleport') {
      const blocked = [
        ...this.enemies.filter((e) => e.hp > 0).map((e) => ({ tx: e.tx, ty: e.ty })),
        ...this.chests.filter((c) => !c.opened).map((c) => ({ tx: c.tx, ty: c.ty })),
      ]
      const spots = teleportCandidates(this.grid, this.playerTX, this.playerTY, blocked)
      if (spots.length === 0) return
      const spot = spots[this.rng.nextInt(0, spots.length - 1)]
      this.playerTX = spot.x
      this.playerTY = spot.y
      this.player.x = spot.x * TILE + TILE / 2
      this.player.y = spot.y * TILE + TILE / 2
      this.updateFogOfWar()
      return
    }

    if (effect === 'map') {
      for (let y = 0; y < this.mapHeight; y++) {
        for (let x = 0; x < this.mapWidth; x++) this.explored[y][x] = true
      }
      this.updateFogOfWar()
      return
    }

    if (effect === 'strength') {
      GameState.playerBaseAtk += STRENGTH_BONUS
      GameState.recalcAtk()
    }
  }

  private tryPickupItem(tx: number, ty: number) {
    const idx = this.floorItems.findIndex(i => i.tx === tx && i.ty === ty)
    if (idx === -1) return

    const item = this.floorItems[idx]
    const def = item.def

    // Auto-use consumables, equip gear
    if (def.category === 'weapon' || def.category === 'armor' || def.category === 'accessory') {
      // Gear is equipped by walking onto it, so this is the only guard against
      // a downgrade — see GameState.isUpgrade. An item that loses the
      // comparison is left on the floor rather than consumed, so the player
      // can come back for it after a swap.
      if (!GameState.isUpgrade(def)) {
        this.showDamageText(this.player.x, this.player.y - 10, 'KEPT YOURS', '#a0a0a0')
        return
      }
      if (def.category === 'weapon') GameState.equipWeapon(def)
      else if (def.category === 'armor') GameState.equipArmor(def)
      else GameState.equipAccessory(def)
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
    } else if (def.category === 'key') {
      GameState.inventory.add(def)
      this.showDamageText(
        this.player.x,
        this.player.y - 10,
        `KEY x${GameState.inventory.count('key')}`,
        '#ffd700',
      )
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
    const sightRadius = this.modifier?.sightRadius ?? 4
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
