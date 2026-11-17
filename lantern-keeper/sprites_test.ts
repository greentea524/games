// The keeper, the lanterns and the props hold up, and the keeper's box is
// the size it always was (#173).
//
//   npx tsx lantern-keeper/sprites_test.ts
import { ART_SCALE, BIOMES, luminance } from './forest'
import {
  HEART_TREE_PX, INK, KEEPER_BODY, KEEPER_H, KEEPER_W, OUTLINE, SIGN_H, SIGN_W, SIZE, SPRITES, drawHeartTree, pixels, sign,
  worldSize,
} from './sprites'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const names = Object.keys(SPRITES)

// Every key the scenes ask for. A name missing here is art still drawn at
// one pixel to the unit.
const wanted = [
  'player_idle', 'player_walk1', 'player_walk2', 'player_cling', 'lanternUnlit', 'lanternLit', 'oil_flask', 'deco_grass',
  'deco_fern', 'deco_shroom', 'deco_vine', 'bouncy_shroom', 'crumble_plank', 'guidance_arrow', 'signpost',
]
const missing = wanted.filter((n) => !names.includes(n))
const extra = names.filter((n) => !wanted.includes(n))
check('every sprite the game places is drawn here', missing.length === 0 && extra.length === 0, [...missing, ...extra].join(', '))
check('and each has a size', names.every((n) => SIZE[n]?.length === 2))

const strange = names.filter((n) => SPRITES[n].some((row) => [...row].some((ch) => ch !== '.' && INK[ch] === undefined)))
check('every picture uses only real inks', strange.length === 0, strange.join(', '))
const tooBig = names.filter((n) => SPRITES[n].length > SIZE[n][1] || SPRITES[n].some((row) => row.replace(/\.+$/, '').length > SIZE[n][0]))
check('every picture fits the size it claims', tooBig.length === 0, tooBig.join(', '))
// The control: a row one pixel too long.
const long = [...SPRITES.oil_flask, '.'.repeat(SIZE.oil_flask[0]) + 'm']
check('and the check can fail: a row past the edge does not', long.some((row) => row.replace(/\.+$/, '').length > SIZE.oil_flask[0]))
// Shown at half size, a picture with an odd side would sit between pixels.
const odd = names.filter((n) => SIZE[n][0] % ART_SCALE !== 0 || SIZE[n][1] % ART_SCALE !== 0)
check('every picture is a whole number of units each way', odd.length === 0, odd.join(', '))

// --- the keeper's box
check('the keeper\'s box is six units square, as it always was', KEEPER_BODY.width / ART_SCALE === 6 && KEEPER_BODY.height / ART_SCALE === 6)
check('it is at the picture\'s foot', KEEPER_BODY.offsetY + KEEPER_BODY.height === KEEPER_H)
check('and in its middle', KEEPER_BODY.offsetX * 2 + KEEPER_BODY.width === KEEPER_W)
const [kw, kh] = worldSize('player_idle')
check('the keeper is drawn larger than the box', kw > 6 && kh > 6, `${kw} by ${kh} units`)
// In every pose the feet reach the bottom row: the box's foot is the picture's.
const poses = ['player_idle', 'player_walk1', 'player_walk2', 'player_cling']
const floating = poses.filter((n) => !pixels(n)[KEEPER_H - 1].some((c) => c !== null && c !== OUTLINE))
check('in every pose the keeper\'s feet are on the picture\'s bottom row', floating.length === 0, floating.join(', '))
const same = (a: string, b: string) => pixels(a).flat().join() === pixels(b).flat().join()
const alike: string[] = []
poses.forEach((a, i) => poses.slice(i + 1).forEach((b) => { if (same(a, b)) alike.push(`${a}/${b}`) }))
check('every pose is its own picture', alike.length === 0, alike.join(', '))
// The lantern is held out in front: its light is in the half the keeper faces.
const warm = [INK.Y, INK.W]
for (const pose of poses) {
  const px = pixels(pose)
  let front = 0
  let back = 0
  px.forEach((row) => row.forEach((c, x) => { if (c !== null && warm.includes(c)) x >= KEEPER_W / 2 ? front++ : back++ }))
  check(`${pose}: the lantern is held out in front`, front >= 4 && back === 0, `${front} lit pixels in front, ${back} behind`)
}

