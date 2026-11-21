// Every prop is drawn, fits its tiles, and holds to the green screen (#178).
//
//   npx tsx static/props_test.ts
import { PAL } from './constants'
import { PROPS, propKey } from './props'
import { DMG_VILLAGE, TILE_PX, VILLAGE, type Painter, type VillagePalette } from './tiles'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

/** Draws a prop into an array, and counts what fell outside its picture. */
function raster(name: string, pal: VillagePalette) {
  const prop = PROPS[name]
  const W = prop.w * TILE_PX
  const H = prop.h * TILE_PX
  const px = Array.from({ length: H }, () => Array<number>(W).fill(-1))
  let spilt = 0
  const p: Painter = (x, y, w, h, colour) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) spilt++
        else px[j][i] = colour
      }
    }
  }
  prop.draw(p, pal)
  return { px, spilt, W, H }
}

const names = Object.keys(PROPS)
// The thirteen keys the world scene asks for. A name missing here is a prop
// still drawn at 16 pixels and enlarged.
const wanted = [
  'prop_lamp', 'prop_sign', 'prop_barrel', 'prop_fence', 'prop_bush', 'prop_flower', 'prop_plant', 'hatch',
  'fountain_full', 'fountain_drained', 'prop_bed', 'prop_rug', 'prop_bookshelf',
]
check('every prop the world places is drawn here', wanted.every((n) => names.includes(n)) && names.length === wanted.length, names.filter((n) => !wanted.includes(n)).join(', '))
check('texture keys carry the palette', propKey('prop_lamp', 'dmg') === 'prop_lamp_dmg' && propKey('hatch', 'gbc') === 'hatch_gbc')

const tones: number[] = Object.values(PAL)
for (const name of names) {
  const colour = raster(name, VILLAGE)
  const green = raster(name, DMG_VILLAGE)
  const painted = colour.px.flat().filter((c) => c >= 0).length
  check(`${name}: is drawn, inside its ${PROPS[name].w} by ${PROPS[name].h} tiles`, painted > 40 && colour.spilt === 0, `${painted} pixels, ${colour.spilt} outside`)
  check(`${name}: four tones on the green screen`, green.px.flat().every((c) => c < 0 || tones.includes(c)))
  // On the green screen the ground is the lightest tone, indoors the next.
  // A prop made only of those two is a prop nobody can see.
  const dark = green.px.flat().filter((c) => c === PAL.dark || c === PAL.darkest).length
  check(`${name}: has dark in it there`, dark > 20, `${dark} dark pixels`)
}
// The control: a rectangle in the lightest tone has no dark in it.
const blank = Array.from({ length: 24 }, () => Array<number>(24).fill(PAL.lightest)).flat()
check('and the check can fail: a pale square has none', blank.filter((c) => c === PAL.dark || c === PAL.darkest).length === 0)

// A fence's rails reach both sides of its tile, so a run of them joins up.
const fence = raster('prop_fence', VILLAGE).px
check('a fence\'s rails run edge to edge', fence.some((row) => row[0] >= 0 && row[TILE_PX - 1] >= 0))
// The two fountains are the same basin: only what is in it differs.
const full = raster('fountain_full', VILLAGE).px.flat()
const dry = raster('fountain_drained', VILLAGE).px.flat()
const same = full.filter((c, i) => (c >= 0) === (dry[i] >= 0)).length
check('the drained fountain is the same shape as the full one', same === full.length)
check('and has no water in it', !dry.includes(VILLAGE.water) && full.includes(VILLAGE.water))

console.log(failed ? `\n${failed} FAILED` : '\nALL PROP CHECKS PASS')
process.exit(failed ? 1 : 0)
