// Content-Security-Policy checks (#101, #102, #108).
//
//   npm run qa:csp
//
// Pure text: the policy and the scripts it governs are both in the HTML, so
// this needs no browser and takes milliseconds.
//
// It exists for one failure mode above all. A script hash rots *silently*:
// edit the inline sizing script by a character and the browser quietly
// declines to run it. Nothing throws, no request fails, no console error the
// game can see — the shell simply never sizes itself, and every other check in
// this repo goes on passing. That is a worse failure than the 'unsafe-inline'
// it replaced, and this check is the only reason trading one for the other is
// a good deal.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PAGES = [
  'index.html',
  'static/index.html',
  'windup/index.html',
  'lantern-keeper/index.html',
  'pocket-dungeon/index.html',
  'cart-crate/index.html',
  'tower-stacker/index.html',
  'tube-runner/index.html',
]

let ok = true
const check = (name, pass, note) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const sha256 = (s) => `sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}`

/** Inline `<script>` blocks — no attributes, so the module script is excluded. */
const inlineScripts = (html) => [...html.matchAll(/<script>(.*?)<\/script>/gs)].map((m) => m[1])

const policyOf = (html) => {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)
  return m ? m[1] : null
}

const directive = (policy, name) => {
  const part = policy.split(';').map((s) => s.trim()).find((s) => s.startsWith(name + ' '))
  return part ? part.slice(name.length + 1).trim().split(/\s+/) : null
}

for (const page of PAGES) {
  const html = readFileSync(ROOT + page, 'utf8')
  const policy = policyOf(html)
  check(`${page} has a policy`, policy !== null)
  if (!policy) continue

  const scriptSrc = directive(policy, 'script-src')
  check(`${page} script-src exists`, scriptSrc !== null, scriptSrc?.join(' '))

  // The point of the whole exercise.
  check(
    `${page} does not allow inline script`,
    !scriptSrc?.includes("'unsafe-inline'"),
    scriptSrc?.join(' '),
  )

  // Every inline script must be covered by a hash, and every hash must cover
  // an inline script. Both directions: an uncovered script is a shell that
  // silently stops working, and a stale hash left behind after a script is
  // deleted is a permission granted to nothing, which reads as protection it
  // is not providing.
  const scripts = inlineScripts(html)
  const wanted = scripts.map(sha256)
  const listed = (scriptSrc ?? []).filter((s) => s.startsWith("'sha256-"))
    .map((s) => s.slice(1, -1))

  const uncovered = wanted.filter((h) => !listed.includes(h))
  check(
    `${page}: every inline script is hashed (${scripts.length} script(s))`,
    uncovered.length === 0,
    uncovered.length ? `not in the policy: ${uncovered.join(', ')}` : 'all covered',
  )
  const unused = listed.filter((h) => !wanted.includes(h))
  check(
    `${page}: every hash covers a script`,
    unused.length === 0,
    unused.length ? `nothing on the page matches: ${unused.join(', ')}` : `${listed.length} hash(es)`,
  )

  // #102: nothing external. Any host in any fetch directive is a regression.
  const hosts = policy
    .split(';')
    .flatMap((d) => d.trim().split(/\s+/).slice(1))
    .filter((v) => /^https?:/.test(v) || v.includes('.'))
  check(`${page} names no external host`, hosts.length === 0, hosts.join(' ') || 'none')

  for (const [name, want] of [['default-src', "'none'"], ['base-uri', "'none'"], ['form-action', "'none'"]]) {
    check(`${page} ${name} is ${want}`, directive(policy, name)?.join(' ') === want, directive(policy, name)?.join(' '))
  }
}

console.log(ok ? '\nALL CSP CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
