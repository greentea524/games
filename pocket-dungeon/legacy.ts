// Screens still laid out for the old 160×144 (#155).
import type Phaser from 'phaser'
import { SCALE } from './constants'

/**
 * Shows a scene laid out for 160×144 on the 240×216 screen, enlarged.
 *
 * Zoomed about the top-left corner rather than the centre, so one rule covers
 * both things on screen and things pinned to the camera with a scroll factor
 * of zero: either way a point at (x, y) lands at (x, y) times `SCALE`.
 */
export function legacyCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(SCALE)
}
