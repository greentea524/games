// Art still drawn at the old size, enlarged to the new one (#177).
import type Phaser from 'phaser'
import { SCALE } from './constants'

const RESERVED = new Set(['__DEFAULT', '__MISSING', '__WHITE', '__NORMAL'])
const done = new WeakSet<object>()

/**
 * Enlarges one generated texture by `SCALE`. Safe to call again: a texture is
 * only ever enlarged once.
 */
export function enlargeTexture(scene: Phaser.Scene, key: string): void {
  const source = scene.textures.get(key).getSourceImage() as HTMLCanvasElement
  if (done.has(source)) return
  const width = Math.round(source.width * SCALE)
  const height = Math.round(source.height * SCALE)
  const copy = document.createElement('canvas')
  copy.width = width
  copy.height = height
  const ctx = copy.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, 0, 0, width, height)
  scene.textures.remove(key)
  scene.textures.addCanvas(key, copy)
  done.add(copy)
}

/**
 * Enlarges every texture that exists, for `BootScene` to call once its
 * builders have run.
 *
 * #177 changes the canvas and leaves the art alone, so the game is whole at
 * the new size before any of it is redrawn. One and a half is not a whole
 * number of pixels, so an enlarged sprite has pixels of two widths, and it
 * shows. That ends as #178 and #179 replace each builder with art drawn at
 * 24, and this goes with the last of them.
 *
 * Only at boot, and only before anything holds a texture. Replacing a texture
 * destroys the old one: the walk animations lost their frames to it, and
 * called from the world scene it took the darkness overlay's canvas out from
 * under it mid-game. A texture made later is enlarged by name.
 */
export function enlargeTextures(scene: Phaser.Scene): void {
  for (const key of scene.textures.getTextureKeys()) {
    if (!RESERVED.has(key)) enlargeTexture(scene, key)
  }
}
