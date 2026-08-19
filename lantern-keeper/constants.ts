export const GBC_WIDTH = 160
export const GBC_HEIGHT = 144
export const TILE_SIZE = 8

// Fading firefly glow (KAN-113) — all tunable
export const GLOW = {
  maxRadius: 24,
  minRadius: 5,
  durationMs: 30000, // time for a full glow to fade to minimum
} as const

// Lantern fuel (#70) — all tunable.
//
// The player's light used to be free and infinite: `playerLightRadius()`
// returned `GLOW.maxRadius` and nothing ever reduced it, so the darkness only
// ever receded and was scenery rather than a threat.
//
// `GLOW.durationMs` and `GLOW.minRadius` were the fossils of an earlier
// attempt at this — a 30s glow timeout that *killed* you, removed because
// running dry meant standing in the dark waiting to die (see the respawn
// comment in PlayScene). Both constants were left behind, referenced nowhere.
// This revives the idea without the part that was wrong with it: running dry
// blinds, it does not kill, and it is always recoverable because lit lanterns
// keep their own permanent glow and the level's darkness never reaches full
// opacity (see DARKNESS_ALPHA), so terrain outlines stay readable at empty.
export const FUEL = {
  /** A full tank, in ms of play. Drains on a timer, not on movement. */
  maxMs: GLOW.durationMs,
  /** Below this fraction the HUD gauge warns and the low-fuel cue plays. */
  lowRatio: 0.25,
  /** What one oil flask restores, as a fraction of a tank. */
  flaskRatio: 0.5,
} as const

// Dash (KAN-114) — all tunable
export const SPAWN_POINT = { x: 32, y: 360 }
export const DASH = {
  speed: 400,
  durationMs: 100, // 40px = 5 tiles of travel
  cooldownMs: 400,
  bufferMs: 120, // presses this early still fire when the cooldown ends
} as const

// Wall-cling (KAN-115) — all tunable
export const WALL = {
  slideSpeed: 25, // max fall speed while clinging
  jumpVx: 100, // horizontal kick away from the wall
  jumpVy: -150,
  coyoteMs: 80, // wall-jump grace after leaving the wall
  jumpLockMs: 150, // arrows can't override the kick during this window
} as const

// Jump feel (KAN-112 tuning note)
export const JUMP_ASSIST = {
  coyoteMs: 80,
  bufferMs: 100,
} as const

// Darkness overlay per level (issue #7) — kept below 1 so terrain
// outlines stay faintly visible even without direct lantern light.
// Later levels stay darker, but never fully opaque.
export const DARKNESS_ALPHA: Record<string, number> = {
  level1: 0.76,
  // The Firefly Grove (#90) is the lightest stage in the game on purpose: it
  // is a breather whose whole point is looking at the lanterns and the
  // fireflies around them, and darkness that hides them defeats it.
  grove: 0.70,
  // The Quiet Climb (#91) sits between the Marsh and the Canopy, so it is
  // pitched between their two settings rather than being another bright stage.
  climb: 0.78,
  level2: 0.80,
  level3: 0.80,
  level4: 0.82,
}

// Procedural stage decorations (issue #7) — density per exposed surface
export const DECO = {
  topDensity: 0.35, // chance of a plant on an exposed tile top
  vineDensity: 0.22, // chance of a vine under an exposed tile bottom
} as const

/**
 * Firefly ambience (#65).
 *
 * `max` is a hard cap rather than a density, because density alone tanks the
 * frame rate on a large map: every firefly is a sprite moved every frame, and
 * level 4 is wide enough that 2% of its open tiles would be hundreds of them.
 *
 * They are spawned near lanterns rather than uniformly. That is what "density
 * varies with local light" means here, and it is also what makes them read as
 * belonging to the lanterns rather than as screen dirt.
 */
export const FIREFLY = {
  /** Hard ceiling on live fireflies, whatever the map size. */
  max: 40,
  /** How many to try to place around each lantern. */
  perLantern: 6,
  /** Radius around a lantern that fireflies are scattered into, in px. */
  spread: 40,
  /** Drift, as a slow sine on each axis. */
  driftX: 5,
  driftY: 3,
  /** Seconds for a full drift cycle; each firefly gets its own phase. */
  periodMs: 4200,
  /** Resting alpha, and what a lit lantern nearby lifts it to. */
  alpha: 0.45,
  alphaLit: 0.9,
} as const

/**
 * DANGER signposts (#65).
 *
 * This game has no fall damage. Landing six tiles lower costs nothing, so a
 * deep drop is not a hazard — the only fall that hurts is one that reaches
 * the world-bounds floor and respawns you. A signposted ledge is therefore
 * one whose neighbouring column is empty all the way to the bottom of the
 * map, not merely one with a long way down.
 *
 * `minDrop` is the shortest such void worth marking, so a sign never appears
 * on a ledge one tile above the map floor.
 */
export const SIGNPOST = {
  minDrop: 6,
  /** Minimum gap between two signposts, in tiles, so ledges do not crowd. */
  minSpacing: 8,
} as const

// GBC-inspired 4-color palette
export const PAL = {
  darkest: 0x0f1a12,
  dark: 0x2d4a33,
  light: 0x86b06a,
  lightest: 0xe0f8cf,
  warm: 0xffcc66,
} as const
