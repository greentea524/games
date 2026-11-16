// The Tiled maps, at the size they are drawn (#177).
//
// Seven JSON maps in `assets/` declare 16-pixel tiles, and their objects —
// spawns, doors, NPCs — are placed in pixels on that grid. The screen moved to
// 24-pixel tiles. The files are left as Tiled wrote them and scaled as they
// are loaded: a map opened in Tiled still shows what it always did, and one
// function is the whole of the change, where editing seven files by hand is
// seven chances to miss a door.
//
// No Phaser here, so `maps_test.ts` can run every map through it.

export interface TiledObject {
  x?: number
  y?: number
  width?: number
  height?: number
  [key: string]: unknown
}
export interface TiledLayer {
  type: string
  objects?: TiledObject[]
  [key: string]: unknown
}
export interface TiledTileset {
  tilewidth: number
  tileheight: number
  imagewidth?: number
  imageheight?: number
  [key: string]: unknown
}
export interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  layers: TiledLayer[]
  tilesets: TiledTileset[]
  [key: string]: unknown
}

/**
 * A map with every pixel measurement multiplied by `tile / its own tile`.
 *
 * The grid is not touched: the same cells hold the same tiles. A map already
 * at `tile` comes back as it is, so scaling twice is harmless — two of the
 * map keys share one file, and whether they share one parsed copy is the
 * loader's business.
 */
export function scaleTiledMap<T extends TiledMap>(map: T, tile: number): T {
  const k = tile / map.tilewidth
  if (k === 1) return map
  const len = (n: number | undefined) => (typeof n === 'number' ? n * k : n)
  map.tilewidth = tile
  map.tileheight = tile
  for (const set of map.tilesets) {
    set.tilewidth = len(set.tilewidth) as number
    set.tileheight = len(set.tileheight) as number
    set.imagewidth = len(set.imagewidth)
    set.imageheight = len(set.imageheight)
  }
  for (const layer of map.layers) {
    for (const o of layer.objects ?? []) {
      o.x = len(o.x)
      o.y = len(o.y)
      o.width = len(o.width)
      o.height = len(o.height)
    }
  }
  return map
}
