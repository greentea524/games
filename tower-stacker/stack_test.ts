// Tower Stacker's overlap arithmetic (#110).
//
//   npx tsx tower-stacker/stack_test.ts
//
// CLAUDE.md asks that a check prove it can fail, and #110 names the exact trap
// here: "dropping at the right moment does not shrink the block" passes on a
// block that has not started sliding yet, because at t=0 the block is at the
// far end of its travel and every drop from a standing start is either a clean
// miss or a clean hit. So the perfect-drop checks below are driven from a
// sampled slide nine levels in, at that level's real speed, rather than
// from a hand-placed block at the origin.
//
// Both halves were proven to fail before being trusted, by reintroducing the
// defect and watching the run go red:
//
//   - `const overlap = hi - lo + 1` in `dropBlock`, the inclusive-span slip
//     #110 warns about, fails nine checks including "the slab is narrowed by
//     exactly the offset" (w=1.75), "the slab and its chip reconstruct the
//     moving block", and all four miss checks.
//   - `PERFECT_EPS = 0.22`, wide enough to score a plainly off-centre drop as
//     perfect, fails exactly "a clearly-off drop is not perfect" and "and it
//     does shrink the block". A larger widening than that is worth avoiding
//     when re-running this by hand: at 0.25 the checks at the top of the file
//     drop through the perfect branch, `r.chip` is null, and the run dies on
//     a TypeError before it reaches the checks the change is aimed at.
import {
  BASE_BLOCK,
  PERFECT_EPS,
  SLIDE_RANGE,
  SPEED_CAP,
  axisFor,
  dropBlock,
  slideOffset,
  speedFor,
  type Axis,
  type Block,
} from './stack'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps
/** Extent of `b` along `axis`. */
const size = (b: Block, axis: Axis) => (axis === 'x' ? b.w : b.d)
/** Centre of `b` along `axis`. */
const at = (b: Block, axis: Axis) => (axis === 'x' ? b.x : b.z)
/** The moving block for a level: the slab below, offset along the axis. */
const moverAt = (top: Block, axis: Axis, offset: number): Block =>
  axis === 'x' ? { ...top, x: top.x + offset } : { ...top, z: top.z + offset }

// --- the overlap itself ---------------------------------------------------

{
  const top = { ...BASE_BLOCK }
  const r = dropBlock(top, moverAt(top, 'x', 0.25), 'x')
  check('a partial overlap places a slab', r.placed !== null && !r.missed)
  check(
    'the slab is narrowed by exactly the offset',
    near(size(r.placed!, 'x'), 0.75),
    `w=${r.placed!.w}`,
  )
  check(
    'and sits midway between the two blocks',
    near(at(r.placed!, 'x'), 0.125),
    `x=${r.placed!.x}`,
  )
  check('an overhang is sliced off', r.chip !== null)
  check('the chip is as wide as the offset', near(size(r.chip!, 'x'), 0.25), `w=${r.chip!.w}`)
  check(
    'the slab and its chip reconstruct the moving block',
    near(size(r.placed!, 'x') + size(r.chip!, 'x'), top.w),
    `${r.placed!.w} + ${r.chip!.w} against a moving block of ${top.w}`,
  )
  check(
    'the chip is on the overhanging side',
    at(r.chip!, 'x') > at(r.placed!, 'x'),
    `chip x=${r.chip!.x}, slab x=${r.placed!.x}`,
  )
  check('the untouched axis is carried through', near(r.placed!.d, top.d), `d=${r.placed!.d}`)
}

{
  // The mirror case. A sign slip in the chip's placement survives the check
  // above, because at a positive offset the chip lands on the positive side
  // either way.
  const top = { ...BASE_BLOCK }
  const r = dropBlock(top, moverAt(top, 'x', -0.25), 'x')
  check('a negative offset narrows the slab the same amount', near(r.placed!.w, 0.75))
  check('and mirrors its centre', near(r.placed!.x, -0.125), `x=${r.placed!.x}`)
  check('with the chip on the negative side', at(r.chip!, 'x') < at(r.placed!, 'x'))
}

{
  // z is not a copy-paste of x: `withAxis` has to leave w alone and write d.
  const top = { ...BASE_BLOCK }
  const r = dropBlock(top, moverAt(top, 'z', 0.4), 'z')
  check('the z axis narrows depth, not width', near(r.placed!.d, 0.6) && near(r.placed!.w, 1))
  check('and moves z, not x', near(r.placed!.z, 0.2) && near(r.placed!.x, 0))
}

// --- misses ---------------------------------------------------------------

{
  const top = { ...BASE_BLOCK }
  check('an offset of a full width is a miss', dropBlock(top, moverAt(top, 'x', 1), 'x').missed)
  check('an offset past it is a miss', dropBlock(top, moverAt(top, 'x', 1.6), 'x').missed)
  check('and a miss places nothing', dropBlock(top, moverAt(top, 'x', 1.6), 'x').placed === null)
  check(
    'an offset a hair inside is not a miss',
    !dropBlock(top, moverAt(top, 'x', 0.999), 'x').missed,
  )
  // A narrowed tower misses sooner. This is the case an overlap computed from
  // the centre offset alone would get wrong once the widths stop matching.
  const narrow: Block = { x: 0, z: 0, w: 0.3, d: 1 }
  check('a narrow slab misses at a smaller offset', dropBlock(narrow, moverAt(narrow, 'x', 0.3), 'x').missed)
  check('but not before it', !dropBlock(narrow, moverAt(narrow, 'x', 0.29), 'x').missed)
}

