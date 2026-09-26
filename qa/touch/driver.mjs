// A phone-shaped browser with real, trusted touch.
//
// Playwright's own helpers cannot express what these games need. `mouse` is
// not touch at all; `page.touchscreen.tap` is a single contact with no drag;
// and PointerEvents dispatched from `evaluate()` are untrusted, so
// `setPointerCapture` rejects them — and pointer capture is precisely the
// mechanism shared/dpad.ts is built on. CDP's Input.dispatchTouchEvent
// produces genuine trusted touch, so capture, the dead zone and the edge slop
// all behave the way they do under a thumb.
import { chromium } from 'playwright-core'
import { browserLaunchOptions } from '../harness.mjs'

/** A mid-size phone in portrait — the case the on-screen controls exist for. */
export const PHONE = { width: 390, height: 844 }

/** Base URL of the games, without a trailing game segment. */
export const BASE_URL = process.env.QA_URL ?? 'http://localhost:5178/games/'

export function gameUrl(name) {
  return new URL(`${name}/`, BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`).toString()
}

const AUDIO_PROBE = `
/**
 * Listens to what the games actually put out, for #136.
 *
 * Three touch suites check the sound control by asserting the *label* changed,
 * and nothing anywhere asserted a sound. \`playBlip\` wired to nothing, a context
 * left suspended, a master gain stuck at 0, or a toggle that flips the label and
 * not the gain — every one of those passed. The last is the sharp case, because
 * a label changing is exactly what a broken toggle also does.
 *
 * So this measures the signal rather than the intent. Installed before any page
 * script runs, it replaces the \`destination\` getter every game reaches for with
 * an \`AnalyserNode\` that forwards to the real output, and keeps the peak RMS
 * seen since the last reset.
 *
 * An analyser rather than a count of \`createOscillator\` calls, deliberately:
 * counting calls measures what the game meant to do, and a master gain at 0 —
 * which is what a half-wired mute looks like — leaves the count untouched and
 * the room silent. The samples are the only thing that knows the difference.
 *
 * It is a pass-through, so nothing about what a player would hear changes; and
 * it exists only under this driver, never in a shipped page.
 *
 * Peak-held rather than sampled on demand: the shortest sound in the repo is a
 * 55 ms ring clear, so a single read after the fact would usually land in
 * silence and report a game that had just made a noise as mute.
 */
;(() => {
  try {
    const proto = window.BaseAudioContext?.prototype ?? window.AudioContext?.prototype
    if (!proto) return
    const real = Object.getOwnPropertyDescriptor(proto, 'destination')
    if (!real?.get) return

    const state = { analysers: [], peak: 0, contexts: 0 }
    window.__audio = {
      /** Peak RMS across every context since the last reset. */
      peak: () => state.peak,
      /** How many contexts the page built — 0 means nothing even tried. */
      contexts: () => state.contexts,
      reset() {
        state.peak = 0
      },
    }

    Object.defineProperty(proto, 'destination', {
      configurable: true,
      get() {
        const output = real.get.call(this)
        // \`createAnalyser\` can reach for \`destination\` itself; without this the
        // getter recurses until the stack gives out.
        if (this.__probing) return output
        if (!this.__probe) {
          this.__probing = true
          try {
            const analyser = this.createAnalyser()
            analyser.fftSize = 2048
            analyser.connect(output)
            this.__probe = analyser
            state.analysers.push(analyser)
            state.contexts++
          } catch {
            this.__probe = null
          } finally {
            this.__probing = false
          }
        }
        return this.__probe ?? output
      },
    })

    const buf = new Float32Array(2048)
    const tick = () => {
      for (const a of state.analysers) {
        try {
          a.getFloatTimeDomainData(buf)
        } catch {
          continue
        }
        let sum = 0
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        if (rms > state.peak) state.peak = rms
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  } catch {
    // A driver that breaks the page it is measuring is worse than one that
    // measures nothing, and \`window.__audio\` being absent is a loud failure in
    // the checks that use it.
  }
})()

`

export async function launchTouch(url) {
  let browser
  try {
    browser = await chromium.launch(browserLaunchOptions())
  } catch (e) {
    throw new Error(
      'could not start a browser for the touch run. Set QA_BROWSER to a ' +
        `Chromium binary, or install Chrome.\n  underlying error: ${e.message}`,
    )
  }
  const context = await browser.newContext({
    viewport: PHONE,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  })
  // Installed before any page script, so the games' own `new AudioContext()`
  // already sees the patched `destination`. See `AUDIO_PROBE`.
  await context.addInitScript(AUDIO_PROBE)
  const page = await context.newPage()
  const log = []
  page.on('pageerror', (e) => log.push({ kind: 'pageerror', text: e.message }))
  page.on('console', (m) => {
    // "Failed to load resource" is the console echo of a failed request, and
    // it carries no URL — so it cannot be told apart from a third-party
    // failure here. The requestfailed handler below does that properly, by
    // origin, which is why dropping these is safe rather than blind.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
      log.push({ kind: 'console.error', text: m.text() })
    }
  })
  // Every failed request is the game's problem now.
  //
  // This used to ignore anything not from the game's own origin, because the
  // analytics tag was the one third party on these pages and an offline or
  // proxied machine fails it on every run — so the suite had to look past it.
  // #102 removed the tag, so nothing external is requested at all and the
  // filter would only be hiding a genuine regression. Measured: a clean run
  // across all five games now reports zero failed requests of any origin.
  //
  // Without *some* handler here the suite noticed nothing at all: the console
  // echo above is dropped wholesale, so a 404 on a game asset passed silently.
  page.on('requestfailed', (req) => {
    // ERR_ABORTED is a cancellation, not a failure — a reload cancels
    // in-flight requests, and the Static suite reloads to seed its save.
    const why = req.failure()?.errorText ?? 'unknown'
    if (why.includes('ERR_ABORTED')) return
    log.push({ kind: 'requestfailed', text: `${req.url()} — ${why}` })
  })
  // A 404 on a game asset is *not* a requestfailed — that fires for network
  // failures, not error statuses, so a missing sprite or map used to sail
  // through both suites silently. Same-origin error statuses are always the
  // game's problem. Measured across all five games: a clean run produces none.
  page.on('response', (res) => {
    if (!res.url().startsWith(new URL(BASE_URL).origin)) return
    if (res.status() < 400) return
    log.push({ kind: 'badstatus', text: `${res.status()} ${res.url()}` })
  })

  const cdp = await context.newCDPSession(page)

  // The games only publish window.__game when asked (#98).
  const u = new URL(url)
  u.searchParams.set('qa', '1')
  await page.goto(u.toString(), { waitUntil: 'load' })

  // Multi-touch. A platformer needs a thumb parked on the d-pad while the
  // other hand taps A or B, so contacts are tracked here and the live set is
  // re-sent on every event.
  const live = new Map()
  const points = () => [...live.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }))

  const hand = {
    async down(id, x, y) {
      live.set(id, { x, y })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points() })
    },
    async move(id, x, y) {
      live.set(id, { x, y })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points() })
    },
    async up(id) {
      const p = live.get(id)
      if (!p) return
      live.delete(id)
      // touchEnd carries the contacts being *released*, not the ones that
      // remain. Sending the remainder lifts the wrong finger — which presents
      // exactly like the game dropping a held direction, and cost an
      // afternoon before it was spotted.
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [{ x: p.x, y: p.y, id }],
      })
    },
    /** Press, hold, release: the shape of a normal button press. */
    async tap(id, x, y, holdMs = 120) {
      await hand.down(id, x, y)
      await page.waitForTimeout(holdMs)
      await hand.up(id)
      await page.waitForTimeout(60)
    },
    /** Lift everything still down. */
    async release() {
      for (const id of [...live.keys()]) await hand.up(id)
    },
  }

  return { browser, context, page, cdp, hand, log }
}

/** Centre point of a selector, in client coordinates. */
export async function centreOf(page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no element matching ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

/**
 * A point on the canvas, from normalised 0..1 coordinates.
 *
 * The counterpart to `canvasSpace` in `grid.mjs` for games that are not
 * 160 pixels wide. A standalone 3D game (#118) sizes its canvas to whatever
 * the viewport gives it, so a suite cannot convert game-space to client-space
 * the way the GameBoy games can — but it can still say "a third of the way
 * across, near the bottom", which is what a gesture is actually described in.
 */
export async function canvasPoint(page, nx, ny, selector = 'canvas') {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`no element matching ${selector}`)
  return { x: box.x + box.width * nx, y: box.y + box.height * ny, box }
}

/**
 * The GameBoy shell's controls, with a helper for aiming at a d-pad arm.
 *
 * The five Phaser games and the two GameBoy-styled 3D ones share this markup,
 * so one lookup serves those suites. Standalone 3D games (#118) have none of
 * it — no pad, no A/B, no system buttons — and drive `canvasPoint` above
 * against their own gestures instead.
 */
export async function controls(page) {
  const pad = await centreOf(page, '.d-pad')
  const third = pad.box.width / 3
  return {
    pad,
    A: await centreOf(page, '.a-btn[data-key="KeyZ"]'),
    B: await centreOf(page, '.a-btn[data-key="KeyX"]'),
    arm: (dir) =>
      ({
        ArrowUp: { x: pad.x, y: pad.y - third },
        ArrowDown: { x: pad.x, y: pad.y + third },
        ArrowLeft: { x: pad.x - third, y: pad.y },
        ArrowRight: { x: pad.x + third, y: pad.y },
      })[dir],
  }
}

/** Touch ids, named so a two-handed sequence reads as one. */
export const PAD = 1
export const ACT = 2

/** Minimal pass/fail collector shared by the suites. */
export function checker() {
  const results = []
  return {
    check(name, ok, note) {
      results.push(!!ok)
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
    },
    /** Page and console errors count as failures, same as the static suite. */
    finish(log) {
      if (log?.length) {
        console.log(`  FAIL page reported errors — ${JSON.stringify(log)}`)
        results.push(false)
      }
      return results.every(Boolean)
    },
  }
}

/** Peak RMS the page has put out since `resetAudio`, and how many contexts exist. */
export async function audioPeak(page) {
  return page.evaluate(() => {
    if (!window.__audio) return { missing: true }
    return { peak: window.__audio.peak(), contexts: window.__audio.contexts() }
  })
}

/** Zeroes the peak hold, so the next reading covers only what follows it. */
export async function resetAudio(page) {
  await page.evaluate(() => window.__audio?.reset())
}

/**
 * The peak RMS above which the page is making a sound rather than not.
 *
 * Calibrated, not chosen. Peak RMS through `AUDIO_PROBE` while each game is
 * playing normally, against the same measurement with its sound turned off:
 *
 *   game            playing   muted
 *   anomaly-room     0.0162     0
 *   tube-runner      0.0286     0
 *   tower-stacker    0.0866     0
 *
 * 0.004 sits a factor of four below the quietest game that is audible and well
 * clear of the silence, which is exact in all three.
 */
export const AUDIBLE = 0.004

/**
 * How long to wait after the mute control before measuring silence.
 *
 * Not padding. Anomaly Room fades its master gain with
 * `setTargetAtTime(0, now, 0.05)`, which approaches zero exponentially and
 * never arrives, and its drone is continuous — so a check that zeroes the peak
 * hold the instant the button is clicked measures the *ramp* and reports a leak.
 * It read 2.9e-3 that way, most of the way to `AUDIBLE`, which would have
 * looked like a flaky threshold rather than a mismeasurement. At 300 ms — six
 * time constants — every game reads exactly 0.
 */
export const MUTE_SETTLE_MS = 300

/**
 * Checks a game's sound control by listening to it (#136).
 *
 * The three suites with a sound button each asserted that its *label* changed,
 * and nothing asserted a sound. That passes for a `playBlip` wired to nothing,
 * a context left suspended, a master gain stuck at 0, and — the sharp case — a
 * toggle that flips the label and not the gain, because a label changing is
 * exactly what a broken toggle also does.
 *
 * `play` is the game's own way of making a noise, supplied by the caller: the
 * driver has no idea which gesture is loud in which game, and guessing is how a
 * check ends up asserting silence against a game nobody asked to make a sound.
 *
 * Shared rather than copied into three suites because `MUTE_SETTLE_MS` is a
 * trap worth solving once.
 */
export async function checkSound({ page, check, selector, play }) {
  const text = () => page.evaluate((s) => document.querySelector(s)?.textContent, selector)
  const click = () => page.evaluate((s) => document.querySelector(s).click(), selector)
  const measure = async () => {
    await resetAudio(page)
    await play()
    return audioPeak(page)
  }

  const on = await text()
  const loud = await measure()
  check(
    'the game makes a sound at all',
    !loud.missing && loud.peak >= AUDIBLE,
    loud.missing
      ? 'window.__audio is absent — the probe did not install'
      : `peak ${loud.peak.toFixed(4)} over ${loud.contexts} context(s), floor ${AUDIBLE}`,
  )

  await click()
  const off = await text()
  check('the control reports it off', off !== on, `${on} -> ${off}`)
  await page.waitForTimeout(MUTE_SETTLE_MS)
  const quiet = await measure()
  check(
    'and nothing comes out of it',
    quiet.peak < AUDIBLE,
    `peak ${quiet.peak.toExponential(2)} against floor ${AUDIBLE}`,
  )

  await click()
  check('the control reports it back on', (await text()) === on, on)
  await page.waitForTimeout(MUTE_SETTLE_MS)
  const again = await measure()
  check(
    'and the sound comes back',
    again.peak >= AUDIBLE,
    `peak ${again.peak.toFixed(4)} — a mute that cannot be undone passes the label checks too`,
  )
}
