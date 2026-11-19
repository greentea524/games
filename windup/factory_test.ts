// Checks on the factory's pictures (#167). Run with `npx tsx windup/factory_test.ts`.
//
// What the ticket asks is that platform, hazard and backdrop be three clearly
// different things at a glance. That is held here as rules about colour, with
// a control beside each that must fail: the rule is only worth having if a
// picture breaking it is caught.

import {
  GBC, DMG, PALETTES, type Picture, type FactoryPalette, get, luma, T, CAP,
  stone, stoneSheet, UP, RIGHT, LEFT, STONE_VARIANTS,
  spikes, lava, LAVA_FRAMES, belt, BELT_FRAMES, spring, mover, pylon,
  farLayer, midLayer, nearLayer, gear, gearFrames, gearSymmetry, BIG_GEAR, SMALL_GEAR, GEAR_STEP,
} from './factory'
import { PAL } from './constants'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const colours = (pics: Picture[]) => {
  const out = new Set<number>()
  for (const p of pics) for (const c of p.px) if (c >= 0) out.add(c)
  return out
}
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

const backdrop = (pal: FactoryPalette) => [
  farLayer(pal), midLayer(pal), nearLayer(pal),
  ...Array.from({ length: gearFrames(BIG_GEAR) }, (_, f) => gear(BIG_GEAR, f * GEAR_STEP, pal)),
  ...Array.from({ length: gearFrames(SMALL_GEAR) }, (_, f) => gear(SMALL_GEAR, -f * GEAR_STEP, pal)),
]
const hazards = (pal: FactoryPalette) => [spikes(pal), ...Array.from({ length: LAVA_FRAMES }, (_, f) => lava(f, pal))]
const machines = (pal: FactoryPalette) => [
  ...Array.from({ length: BELT_FRAMES }, (_, f) => belt(f, pal)), spring(pal), mover(pal), pylon(pal),
]
const everything = (pal: FactoryPalette) => [...stoneSheet(pal), ...hazards(pal), ...machines(pal), ...backdrop(pal)]

console.log('\n### windup factory ###\n')

// --- the green screen has four tones -------------------------------------------

const TONES = new Set([PAL.lightest, PAL.light, PAL.dark, PAL.darkest])
{
  const off = [...colours(everything(DMG))].filter((c) => !TONES.has(c))
  check('every green-screen picture is drawn in the four tones', off.length === 0, off.map(hex).join(', ') || 'all four-tone')
  const control = [...colours(everything(GBC))].filter((c) => !TONES.has(c))
  check('control: the colour pictures are not', control.length > 0, `${control.length} colours off the ramp`)
}

// --- the backdrop is behind ------------------------------------------------------

{
  // On the green screen, by tone: #52 shipped a backdrop in the platform's.
  const light = [...colours(backdrop(DMG))].filter((c) => c === PAL.light || c === PAL.lightest)
  check('green screen: the backdrop uses only the two dark tones', light.length === 0, light.map(hex).join(', ') || 'dark and darkest')
  const stoneTones = colours(stoneSheet(DMG))
  check('green screen: a stone block uses the light ones', stoneTones.has(PAL.light) && stoneTones.has(PAL.lightest))
}

/** The brightest backdrop pixel that is not the lamp's own light. */
const backdropPeak = (pal: FactoryPalette, pics = backdrop(pal)) =>
  Math.max(...[...colours(pics)].filter((c) => c !== pal.lampBulb && c !== pal.lampGlow).map(luma))
{
  const peak = backdropPeak(GBC)
  check(
    'colour: nothing behind is as bright as a stone\'s face',
    peak < luma(GBC.stone),
    `backdrop ${peak.toFixed(0)} against stone ${luma(GBC.stone).toFixed(0)}`,
  )
  // Control: the old brick was 0xa84830; a backdrop drawn in a pale steel
  // would outshine the stone and has to be caught.
  const pale = { ...GBC, steelLit: 0x8aa0b8 }
  check('control: a backdrop with pale steel fails it', backdropPeak(pale) >= luma(GBC.stone))
}

// --- a hazard is never scenery ------------------------------------------------------

{
  // Every hazard carries something brighter than anything in the stone or the
  // backdrop, the lamp aside, and in a colour neither of them has.
  const notHazard = new Set([...colours(stoneSheet(GBC)), ...colours(backdrop(GBC))])
  const ceiling = Math.max(...[...notHazard].filter((c) => c !== GBC.lampBulb).map(luma))
  for (const [name, pics] of [['spikes', [spikes(GBC)]], ['lava', hazards(GBC).slice(1)]] as const) {
    const own = [...colours([...pics])].filter((c) => !notHazard.has(c) && luma(c) > ceiling)
    check(`colour: ${name} carry a colour brighter than any stone or backdrop`, own.length > 0, own.map(hex).join(', ') || `nothing over ${ceiling.toFixed(0)}`)
  }
  // On the green screen they cannot be a colour of their own; they are the
  // lightest tone, which the backdrop never uses.
  for (const [name, pic] of [['spikes', spikes(DMG)], ['lava', lava(0, DMG)]] as const) {
    check(`green screen: ${name} use the lightest tone`, colours([pic]).has(PAL.lightest))
  }
  // Control: spikes drawn in the stone's colours would pass for a block.
  const stoneSpikes = spikes({ ...GBC, spike: GBC.stone, spikeLit: GBC.stoneLight, spikeDark: GBC.stoneDark })
  const own = [...colours([stoneSpikes])].filter((c) => !notHazard.has(c) && luma(c) > ceiling)
  check('control: spikes in stone colours fail it', own.length === 0)
}

