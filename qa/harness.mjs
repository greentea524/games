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
