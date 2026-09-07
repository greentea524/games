// The hub's thumbnails are the size the hub says they are (#122).
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
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const IMAGE_DIR = 'src/assets/images'
const APP = 'src/App.tsx'

/**
 * Width and height of a WebP file, read from its header.
 *
 * All three container variants are handled because this repo has all three:
 * the painted art is simple lossy `VP8 `, and anything Chromium's
 * `toDataURL('image/webp')` produced is `VP8X` extended. A reader that only
 * understood one would silently skip the files it could not parse, which is a
 * check that passes by looking away.
 */
function webpSize(buf: Buffer): { w: number; h: number; fmt: string } | null {
  if (buf.length < 30) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null
  const fourcc = buf.toString('ascii', 12, 16)
  if (fourcc === 'VP8 ') {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, fmt: 'lossy' }
  }
  if (fourcc === 'VP8L') {
    const bits = buf.readUInt32LE(21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1, fmt: 'lossless' }
  }
  if (fourcc === 'VP8X') {
    return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1, fmt: 'extended' }
  }
  return null
}

const app = readFileSync(APP, 'utf8')

// --- what the markup claims ------------------------------------------------

const declared = app.match(
  /className="game-card-thumb"[\s\S]{0,200}?width="(\d+)"[\s\S]{0,80}?height="(\d+)"/,
)
check('the card image declares an intrinsic size', declared !== null, APP)
if (!declared) {
  console.log('\nFAILURES ABOVE')
  process.exit(1)
}
const WIDTH = Number(declared[1])
const HEIGHT = Number(declared[2])
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

const imported = [...app.matchAll(/from '\.\/assets\/images\/([^']+)'/g)].map((m) => m[1])
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

console.log(ok ? '\nALL THUMBNAIL CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
