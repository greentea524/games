import Phaser from 'phaser'
import { BIOMES, SIDE, TILE_PX, frameFor, type Biome, type Layer } from '../forest'
import { GROUND, SCREEN_COLOURS, type Box } from '../screens'

/**
 * The forest behind a screen that is not a stage (#175): the three layers of
 * trees, the forest's own dark over them, and a strip of mossy stone along
 * the bottom. The pictures are drawn at the screen's resolution, so on a
 * camera that does not magnify they are shown at their own size.
 */
export function screenForest(scene: Phaser.Scene, biome: Biome, dim = 0.3) {
  const { width, height } = scene.scale
  const pal = BIOMES[biome]
  scene.cameras.main.setBackgroundColor(pal.void)
  ;(['far', 'mid', 'near'] as Layer[]).forEach((layer, i) => {
    // Each layer a different way along, so the trees do not line up.
    scene.add.tileSprite(0, 0, width, height, `forest_${biome}_${layer}`).setOrigin(0).setTilePosition(i * 37, i * 53)
  })
  scene.add.rectangle(0, 0, width, height, pal.gloom, dim).setOrigin(0)

  // The ground: a cap of moss along the top course, and the stone under it.
  const key = `stone_${biome}`
  const tex = scene.textures.get(key)
  const named = (name: string, mask: number) => {
    if (!tex.has(name)) tex.add(name, 0, frameFor(mask, 0) * TILE_PX, 0, TILE_PX, TILE_PX)
    return name
  }
  const cap = named('screen_cap', SIDE.down | SIDE.left | SIDE.right)
  const buried = named('screen_buried', SIDE.up | SIDE.down | SIDE.left | SIDE.right)
  const y = height - GROUND
  scene.add.tileSprite(0, y, width, TILE_PX, key, cap).setOrigin(0)
  scene.add.tileSprite(0, y + TILE_PX, width, GROUND - TILE_PX, key, buried).setOrigin(0)
}

/** A panel behind text: the HUD's near-black, with the forest's edge. */
export function panel(scene: Phaser.Scene, box: Box): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.fillStyle(SCREEN_COLOURS.panel, 0.92)
  g.fillRect(box.x, box.y, box.width, box.height)
  g.lineStyle(1, SCREEN_COLOURS.panelEdge, 1)
  g.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1)
  return g
}

export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`

export const FONT = '"Press Start 2P", monospace'

/** Text at the font's size times `scale`, with the title's shadow under it. */
export function heading(scene: Phaser.Scene, box: Box, text: string, scale = 2): Phaser.GameObjects.Text {
  return scene.add.text(box.x, box.y, text, {
    fontFamily: FONT,
    fontSize: `${8 * scale}px`,
    color: css(SCREEN_COLOURS.title),
    resolution: 1,
    shadow: { offsetX: scale, offsetY: scale, color: css(SCREEN_COLOURS.titleShadow), fill: true },
  })
}

export const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
