/**
 * Scroll effects (#105).
 *
 * Before this, the four scrolls were pickups that occupied an inventory slot
 * and did nothing: no code read `scrollEffect`, `ScrollIdentifier.identify`
 * had no callers, and there was no action that used an inventory item at all.
 * They are 20% of the floor drop pool by weight, so a fifth of every floor's
 * loot was inert.
 *
 * The geometry lives here rather than in the scene so it can be checked
 * without a browser. The scene owns the tweens, the text and the turn; this
 * module owns "which enemies does the fire scroll hit" and "where can the
 * teleport scroll legally put the player", which are the parts worth being
 * sure about.
 */

/** Tiles the player can stand on. Matches the scene's own walkability rule. */
const WALL = '#'

export interface ScrollSpec {
  /** Shown once the scroll is identified. */
  realName: string
  /** One line of feedback when it fires, kept under the banner width. */
  banner: string
}

export const SCROLL_SPECS: Record<string, ScrollSpec> = {
  fire: { realName: 'Scroll of Fire', banner: 'FLAMES ERUPT' },
  teleport: { realName: 'Scroll of Teleport', banner: 'ELSEWHERE' },
  map: { realName: 'Scroll of Mapping', banner: 'THE FLOOR IS KNOWN' },
  strength: { realName: 'Scroll of Strength', banner: 'STRONGER' },
}

/** How far the fire scroll reaches, in tiles, measured as manhattan distance. */
export const FIRE_RADIUS = 3
/** Damage before the floor's damage modifier is applied. */
export const FIRE_DAMAGE = 8
/** Permanent base-ATK gain from a strength scroll. */
export const STRENGTH_BONUS = 2

interface Positioned {
  tx: number
  ty: number
  hp: number
}

/**
 * Which enemies a fire scroll hits.
 *
 * Manhattan distance, to match the movement grid — a diagonal neighbour is two
 * steps away in this game, and using euclidean here would make the blast reach
 * further diagonally than the player can walk.
 *
 * Returns indices rather than the enemies themselves so the caller can mutate
 * its own array without this module knowing what an enemy is.
 */
export function blastTargets(
  px: number,
  py: number,
  enemies: Positioned[],
  radius = FIRE_RADIUS,
): number[] {
  const hit: number[] = []
  enemies.forEach((e, i) => {
    if (e.hp <= 0) return
    if (Math.abs(e.tx - px) + Math.abs(e.ty - py) <= radius) hit.push(i)
  })
  return hit
}

/**
 * Every tile a teleport scroll may land the player on.
 *
 * Excludes walls, the tile the player is already on — teleporting to where you
 * already stand is a wasted scroll, and the player would reasonably read it as
 * the scroll being broken — and anything occupied by a living enemy or an
 * unopened chest, which would put the player inside a solid object.
 */
export function teleportCandidates(
  grid: string[],
  px: number,
  py: number,
  blocked: { tx: number; ty: number }[],
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === WALL || grid[y][x] === ' ') continue
      if (x === px && y === py) continue
      if (blocked.some((b) => b.tx === x && b.ty === y)) continue
      out.push({ x, y })
    }
  }
  return out
}
