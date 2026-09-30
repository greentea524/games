// The six standalone 3D games tell a desktop player their keys (#140).
//
// Every one of them has a full keyboard scheme, and until #140 five of the six
// hints said only "tap", "drag" or "hold the side of the screen". A player at a
// desktop was told to touch a screen they did not have, and the arrow keys that
// would have done it were undiscoverable.
//
// The hint is unconditional — it names the keys on a phone too. #140 weighed
// branching on `(pointer: coarse)` and chose not to: a phone player reading the
// word "keys" loses nothing, a desktop player reading only "tap" loses the
// controls, and a second code path in six games is six places to drift.
//
// ## What is asserted, and why it is two things
//
// **The hint names a key.** Without this the change regresses to a hint that
// says "tap" and passes. That is the check #140 asked for.
//
// **Every key it names is one the game acts on.** A hint that names a key the
// game ignores is worse than one that names none: it sends the player to a
// dead control. So each named key is pressed, for real, through the keyboard,
// and the game has to consume it.
//
// "Consume" is read as `defaultPrevented`. Every key handler in these six
// games calls `preventDefault()` on the keys it acts on — Space and the arrows
// scroll a page otherwise, which is why the handlers were written that way —
// and nothing in `shared/` listens to the keyboard at all, so there is no
// global handler that would swallow every key and make this pass for anything.
// A listener registered *after* the game's, on the same target, sees the flag
// the game's own listener set.
//
// It is a proxy — it says the key reached a handler that claimed it, not what
// the handler did with it. The per-game suites cover what the controls do.
//
// ## The vocabulary
//
// `KEYS` below maps the way a hint writes a key to the codes that phrase
// promises. "The arrow keys" promises left and right, the pair every one of
// the six handles; a game that only listened to one arrow would be told so.
// A phrase not in the list is not recognised, so a hint that invents new
// wording fails the first assertion rather than slipping past the second —
// extend `KEYS` when that happens.
import { launchTouch, gameUrl, checker } from './driver.mjs'

const { check, finish } = checker()

/** How a hint writes a key, and the `KeyboardEvent.code`s that promises. */
const KEYS = [
  { phrase: /\barrow keys\b/i, name: 'the arrow keys', codes: ['ArrowLeft', 'ArrowRight'] },
  { phrase: /\bWASD\b/, name: 'WASD', codes: ['KeyW', 'KeyA', 'KeyS', 'KeyD'] },
  { phrase: /\bSpace(bar)?\b/, name: 'Space', codes: ['Space'] },
  { phrase: /\bEnter\b/, name: 'Enter', codes: ['Enter'] },
]

/**
 * Where each game's hint is, and how to get it on screen.
 *
 * Two games open on a title panel and show the hint only once a run starts;
 * Anomaly Room fills its hint in only once a round is armed. The rest show it
 * at load. The hint is read where a player reads it, not from source.
 */
const GAMES = [
  { name: 'tower-stacker', hint: '.ts-hint', start: '.ts-btn-primary' },
  { name: 'tube-runner', hint: '.tr-hint', start: '.tr-btn-primary' },
  { name: 'tilt-maze', hint: '.tm-hint' },
  { name: 'minigolf', hint: '.mg-hint' },
  { name: 'anomaly-room', hint: '.ar-hint' },
  { name: 'voxel-digger', hint: '.vd-hint' },
]

/**
 * Presses a key through the real keyboard and reports whether the game
 * consumed it — on keydown, which is where every one of these acts.
 */
async function consumed(page, code) {
  await page.evaluate(() => {
    window.__consumed = null
    if (window.__consumedListening) return
    window.__consumedListening = true
    window.addEventListener('keydown', (e) => {
      window.__consumed = { code: e.code, prevented: e.defaultPrevented }
    })
  })
  await page.keyboard.down(code)
  await page.waitForTimeout(60)
  await page.keyboard.up(code)
  await page.waitForTimeout(60)
  const seen = await page.evaluate(() => window.__consumed)
  return !!seen && seen.code === code && seen.prevented
}

async function run(game) {
  const t = await launchTouch(gameUrl(game.name))
  const { page } = t
  try {
    await page.waitForSelector('#stage canvas')
    if (game.start) await page.locator(game.start).click()
    const hint = page.locator(game.hint)
    let shown = true
    try {
      await hint.waitFor({ state: 'visible', timeout: 8000 })
    } catch {
      shown = false
    }
    const text = shown ? ((await hint.textContent()) ?? '').trim() : ''
    check(`${game.name}: the hint is on screen`, shown && text.length > 0, shown ? `"${text}"` : 'never shown')
    if (!shown) return

    const named = KEYS.filter((k) => k.phrase.test(text))
    check(
      `${game.name}: and it names a key`,
      named.length > 0,
      named.length ? named.map((k) => k.name).join(', ') : 'no key the vocabulary recognises',
    )
    for (const key of named) {
      const dead = []
      for (const code of key.codes) if (!(await consumed(page, code))) dead.push(code)
      check(
        `${game.name}: which the game acts on — ${key.name}`,
        dead.length === 0,
        dead.length ? `not consumed: ${dead.join(' ')}` : key.codes.join(' '),
      )
    }
  } finally {
    await t.browser.close()
  }
  return finish(t.log)
}

console.log('\n### keyboard hints ###\n')
let ok = true
for (const game of GAMES) {
  if (!(await run(game))) ok = false
}
process.exit(ok ? 0 : 1)
