// Capture a hub thumbnail from the running game (#124).
//
//   npm run thumbnail -- tower-stacker
//   npm run thumbnail                    # every game that has a pose hook
//
// #123 settled where a card's picture comes from: a capture of the running
// game, with two closed sets of exceptions listed in `qa/thumbnails.mjs`. This
// tool is how the capture half of that rule is carried out, and the treatment
// below is how one looks.
//
// There was no committed way to do this. The two 3D thumbnails were made by an
// ad-hoc Playwright script written in the session that added them and deleted
// at commit time, because a throwaway file at the repo root is worse than
// none — so the knowledge shipped and the tool did not, and the next game
// would have re-derived it. This is that tool.
//
// The part that cannot be generic is getting the game somewhere worth
// photographing: a title screen is rarely the best card. So each game owns a
// `thumbnail.mjs` beside it exporting `pose(page)`, which drives its own
// `window.__game` handle however it needs to. The tool owns everything else.
import { readdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { ROOT, browserLaunchOptions, startDevServer } from '../qa/harness.mjs'
import { IMAGE_DIR, declaredSize } from '../qa/thumbnails.mjs'

/**
 * A game is a directory with both a page to load and a pose hook to run.
 *
 * Both halves matter. Testing only for `thumbnail.mjs` matched `scripts/`,
 * because this file *is* a `scripts/thumbnail.mjs` — so the tool's first act
 * was to navigate to `/games/scripts/`, get the dev server's SPA fallback, and
 * wait thirty seconds for a canvas that was never going to exist. Requiring an
 * `index.html` says what a game actually is instead of pattern-matching a
 * filename.
 */
function isGame(name) {
  return existsSync(`${ROOT}${name}/index.html`) && existsSync(`${ROOT}${name}/thumbnail.mjs`)
}

function gamesWithHooks() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => e.name)
    .filter(isGame)
    .sort()
}

/**
 * The viewport a game is photographed at.
 *
 * Per-game like the pose, and for the same reason. The GameBoy pages want a
 * tall window, because their pre-init script sizes the console from the
 * available height. A standalone game fills whatever it is given, so a
 * portrait window hands the treatment a portrait frame and most of the board
 * is cropped away reaching the card's shape. A game may export `viewport` from
 * its `thumbnail.mjs` to say so.
 */
const DEFAULT_VIEWPORT = { width: 520, height: 900 }

/**
 * The least variation a real capture has in it.
 *
 * Below this the picture is one flat colour, which is what a Phaser game
 * produced for as long as this tool read the canvas back instead of
 * screenshotting it — and it was written to disk and reported `ok` every time.
 */
const BLANK_RANGE = 0.05

