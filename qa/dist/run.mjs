// The site as it actually ships (#135).
//
//   npm run qa:dist          # builds, serves dist/, checks every page
//   QA_SKIP_BUILD=1 npm run qa:dist
//
// Every other browser suite in this repo runs against `npm run dev`. That is a
// problem `qa/touch/README.md` has stated since it was written:
//
//   > a missing asset only shows up against a **built** site. Both the Vite
//   > dev server and `vite preview` fall back to serving index.html for an
//   > unmatched path, so everything answers 200 there; GitHub Pages returns a
//   > real 404.
//
// …and until this file, nothing pointed anything at a built site. Grepping
// `dist/` across `qa/`, `static/qa/`, `scripts/` and `package.json` returned
// exactly one hit: that sentence, describing a thing nobody did. So the one
// defect class the repo had written down as invisible was invisible on every
// run — and it is the class that reaches production, because this repo deploys
// `main` straight to Pages.
//
// ## What can only fail here
//
//   - an asset the build did not emit, or emitted under another name;
//   - a wrong `base`, so `/games/assets/...` resolves nowhere;
//   - a filename whose case is only correct on this filesystem;
//   - a game on the hub with no built page at all — a card that 404s;
//   - a hardcoded absolute path that works in dev and not under `/games/`.
//
// Every one answers 200 against the dev server.
//
// ## Why a reachability pass rather than the full suites
//
// #135 left the choice open. This runs a load-and-listen pass over the hub and
// every locally hosted game rather than re-running `qa:touch` against `dist/`,
// for two reasons: the 404 class does not need a playthrough to show itself,
// and this way the pass covers **all twelve pages**, which no existing suite
// does — `qa:touch` drives ten games, `qa:contrast` four, `qa:painted` five,
// and `qa:static` one. The hub itself was checked by nothing at all.
//
// The listening is the same as `qa/touch/driver.mjs`'s and for the same
// reasons, including that a 404 is a `response` with a status and not a
// `requestfailed`, which is how a missing sprite used to sail through.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { ROOT, browserLaunchOptions, startStaticServer } from '../harness.mjs'
import { EXTERNAL, importedImages } from '../thumbnails.mjs'

const DIST = ROOT + 'dist'

let ok = true
const check = (name, pass, note) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/**
 * The pages `vite.config.ts` declares, read rather than duplicated.
 *
 * Three lists have to agree for the live site to be whole — what the build is
 * told to emit, what it emitted, and what the hub links to — and no single one
 * of them is the truth. #122 was this shape: a size declared in TSX, the real
 * size in a binary header, and no check spanning the two.
 */
