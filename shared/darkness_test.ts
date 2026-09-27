// The darkness overlay's arithmetic (#139).
//
//   npx tsx shared/darkness_test.ts
//
// `shared/lighting.ts` draws the overlay Static and Pocket Dungeon use, and
// until #139 it had **no check of any kind** — while the only `*_test.ts` beside
// it was about three.js light intensities, so anyone auditing coverage saw a
// `lighting_test.ts` in `shared/` and reasonably concluded otherwise.
//
// Most of that module is Phaser and is not worth reimplementing here. The two
// pieces in `shared/darkness.ts` are pure, and they are the two where a mistake
// is invisible:
//
//   - `reachesScreen` decides which lights are drawn at all. Get a sign wrong
//     and a light that should be on screen is skipped: the room stays dark
//     there, nothing throws, and it reads as level design rather than a bug.
//   - `brushRadius` decides the per-radius texture cache key. Drop the rounding
//     and a smoothly shrinking light mints a texture every frame — a leak that
//     shows up as a slow death rather than a failure.
import { brushRadius, reachesScreen } from './darkness'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- brushRadius -----------------------------------------------------------

check(
  'a radius is rounded to an integer',
  brushRadius(7.4) === 7 && brushRadius(7.6) === 8,
  `7.4 -> ${brushRadius(7.4)}, 7.6 -> ${brushRadius(7.6)}`,
)
check(
  'and never falls below 1',
  brushRadius(0.2) === 1 && brushRadius(0) === 1 && brushRadius(-5) === 1,
  `0.2 -> ${brushRadius(0.2)}, 0 -> ${brushRadius(0)}, -5 -> ${brushRadius(-5)}`,
)

{
  // The claim the rounding exists for, as the module states it: a smoothly
  // shrinking radius must not mint a texture per frame. A light fading from 40
  // to 0 over two seconds at 60fps is 120 distinct radii, and must not be 120
  // distinct brushes.
  const radii: number[] = []
  for (let frame = 0; frame < 120; frame++) radii.push(40 * (1 - frame / 120))
  const keys = new Set(radii.map(brushRadius))
  check(
    'a light fading over 120 frames mints one brush per pixel of radius, not per frame',
    keys.size <= 40,
    `${keys.size} distinct brushes for ${new Set(radii).size} distinct radii`,
  )
}

// --- reachesScreen ---------------------------------------------------------

/** The size these games run at. */
const W = 160
const H = 144

check('a light in the middle is drawn', reachesScreen(80, 72, 16, W, H), '(80,72) r16')
check(
  'a light entirely off each side is skipped',
  !reachesScreen(-20, 72, 16, W, H) &&
    !reachesScreen(180, 72, 16, W, H) &&
    !reachesScreen(80, -20, 16, W, H) &&
    !reachesScreen(80, 164, 16, W, H),
  'left, right, above and below all culled',
)

// The cases that make this worth checking: a light whose *centre* is off screen
// and whose circle still spills onto it. This is the common case — a torch just
// past the edge of the viewport lights the edge of the room — and it is exactly
// what a dropped `r` gets wrong.
check(
  'a light just off the left still lights the edge',
  reachesScreen(-10, 72, 16, W, H),
  'centre -10, radius 16, so it reaches x=6',
)
check('and just off the right', reachesScreen(170, 72, 16, W, H), 'reaches x=154')
check('and just above', reachesScreen(80, -10, 16, W, H), 'reaches y=6')
check('and just below', reachesScreen(80, 154, 16, W, H), 'reaches y=138')

// The boundary, spelled out rather than left to the reader.
check('a circle touching the left edge exactly is drawn', reachesScreen(-16, 72, 16, W, H), 'x + r === 0')
check('and one pixel further out is not', !reachesScreen(-17, 72, 16, W, H), 'x + r === -1')
check('a circle touching the right edge exactly is drawn', reachesScreen(W + 16, 72, 16, W, H), 'x - r === width')
check('and one pixel further out is not', !reachesScreen(W + 17, 72, 16, W, H), 'x - r === width + 1')

// `redraw` skips `radius <= 0` before asking, but `brushRadius` floors at 1, so
// the floor case must behave like a point rather than vanishing.
check(
  'a one-pixel light at the origin is drawn',
  reachesScreen(0, 0, 1, W, H),
  "brushRadius's floor case",
)

console.log(ok ? '\nALL DARKNESS OVERLAY CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