async function capture(game, page, baseUrl, size) {
  const hook = await import(`${ROOT}${game}/thumbnail.mjs`)
  const { pose, viewport = DEFAULT_VIEWPORT } = hook
  await page.setViewportSize(viewport)

  const url = new URL(`${game}/`, baseUrl)
  url.searchParams.set('qa', '1')
  await page.goto(url.toString(), { waitUntil: 'load' })
  await page.waitForSelector('#game canvas, canvas', { timeout: 20_000 })
  await page.waitForTimeout(1500)

  await pose(page)

  // The one thing hidden before the shutter: the link back to the hub.
  //
  // A screenshot composites the DOM overlay a standalone game draws its HUD
  // in, which is right — the score and the state are what the player sees, and
  // the GameBoy games have theirs drawn into the canvas where it cannot be
  // removed anyway. The back link is the exception because it is not the game:
  // it is navigation, it is on every standalone page, and its counterpart on a
  // GameBoy page sits outside the canvas and never appears in those captures.
  // Leaving it in would put a "Games" button on six cards and not the other
  // eight, which is exactly the drift #123 is about.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.stage3d-back')) {
      el.style.visibility = 'hidden'
    }
  })

  const frame = await page.evaluate(() => {
    const c = document.querySelector('#game canvas') ?? document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      // The backing store, not the displayed size. "Pixel art" means a buffer
      // small enough that every source pixel is meant to be seen as one; 320
      // is two GameBoy screens wide, and anything above it is a
      // full-resolution render that should be filtered rather than blocked up.
      pixelArt: c.width <= 320,
      backing: [c.width, c.height],
    }
  })

  // The frame is taken with a page screenshot rather than by reading the
  // canvas back with `drawImage`.
  //
  // Reading it back is what this tool did first, and it works for the three.js
  // games only because `shared/stage3d.ts` asks for `preserveDrawingBuffer`.
  // Phaser does not, so its WebGL buffer is undefined once the frame has been
  // composited, and `drawImage` returns a canvas of solid black. Every one of
  // the five GameBoy games would have been photographed as a black rectangle,
  // written to disk, and reported as `ok` — the tool had no way to tell.
  //
  // A screenshot composites the same pixels the player sees, whatever the
  // renderer did with its buffer, and needs nothing from the game.
  const shot = await page.screenshot({
    clip: {
      x: Math.max(0, frame.x),
      y: Math.max(0, frame.y),
      width: Math.min(frame.width, viewport.width - Math.max(0, frame.x)),
      height: Math.min(frame.height, viewport.height - Math.max(0, frame.y)),
    },
  })

  // ---------------------------------------------------------- the treatment
  //
  // The house treatment (#123), and deliberately the only place that decides
  // anything about how a thumbnail looks. Every card is this recipe applied to
  // a frame of the running game:
  //
  //   - one size for every card, read from the markup rather than kept here
  //   - the frame fills the card's box, scaled by the larger of the two ratios
  //     so nothing is letterboxed
  //   - a pixel-art game is scaled by a whole number with smoothing off, so a
  //     160x144 screen keeps hard pixels instead of a blurred upscale
  //   - anything left over is cropped from the bottom, not the middle: these
  //     games put their score line along the top, and centring cuts it off
  //
  // It has to be written inline rather than passed in as a named function:
  // Playwright serialises the callback itself, so it cannot call anything from
  // this module's scope, and the obvious workaround — passing the source and
  // `eval`-ing it in the page — is blocked by the games' own CSP, which is
  // `script-src 'self'` with no `unsafe-eval`.
  const result = await page.evaluate(
    async ([png, W, H, pixelArt]) => {
      const img = new Image()
      img.src = png
      await img.decode()

      const out = document.createElement('canvas')
      out.width = W
      out.height = H
      const ctx = out.getContext('2d')
      ctx.imageSmoothingEnabled = !pixelArt
      let scale = Math.max(W / img.width, H / img.height)
      // Rounded rather than ceiled: the screenshot is already the canvas at
      // its displayed zoom, so it is usually at or above the card's size
      // already and the right whole number is 1.
      if (pixelArt) scale = Math.max(1, Math.round(scale))
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, Math.round(img.width * scale), Math.round(img.height * scale))

      // How much of the card actually varies. A capture that came back blank —
      // which is exactly what a Phaser game used to produce — has a luminance
      // range of nothing, and the tool has to be able to say so rather than
      // write it out and report success.
      const d = ctx.getImageData(0, 0, W, H).data
      let lo = 1
      let hi = 0
      for (let i = 0; i < d.length; i += 4 * 37) {
        const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255
        if (l < lo) lo = l
        if (l > hi) hi = l
      }
      return { dataUrl: out.toDataURL('image/webp', 0.92), range: hi - lo, source: [img.width, img.height] }
    },
    [`data:image/png;base64,${shot.toString('base64')}`, size.width, size.height, frame.pixelArt],
  )

  const buf = Buffer.from(result.dataUrl.split(',')[1], 'base64')
  const out = `${ROOT}${IMAGE_DIR}/${game}.webp`
  writeFileSync(out, buf)
  return { out, bytes: buf.length, range: result.range, source: result.source, backing: frame.backing }
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const games = requested.length ? requested : gamesWithHooks()

const size = declaredSize()
if (!size) {
  console.error('could not read the thumbnail size from src/App.tsx')
  process.exit(1)
}

for (const game of games) {
  if (!existsSync(`${ROOT}${game}/index.html`)) {
    console.error(`${game}: no index.html — is that a game directory?`)
    process.exit(1)
  }
  if (!existsSync(`${ROOT}${game}/thumbnail.mjs`)) {
    console.error(`${game}: no thumbnail.mjs — it needs one exporting \`pose(page)\`,`)
    console.error('       which drives the game to a frame worth photographing.')
    process.exit(1)
  }
}

const server = await startDevServer({ port: process.env.QA_PORT ?? '5179' })
let browser
let failed = 0
try {
  browser = await chromium.launch(browserLaunchOptions())
  const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message)))

  console.log(`capturing at ${size.width}x${size.height}\n`)
  for (const game of games) {
    errors.length = 0
    const { out, bytes, range, source, backing } = await capture(game, page, server.url, size)
    // A game that threw on the way to its pose has produced a picture of a
    // broken game, and a silently wrong thumbnail is worse than none.
    if (errors.length) {
      console.error(`  FAIL ${game} — page errors: ${errors.join('; ')}`)
      failed++
      continue
    }
    // A capture with no variation in it is a picture of nothing. It is what a
    // Phaser game produced for as long as this tool read the canvas back, and
    // it was reported as a success every time.
    if (range < BLANK_RANGE) {
      console.error(`  FAIL ${game} — the capture is blank (luminance range ${range.toFixed(3)})`)
      failed++
      continue
    }
    const zoom = (source[0] / backing[0]).toFixed(2).replace(/\.00$/, '')
    console.log(
      `  ok   ${game} -> ${out.replace(ROOT, '')} (${Math.round(bytes / 1024)} kB, ${backing[0]}x${backing[1]} at ${zoom}x)`,
    )
  }
} finally {
  await browser?.close()
  server.stop()
}

if (failed) {
  console.error('\nsome captures failed')
  process.exit(1)
}
console.log('\nRun `npm run qa:units` to check the results against what App.tsx declares.')
