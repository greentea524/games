// The kid, the townsfolk, the static and the items hold up on both screens (#179).
//
//   npx tsx static/sprites_test.ts
import {
  DMG_TONES, INK, OUTLINE, PEOPLE, SPRITES, SPRITE_PX, crackleMs, person, pixels, textureKey, type Person,
} from './sprites'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const names = Object.keys(SPRITES)
const N = SPRITE_PX

// Every key the scenes ask for. A name missing here is a sprite still drawn
// at 16 pixels and enlarged.
const facings = ['down', 'up', 'left', 'right'] as const
const wanted = [
  ...facings.flatMap((f) => [`kid_${f}_0`, `kid_${f}_1`]),
  ...['mom', 'ren', 'gus', 'baker'].flatMap((id) => facings.map((f) => `npc_${id}_${f}`)),
  ...['corruption_sealed', 'corruption_open', 'tv', 'entity'].flatMap((n) => [n, `${n}_b`]),
  'beacon',
  ...['flashlight', 'flashlight_dead', 'flower', 'flower_fresh', 'photo', 'photo_intact', 'ledger', 'ledger_unredacted', 'ren_key', 'signal_shard'].map((n) => `item_${n}`),
]
const missing = wanted.filter((n) => !names.includes(n))
const extra = names.filter((n) => !wanted.includes(n))
check('every sprite the game places is drawn here', missing.length === 0 && extra.length === 0, [...missing, ...extra].join(', '))

const strange = names.filter((n) => SPRITES[n].some((row) => [...row].some((ch) => ch !== '.' && !INK[ch])))
check('every picture uses only real inks', strange.length === 0, strange.join(', '))
const wide = names.filter((n) => SPRITES[n].some((row) => row.replace(/\.+$/, '').length > N))
check('every picture fits the tile across', wide.length === 0, wide.join(', '))

// A picture drawn to the edge has no room for its outline there (#157).
const onEdge = (rows: string[]) =>
  rows.some((row, y) => [...row.padEnd(N, '.')].some((ch, x) => ch !== '.' && (x === 0 || y === 0 || x >= N - 1 || y >= Math.max(N, rows.length) - 1)))
const edged = names.filter((n) => onEdge(SPRITES[n]))
check('no picture touches the edge of its tile', edged.length === 0, edged.join(', '))
// The control: the baker as first drawn, with the hat's puff on the top row.
const raised = [...SPRITES.npc_baker_down.slice(1), '']
check('and the check can fail: a hat on the top row touches it', onEdge(raised))

const tones: number[] = Object.values(DMG_TONES)
const stray = names.filter((n) => pixels(n, 'dmg').flat().some((c) => c !== null && !tones.includes(c)))
check('the green screen uses only its four tones', stray.length === 0, stray.join(', '))

// Nothing in the lightest tone may meet the grass, which is that tone.
const bare = (px: (number | null)[][]) => {
  let count = 0
  px.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== DMG_TONES.L) return
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (px[y + dy]?.[x + dx] ?? null) === null)) count++
    }),
  )
  return count
}
const exposed = names.filter((n) => bare(pixels(n, 'dmg')) > 0)
check('no pale pixel is open to the pale grass', exposed.length === 0, exposed.join(', '))
// And a sprite that is only pale inside is an outline round nothing.
const hollow = names.filter((n) => {
  const px = pixels(n, 'dmg').flat()
  return px.filter((c) => c === DMG_TONES.d || c === DMG_TONES.D).length < 30
})
check('every picture has dark in it on the green screen', hollow.length === 0, hollow.join(', '))

// --- the people: told apart by outline, not by the colour of a shirt
const outline = (rows: string[]) => rows.flatMap((row) => [...row.padEnd(N, '.')].map((ch) => ch !== '.'))
const apart = (a: string[], b: string[]) => {
  const A = outline(a)
  const B = outline(b)
  return A.filter((on, i) => on !== B[i]).length
}
const ids = Object.keys(PEOPLE)
let closest = Infinity
let closestPair = ''
ids.forEach((a, i) =>
  ids.slice(i + 1).forEach((b) => {
    const d = apart(person(PEOPLE[a], 'down'), person(PEOPLE[b], 'down'))
    if (d < closest) { closest = d; closestPair = `${a} and ${b}` }
  }),
)
check('no two people share a silhouette', closest >= 12, `the closest are ${closestPair}, ${closest} pixels apart`)
// The control: how the game told them apart before. Ren in another shirt.
const recoloured: Person = { ...PEOPLE.ren, top: 'R', topDark: 'r' }
check('and the check can fail: a change of shirt is the same outline', apart(person(PEOPLE.ren, 'down'), person(recoloured, 'down')) === 0)

