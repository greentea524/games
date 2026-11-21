// Pocket Dungeon's sprite pictures (#157).
//
//   npx tsx pocket-dungeon/sprites_test.ts
//
// The pictures are text, and text can be wrong in ways a screen hides: a row
// a character too long, a letter that is not an ink, a pale pixel hard
// against the edge of the tile where no outline can be drawn round it.
import { DMG_TONES, INK, OUTLINE, SPRITES, SPRITE_PX, pixels, textureKey } from './sprites'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const names = Object.keys(SPRITES)

{
  const tooBig = names.filter((n) => SPRITES[n].length > SPRITE_PX || SPRITES[n].some((r) => r.length > SPRITE_PX))
  check('every picture fits its tile', tooBig.length === 0, tooBig.join(', ') || `${names.length} pictures`)
  const strange = names.filter((n) => SPRITES[n].some((r) => [...r].some((ch) => ch !== '.' && !INK[ch])))
  check('and uses only inks that exist', strange.length === 0, strange.join(', ') || `${Object.keys(INK).length} inks`)
  const empty = names.filter((n) => pixels(n, 'gbc').flat().filter((p) => p !== null).length < 40)
  check('none is blank or nearly so', empty.length === 0, empty.join(', '))
}

{
  // The texture keys the game asks for by name.
  const wanted = ['hero_gbc_down', 'hero_dmg_right', 'rat_gbc', 'chest_locked_open_dmg', 'item_rewind_gbc', 'boss_choir_dmg', 'portal_gbc']
  const made = new Set(names.flatMap((n) => [textureKey(n, 'gbc'), textureKey(n, 'dmg')]))
  const missing = wanted.filter((k) => !made.has(k))
  check('the keys the game asks for are all made', missing.length === 0, missing.join(', ') || `${made.size} keys`)
}

/**
 * Pale pixels with no outline between them and the floor, on the green
 * screen: the lightest tone touching clear space or the tile's edge. The
 * floor there is that same tone, so such a pixel is part of the floor.
 */
function bitten(grid: (number | null)[][]): number {
  let n = 0
  for (let y = 0; y < SPRITE_PX; y++) {
    for (let x = 0; x < SPRITE_PX; x++) {
      if (grid[y][x] !== DMG_TONES.L) continue
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const v = grid[y + dy]?.[x + dx]
        return v === undefined || v === null
      })
      if (open) n++
    }
  }
  return n
}

{
  // The cobweb is drawn bare on purpose and has no lightest tone in it.
  const worst = names.map((n) => ({ n, b: bitten(pixels(n, 'dmg')) })).sort((a, b) => b.b - a.b)[0]
  check(
    'on the green screen no pale pixel is left open to the floor',
    worst.b === 0,
    `worst is ${worst.n} with ${worst.b}`,
  )
  // Staged: the boss as first drawn, with its crown on the top row of the
  // tile, where there is no room for an outline above it.
  const crown = pixels('boss', 'dmg')
  crown.shift()
  crown.push(new Array(SPRITE_PX).fill(null))
  check('and a crown drawn against the top edge is caught', bitten(crown) > 0, `${bitten(crown)} open pixels`)
}

{
  // Every sprite has an outline somewhere, except the bare cobweb.
  const bare = names.filter((n) => !pixels(n, 'gbc').flat().includes(OUTLINE.gbc))
  check('everything but the cobweb is outlined', bare.join() === 'cobweb', bare.join(', '))
  const tones = new Set<number>(Object.values(DMG_TONES))
  const stray = names.filter((n) => pixels(n, 'dmg').flat().some((p) => p !== null && !tones.has(p)))
  check('the green-screen sprites use only its four tones', stray.length === 0, stray.join(', '))
}

console.log(ok ? '\nALL POCKET DUNGEON SPRITE CHECKS PASS' : '\nPOCKET DUNGEON SPRITE CHECKS FAILED')
process.exit(ok ? 0 : 1)
