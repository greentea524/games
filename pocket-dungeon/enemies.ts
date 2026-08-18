import { RNG } from './rng'

// --- Strategy Pattern: Each enemy type has a different AI behavior ---

export type AIType = 'chaser' | 'coward' | 'ranger' | 'sleeper' | 'splitter'

export interface AIContext {
  selfTX: number
  selfTY: number
  playerTX: number
  playerTY: number
  grid: string[]
  enemies: { tx: number; ty: number; hp: number }[]
  rng: RNG
}

export interface AIResult {
  dx: number
  dy: number
  action: 'move' | 'attack' | 'shoot' | 'idle' | 'split'
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2)
}

function isWalkable(grid: string[], x: number, y: number): boolean {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return false
  return grid[y][x] !== '#'
}

function stepToward(sx: number, sy: number, tx: number, ty: number, grid: string[], enemies: { tx: number; ty: number; hp: number }[]): { dx: number; dy: number } {
  const candidates: { dx: number; dy: number }[] = []
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) {
    candidates.push({ dx: tx > sx ? 1 : -1, dy: 0 })
    candidates.push({ dx: 0, dy: ty > sy ? 1 : -1 })
  } else {
    candidates.push({ dx: 0, dy: ty > sy ? 1 : -1 })
    candidates.push({ dx: tx > sx ? 1 : -1, dy: 0 })
  }
  for (const c of candidates) {
    const nx = sx + c.dx
    const ny = sy + c.dy
    if (isWalkable(grid, nx, ny) && !enemies.some(e => e.tx === nx && e.ty === ny && e.hp > 0)) {
      return c
    }
  }
  return { dx: 0, dy: 0 }
}

function stepAway(sx: number, sy: number, tx: number, ty: number, grid: string[], enemies: { tx: number; ty: number; hp: number }[]): { dx: number; dy: number } {
  const candidates = [
    { dx: tx < sx ? 1 : -1, dy: 0 },
    { dx: 0, dy: ty < sy ? 1 : -1 },
    { dx: tx > sx ? 1 : -1, dy: 0 },
    { dx: 0, dy: ty > sy ? 1 : -1 },
  ]
  for (const c of candidates) {
    const nx = sx + c.dx
    const ny = sy + c.dy
    if (isWalkable(grid, nx, ny) && !enemies.some(e => e.tx === nx && e.ty === ny && e.hp > 0)) {
      return c
    }
  }
  return { dx: 0, dy: 0 }
}

