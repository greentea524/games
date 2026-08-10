// The double-tap zoom guard (shared/noZoom.ts).
//
// The zoom itself cannot be reproduced here: Chromium honours
// `user-scalable=no`, so it never zooms in the first place, and it is iOS
// Safari — which ignores that meta — where players hit this. What *is*
// testable, and is the whole mechanism, is that the second `touchend` of a
// double tap gets cancelled, in every game.
//
// The other half matters just as much. Cancelling `touchend` suppresses the
// synthesised mouse events, and a control wired to `click` rather than to
// touchstart/pointerdown would go dead under a fast thumb. So this also
// asserts a rapid double tap still registers as two button presses.
import { launchTouch, centreOf, controls, gameUrl, checker, ACT } from './driver.mjs'

const { check, finish } = checker()
let ok = true

const GAMES = ['static', 'windup', 'lantern-keeper', 'pocket-dungeon', 'cart-crate']

for (const name of GAMES) {
  console.log(`\n### ${name} ###\n`)
  const t = await launchTouch(gameUrl(name))
  const { page, hand } = t
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2000)
  const c = await controls(page)

  // Watch the events at the document, after the guard's own listeners have
  // run, so `defaultPrevented` reflects what it did.
  await page.evaluate(() => {
    window.__z = { touchend: [], keydown: 0 }
    document.addEventListener('touchend', (e) => window.__z.touchend.push(e.defaultPrevented))
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyZ') window.__z.keydown++
    })
  })

  // Two taps inside the 300ms double-tap window, in the dead space just below
  // the d-pad — where the report came from, and where no element has a
  // handler of its own.
  const gap = { x: c.pad.x, y: c.pad.y + c.pad.box.height / 2 + 6 }
  await hand.tap(ACT, gap.x, gap.y, 40)
  await hand.tap(ACT, gap.x, gap.y, 40)
  await page.waitForTimeout(200)

  const z = await page.evaluate(() => window.__z)
  check(
    'the second tap of a double tap is cancelled',
    z.touchend.length >= 2 && z.touchend[1] === true,
    `touchend defaultPrevented: [${z.touchend.join(', ')}]`,
  )
  check(
    'the first tap is left alone',
    z.touchend[0] === false,
    'cancelling an isolated tap would break single presses',
  )

  // And the guard must not cost a fast player their inputs.
  await page.evaluate(() => (window.__z.keydown = 0))
  await hand.tap(ACT, c.A.x, c.A.y, 40)
  await hand.tap(ACT, c.A.x, c.A.y, 40)
  await page.waitForTimeout(200)
  const presses = await page.evaluate(() => window.__z.keydown)
  check('a rapid double tap still registers two button presses', presses === 2, `${presses} keydowns`)

  ok = finish(t.log) && ok
  await t.browser.close()
}

process.exit(ok ? 0 : 1)
