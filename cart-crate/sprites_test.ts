// The fox and the crates hold up on both screens (#162).
//
//   npx tsx cart-crate/sprites_test.ts
import { DMG_TONES, INK, OUTLINE, SPRITES, SPRITE_PX, pixels, playerKey, textureKey } from './sprites'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const names = Object.keys(SPRITES)
const N = SPRITE_PX

const tooBig = names.filter(
  (n) => SPRITES[n].length > N || SPRITES[n].some((row) => row.replace(/\.+$/, '').length > N),
)
check('every picture fits the tile', tooBig.length === 0, tooBig.join(', '))
const strange = names.filter((n) => SPRITES[n].some((row) => [...row].some((ch) => ch !== '.' && !INK[ch])))
check('every picture uses only real inks', strange.length === 0, strange.join(', '))

// A picture drawn to the tile's edge has no room for its outline there, and
// the part at the edge is bare against the floor (Pocket Dungeon, #157).
const onEdge = (rows: string[]) =>
  rows.some((row, y) => [...row.padEnd(N, '.')].some((ch, x) => ch !== '.' && (x === 0 || y === 0 || x >= N - 1 || y >= N - 1)))
const edged = names.filter((n) => onEdge(SPRITES[n]))
check('no picture touches the edge of its tile', edged.length === 0, edged.join(', '))
// The control: the first draft of the fox pushing upward, one column over.
const shoved = SPRITES.player_up_push.map((row) => (row.length ? `.${row}` : row))
check('and the check can fail: a picture shoved one pixel over touches it', onEdge(shoved))

const tones: number[] = Object.values(DMG_TONES)
const stray = names.filter((n) => pixels(n, 'dmg').flat().some((c) => c !== null && !tones.includes(c)))
check('the green screen uses only its four tones', stray.length === 0, stray.join(', '))

// Nothing in the lightest tone may meet the floor, which is that tone.
const bare = (name: string) => {
  const px = pixels(name, 'dmg')
  let count = 0
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (px[y][x] !== DMG_TONES.L) continue
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (px[y + dy]?.[x + dx] ?? null) === null)
      if (open) count++
    }
  }
  return count
}
const exposed = names.filter((n) => bare(n) > 0)
check('no pale pixel is open to the pale floor', exposed.length === 0, exposed.join(', '))
check('every picture is outlined', names.every((n) => pixels(n, 'gbc').flat().includes(OUTLINE.gbc)))

// The fox: each facing is its own picture, and each pose differs from standing.
const same = (a: string, b: string) => pixels(a, 'gbc').flat().join() === pixels(b, 'gbc').flat().join()
const facings = ['down', 'up', 'left', 'right'] as const
const alike: string[] = []
facings.forEach((a, i) => facings.slice(i + 1).forEach((b) => { if (same(`player_${a}`, `player_${b}`)) alike.push(`${a}/${b}`) }))
check('the fox looks different facing each way', alike.length === 0, alike.join(', '))
const still = facings.flatMap((f) => (['step', 'push'] as const).filter((p) => same(`player_${f}`, `player_${f}_${p}`)).map((p) => `${f} ${p}`))
check('stepping and pushing each differ from standing', still.length === 0, still.join(', '))
// A push reaches further toward the crate than standing does.
const reach = (name: string, edge: 'left' | 'right' | 'top' | 'bottom') => {
  const px = pixels(name, 'gbc')
  const filled = (x: number, y: number) => px[y][x] !== null
  const band = (i: number) => Array.from({ length: N }, (_, j) => (edge === 'left' || edge === 'right' ? filled(i, j) : filled(j, i))).filter(Boolean).length
  const near = edge === 'left' || edge === 'top' ? [1, 2, 3, 4] : [N - 2, N - 3, N - 4, N - 5]
  return near.reduce((a, i) => a + band(i), 0)
}
const leans: [string, 'left' | 'right' | 'top' | 'bottom'][] = [['left', 'left'], ['right', 'right'], ['down', 'bottom']]
for (const [facing, edge] of leans) {
  const idle = reach(`player_${facing}`, edge)
  const push = reach(`player_${facing}_push`, edge)
  check(`pushing ${facing}, the fox reaches toward the crate`, push > idle, `${push} pixels at that edge against ${idle}`)
}

// The crates: home must not be mistaken for not home, on either screen.
for (const mode of ['gbc', 'dmg'] as const) {
  const a = pixels('crate', mode).flat()
  const b = pixels('crate_on', mode).flat()
  const differ = a.filter((c, i) => c !== b[i]).length
  check(`${mode}: a crate on its target differs over most of its face`, differ > (N * N) / 2, `${differ} of ${N * N} pixels`)
}
// All but the four corner pixels, which no side of the picture touches.
check('a crate and its outline fill the tile', pixels('crate', 'gbc').flat().filter((c) => c !== null).length === N * N - 4)

check('texture keys: the fox by facing and pose', playerKey('gbc', 'left', 'push') === 'player_gbc_left_push' && playerKey('dmg', 'up') === 'player_dmg_up')
check('texture keys: a crate by world', textureKey('crate_on', 'gbc', 3) === 'crate_on_gbc_w3' && textureKey('crate', 'dmg') === 'crate_dmg')
check('texture keys: the fox has no world', textureKey('player_left_step', 'gbc', 4) === 'player_gbc_left_step')

console.log(failed ? `\n${failed} FAILED` : '\nALL SPRITE CHECKS PASS')
process.exit(failed ? 1 : 0)