// --- stone: the cap follows the neighbours ----------------------------------------------

const isMoss = (pal: FactoryPalette, c: number) => c === pal.moss || c === pal.mossLight || c === pal.mossDark
{
  let wrong = 0
  for (let mask = 0; mask < 16; mask++) {
    for (let v = 0; v < STONE_VARIANTS; v++) {
      const p = stone(mask, v, GBC)
      const capped = isMoss(GBC, get(p, T >> 1, 1))
      if (capped !== !(mask & UP)) wrong++
    }
  }
  check('a block is capped with moss exactly when nothing is above it', wrong === 0, `${wrong} of 32 wrong`)

  // A ledge: the cap runs across the seam between two blocks. Every row of
  // the cap is moss in the last column of the left block and the first of the
  // right one.
  const seam = (draw: (mask: number) => Picture) => {
    const left = draw(RIGHT)
    const right = draw(LEFT)
    let gaps = 0
    for (let y = 1; y < CAP; y++) {
      if (!isMoss(GBC, get(left, T - 1, y))) gaps++
      if (!isMoss(GBC, get(right, 0, y))) gaps++
    }
    return gaps
  }
  const gaps = seam((m) => stone(m, 0, GBC))
  check('a ledge\'s cap runs across the joint between its blocks', gaps === 0, `${gaps} gaps`)
  // Control: a cap drawn without looking at the neighbours stops a pixel
  // short each side, and a ledge reads as separate tufts.
  check('control: a cap that ignores its neighbours leaves gaps', seam((m) => stone(m, 0, GBC, false)) > 0)

  const shut = stone(UP | LEFT | RIGHT, 0, GBC)
  check('a buried block has its joint all round', get(shut, 0, 0) === GBC.joint && get(shut, T - 1, T - 1) === GBC.joint)
}

// --- belts point the way they carry ----------------------------------------------------

{
  // The arrow's back is its tallest column and its tip its shortest; the tip
  // is on the side the belt runs to.
  const arrowColumns = (p: Picture, pal: FactoryPalette) => {
    const heights: number[] = []
    for (let x = 0; x < T; x++) {
      let n = 0
      for (let y = 7; y < 20; y++) {
        const c = get(p, x, y)
        if (c === pal.arrow || c === pal.arrowDark) n++
      }
      heights.push(n)
    }
    const drawn = heights.map((n, x) => [n, x]).filter(([n]) => n > 0)
    const back = drawn.reduce((a, b) => (b[0] > a[0] ? b : a))[1]
    const tip = drawn.reduce((a, b) => (b[0] < a[0] ? b : a))[1]
    return Math.sign(tip - back)
  }
  for (const [mode, pal] of Object.entries(PALETTES)) {
    const dirs = Array.from({ length: BELT_FRAMES }, (_, f) => arrowColumns(belt(f, pal), pal))
    check(`${mode}: every belt frame's arrow points the way it runs`, dirs.join() === '1,1,-1,-1', dirs.join())
  }
  // Control: the first version drew the arrow's back on the leading side.
  const mirror = (p: Picture): Picture => {
    const q = { ...p, px: new Int32Array(p.px.length) }
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) q.px[y * p.w + x] = get(p, p.w - 1 - x, y)
    return q
  }
  check('control: a reversed arrow is caught', arrowColumns(mirror(belt(0, GBC)), GBC) === -1)
  const moves = belt(0, GBC).px.some((c, i) => c !== belt(1, GBC).px[i])
  check('a belt\'s two frames differ, so it is seen to run', moves)
}

// --- gears loop without a jump ----------------------------------------------------------

{
  for (const [name, g] of [['big', BIG_GEAR], ['small', SMALL_GEAR]] as const) {
    const sym = gearSymmetry(g)
    const same = gear(g, 0, GBC).px.every((c, i) => c === gear(g, sym, GBC).px[i])
    check(`the ${name} gear looks the same after its loop of ${gearFrames(g)} frames`, same, `${sym}°`)
  }
  // Control: looping on the tooth pitch alone, as a gear with no holes would,
  // jumps the holes every loop.
  const pitch = 360 / BIG_GEAR.teeth
  const jumps = gear(BIG_GEAR, 0, GBC).px.some((c, i) => c !== gear(BIG_GEAR, pitch, GBC).px[i])
  check('control: a loop of one tooth pitch would jump', jumps, `${pitch}°`)
}

// --- sizes -------------------------------------------------------------------------------

{
  const wrong = [...stoneSheet(GBC), ...hazards(GBC), ...machines(GBC).slice(0, -1)].filter((p) => p.w !== T || p.h !== T)
  check('every tile picture is a 24-pixel tile', wrong.length === 0, `${wrong.length} wrong`)
}

console.log(failed ? `\n${failed} FAILED\n` : '\nALL FACTORY CHECKS PASS\n')
process.exit(failed ? 1 : 0)
