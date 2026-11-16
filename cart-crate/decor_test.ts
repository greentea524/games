// The warehouse stays outside the puzzle, on every level (#163).
//
//   npx tsx cart-crate/decor_test.ts
import { GBC_HEIGHT, GBC_WIDTH, PAL, sx } from './constants'
import { CAMPAIGN_LEVELS } from './levels'
import {
  DECOR, DMG_DECOR, decorPalette, drawDecor, drawDecorFloor, isOutside, levelView, placeDecor, surround,
} from './decor'
import { TILE_PX, luma, worldPalette, type Painter } from './tiles'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const screen = { width: GBC_WIDTH, height: GBC_HEIGHT }
const hud = { top: sx(14), bottom: sx(12) }

/** A cell that is part of the level: floor, a drawn wall, a target, a crate, the fox. */
const playable = (grid: string[], x: number, y: number) => !isOutside(grid, x, y)

let decorated = 0
let bare = 0
let onLevel = 0
let total = 0
const kinds = new Set<string>()
for (const level of CAMPAIGN_LEVELS) {
  const view = levelView(level.grid, screen, hud)
  const cells = surround(level.grid, view, screen)
  const placed = placeDecor(level.grid, cells, level.id)
  total += placed.length
  placed.forEach((d) => kinds.add(d.kind))
  if (placed.length) decorated++
  else bare++
  onLevel += placed.filter((d) => playable(level.grid, d.x, d.y)).length
  onLevel += cells.filter((c) => playable(level.grid, c.x, c.y)).length
  if (cells.length === 0 && placed.length > 0) onLevel++
}
check(`decoration was placed for all ${CAMPAIGN_LEVELS.length} levels`, total > 0, `${total} pieces on ${decorated} levels, ${bare} with none`)
check('none of it, floor or furniture, is on a playable tile', onLevel === 0, `${onLevel} on the level`)
check('all four kinds turn up', kinds.size === DECOR.count, [...kinds].join(', '))

// The control: a placement that ignores the rule puts things on the level.
const first = CAMPAIGN_LEVELS[0]
const everywhere = first.grid.flatMap((row, y) => [...row].map((_, x) => ({ x, y })))
const careless = placeDecor(first.grid, everywhere, first.id).filter((d) => playable(first.grid, d.x, d.y))
check('and the check can fail: handed every cell, it would decorate the room', careless.length > 0, `${careless.length} pieces`)

// A level that fills its screen has no room, and gets nothing.
const full = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '##########' : '#........#'))
const fullCells = surround(full, levelView(full, screen, hud), screen)
check('a level with no spare space gets none', fullCells.length === 0 && placeDecor(full, fullCells, 1).length === 0)

// The same level always looks the same; a different one does not.
const again = (id: number) => {
  const level = CAMPAIGN_LEVELS[0]
  const cells = surround(level.grid, levelView(level.grid, screen, hud), screen)
  return JSON.stringify(placeDecor(level.grid, cells, id))
}
check('a level is decorated the same way every time', again(1) === again(1))
check('and differently from another', again(1) !== again(2))

// Cells run past the grid where the level does not reach the screen's edge.
const small = CAMPAIGN_LEVELS[0]
const smallCells = surround(small.grid, levelView(small.grid, screen, hud), screen)
check('the surround reaches past the level\'s own grid', smallCells.some((c) => c.y < 0 || c.y >= small.grid.length || c.x < 0))
// A scrolling level's surround stays inside what the camera's bounds cover.
const big = CAMPAIGN_LEVELS.find((l) => levelView(l.grid, screen, hud).follows)!
const bigCells = surround(big.grid, levelView(big.grid, screen, hud), screen)
const cols = Math.max(big.grid[0].length, GBC_WIDTH / TILE_PX)
const rows = Math.max(big.grid.length, GBC_HEIGHT / TILE_PX)
check('a scrolling level\'s surround stays inside the camera\'s bounds', bigCells.every((c) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows), big.title)

// --- the pictures
const raster = (width: number, draw: (p: Painter) => void) => {
  const px = Array.from({ length: TILE_PX }, () => Array<number>(width).fill(-1))
  draw((x, y, w, h, colour) => {
    for (let j = Math.max(0, y); j < Math.min(TILE_PX, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(width, x + w); i++) px[j][i] = colour
    }
  })
  return px
}
const mean = (px: number[]) => px.reduce((a, c) => a + luma(c), 0) / px.length
const tones: number[] = Object.values(PAL)
const dmgAll = [
  ...raster(2 * TILE_PX, (p) => drawDecorFloor(p, DMG_DECOR, true)).flat(),
  ...raster(DECOR.count * TILE_PX, (p) => drawDecor(p, DMG_DECOR)).flat(),
].filter((c) => c >= 0)
check('the green screen uses only its four tones', dmgAll.every((c) => tones.includes(c)))

for (let world = 1; world <= 5; world++) {
  const pal = decorPalette(world)
  const play = worldPalette(world)
  const floor = raster(2 * TILE_PX, (p) => drawDecorFloor(p, pal)).flat()
  const things = raster(DECOR.count * TILE_PX, (p) => drawDecor(p, pal)).flat().filter((c) => c >= 0)
  check(`world ${world}: the surround's floor is painted edge to edge`, floor.every((c) => c >= 0))
  // Darker than the play floor, and than a real crate's wood.
  const gap = luma(play.floorB) - mean(floor)
  check(`world ${world}: the surround is darker than the play floor`, gap > 30, `${gap.toFixed(0)} darker`)
  const brightest = Math.max(...things.map(luma))
  check(`world ${world}: nothing out there is as bright as a crate`, brightest < luma(0xa8682c) - 15, `${brightest.toFixed(0)} against ${luma(0xa8682c).toFixed(0)}`)
  // And still visible on its own floor.
  const stands = things.filter((c) => Math.abs(luma(c) - mean(floor)) > 12).length
  check(`world ${world}: but it can be seen on its floor`, stands > 600, `${stands} pixels`)
}
for (let frame = 0; frame < DECOR.count; frame++) {
  const px = raster(DECOR.count * TILE_PX, (p) => drawDecor(p, decorPalette(1)))
  const own = px.map((row) => row.slice(frame * TILE_PX, (frame + 1) * TILE_PX))
  const edge = own.some((row, y) => row.some((c, x) => c >= 0 && (x === 0 || y === 0 || x === TILE_PX - 1 || y === TILE_PX - 1)))
  check(`piece ${frame} is drawn, and inside its tile`, own.flat().some((c) => c >= 0) && !edge)
}

console.log(failed ? `\n${failed} FAILED` : '\nALL DECOR CHECKS PASS')
process.exit(failed ? 1 : 0)
