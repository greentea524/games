// --- Boss State Machine ---
// The Vault Guardian has 3 health phases with different behaviors.

export type BossPhase = 'rage' | 'summon' | 'desperate'

export interface BossState {
  phase: BossPhase
  summonCooldown: number
}

export function getBossPhase(hp: number, maxHp: number): BossPhase {
  const ratio = hp / maxHp
  if (ratio > 0.6) return 'rage'
  if (ratio > 0.3) return 'summon'
  return 'desperate'
}

export interface BossAction {
  type: 'attack' | 'charge' | 'summon' | 'idle'
  dx: number
  dy: number
}

export function bossAI(
  selfTX: number, selfTY: number,
  playerTX: number, playerTY: number,
  hp: number, maxHp: number,
  state: BossState,
  grid: string[],
  enemies: { tx: number; ty: number; hp: number }[]
): { action: BossAction; newState: BossState } {
  const dist = Math.abs(selfTX - playerTX) + Math.abs(selfTY - playerTY)
  const phase = getBossPhase(hp, maxHp)
  const newState: BossState = { ...state, phase }

  // --- RAGE PHASE (>60% HP): Aggressive chaser, attacks every turn ---
  if (phase === 'rage') {
    if (dist === 1) {
      return {
        action: { type: 'attack', dx: playerTX - selfTX, dy: playerTY - selfTY },
        newState,
      }
    }
    // Charge toward player
    const step = stepTowardBoss(selfTX, selfTY, playerTX, playerTY, grid, enemies)
    return {
      action: { type: 'charge', dx: step.dx, dy: step.dy },
      newState,
    }
  }

  // --- SUMMON PHASE (30-60% HP): Summons minions every 3 turns ---
  if (phase === 'summon') {
    newState.summonCooldown = Math.max(0, state.summonCooldown - 1)
    if (state.summonCooldown <= 0) {
      newState.summonCooldown = 3
      return {
        action: { type: 'summon', dx: 0, dy: 0 },
        newState,
      }
    }
    if (dist === 1) {
      return {
        action: { type: 'attack', dx: playerTX - selfTX, dy: playerTY - selfTY },
        newState,
      }
    }
    const step = stepTowardBoss(selfTX, selfTY, playerTX, playerTY, grid, enemies)
    return {
      action: { type: 'charge', dx: step.dx, dy: step.dy },
      newState,
    }
  }

  // --- DESPERATE PHASE (<30% HP): Double attack damage, relentless chase ---
  if (dist === 1) {
    return {
      action: { type: 'attack', dx: playerTX - selfTX, dy: playerTY - selfTY },
      newState,
    }
  }
  const step = stepTowardBoss(selfTX, selfTY, playerTX, playerTY, grid, enemies)
  return {
    action: { type: 'charge', dx: step.dx, dy: step.dy },
    newState,
  }
}

function stepTowardBoss(
  sx: number, sy: number, tx: number, ty: number,
  grid: string[], enemies: { tx: number; ty: number; hp: number }[]
): { dx: number; dy: number } {
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
    if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length &&
        grid[ny][nx] !== '#' && !enemies.some(e => e.tx === nx && e.ty === ny && e.hp > 0)) {
      return c
    }
  }
  return { dx: 0, dy: 0 }
}
