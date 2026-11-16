// The seven Tiled maps keep their grid and move their objects with it (#177).
//
//   npx tsx static/maps_test.ts
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LEGACY_TILE, PLAYER_SPEED, SCALE, TILE, scaled } from './constants'
import { scaleTiledMap, type TiledMap } from './maps'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const dir = fileURLToPath(new URL('./assets/', import.meta.url))
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
const load = (f: string) => JSON.parse(readFileSync(dir + f, 'utf8')) as TiledMap
check('all seven maps are here', files.length === 7, files.join(', '))

/** The cell an object's corner is in, and how far into it, as a fraction. */
const cell = (v: number | undefined, tile: number) => (typeof v === 'number' ? v / tile : null)

for (const f of files) {
  const before = load(f)
  const after = scaleTiledMap(load(f), TILE)
  const name = f.replace('.json', '')
  check(`${name}: declared ${LEGACY_TILE} pixels a tile on disk`, before.tilewidth === LEGACY_TILE && before.tileheight === LEGACY_TILE)
  check(`${name}: is ${TILE} once loaded`, after.tilewidth === TILE && after.tileheight === TILE)
  check(`${name}: the grid is the same size`, after.width === before.width && after.height === before.height)
  const tiles = (m: TiledMap) => JSON.stringify(m.layers.filter((l) => l.type === 'tilelayer').map((l) => l.data))
  check(`${name}: every cell holds the tile it did`, tiles(after) === tiles(before))
  check(`${name}: its tileset is cut at ${TILE}`, after.tilesets.every((t) => t.tilewidth === TILE && t.tileheight === TILE))

  const a = before.layers.flatMap((l) => l.objects ?? [])
  const b = after.layers.flatMap((l) => l.objects ?? [])
  const moved = a.filter((o, i) =>
    cell(o.x, LEGACY_TILE) !== cell(b[i].x, TILE) || cell(o.y, LEGACY_TILE) !== cell(b[i].y, TILE) ||
    cell(o.width, LEGACY_TILE) !== cell(b[i].width, TILE) || cell(o.height, LEGACY_TILE) !== cell(b[i].height, TILE),
  )
  check(`${name}: all ${a.length} objects are in the cells they were`, a.length === b.length && moved.length === 0, `${moved.length} moved`)

  // Twice is once: two map keys share one file.
  const twice = scaleTiledMap(scaleTiledMap(load(f), TILE), TILE)
  check(`${name}: scaling it again changes nothing`, JSON.stringify(twice) === JSON.stringify(after))
}

// The control: a map left as it is on disk puts its objects in the wrong cells.
const town = load('town.json')
const spawn = town.layers.flatMap((l) => l.objects ?? [])[0]
check(
  'and the check can fail: an unscaled object read on the new grid is in another cell',
  Math.floor((spawn.x as number) / TILE) !== Math.floor((spawn.x as number) / LEGACY_TILE) ||
    Math.floor((spawn.y as number) / TILE) !== Math.floor((spawn.y as number) / LEGACY_TILE),
  `x ${spawn.x}, y ${spawn.y}`,
)

// Movement is free, so its speed is a length too: the same tiles a second.
check('the kid walks as many tiles a second as before', PLAYER_SPEED / TILE === 60 / LEGACY_TILE, `${PLAYER_SPEED / TILE}`)
check('a length scales by the one factor', scaled(16) === TILE && scaled(10) === 15 && SCALE === 1.5)

console.log(failed ? `\n${failed} FAILED` : '\nALL MAP CHECKS PASS')
process.exit(failed ? 1 : 0)
