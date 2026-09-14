// The painted hub cards, and whether they still describe their games (#132).
//
//   npm run qa:painted             # check
//   npm run qa:painted -- --approve # record the games as they are now
//
// #123 settled where a card's picture comes from: it is a capture of the
// running game, with two closed sets of exceptions. `src/thumbnails_test.ts`
// enforces the lists. What it cannot ask is whether a card on the `PAINTED`
// list still has anything to do with the game behind it, and `qa/thumbnails.mjs`
// says why that matters in as many words: *nothing regenerates these, so
// nothing keeps them honest.* Change a game's sprites, rework it, replace it
// outright, and its card keeps the picture it was commissioned with. Nothing
// goes red.
//
// So this is the missing half. It cannot tell a good illustration from a bad
// one and does not try. It answers one question: **has the game changed since
// a human last looked at the card and said yes?**
//
// ## Comparing the picture to the game does not work
//
// #132 proposed that first and it is worth writing down why it was dropped,
// because it is the obvious idea and it is wrong. Capture each painted game,
// reduce both the capture and the card to a palette signature, and require
// them to resemble each other. Measured across all five, as a histogram
// intersection over a 512-bin RGB signature — rows are the painted art,
// columns the running game:
//
//                  static   windup lantern- pocket-d cart-cra
//   static          0.034    0.151    0.139    0.157    0.041
//   windup          0.025    0.354    0.281    0.359    0.084
//   lantern-keeper  0.101    0.654    0.635    0.652    0.052
//   pocket-dungeon  0.036    0.770    0.732    0.791    0.078
//   cart-crate      0.020    0.252    0.184    0.259    0.084
//
// The diagonal is the right answer and it is the largest number in exactly one
// row of five. Static's own card is its *worst* match — 0.034 against its game,
// 0.157 against Pocket Dungeon's. A threshold that passes the four real pairs
// admits nearly every wrong pairing, which is the test #132 set for the idea,
// and it fails it.
//
// The reason is structural rather than a matter of tuning. The paintings depict
// play; the only frame available to compare them against is a title screen,
// because #123 forbids a painted game from carrying the `thumbnail.mjs` pose
// hook — a painted game with a hook would be silently recaptured by
// `npm run thumbnail` and the art overwritten. Three of these games open on a
// dark title, so the captures resemble *each other* far more than any of them
// resembles its own painting.
//
// ## What is recorded instead
//
// Two hashes and a note per painted game, in `approved.json`:
//
//   - the card file's SHA-256, so swapping the art voids the approval;
//   - a digest of every texture the game generates — key, size and pixels —
//     so a sprite that is added, removed, resized or repainted voids it too;
//   - the note, which is the only part a person writes and the part that says
//     what they saw. `--approve` carries it forward rather than clearing it.
//
// Textures rather than source, deliberately. A refactor, a balance change or a
// new floor modifier moves no pixels and should not demand that anyone look at
// a picture again; redrawing the hero should.
//
// Four controls, per CLAUDE.md, and the last is the one that matters most:
//
//   - Static's card pointed at Cart & Crate's art — the art hash goes red;
//   - one pixel column off Cart & Crate's crate, art untouched — the texture
//     digest goes red, with the key count unchanged at 74, so it is the pixels
//     doing the work and not the inventory;
//   - `entity` dropped from Static's non-deterministic list — red on both of
//     two runs of the same build, which is what that list is for;
//   - an unused exported function added to `cart-crate/levels.ts` — **green**.
//     That is the negative control. Without it this check is indistinguishable
//     from one that fires whenever the repository changes, which would be
//     useless: it would be re-approved on reflex within a week.
//
// See `qa/painted/README.md`.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { ROOT, browserLaunchOptions, startDevServer } from '../harness.mjs'
import { IMAGE_DIR, PAINTED } from '../thumbnails.mjs'

const RECORD = fileURLToPath(new URL('./approved.json', import.meta.url))
const APPROVE = process.argv.includes('--approve')

/**
 * Phaser gives every `Text` object its own canvas texture under a UUID key, so
 * the HP readout and the run clock sit in `getTextureKeys()` alongside the art
 * — and they differ on every load, because the numbers in them do. Measured
 * before this filter existed: 7 such keys in Static, 22 in Pocket Dungeon, and
 * every game's digest changed between two loads of the same build.
 *
 * Skipped by the shape of the key rather than by name, so there is no list to
 * keep up to date and a real texture cannot accidentally be called one.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Digests every generated texture, keyed and sized.
 *
 * `?qa=1` is what publishes `window.__game` (#98), so the URL below carries it.
 */
/**
 * Digests every generated texture, keyed and sized.
 *
 * A real function rather than a source string, so Playwright can pass it the
 * skip list: `page.evaluate` with a string takes no arguments, and evaluating
 * `(skip) => ...` as source hands back the function rather than calling it.
 */
