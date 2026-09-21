// The bits of the QA harness that are not about QA (#124).
//
// Browser discovery and dev-server spawning were both fiddly to get right and
// neither is specific to running a test suite. They lived inside
// `qa/touch/driver.mjs` and `qa/touch/run.mjs` because the touch suites were
// the only thing that needed them; `scripts/thumbnail.mjs` is the second
// caller, which is this repo's usual moment to extract — the same one that
// produced `shared/buttons.ts` and `shared/shell.css`.
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Repository root, as an absolute path with a trailing separator. */
export const ROOT = fileURLToPath(new URL('../', import.meta.url))

/**
 * Where to find a Chromium.
 *
 * `playwright-core` ships no browsers, which keeps `npm ci` cheap for a
 * dependency only tooling uses. Point `QA_BROWSER` at a binary, or leave it
 * and we fall back through the usual paths to an installed Chrome.
 */
const BROWSER_PATHS = [
  process.env.QA_BROWSER,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean)

export function browserLaunchOptions() {
  const found = BROWSER_PATHS.find((p) => fs.existsSync(p))
  if (found) return { executablePath: found }
  return { channel: 'chrome' } // last resort: a system Chrome install
}

/** Polls `url` until it answers, or the deadline passes. */
export async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

/**
 * Starts a dev server and waits for it, or reuses one already running.
 *
 * Set `QA_URL` to the games *base* URL to skip the spawn — a cold server is
 * the slow part of any of this. Returns the base URL and a `stop` that is safe
 * to call whether or not anything was spawned.
 */
export async function startDevServer({ port = '5178', reuse = process.env.QA_URL } = {}) {
  if (reuse) return { url: reuse, spawned: false, stop() {}, logText: () => '' }

  const url = `http://localhost:${port}/games/`
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Detached so the whole process group can be taken down: npm spawns vite as
    // a child, and killing npm alone leaves vite holding the port.
    detached: true,
  })

  // Drain both pipes. A piped stream nobody reads fills its buffer and then
  // blocks the writer, so a chatty startup — Vite re-optimising dependencies
  // on a cold cache, say — could wedge the server *after* it had already
  // answered the readiness check. Keeping the tail also means a failure can
  // print what the server said instead of only that it went quiet.
  const lines = []
  const record = (chunk) => {
    lines.push(chunk.toString())
    if (lines.length > 400) lines.shift()
  }
  server.stdout?.on('data', record)
  server.stderr?.on('data', record)
  const logText = () => lines.join('')

  const stop = () => {
    if (!server.pid) return
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }

  if (!(await waitForServer(url))) {
    stop()
    throw new Error(`the dev server never came up on ${url}\n${logText()}`)
  }
  return { url, spawned: true, stop, logText }
}

/**
 * Serves a directory over HTTP the way GitHub Pages does, for #135.
 *
 * The one property that matters is the one Vite's own servers do not have:
 * **an unmatched path gets a 404.** Both `vite` and `vite preview` fall back to
 * serving `index.html`, so a missing asset, a wrong `base` or a filename whose
 * case is only right on this filesystem all answer 200 against them and 404 on
 * Pages. `qa/touch/README.md` has said so since it was written, and until this
 * existed nothing in the repo ever served anything else — so the only defect
 * class the repo had written down as invisible was invisible on every run.
 *
 * `mount` matters as much. The built pages reference `/games/assets/...`
 * absolutely, because `vite.config.ts` sets `base: '/games/'`, so a server that
 * hands `dist/` out at the root serves pages whose every asset 404s. Mounting
 * at `/games/` is what Pages does with this repo.
 */
export async function startStaticServer({ dir, port = '5181', mount = '/games/' } = {}) {
  const { createServer } = await import('node:http')
  const { join, normalize, extname } = await import('node:path')

  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.map': 'application/json; charset=utf-8',
  }

  const server = createServer((req, res) => {
    const send = (code, body = '', type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'content-type': type })
      res.end(body)
    }
    let path
    try {
      path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      return send(400, 'bad request')
    }
    if (!path.startsWith(mount)) return send(404, 'not found')
    let rel = path.slice(mount.length)
    if (rel.endsWith('/') || rel === '') rel += 'index.html'
    // `normalize` collapses `..`, and the prefix test is what stops a request
    // escaping the served directory.
    const full = normalize(join(dir, rel))
    if (!full.startsWith(normalize(dir))) return send(403, 'forbidden')
    let body
    try {
      body = fs.readFileSync(full)
    } catch {
      // No index.html fallback. This is the whole point of the file.
      return send(404, 'not found')
    }
    send(200, body, TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream')
  })

  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(Number(port), '127.0.0.1', resolve)
  })
  const url = `http://localhost:${port}${mount}`
  return {
    url,
    spawned: true,
    stop() {
      server.close()
    },
    logText: () => '',
  }
}
