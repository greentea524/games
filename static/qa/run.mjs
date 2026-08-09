// Entry point for `npm run qa:static`.
//
// Starts a dev server, runs the reachability check and then the playthrough,
// and shuts the server down again. Point QA_URL at an already-running server
// to skip the spawn (useful when iterating, since the server is the slow part
// of a cold run).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PORT = process.env.QA_PORT ?? '5178'
const ROOT = fileURLToPath(new URL('../../', import.meta.url))

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
  url = `http://localhost:${PORT}/games/static/`
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

console.log('\n### reachability ###\n')
failed += await run('./reachability.mjs', env)

console.log('\n### playthrough ###\n')
failed += await run('./playthrough.mjs', env)

if (server?.pid) {
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

process.exit(failed ? 1 : 0)
