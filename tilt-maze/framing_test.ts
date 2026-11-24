// Checks on Tilt Maze's framing (#186). Run with `npx tsx tilt-maze/framing_test.ts`.
//
// Every board, at every screen shape here, has to fit whole, at every lean,
// clear of the HUD; and not be framed further back than it needs. The old
// rule, the board's longest side times 1.15, is the control: it must fail on
// a phone held upright.

import { LEVELS } from './levels'
import { CELL } from './physics'
import { fitDistance, fits, reachableCorners, project, VIEW_DIR } from './framing'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

console.log('\n### tilt maze framing ###\n')

const SCREENS: [string, number, number][] = [
  ['phone upright', 390, 844],
  ['phone on its side', 844, 390],
  ['small phone', 360, 640],
  ['tablet', 768, 1024],
  ['desktop', 1280, 800],
]

for (const [name, w, h] of SCREENS) {
  const loose: string[] = []
  const tight: string[] = []
  for (const level of LEVELS) {
    const cols = level.grid[0].length
    const rows = level.grid.length
    const d = fitDistance(cols, rows, w, h)
    const corners = reachableCorners(cols, rows)
    if (!fits(corners, d, w, h)) loose.push(level.name)
    // And no further than it need be: a little nearer and something is off.
    if (fits(corners, d * 0.97, w, h)) tight.push(level.name)
  }
  check(`${name} (${w}×${h}): every board fits whole, at every lean, clear of the HUD`, loose.length === 0, loose.join(', ') || `${LEVELS.length} boards`)
  check(`${name}: and none is framed further back than it needs`, tight.length === 0, tight.join(', ') || 'all as near as they can be')
}

{
  // The old framing: the longest side times 1.15, along the same direction.
  const old = (cols: number, rows: number) => Math.max(cols, rows) * CELL * 1.15 * Math.hypot(VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z)
  const cropped = LEVELS.filter((l) => !fits(reachableCorners(l.grid[0].length, l.grid.length), old(l.grid[0].length, l.grid.length), 390, 844))
  check('control: the old framing crops boards on a phone held upright', cropped.length > 0, `${cropped.length} of ${LEVELS.length}: ${cropped.map((l) => l.name).join(', ')}`)
  // How much of an 11-wide board it showed: the ticket's figure.
  const spiral = LEVELS.reduce((a, b) => (b.grid[0].length > a.grid[0].length ? b : a))
  const edge = project({ x: (spiral.grid[0].length * CELL) / 2, y: 0, z: 0 }, old(spiral.grid[0].length, spiral.grid.length), 390 / 844)
  check(`control: the old framing put ${spiral.name}'s side wall off the screen`, Math.abs(edge.x) > 1, `at x ${edge.x.toFixed(2)} of ±1`)
}

{
  // The projection here is the module's own; the touch suite compares it with
  // three's. What can be held here is that it agrees with itself: the middle
  // of the board is the middle of the screen.
  const mid = project({ x: 0, y: 0, z: 0 }, 20, 1)
  check('the board\'s middle projects to the middle of the screen', Math.abs(mid.x) < 1e-9 && Math.abs(mid.y) < 1e-9)
}

console.log(failed ? `\n${failed} FAILED\n` : '\nALL FRAMING CHECKS PASS\n')
process.exit(failed ? 1 : 0)
