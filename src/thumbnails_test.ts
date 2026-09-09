// The hub's thumbnails are the size the hub says they are (#122), and come
// from where the house rule says they come from (#123).
//
//   npx tsx src/thumbnails_test.ts
//
// `App.tsx` renders every card's image with one hardcoded intrinsic size:
//
//   <img ... width="640" height="478" />
//
// Two of the ten files were not that size. `invasion.webp` was 640x454 and
// `platformer.webp` was 640x360, and the consequences were both invisible
// until measured:
//
//   - a browser reserves space for an image from those attributes before it
//     loads, so a wrong one reserves the wrong box and the card resizes when
//     the image arrives. These are `loading="lazy"`, so it happened on scroll.
//   - `.game-thumb-link` is `aspect-ratio: 4 / 3` and `.game-card-thumb` is
//     `object-fit: cover`, so covering that box with a 16:9 image cropped 25%
//     of `platformer.webp` away — 12.5% off each side, never rendered.
//
// Nothing caught it because nothing looked. The attributes are in TSX, the
// sizes are in binary files, and no check spanned the two. This is that check.
//
// It reads the declared size out of `App.tsx` rather than keeping its own copy
// of it, so there is one source of truth: change the markup and every file
// must follow, change a file and the markup must. A constant duplicated here
// would be a third thing to keep in sync, which is the shape of the original
// problem.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// Shared with `scripts/thumbnail.mjs`, which has to *produce* files that pass
// these checks. One definition of the house size and one webp reader, so the
// tool and the check cannot disagree about what correct means.
import {
  APP,
  EXTERNAL,
  IMAGE_DIR,
  PAINTED,
  declaredSize,
  importedImages,
  webpSize,
} from '../qa/thumbnails.mjs'
import { ROOT } from '../qa/harness.mjs'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- what the markup claims ------------------------------------------------

const declared = declaredSize()
check('the card image declares an intrinsic size', declared !== null, APP)
if (!declared) {
  console.log('\nFAILURES ABOVE')
  process.exit(1)
}
const { width: WIDTH, height: HEIGHT } = declared
check('and it is a sane one', WIDTH > 0 && HEIGHT > 0, `${WIDTH}x${HEIGHT}`)

// --- what is on disk -------------------------------------------------------

const files = readdirSync(IMAGE_DIR).sort()
const images = files.filter((f) => /\.(webp|png|jpe?g|gif|avif|svg)$/i.test(f))
check('there are thumbnails to check', images.length > 0, `${images.length} image file(s)`)

// Every card image is a webp. A stray png would still render, and would still
// be several times the weight for the same picture.
const notWebp = images.filter((f) => !f.endsWith('.webp'))
check(
  'every image in the directory is a webp',
  notWebp.length === 0,
  notWebp.length ? notWebp.join(' ') : `${images.length} webp`,
)

for (const file of images.filter((f) => f.endsWith('.webp'))) {
  const size = webpSize(readFileSync(join(IMAGE_DIR, file)))
  if (!size) {
    check(`${file} is a readable webp`, false, 'header did not parse')
    continue
  }
  check(
    `${file} is ${WIDTH}x${HEIGHT}`,
    size.w === WIDTH && size.h === HEIGHT,
    `${size.w}x${size.h} ${size.fmt}`,
  )
}

// --- the directory and the markup agree ------------------------------------
//
// Both directions. An orphan is dead weight on every clone — two unreferenced
// JPEGs sat here at 1.3 MB, invisible because Vite never emits an asset
// nothing imports, so they cost the repo and not the deployed site. A missing
// file is a broken build, which at least fails loudly, but it is the same
// question and free to ask here.

const imported = importedImages()
check('App.tsx imports thumbnails', imported.length > 0, `${imported.length} import(s)`)

const orphans = images.filter((f) => !imported.includes(f))
check(
  'no image file is unreferenced',
  orphans.length === 0,
  orphans.length ? orphans.join(' ') : 'every file is imported',
)

const missing = imported.filter((f) => !files.includes(f))
check(
  'every import resolves to a file',
  missing.length === 0,
  missing.length ? missing.join(' ') : `${imported.length} resolved`,
)

// --- where a card's picture comes from (#123) ------------------------------
//
// The rule is in `qa/thumbnails.mjs`: a card is a capture of the running game,
// with two closed sets of exceptions. #123 exists because there was never a
// stated rule and each new card was decided on its own, so the value here is
// not that any one card is wrong — it is that a fifteenth game cannot quietly
// become a fourth kind of picture. That is what these check.

const cards = imported.map((f) => f.replace(/\.webp$/, ''))

{
  const overlap = PAINTED.filter((g) => EXTERNAL.includes(g))
  check(
    'the two exception sets do not overlap',
    overlap.length === 0,
    overlap.length ? overlap.join(' ') : `${PAINTED.length} painted, ${EXTERNAL.length} external`,
  )
  const unknown = [...PAINTED, ...EXTERNAL].filter((g) => !cards.includes(g))
  check(
    'every listed exception is still a card on the hub',
    unknown.length === 0,
    unknown.length ? `${unknown.join(' ')} — remove it from the list` : 'no stale entries',
  )
}

{
  // The load-bearing one. Anything not on a list has to be regenerable, and
  // regenerable means the game's directory carries the pose hook the tool
  // needs. A new game added in a hurry either gets a hook or fails here.
  const capturable = cards.filter((g) => !PAINTED.includes(g) && !EXTERNAL.includes(g))
  const hookless = capturable.filter((g) => !existsSync(join(ROOT, g, 'thumbnail.mjs')))
  check(
    'every card that is not an exception can be recaptured',
    hookless.length === 0,
    hookless.length
      ? `${hookless.join(' ')} — add a thumbnail.mjs exporting pose(page), or say why it is an exception`
      : `${capturable.length} capturable`,
  )
}

{
  // And the exceptions are exceptions because there is nothing to photograph
  // or because someone painted them — not because a hook was never written.
  // A painted game that grew a hook would be silently recaptured by
  // `npm run thumbnail` with no arguments, overwriting the art.
  const armed = PAINTED.filter((g) => existsSync(join(ROOT, g, 'thumbnail.mjs')))
  check(
    'no painted card has a pose hook that would overwrite it',
    armed.length === 0,
    armed.length ? `${armed.join(' ')} — running the tool would replace the art` : `${PAINTED.length} safe`,
  )
  const local = EXTERNAL.filter((g) => existsSync(join(ROOT, g, 'index.html')))
  check(
    'no external card is actually a game in this repo',
    local.length === 0,
    local.length ? `${local.join(' ')} — it can be captured, so it is not an exception` : 'all elsewhere',
  )
}

console.log(ok ? '\nALL THUMBNAIL CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
