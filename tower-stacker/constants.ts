// Tower Stacker's fixed numbers (#110, #119).
//
// What used to be here was mostly GameBoy: a 160x144 render target, the DMG
// four-tone ramp, and the pixel font the 8px HUD drew in. #119 moved the game
// onto `shared/stage3d.ts` — a full-resolution responsive canvas in full
// colour — so none of that survives. The save key does, because it names data
// already on players' machines and renaming it would silently reset every
// stored best.

/** Storage key and envelope version for the single saved best height. */
export const SAVE_KEY = 'tower_stacker_save'
export const SAVE_VERSION = 1

/**
 * The sky, and the outline every block carries.
 *
 * Dark, but not black. The blocks' dimmest visible face has to sit clearly
 * above the background — see the lighting table in `game.ts` — and a pure
 * black sky makes that easy to satisfy and easy to stop checking. A sky with
 * a little luminance in it keeps the claim honest.
 */
export const SKY = 0x0e1420
export const OUTLINE = 0x080b12