// --- what must not be confused
const count = (name: string, inks: number[]) => pixels(name).flat().filter((c) => c !== null && inks.includes(c)).length
check('a lit lantern is full of light', count('lanternLit', warm) > 40, `${count('lanternLit', warm)} pixels`)
check('and an unlit one has none', count('lanternUnlit', [...warm, INK.O]) === 0)
const mask = (name: string) => pixels(name).map((row) => row.map((c) => c !== null))
const sameShape = JSON.stringify(mask('lanternLit')) === JSON.stringify(mask('lanternUnlit'))
check('they are the same lantern: one shape, lit or not', sameShape)
// A flask is told from a lantern by its outline, since both can be warm.
const [lw, lh] = SIZE.lanternLit
const [fw, fh] = SIZE.oil_flask
const cover = (name: string) => pixels(name).flat().filter((c) => c !== null).length
check('a flask is a different size and outline from a lantern', (lw !== fw || lh !== fh) && Math.abs(cover('lanternLit') - cover('oil_flask')) > 40, `${cover('oil_flask')} against ${cover('lanternLit')} pixels`)
// The mushroom that throws the keeper against the ones that only grow there.
check('the mushroom that bounces is far bigger than the ones that do not', cover('bouncy_shroom') > cover('deco_shroom') * 4)

// --- against the forest
// Everything is seen against stone, leaves and the dark. The outline is
// darker than all of it, and every sprite carries something bright.
const darkest = Math.min(...Object.values(BIOMES).flatMap((b) => [b.void, b.far, b.near, b.gloom]).map(luminance))
check('the outline is darker than anything in the forest', luminance(OUTLINE) <= darkest, `${luminance(OUTLINE).toFixed(3)} against ${darkest.toFixed(3)}`)
const outlined = names.filter((n) => pixels(n).flat().includes(OUTLINE))
check('every sprite is outlined, but the two that join end to end', names.length - outlined.length === 2 && !outlined.includes('crumble_plank') && !outlined.includes('deco_vine'))
const stone = Math.max(...Object.values(BIOMES).map((b) => luminance(b.stoneLight)))
const dull = names.filter((n) => {
  if (n === 'lanternUnlit') return false // dark on purpose: see below
  return !pixels(n).flat().some((c) => c !== null && c !== OUTLINE && luminance(c) > stone)
})
check('every sprite has something brighter than the brightest stone', dull.length === 0, dull.join(', '))
// The unlit lantern is the exception, and its iron is what shows.
check('an unlit lantern is found by its iron', luminance(INK.m) > stone)
// The outline is left off only where there is no room for it, which is the
// edge of the picture. So nothing may be drawn up to the top or the sides.
// The bottom is allowed: these stand on the ground, and their foot is on it.
const onEdge = (px: (number | null)[][]) => {
  const W = px[0].length
  return px.some((row, y) => row.some((c, x) => c !== null && c !== OUTLINE && (y === 0 || x === 0 || x === W - 1)))
}
const edged = outlined.filter((n) => onEdge(pixels(n)))
check('no outlined sprite is drawn up to the top or sides of its picture', edged.length === 0, edged.join(', '))
// The control: the keeper as first drawn, with the pack in the first column.
check('and the check can fail: a picture one pixel over is', onEdge(pixels('player_idle').map((row) => row.slice(1))))

// --- the sign and the tree
const board = sign('DANGER')
check('the sign is the size it claims', board.length === SIGN_H && board.every((row) => row.length === SIGN_W))
const letters = board.join('').split('').filter((ch) => ch === 'k').length
check('and has its word painted on it', letters > 50, `${letters} pixels of paint`)
const lettered = board.map((row, y) => (row.includes('k') ? y : -1)).filter((y) => y >= 0)
check('the word is inside the board', Math.min(...lettered) >= 2 && Math.max(...lettered) <= 10 && board.every((row) => row[1] !== 'k' && row[SIGN_W - 2] !== 'k'))
check('a word it has no letters for is a blank board, not a crash', sign('ZZZ').join('').includes('w') && !sign('ZZZ').join('').includes('k'))

let spilt = 0
let painted = 0
drawHeartTree((x, y, w, h) => {
  if (x < 0 || y < 0 || x + w > HEART_TREE_PX || y + h > HEART_TREE_PX) spilt++
  painted += w * h
})
check('the Heart Tree is drawn inside its picture', spilt === 0 && painted > 4000, `${spilt} strokes outside`)

console.log(failed ? `\n${failed} FAILED` : '\nALL SPRITE CHECKS PASS')
process.exit(failed ? 1 : 0)
