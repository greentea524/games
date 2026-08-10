// Entry point for `npm run qa:touch`.
//
// Starts a dev server, runs each touch suite against it, and shuts it down.
// Set QA_URL to the base games URL of an already-running server to skip the
// spawn — the server is the slow part of a cold run.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PORT = process.env.QA_PORT ?? '5178'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SUITES = ['./static.mjs', './platformers.mjs']

async function waitForServer(url, timeoutMs = 30_000) {
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

function run(script, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      cwd: ROOT,
      stdio: 'inherit',
      env,
    })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

let server
let url = process.env.QA_URL

if (!url) {
  url = `http://localhost:${PORT}/games/`
  console.log(`starting a dev server on ${PORT}...`)
  server = spawn('npm', ['run', 'dev', '--', '--port', PORT], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Detached so we can take the whole process group down: npm spawns vite as
    // a child, and killing npm alone leaves vite holding the port.
    detached: true,
  })
  if (!(await waitForServer(url))) {
    console.error(`the dev server never came up on ${url}`)
    if (server.pid) process.kill(-server.pid, 'SIGTERM')
    process.exit(1)
  }
}

const env = { ...process.env, QA_URL: url }
let failed = 0
for (const suite of SUITES) {
  failed += await run(suite, env)
}

if (server?.pid) {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

process.exit(failed ? 1 : 0)