function digestTextures({ skip, uuid }) {
  const isText = new RegExp(uuid)
  const g = window.__game
  if (!g || !g.textures) {
    return { error: 'window.__game is not published — is ?qa=1 on the URL?' }
  }
  const keys = g.textures
    .getTextureKeys()
    .filter((k) => !k.startsWith('__') && !isText.test(k) && !skip.includes(k))
    .sort()
  const per = {}
  for (const key of keys) {
    const src = g.textures.get(key).getSourceImage()
    if (!src || !src.width) {
      per[key] = 'no-source'
      continue
    }
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    try {
      ctx.drawImage(src, 0, 0)
    } catch {
      per[key] = 'undrawable'
      continue
    }
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let h = 2166136261
    for (let i = 0; i < d.length; i++) {
      h ^= d[i]
      h = Math.imul(h, 16777619)
    }
    per[key] = src.width + 'x' + src.height + ':' + (h >>> 0).toString(16)
  }
  return { per }
}

/** Waits until the game has stopped building textures, rather than sleeping. */
async function settled() {
  let last = -1
  for (let i = 0; i < 60; i++) {
    const n = window.__game?.textures?.getTextureKeys?.().length ?? -1
    if (n > 0 && n === last) return n
    last = n
    await new Promise((r) => setTimeout(r, 150))
  }
  return last
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

/** Collapses the per-texture map into one hash, so a record stays readable. */
function digestOf(per) {
  const s = Object.keys(per)
    .sort()
    .map((k) => `${k}=${per[k]}`)
    .join('|')
  return { hash: sha(s), keys: Object.keys(per).length }
}

async function measure(page, base, game, skip) {
  await page.goto(`${base}${game}/?qa=1`, { waitUntil: 'load' })
  await page.waitForSelector('canvas')
  await page.evaluate(settled)
  const r = await page.evaluate(digestTextures, { skip, uuid: UUID.source })
  if (r.error) throw new Error(`${game}: ${r.error}`)
  return r.per
}

let server
let base = process.env.QA_URL
if (!base) {
  server = await startDevServer({ port: process.env.QA_PORT ?? '5180' })
  base = server.url
}

const browser = await chromium.launch(browserLaunchOptions())
const context = await browser.newContext({ viewport: { width: 900, height: 900 } })
const page = await context.newPage()

const previous = JSON.parse(readFileSync(RECORD, 'utf8'))
// On approve the hashes are rewritten and the `note` is carried forward. The
// note is the only part a person writes, and it is the part that says what they
// saw — losing it on every re-approval would leave a file of bare hashes with
// nothing in it about the picture.
const record = APPROVE ? {} : previous
let ok = true
const check = (name, pass, note) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

console.log(`\n### painted cards ###\n`)

for (const game of PAINTED) {
  const art = sha(readFileSync(`${ROOT}${IMAGE_DIR}/${game}.webp`))

  if (APPROVE) {
    // Two loads, and the keys that disagree between them are non-deterministic
    // by measurement rather than by anyone's say-so. Static's `entity` paints
    // its face from `Math.random()` on purpose, and would otherwise report a
    // changed game on every single run.
    const first = await measure(page, base, game, [])
    const second = await measure(page, base, game, [])
    const unstable = Object.keys(first).filter((k) => first[k] !== second[k]).sort()
    for (const k of unstable) delete second[k]
    const { hash, keys } = digestOf(second)
    record[game] = {
      note: previous[game]?.note ?? 'not yet described — say what the card shows and how it relates to the game',
      art,
      textures: hash,
      keys,
      nondeterministic: unstable,
    }
    console.log(
      `  recorded ${game.padEnd(15)} ${keys} textures${unstable.length ? `, ${unstable.length} non-deterministic: ${unstable.join(' ')}` : ''}`,
    )
    continue
  }

  const approved = record[game]
  if (!approved) {
    check(`${game} has an approval on record`, false, 'run npm run qa:painted -- --approve')
    continue
  }
  check(
    `${game}'s card is the one that was approved`,
    approved.art === art,
    approved.art === art
      ? `${art.slice(0, 12)}`
      : `the art file changed — ${approved.art.slice(0, 12)} -> ${art.slice(0, 12)}`,
  )
  const per = await measure(page, base, game, approved.nondeterministic ?? [])
  const { hash, keys } = digestOf(per)
  check(
    `and ${game} still looks the way it did then`,
    approved.textures === hash,
    approved.textures === hash
      ? `${keys} textures unchanged`
      : `${keys} textures now, ${approved.keys} then — look at the card beside the game, then approve`,
  )
}

if (APPROVE) {
  writeFileSync(RECORD, JSON.stringify(record, null, 2) + '\n')
  console.log(`\nwrote ${RECORD}`)
  console.log('Approving is a claim that someone looked. Commit it with what you saw.')
}

await browser.close()
server?.stop()

if (!APPROVE) console.log(ok ? '\nALL PAINTED CARD CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
