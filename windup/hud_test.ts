// Checks on Windup's HUD (#169). Run with `npx tsx windup/hud_test.ts`.
//
// The ticket's bar: no HUD element over a platform, a hazard or the toy,
// anywhere in the 32 levels. Each rule here has a control that must fail.

import { LEVELS } from './levels'
import { PAL } from './constants'
import {
  SCREEN_W, SCREEN_H, CHAR, PANEL, SEGMENTS, HOME, HUD_THEME,
  slots, clearSlots, occupied, tilesUnder, place, toyBox, overlap,
  energyLayout, clockLayout, energyLevel, litSegments, clockText, levelText, type Box, type Placement,
} from './hud'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

console.log('\n### windup hud ###\n')

const levels = Object.entries(LEVELS).map(([n, lv]) => [Number(n), lv] as const)
const onScreen = (b: Box) => b.x >= 0 && b.y >= 0 && b.x + b.width <= SCREEN_W && b.y + b.height <= SCREEN_H

/** Everything wrong with a placement in a level with the toy at a point. */
const faults = (n: number, p: Placement, toy: Box) => {
  const cells = occupied(LEVELS[n])
  const out: string[] = []
  for (const [name, b] of [['energy', p.energy], ['clock', p.clock]] as const) {
    if (!b) continue
    if (!onScreen(b)) out.push(`${name} off screen`)
    if (tilesUnder(b).some((c) => cells.has(c))) out.push(`${name} over the level`)
    if (overlap(b, toy)) out.push(`${name} over the toy`)
  }
  if (p.energy && p.clock && overlap(p.energy, p.clock)) out.push('the panels overlap')
  return out
}

// --- at the start of every level ---------------------------------------------------

{
  const bad: string[] = []
  for (const [n, lv] of levels) {
    const toy = toyBox(lv.spawn.x, lv.spawn.y)
    const p = place(clearSlots(lv), toy)
    if (!p.energy || !p.clock) bad.push(`${n}: ${!p.energy ? 'energy' : 'clock'} has nowhere`)
    bad.push(...faults(n, p, toy).map((f) => `${n}: ${f}`))
  }
  check('every level starts with both panels, clear of the level and the toy', bad.length === 0, bad.join('; ') || `${levels.length} levels`)
  const home = levels.filter(([, lv]) => {
    const p = place(clearSlots(lv), toyBox(lv.spawn.x, lv.spawn.y))
    return p.energy?.x === HOME.energy.x && p.energy?.y === HOME.energy.y && p.clock?.x === HOME.clock.x && p.clock?.y === HOME.clock.y
  }).length
  check('and in nearly all of them the panels are at home, top left and top right', home >= levels.length - 1, `${home} of ${levels.length}`)
}

// --- wherever the toy goes ---------------------------------------------------------

{
  // Every point in every level the toy could be, by its middle, four units
  // apart, walking from one to the next so a panel can keep its place.
  let tries = 0
  let missing = 0
  const bad: string[] = []
  for (const [n, lv] of levels) {
    const clear = clearSlots(lv)
    const cells = occupied(lv)
    let p: Placement = { energy: null, clock: null }
    for (let y = 0; y < 144; y += 4) {
      for (let x = 0; x < 160; x += 4) {
        if (cells.has(`${Math.floor(x / 16)},${Math.floor(y / 16)}`)) continue
        tries++
        const toy = toyBox(x, y)
        p = place(clear, toy, p)
        if (!p.energy) missing++
        if (bad.length < 5) bad.push(...faults(n, p, toy).map((f) => `${n} at ${x},${y}: ${f}`))
      }
    }
  }
  check('wherever the toy is, no panel is over it, the level or the other', bad.length === 0, bad.join('; ') || `${tries} places`)
  check('and the energy panel has somewhere to go at nearly all of them', missing / tries < 0.005, `${missing} of ${tries} without`)
}

{
  // A panel keeps its place while that is clear, so it does not hop about.
  const lv = LEVELS[1]
  const clear = clearSlots(lv)
  const first = place(clear, toyBox(40, 120))
  const again = place(clear, toyBox(60, 120), first)
  check('a panel stays where it is while it is clear', again.energy === first.energy && again.clock === first.clock)
  const under = toyBox(HOME.energy.x / 1.5 + 20, 8)
  const moved = place(clear, under, first)
  check('and steps aside when the toy comes under it', moved.energy !== null && !overlap(moved.energy, under))
}