const same = (a: string, b: string) => pixels(a, 'gbc').flat().join() === pixels(b, 'gbc').flat().join()
const who = (id: string, f: string, step?: number) => (id === 'kid' ? `kid_${f}_${step ?? 0}` : `npc_${id}_${f}`)
const alike: string[] = []
for (const id of ids) {
  facings.forEach((a, i) => facings.slice(i + 1).forEach((b) => { if (same(who(id, a), who(id, b))) alike.push(`${id} ${a}/${b}`) }))
}
check('everyone looks different facing each way', alike.length === 0, alike.join(', '))
const frozen = facings.filter((f) => same(`kid_${f}_0`, `kid_${f}_1`))
check('the kid\'s step differs from standing, every way', frozen.length === 0, frozen.join(', '))
const mirrored = SPRITES.kid_right_0.every((row, y) => [...row].reverse().join('') === SPRITES.kid_left_0[y].padEnd(N, '.'))
check('right is left in a mirror', mirrored)

// --- the static
const mask = (name: string) => pixels(name, 'gbc').flat().map((c) => c !== null)
for (const mode of ['gbc', 'dmg'] as const) {
  const a = pixels('corruption_sealed', mode).flat()
  const b = pixels('corruption_open', mode).flat()
  const differ = a.filter((c, i) => c !== b[i]).length
  check(`${mode}: a sealed patch and an open one differ over most of the tear`, differ > 150, `${differ} pixels`)
  const f = pixels('corruption_sealed_b', mode).flat()
  const moved = a.filter((c, i) => c !== f[i]).length
  check(`${mode}: and the two frames of the crackle differ`, moved > 80, `${moved} pixels`)
}
const open = pixels('corruption_open', 'gbc').flat()
const sealed = pixels('corruption_sealed', 'gbc').flat()
const inTear = SPRITES.corruption_sealed.join('').replace(/\./g, '').length
const clear = sealed.filter((c, i) => c !== null && open[i] === null).length
check('an open patch is mostly clear: you can see the ground through it', clear > inTear / 2, `${clear} of ${inTear} pixels`)
// The outline must not creep inside an open tear: it did, and filled it in.
const ringed = pixels('corruption_open', 'gbc').flat().filter((c) => c === OUTLINE.gbc).length
const ringedSealed = pixels('corruption_sealed', 'gbc').flat().filter((c) => c === OUTLINE.gbc).length
check('an open tear is outlined only round its outside', ringed === ringedSealed, `${ringed} outline pixels against ${ringedSealed} sealed`)
const light = sealed.filter((c) => c === INK.X[0]).length
const dark = sealed.filter((c) => c === INK.x[0]).length
check('a sealed patch is black and white noise', light > 60 && dark > 60, `${light} light, ${dark} dark`)
check('with a bright edge', sealed.filter((c) => c === INK.C[0]).length > 30)
for (const n of ['corruption_sealed', 'tv', 'entity']) {
  const a = mask(n)
  const b = mask(`${n}_b`)
  // The sparks thrown off a tear move; nothing else about a shape may. (An
  // open tear's sparks are its inside, so its outline is what is held above.)
  const moved = a.filter((on, i) => on !== b[i]).length
  check(`${n}: the crackle does not change its shape`, moved <= (n === 'corruption_sealed' ? 60 : 0), `${moved} pixels`)
}

// --- motion
check('the static crackles', crackleMs(false) <= 150)
check('slowly under reduced motion: under three changes a second', 1000 / crackleMs(true) < 3 && crackleMs(true) > crackleMs(false) * 3, `${(1000 / crackleMs(true)).toFixed(1)} a second`)

check('texture keys: the palette where the game has always put it',
  textureKey('kid_down_0', 'gbc') === 'kid_gbc_down_0' && textureKey('npc_mom_left', 'dmg') === 'npc_dmg_mom_left' &&
  textureKey('item_photo', 'gbc') === 'item_gbc_photo' && textureKey('corruption_sealed', 'dmg') === 'corruption_sealed_dmg' &&
  textureKey('corruption_open_b', 'gbc') === 'corruption_open_gbc_b' && textureKey('tv', 'dmg') === 'tv_dmg' && textureKey('beacon', 'gbc') === 'beacon_gbc')

console.log(failed ? `\n${failed} FAILED` : '\nALL SPRITE CHECKS PASS')
process.exit(failed ? 1 : 0)