// --- the perfect drop, driven from a real slide ---------------------------
//
// The trap #110 names. Sampling the triangle wave at the speed level 8
// actually runs at means these assert against the block the game presents,
// not against a block sitting still at the origin.

{
  const level = 9
  const axis = axisFor(level)
  const speed = speedFor(level)
  const top: Block = { x: 0, z: 0, w: 0.62, d: 0.71 }

  check('level 9 slides along z, not x', axis === 'z', `axis=${axis}`)
  check('and is moving by then', speed > 1, `speed=${speed}`)

  // Walk the wave at 60Hz and take the frame closest to centre, which is what
  // a player aiming for a perfect is doing.
  let bestT = 0
  let bestAbs = Infinity
  for (let f = 0; f < 600; f++) {
    const t = f / 60
    const o = Math.abs(slideOffset(t, speed))
    if (o < bestAbs) {
      bestAbs = o
      bestT = t
    }
  }
  check(
    'a 60Hz sweep finds a frame inside the perfect window',
    bestAbs <= PERFECT_EPS,
    `closest frame was ${bestAbs.toFixed(4)} off, window is ${PERFECT_EPS}`,
  )

  const perfect = dropBlock(top, moverAt(top, axis, slideOffset(bestT, speed)), axis)
  check('a perfect drop does not shrink the block', near(perfect.placed!.d, top.d), `d=${perfect.placed!.d}`)
  check('nor the other axis', near(perfect.placed!.w, top.w))
  check('it snaps to the slab below', near(perfect.placed!.z, top.z), `z=${perfect.placed!.z}`)
  check('it sheds no chip', perfect.chip === null)
  check('and it reports itself', perfect.perfect && !perfect.missed)

  // The other half of the claim: a drop the player would see as off-centre
  // must not be scored perfect. Widening PERFECT_EPS to cover this is what
  // turns this check red.
  const off = dropBlock(top, moverAt(top, axis, 0.2), axis)
  check('a clearly-off drop is not perfect', !off.perfect && off.chip !== null)
  check('and it does shrink the block', off.placed!.d < top.d, `d=${off.placed!.d}`)

  // Perfects have to be repeatable, or the reward for hitting one is a tower
  // that walks sideways until it falls off its own base.
  let stacked: Block = { ...top }
  for (let i = 0; i < 12; i++) {
    const a = axisFor(i)
    const r = dropBlock(stacked, moverAt(stacked, a, PERFECT_EPS * 0.9), a)
    if (!r.perfect) {
      check(`perfect ${i} stayed perfect`, false)
      break
    }
    stacked = r.placed!
  }
  check(
    'twelve perfects in a row leave the tower its full size',
    near(stacked.w, top.w) && near(stacked.d, top.d),
    `${stacked.w} x ${stacked.d}`,
  )
  check(
    'and do not drift it off centre',
    near(stacked.x, top.x) && near(stacked.z, top.z),
    `${stacked.x}, ${stacked.z}`,
  )
}

// --- the slide ------------------------------------------------------------

{
  const speed = speedFor(0)
  check('the block starts at the far end of its travel', near(slideOffset(0, speed), -SLIDE_RANGE))
  let lo = Infinity
  let hi = -Infinity
  for (let f = 0; f < 2000; f++) {
    const o = slideOffset(f / 120, speed)
    lo = Math.min(lo, o)
    hi = Math.max(hi, o)
  }
  check('it never travels past its range', lo >= -SLIDE_RANGE - 1e-9 && hi <= SLIDE_RANGE + 1e-9, `${lo}..${hi}`)
  check('and it uses the whole of it', lo < -SLIDE_RANGE * 0.98 && hi > SLIDE_RANGE * 0.98, `${lo}..${hi}`)

  // Every level opens travelling the same way, so the alternating axis is the
  // only thing that changes between them.
  for (const level of [0, 1, 7, 40]) {
    check(
      `level ${level} opens at the same end`,
      near(slideOffset(0, speedFor(level)), -SLIDE_RANGE),
    )
  }
}

// --- the speed ramp -------------------------------------------------------

{
  check('speed rises with height', speedFor(5) > speedFor(0))
  check('it is capped', speedFor(1000) === SPEED_CAP, `${speedFor(1000)}`)
  check('the cap is reached, not merely approached', speedFor(200) === SPEED_CAP)
  // The cap has to leave a perfect drop findable at 60Hz, which is the whole
  // reason it exists. A block at SPEED_CAP moves this far per frame:
  const perFrame = SPEED_CAP / 60
  check(
    'at the cap a 60Hz frame still lands inside the perfect window',
    perFrame < PERFECT_EPS * 2,
    `${perFrame.toFixed(4)} per frame against a ${(PERFECT_EPS * 2).toFixed(4)}-wide window`,
  )
}

// --- the alternating axis -------------------------------------------------

{
  check('level 0 slides along x', axisFor(0) === 'x')
  check('level 1 slides along z', axisFor(1) === 'z')
  check(
    'the axis alternates every level',
    [0, 1, 2, 3, 4, 5].every((n) => axisFor(n) !== axisFor(n + 1)),
  )
}

console.log(ok ? '\nALL TOWER STACKER CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
