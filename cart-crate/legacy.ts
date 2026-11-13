// Screens still laid out for the old 160×144 (#160).
import type Phaser from 'phaser'
import { SCALE } from './constants'

/**
 * Shows a scene laid out for 160×144 on the 240×216 screen, enlarged.
 *
 * Zoomed about the top-left corner rather than the centre, so a point at
 * (x, y) lands at (x, y) times `SCALE` whether or not it scrolls. The same
 * helper Pocket Dungeon used between #155 and #159.
 */
export function legacyCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setOrigin(0, 0).setZoom(SCALE)
}
