// Checks on the toy, its key and the pickups (#168). Run with `npx tsx windup/sprites_test.ts`.
//
// Each rule has a control beside it that must fail, so a rule that passes
// is known to be able to catch what it is for.

import {
  SPRITE_PX, INK, POSES, POSE_ROWS, PICTURES, KEY_FRAMES, KEY_W, KEY_H, ROBOT_BODY, HEAD_BOX, DMG_TONES,
  keyRate, pixels, type Mode,
} from './sprites'
import { GBC, DMG, luma, stoneSheet, farLayer, midLayer, nearLayer, type FactoryPalette } from './factory'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

console.log('\n### windup sprites ###\n')

const all: [string, string[], number, number][] = [
  ...POSES.map((p) => [`robot ${p}`, POSE_ROWS[p], SPRITE_PX, SPRITE_PX] as [string, string[], number, number]),
  ...Object.entries(PICTURES).map(([n, r]) => [n, r, SPRITE_PX, SPRITE_PX] as [string, string[], number, number]),
  ...KEY_FRAMES.map((r, i) => [`key ${i}`, r, KEY_W, KEY_H] as [string, string[], number, number]),
]

// --- pictures are well formed --------------------------------------------------

{
  const bad = all.filter(([, rows, w, h]) => rows.length !== h || rows.some((r) => r.length !== w)).map(([n]) => n)
  check('every picture is its size, row for row', bad.length === 0, bad.join(', ') || `${all.length} pictures`)
  const unknown = all.flatMap(([n, rows]) => [...new Set(rows.join(''))].filter((c) => c !== '.' && !INK[c]).map((c) => `${n} "${c}"`))
  check('every letter is an ink', unknown.length === 0, unknown.join(', '))
}

// --- room for the outline -----------------------------------------------------------

/** Whether a picture keeps clear of its edges, so the outline has room. The key's shaft meets the toy's back, on its right. */
const clear = (rows: string[], w: number, h: number, open: 'right' | null = null) => {
  const ink = (x: number, y: number) => (rows[y]?.[x] ?? '.') !== '.'
  for (let i = 0; i < w; i++) if (ink(i, 0) || ink(i, h - 1)) return false
  for (let j = 0; j < h; j++) if (ink(0, j) || (open !== 'right' && ink(w - 1, j))) return false
  return true
}
{
  const tight = all.filter(([n, rows, w, h]) => !clear(rows, w, h, n.startsWith('key') ? 'right' : null)).map(([n]) => n)
  check('every picture keeps a pixel clear of its edges for the outline', tight.length === 0, tight.join(', ') || 'all clear')
  // Control: the antenna as first drawn, in the top row.
  const first = ['..............RR........', ...POSE_ROWS.idle.slice(1)]
  check('control: an antenna in the top row is caught', !clear(first, SPRITE_PX, SPRITE_PX))
}

// --- the green screen ------------------------------------------------------------

{
  const tones = new Set<number>(Object.values(DMG_TONES))
  const off = all.flatMap(([n, rows, w, h]) => pixels(rows, 'dmg', w, h).flat().filter((c) => c !== null && !tones.has(c)).map(() => n))
  check('every green-screen picture is the four tones', off.length === 0, [...new Set(off)].join(', ') || 'all four-tone')
  // On the green screen, the toy is three tones from head to foot, and not
  // one shape: the head lightest, the body light, the limbs dark.
  const idle = pixels(POSE_ROWS.idle, 'dmg')
  const tone = (y: number) => idle[y].find((c, x) => c !== null && c !== DMG_TONES.D && POSE_ROWS.idle[y][x] !== '.')
  const [head, body, legs] = [tone(5), tone(13), tone(20)]
  check('green screen: head, body and legs are three tones', new Set([head, body, legs]).size === 3,
    [head, body, legs].map((c) => c?.toString(16)).join(', '))
}

// --- the box --------------------------------------------------------------------