function declaredEntries() {
  const config = readFileSync(ROOT + 'vite.config.ts', 'utf8')
  const input = config.slice(config.indexOf('input: {'))
  return [...input.matchAll(/new URL\('\.\/([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p.endsWith('index.html'))
    .map((p) => (p === 'index.html' ? '' : p.replace(/\/index\.html$/, '')))
    .sort()
}

/** The pages `dist/` actually contains. */
function builtPages() {
  const out = existsSync(`${DIST}/index.html`) ? [''] : []
  for (const entry of readdirSync(DIST, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (existsSync(`${DIST}/${entry.name}/index.html`)) out.push(entry.name)
  }
  return out.sort()
}

/** The games the hub links to on this origin — its cards, minus the offsite ones. */
function hubGames() {
  return importedImages()
    .map((f) => f.replace(/\.webp$/, ''))
    .filter((g) => !EXTERNAL.includes(g))
    .sort()
}

// --- build -----------------------------------------------------------------

if (!process.env.QA_SKIP_BUILD) {
  console.log('building...')
  const built = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (built.status !== 0) {
    console.error('\nthe build failed; there is nothing to serve')
    process.exit(1)
  }
}
check('there is a built site to check', existsSync(`${DIST}/index.html`), DIST)
if (!existsSync(`${DIST}/index.html`)) {
  console.log('\nFAILURES ABOVE')
  process.exit(1)
}

console.log('\n### the built site ###\n')

// --- the three lists agree -------------------------------------------------

const declared = declaredEntries()
const built = builtPages()
const hub = hubGames()

check(
  'every page the build declares was emitted',
  declared.every((p) => built.includes(p)),
  declared.filter((p) => !built.includes(p)).join(' ') || `${declared.length} pages`,
)
check(
  'every game the hub links to has a built page',
  hub.every((g) => built.includes(g)),
  hub.filter((g) => !built.includes(g)).join(' ') || `${hub.length} local cards`,
)
// The other direction. A page that is built and linked from nowhere is dead
// weight on the deploy, and more usefully it is the signature of a card that
// was removed from the hub and a build entry that was not.
check(
  'every built game page is linked from the hub',
  built.filter((p) => p !== '').every((p) => hub.includes(p)),
  built.filter((p) => p !== '' && !hub.includes(p)).join(' ') || 'no orphans',
)

// --- the pages load --------------------------------------------------------

const server = await startStaticServer({ dir: DIST, port: process.env.QA_PORT ?? '5181' })
const browser = await chromium.launch(browserLaunchOptions())
const context = await browser.newContext({ viewport: { width: 900, height: 900 } })
const origin = new URL(server.url).origin

/**
 * The server's own control, run every time rather than once by hand.
 *
 * If this ever returns 200 the server has grown an index.html fallback, and
 * every check below is then passing for the wrong reason — the exact failure
 * CLAUDE.md warns about. It is the first thing asserted for that reason.
 */
{
  const res = await fetch(`${server.url}definitely-not-a-page/`)
  check(
    'an unmatched path 404s rather than falling back to index.html',
    res.status === 404,
    `${res.status} — a 200 here means this suite is measuring nothing`,
  )
}

for (const page of ['', ...hub]) {
  const label = page === '' ? 'the hub' : page
  const tab = await context.newPage()
  const trouble = []
  tab.on('pageerror', (e) => trouble.push(`pageerror: ${e.message}`))
  tab.on('console', (m) => {
    if (m.type() !== 'error') return
    // The console echo of a failed request carries no URL, so it cannot be
    // told apart from anything else here; the response handler below does that
    // properly, by status.
    if (m.text().startsWith('Failed to load resource')) return
    trouble.push(`console: ${m.text()}`)
  })
  tab.on('requestfailed', (req) => {
    const why = req.failure()?.errorText ?? 'unknown'
    if (why.includes('ERR_ABORTED')) return
    trouble.push(`requestfailed: ${req.url()} — ${why}`)
  })
  // A 404 is a response with a status, not a `requestfailed`. This is the
  // handler the whole suite exists for.
  tab.on('response', (res) => {
    if (!res.url().startsWith(origin)) return
    if (res.status() < 400) return
    trouble.push(`${res.status()} ${res.url().slice(origin.length)}`)
  })

  const response = await tab.goto(`${server.url}${page ? page + '/' : ''}`, {
    waitUntil: 'load',
  })
  check(`${label} answers 200`, response?.status() === 200, `${response?.status()}`)

  // Long enough for a Phaser boot or a three.js stage to ask for everything it
  // needs. A 404 on a lazily-fetched asset is exactly what this is here for, so
  // returning at `load` would miss the interesting half.
  await tab.waitForTimeout(3000)

  const rendered = await tab.evaluate(() =>
    Boolean(document.querySelector('canvas') || document.querySelector('.game-card-thumb')),
  )
  check(
    `and renders ${page === '' ? 'cards' : 'a canvas'}`,
    rendered,
    rendered ? 'present' : 'nothing rendered — the page loaded and the app did not start',
  )
  check(
    `and asks for nothing it does not get`,
    trouble.length === 0,
    trouble.length ? trouble.slice(0, 6).join('; ') : 'no failed requests or errors',
  )
  await tab.close()
}

await browser.close()
server.stop()

console.log(ok ? '\nALL BUILT-SITE CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
