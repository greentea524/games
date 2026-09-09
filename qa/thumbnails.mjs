// What a hub thumbnail is, for the two things that need to know (#122, #124),
// and the house rule that says where one comes from (#123).
//
// `src/thumbnails_test.ts` checks that the files match what `src/App.tsx`
// declares. `scripts/thumbnail.mjs` produces files that have to match the same
// thing. Neither should carry its own copy of the answer — that duplication is
// the exact shape of the defect #122 fixed, where the declared size lived in
// TSX, the real size lived in a binary header, and nothing spanned the two.
import { readFileSync } from 'node:fs'
import { ROOT } from './harness.mjs'

/** Where `App.tsx` declares the size, and where the images live. */
export const APP = 'src/App.tsx'
export const IMAGE_DIR = 'src/assets/images'

/**
 * The house rule for hub thumbnails (#123).
 *
 * **A card is a capture of the running game.** It is produced by
 * `npm run thumbnail`, at the size `App.tsx` declares, framed by the treatment
 * in `scripts/thumbnail.mjs`, and it can be regenerated at any time — so a
 * card can never show a game that no longer looks like that.
 *
 * There are two kinds of exception, and both are *closed sets listed below*
 * rather than judgement calls. That is the whole point of writing this down.
 * #123 exists because there was never a stated rule, so each new card was
 * decided on its own and the answers drifted apart; a rule with an open
 * exception is the same thing with extra steps.
 *
 * `PAINTED` — five GameBoy games carry commissioned illustrative art rather
 * than a screenshot. It is better-looking than a capture of a 160x144 tilemap
 * and it is kept for that reason, with the cost understood: it is *not* what
 * the game looks like. Static's piece shows a village, a HUD and a score line
 * the game does not have. Nothing regenerates these, so nothing keeps them
 * honest, which is exactly why no sixth game may join them.
 *
 * `EXTERNAL` — three games are hosted elsewhere and have no directory in this
 * repo, so there is nothing here to photograph. Their cards are screenshots
 * taken by hand.
 *
 * Anything else must be capturable, which in practice means the game's
 * directory has a `thumbnail.mjs` exporting `pose(page)`. `thumbnails_test.ts`
 * enforces all of this, so a fifteenth game cannot quietly become a fourth
 * kind of picture.
 */
export const PAINTED = [
  'static',
  'windup',
  'lantern-keeper',
  'pocket-dungeon',
  'cart-crate',
]

export const EXTERNAL = ['invasion', 'platformer', 'big2']

/**
 * The intrinsic size `App.tsx` puts on every card image.
 *
 * This is the hub's house size by definition: the markup promises it to the
 * browser for layout, so a file that disagrees causes a layout shift. Read
 * rather than hardcoded, so changing the markup moves everything at once.
 */
export function declaredSize(root = ROOT) {
  const app = readFileSync(root + APP, 'utf8')
  const m = app.match(
    /className="game-card-thumb"[\s\S]{0,200}?width="(\d+)"[\s\S]{0,80}?height="(\d+)"/,
  )
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

/** Every `./assets/images/...` filename `App.tsx` imports. */
export function importedImages(root = ROOT) {
  const app = readFileSync(root + APP, 'utf8')
  return [...app.matchAll(/from '\.\/assets\/images\/([^']+)'/g)].map((m) => m[1])
}

/**
 * Width and height of a WebP file, read from its header.
 *
 * All three container variants are handled because this repo has all three:
 * the painted art is simple lossy `VP8 `, and anything Chromium's
 * `toDataURL('image/webp')` produced is `VP8X` extended. A reader that only
 * understood one would silently skip the files it could not parse, which is a
 * check that passes by looking away.
 */
export function webpSize(buf) {
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
