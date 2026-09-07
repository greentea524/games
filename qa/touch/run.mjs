// Entry point for `npm run qa:touch`.
//
// Starts a dev server, runs each touch suite against it, and shuts it down.
// Set QA_URL to the base games URL of an already-running server to skip the
// spawn — the server is the slow part of a cold run.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ROOT, startDevServer } from '../harness.mjs'

const PORT = process.env.QA_PORT ?? '5178'
const SUITES = ['./static.mjs', './platformers.mjs', './grid.mjs', './zoom.mjs', './tower-stacker.mjs', './tube-runner.mjs']

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

const server = await startDevServer({ port: PORT })
const url = server.url

const env = { ...process.env, QA_URL: url }
let failed = 0
for (const suite of SUITES) {
  failed += await run(suite, env)
}

server.stop()

process.exit(failed ? 1 : 0)