{
  // The old toy: 10 by 12 at 3, 4 in a 16-unit frame. The picture is 1.5 times it.
  const scale = SPRITE_PX / 16
  const old = { width: 10, height: 12, x: 3, y: 4 }
  const same = (Object.keys(old) as (keyof typeof old)[]).every((k) => ROBOT_BODY[k] === old[k] * scale)
  check('the toy\'s hitbox is the old one, in tiles', same, JSON.stringify(ROBOT_BODY))
  check('and it ends at the foot of the picture', ROBOT_BODY.y + ROBOT_BODY.height === SPRITE_PX)

  // Standing, running or sliding, its feet are on the bottom of the box:
  // drawn to the row above the outline, which is the floor.
  const lowest = (rows: string[]) => rows.reduce((m, r, y) => (r.replace(/\./g, '') ? y : m), -1)
  const grounded = (['idle', 'runA', 'runB', 'slide'] as const).filter((p) => lowest(POSE_ROWS[p]) !== SPRITE_PX - 2)
  check('on the ground its feet meet the floor', grounded.length === 0, grounded.join(', ') || 'idle, run, slide')
  const head = POSE_ROWS.idle.slice(HEAD_BOX.y, HEAD_BOX.y + HEAD_BOX.height).map((r) => r.slice(HEAD_BOX.x, HEAD_BOX.x + HEAD_BOX.width))
  check('the portrait\'s box holds the head and none of the body', !head.join('').match(/[OoT]/) && head.join('').includes('V'))
}

// --- the key says how much is left --------------------------------------------------

{
  const rates = [0, 0.1, 0.5, 1].map(keyRate)
  check('the key is still at empty and turns faster the more is left',
    rates[0] === 0 && rates[1] > 0 && rates[2] > rates[1] && rates[3] > rates[2], rates.map((r) => r.toFixed(1)).join(', '))
  // The bow, seen as it turns: tallest face on, shortest edge on, and back.
  const height = (rows: string[]) => {
    const ys = rows.map((r, y) => (r.slice(0, 6).replace(/\./g, '') ? y : -1)).filter((y) => y >= 0)
    return Math.max(...ys) - Math.min(...ys) + 1
  }
  const hs = KEY_FRAMES.map(height)
  check('the key\'s bow narrows to edge on and opens again', hs[0] > hs[1] && hs[1] > hs[2] && hs[3] > hs[2] && hs[3] === hs[1], hs.join(', '))
}

// --- the toy reads on everything behind it --------------------------------------------

/** Share of the toy's drawn pixels, outline included, that stand clear of a colour. */
const standout = (grid: (number | null)[][], c: number) => {
  const drawn = grid.flat().filter((p): p is number => p !== null)
  return drawn.filter((p) => Math.abs(luma(p) - luma(c)) >= 48).length / drawn.length
}
const behind = (pal: FactoryPalette) => {
  const cs = new Set<number>([pal.void])
  for (const pic of [farLayer(pal), midLayer(pal), nearLayer(pal), ...stoneSheet(pal)]) for (const c of pic.px) if (c >= 0) cs.add(c)
  return [...cs]
}
for (const [mode, pal] of [['gbc', GBC], ['dmg', DMG]] as [Mode, FactoryPalette][]) {
  const worst = POSES.flatMap((p) => {
    const grid = pixels(POSE_ROWS[p], mode)
    return behind(pal).map((c) => [standout(grid, c), p, c] as const)
  }).reduce((a, b) => (b[0] < a[0] ? b : a))
  check(`${mode}: the toy stands out on every backdrop and stone colour`, worst[0] >= 0.4,
    `least ${Math.round(worst[0] * 100)}% clear, ${worst[1]} on #${worst[2].toString(16).padStart(6, '0')}`)
}
{
  // Control: a toy painted in the backdrop's own greens disappears into the gear.
  const green = POSE_ROWS.idle.map((r) => r.replace(/[HhOoTt]/g, 'c'))
  const share = standout(pixels(green, 'gbc'), 0x3e8046)
  check('control: a toy in the gear\'s green does not', share < 0.4, `${Math.round(share * 100)}% clear`)
}

console.log(failed ? `\n${failed} FAILED\n` : '\nALL SPRITE CHECKS PASS\n')
process.exit(failed ? 1 : 0)