// Chaser: Always moves directly toward the player. Simple and relentless.
export function chaserAI(ctx: AIContext): AIResult {
  const dist = manhattan(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY)
  if (dist === 1) {
    return { dx: ctx.playerTX - ctx.selfTX, dy: ctx.playerTY - ctx.selfTY, action: 'attack' }
  }
  const { dx, dy } = stepToward(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
  return { dx, dy, action: 'move' }
}

// Coward: Runs away when HP is below 50%, otherwise chases.
export function cowardAI(ctx: AIContext, hp: number, maxHp: number): AIResult {
  const dist = manhattan(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY)
  const fleeing = hp < maxHp * 0.5

  if (fleeing) {
    const { dx, dy } = stepAway(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
    return { dx, dy, action: 'move' }
  }

  if (dist === 1) {
    return { dx: ctx.playerTX - ctx.selfTX, dy: ctx.playerTY - ctx.selfTY, action: 'attack' }
  }
  const { dx, dy } = stepToward(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
  return { dx, dy, action: 'move' }
}

// Ranger: Attacks from range (2-4 tiles). Keeps distance, shoots when in range.
export function rangerAI(ctx: AIContext): AIResult {
  const dist = manhattan(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY)

  if (dist >= 2 && dist <= 4) {
    // In range - shoot!
    const dx = ctx.playerTX > ctx.selfTX ? 1 : ctx.playerTX < ctx.selfTX ? -1 : 0
    const dy = ctx.playerTY > ctx.selfTY ? 1 : ctx.playerTY < ctx.selfTY ? -1 : 0
    return { dx, dy, action: 'shoot' }
  }

  if (dist === 1) {
    // Too close, run away
    const { dx, dy } = stepAway(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
    return { dx, dy, action: 'move' }
  }

  // Too far, move closer
  const { dx, dy } = stepToward(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
  return { dx, dy, action: 'move' }
}

// Sleeper: Idles until the player is within 3 tiles, then chases aggressively.
export function sleeperAI(ctx: AIContext, awake: boolean): AIResult & { nowAwake: boolean } {
  const dist = manhattan(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY)

  if (!awake && dist > 3) {
    return { dx: 0, dy: 0, action: 'idle', nowAwake: false }
  }

  // Now awake!
  if (dist === 1) {
    return { dx: ctx.playerTX - ctx.selfTX, dy: ctx.playerTY - ctx.selfTY, action: 'attack', nowAwake: true }
  }
  const { dx, dy } = stepToward(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
  return { dx, dy, action: 'move', nowAwake: true }
}

// Splitter: When killed, spawns 2 smaller copies. The AI itself is a simple chaser.
export function splitterAI(ctx: AIContext): AIResult {
  const dist = manhattan(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY)
  if (dist === 1) {
    return { dx: ctx.playerTX - ctx.selfTX, dy: ctx.playerTY - ctx.selfTY, action: 'attack' }
  }
  const { dx, dy } = stepToward(ctx.selfTX, ctx.selfTY, ctx.playerTX, ctx.playerTY, ctx.grid, ctx.enemies)
  return { dx, dy, action: 'move' }
}

// --- Enemy Definitions ---

export interface EnemyDef {
  name: string
  ai: AIType
  hp: number
  atk: number
  spriteKey: string // base sprite key (mode will be appended)
  cost: number      // spawning budget cost
  /**
   * Gets back up once after being killed, at a fraction of its HP (#60).
   * The scene owns the actual revive; this only marks which defs do it.
   */
  revives?: boolean
}

/** What a reviving enemy comes back with, as a fraction of its max HP. */
export const REVIVE_HP_FRACTION = 0.5

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  rat: { name: 'Cellar Rat', ai: 'chaser', hp: 6, atk: 2, spriteKey: 'rat', cost: 1 },
  bat: { name: 'Cave Bat', ai: 'coward', hp: 4, atk: 3, spriteKey: 'bat', cost: 1 },
  archer: { name: 'Skeleton Archer', ai: 'ranger', hp: 8, atk: 3, spriteKey: 'archer', cost: 2 },
  spider: { name: 'Giant Spider', ai: 'sleeper', hp: 10, atk: 4, spriteKey: 'spider', cost: 2 },
  slime: { name: 'Gel Slime', ai: 'splitter', hp: 12, atk: 2, spriteKey: 'slime', cost: 3 },
  // #60. 'Bonepile', not 'Skeleton' — `archer` is already the Skeleton
  // Archer, and two enemies whose inspect text both begin "Skeleton" would
  // be unreadable in a game where you identify things by a one-line banner.
  //
  // A plain chaser on paper, sitting between the rat and the archer. What
  // makes it worth noticing is `revives`: it gets back up once, at reduced
  // HP, so it costs the player two engagements rather than one. That is
  // priced into cost 2 rather than into bigger numbers.
  skeleton: {
    name: 'Bonepile', ai: 'chaser', hp: 7, atk: 3, spriteKey: 'skeleton', cost: 2,
    revives: true,
  },
}

// --- Depth-scaled Spawning ---

interface SpawnEntry {
  defKey: string
  weight: number
}

const BIOME_SPAWN_TABLES: Record<string, SpawnEntry[]> = {
  cellar: [
    { defKey: 'rat', weight: 5 },
    { defKey: 'bat', weight: 3 },
    { defKey: 'spider', weight: 1 },
  ],
  catacomb: [
    { defKey: 'rat', weight: 2 },
    { defKey: 'bat', weight: 3 },
    { defKey: 'archer', weight: 4 },
    { defKey: 'spider', weight: 3 },
    { defKey: 'slime', weight: 2 },
    // Bonepile enters at the catacombs (floor 5), not the cellar: floors 1-4
    // are where the base game is learned, and an enemy that gets back up is a
    // poor first lesson. Weighted below the archer so it adds to the mix
    // rather than crowding it — see the distribution check in
    // enemies_test.ts.
    { defKey: 'skeleton', weight: 3 },
  ],
  vault: [
    { defKey: 'archer', weight: 4 },
    { defKey: 'spider', weight: 3 },
    { defKey: 'slime', weight: 4 },
    { defKey: 'skeleton', weight: 3 },
  ],
}

export function getBiome(depth: number): string {
  if (depth <= 4) return 'cellar'
  if (depth <= 8) return 'catacomb'
  return 'vault'
}

export function getSpawnBudget(depth: number): number {
  // Budget scales: floors 1-4 = 4-7, floors 5-8 = 8-11, floors 9-12 = 12-15
  return depth + 3
}

/**
 * @param budgetBonus Added to the depth-derived budget by a floor modifier
 *   (#69) — Overgrown and Treasury both crowd the floor.
 */
export function rollEnemies(
  depth: number,
  rng: RNG,
  budgetBonus = 0,
): { defKey: string; def: EnemyDef }[] {
  const biome = getBiome(depth)
  const table = BIOME_SPAWN_TABLES[biome]
  let budget = getSpawnBudget(depth) + budgetBonus
  const result: { defKey: string; def: EnemyDef }[] = []

  // Build weighted pool
  const totalWeight = table.reduce((s, e) => s + e.weight, 0)

  let attempts = 0
  while (budget > 0 && attempts < 100) {
    attempts++
    let roll = rng.nextFloat(0, totalWeight)
    let picked: SpawnEntry | null = null
    for (const entry of table) {
      roll -= entry.weight
      if (roll <= 0) {
        picked = entry
        break
      }
    }
    if (!picked) picked = table[table.length - 1]

    const def = ENEMY_DEFS[picked.defKey]
    if (def.cost <= budget) {
      budget -= def.cost
      result.push({ defKey: picked.defKey, def: { ...def } })
    }
  }

  return result
}