// --- controls --------------------------------------------------------------------------

{
  // The old HUD: LVL 1/32 at 6, 132 of 160×144, which is the floor's row.
  const old = { x: 6 * 1.5, y: 132 * 1.5, width: 8 * CHAR * 1.5, height: 8 * 1.5 }
  const over = levels.filter(([, lv]) => tilesUnder(old).some((c) => occupied(lv).has(c))).length
  check('control: the old level number was over the level in every one', over === levels.length, `${over} of ${levels.length}`)
  // Panels placed without looking at the level: level 2 has walls up there.
  const blind = place(slots(), toyBox(LEVELS[2].spawn.x, LEVELS[2].spawn.y))
  check('control: placed without the level, the panels land on level 2\'s walls', faults(2, blind, toyBox(0, 200)).length > 0)
}

// --- inside the panels -------------------------------------------------------------------

{
  const p = { x: 0, y: 0, ...PANEL }
  const e = energyLayout(p)
  const c = clockLayout(p)
  const inside = (x: number, y: number, w: number, h: number) => x >= 1 && y >= 1 && x + w <= PANEL.width - 1 && y + h <= PANEL.height - 1
  check('the face, ENERGY and the ten segments fit their panel',
    inside(e.face.x, e.face.y, 14, 12) && inside(e.label.x, e.label.y, 6 * CHAR, CHAR) &&
    inside(e.bar.x, e.bar.y, SEGMENTS * (e.bar.segment + e.bar.gap) - e.bar.gap, e.bar.height))
  check('the clock at its longest and the last level fit theirs',
    inside(c.time.x, c.time.y, clockText(99 * 60000 + 59999).length * CHAR, CHAR) &&
    inside(c.level.x, c.level.y, levelText(32, 32).length * CHAR, CHAR),
    `${clockText(99 * 60000 + 59999)} / ${levelText(32, 32)}`)
  check('the face does not run into the label', e.face.x + 14 <= e.label.x)
}

// --- low is plain without a number ---------------------------------------------------------

{
  check('the bar runs full, then mid, then low', energyLevel(1) === 'full' && energyLevel(0.5) === 'mid' && energyLevel(0.2) === 'low')
  const lit = [0, 0.01, 0.5, 1].map(litSegments)
  check('no energy lights nothing, any lights one, full lights ten', lit.join() === '0,1,5,10', lit.join())
  for (const [mode, t] of Object.entries(HUD_THEME)) {
    const levelsDiffer = t.seg.full !== t.seg.mid || mode === 'dmg'
    check(`${mode}: low raises an alarm the full bar does not`, t.alarm !== t.panel && levelsDiffer)
  }
  const tones = new Set<number>([PAL.lightest, PAL.light, PAL.dark, PAL.darkest])
  const dmg = HUD_THEME.dmg
  const off = [dmg.panel, dmg.frame, dmg.text, dmg.dim, dmg.empty, dmg.alarm, dmg.alarmText, ...Object.values(dmg.seg)].filter((c) => !tones.has(c))
  check('green screen: the HUD is the four tones', off.length === 0, off.map((c) => c.toString(16)).join(', '))
}

// --- legible ---------------------------------------------------------------------------------

{
  const lum = (c: number) => {
    const ch = [16, 8, 0].map((s) => ((c >> s) & 255) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const ratio = (a: number, b: number) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  for (const [mode, t] of Object.entries(HUD_THEME)) {
    const pairs = [['text', t.text, t.panel], ['level', t.dim, t.panel], ['alarm', t.alarmText, t.alarm]] as const
    const weak = pairs.filter(([, a, b]) => ratio(a, b) < 4.5).map(([n, a, b]) => `${n} ${ratio(a, b).toFixed(1)}`)
    check(`${mode}: the HUD's text is 4.5:1 or better on its panel`, weak.length === 0, weak.join(', ') || 'all clear')
  }
}

console.log(failed ? `\n${failed} FAILED\n` : '\nALL HUD CHECKS PASS\n')
process.exit(failed ? 1 : 0)
