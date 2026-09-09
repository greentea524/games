// Tube Runner's fixed numbers (#111, #120).
//
// What used to be here was the shell's, not this game's: a 160x144 render
// size, the DMG four-tone ramp, and the pixel font the 8px HUD drew in. #120
// moved the game onto `shared/stage3d.ts`, so none of it survives. The save
// key does, because it names data already on players' machines.

/** Storage key and envelope version for the saved best. */
export const SAVE_KEY = 'tube_runner_save'
export const SAVE_VERSION = 1

/**
 * The line drawn around the runner's limbs.
 *
 * Black, and against a black sky that is the point: the runner is lit from
 * straight ahead like everything else, so their limbs meet at edges the light
 * treats identically. Without an outline the figure reads as one blob at the
 * bottom of the frame rather than as something with legs.
 */
export const OUTLINE = 0x000000
