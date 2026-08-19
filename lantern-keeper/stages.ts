/**
 * The stage order, in one place (#88).
 *
 * This used to be spread across five files: the key list in `progress.ts`, the
 * darkness table in `constants.ts`, the tilemap loads in `BootScene`, and an
 * if-chain in `PlayScene` for the title and the spawn point. Adding the Grove,
 * the Climb and the Bridge meant editing all of them, and twice a stage went
 * in half-registered — once the advance never fired at all, so the level was
 * unreachable in normal play.
 *
 * The world map needs the same list a third time, so it lives here now and the
 * others read from it.
 *
 * `next` is deliberately *not* here. Progression is driven by which lantern
 * the player lights, not by array order — several stages end on a named
 * lantern that also grants an ability — so encoding an order here as well
 * would give two sources of truth for the same thing.
 */
export interface Stage {
  key: string
  /** Shown on the stage-title toast and on the world map. */
  title: string
  spawnX: number
  spawnY: number
}

export const STAGES: Stage[] = [
  { key: 'level1', title: 'THE FOREST', spawnX: 32, spawnY: 72 },
  { key: 'grove', title: 'THE FIREFLY GROVE', spawnX: 32, spawnY: 104 },
  { key: 'level2', title: 'THE MARSH', spawnX: 32, spawnY: 72 },
  { key: 'climb', title: 'THE QUIET CLIMB', spawnX: 32, spawnY: 416 },
  { key: 'level3', title: 'THE CANOPY', spawnX: 32, spawnY: 384 },
  { key: 'bridge', title: 'THE MOSSY BRIDGE', spawnX: 32, spawnY: 64 },
  { key: 'level4', title: 'THE HOLLOW', spawnX: 32, spawnY: 104 },
]

export const STAGE_KEYS = STAGES.map((s) => s.key)

export function stageFor(key: string): Stage {
  return STAGES.find((s) => s.key === key) ?? STAGES[0]
}

export function stageIndex(key: string): number {
  const i = STAGES.findIndex((s) => s.key === key)
  return i === -1 ? 0 : i
}
