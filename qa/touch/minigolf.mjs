// Touch coverage for Minigolf (#113), on the standalone 3D stage (#118).
//
// The course itself — whether each hole can be finished, whether a rail is
// tall enough for the green it edges, whether the at-rest detector can tell
// slow from stopped — is checked headless in `minigolf/course_test.ts` and
// `minigolf/rest_test.ts`, where a full round costs milliseconds instead of
// half a minute of wall clock.
//
// What is left for this file is the part those cannot see: that a slingshot
// drag on a real canvas becomes the stroke the player meant. That control is
// the reason #113's original design was rewritten — it specified a charging
// meter on a d-pad, which went with the GameBoy shell — so it is the thing
// most worth driving with an actual finger.
import { launchTouch, canvasPoint, centreOf, gameUrl, checker, PAD } from './driver.mjs'

const { check, finish } = checker()

const state = (page) =>
  page.evaluate(() => ({
    hole: window.__game.hole(),
    name: window.__game.holeName(),
    par: window.__game.par(),
    strokes: window.__game.strokes(),
    phase: window.__game.phase(),
    canPutt: window.__game.canPutt(),
    aim: window.__game.aim(),
    ball: window.__game.ball(),
    speed: window.__game.ballSpeed(),
    card: window.__game.card(),
  }))

const canvasMetrics = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('#stage canvas')
    return {
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
      bufferWidth: c.width,
      dpr: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })

/** The drag distance the game reads as full power, in CSS pixels. */
const powerRadius = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('#stage canvas')
    return Math.max(50, Math.min(c.clientWidth, c.clientHeight) * 0.28)
  })

/** Waits for the ball to be struck and come to rest again. */
async function settle(page, limitMs = 20_000) {
  const deadline = Date.now() + limitMs
  while (Date.now() < deadline) {
    const s = await state(page)
    if (s.phase !== 'rolling' && s.canPutt) return s
    if (s.phase === 'holed' || s.phase === 'card') return s
  }
  return state(page)
}

/**
 * Plays one stroke as a thumb does: press on the ball, pull back, release.
 *
 * `dx`/`dz` point the way the ball should *go*; the drag is the opposite, which
 * is the whole slingshot idea and the thing worth driving through real events
 * rather than through `setAim`.
 */
async function putt(page, hand, dx, dz, power) {
  const radius = await powerRadius(page)
  const start = await canvasPoint(page, 0.5, 0.62, '#stage canvas')
  await hand.down(PAD, start.x, start.y)
  // A first small move, so the drag is a drag and not a tap.
  await hand.move(PAD, start.x - dx * radius * 0.2, start.y - dz * radius * 0.2)
  await hand.move(PAD, start.x - dx * radius * power, start.y - dz * radius * power)
  await hand.settle()
  const held = await state(page)
  await hand.up(PAD)
  return held
}

async function run() {
  console.log('\n### minigolf ###\n')
  const t = await launchTouch(gameUrl('minigolf'))
  const { page, hand } = t
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)

  // ------------------------------------------------- the stage's contract

  const m = await canvasMetrics(page)
  check(
    'the canvas fills the viewport rather than a fixed box',
    m.cssWidth === m.viewport.width && m.cssHeight === m.viewport.height,
    `canvas ${m.cssWidth}x${m.cssHeight}, viewport ${m.viewport.width}x${m.viewport.height}`,
  )
  check(
    'and its drawing buffer is scaled by the device pixel ratio, capped at 2',
    m.bufferWidth === Math.round(m.cssWidth * Math.min(m.dpr, 2)),
    `buffer ${m.bufferWidth} at dpr ${m.dpr}`,
  )

  // ------------------------------------------------------- the game opens

  const opening = await state(page)
  check('the game opens on the first hole', opening.hole === 0, opening.name)
  check('with no strokes taken', opening.strokes === 0 && opening.phase === 'aiming')
  check('and the ball is ready to be struck', opening.canPutt)

  // ------------------------------------------------------------ how to play
  //
  // A button opens the instructions over the course. While they are open a
  // drag on them is not a putt, and Space does not charge behind them.

  const helpShown = () => page.evaluate(() => {
    const h = document.querySelector('.mg-help')
    return { open: !!h && !h.hidden && getComputedStyle(h).display !== 'none', headings: [...document.querySelectorAll('.mg-help-heading')].map((n) => n.textContent) }
  })
  const helpBtn = await centreOf(page, '.mg-help-btn')
  await hand.tap(PAD, helpBtn.x, helpBtn.y)
  await hand.settle()
  const opened = await helpShown()
  check(
    'the How to play button opens the instructions, touch and keyboard both',
    opened.open && opened.headings.some((h) => /touch/i.test(h)) && opened.headings.some((h) => /keyboard/i.test(h)),
    opened.headings.join(' / '),
  )
  // On the card itself: a press on the dimmed course round it closes them.
  const under = await centreOf(page, '.mg-help-card')
  await hand.down(PAD, under.x, under.y)
  await hand.move(PAD, under.x, under.y + 120)
  await hand.settle()
  await hand.up(PAD)
  await hand.settle()
  const dragged = await state(page)
  check('and a drag on them is not a putt', dragged.strokes === 0 && dragged.aim.power === 0 && (await helpShown()).open,
    `strokes ${dragged.strokes}, power ${dragged.aim.power.toFixed(2)}`)
  const close = await centreOf(page, '.mg-help-close')
  await hand.tap(PAD, close.x, close.y)
  await hand.settle()
  check('and Got it closes them', !(await helpShown()).open)

  // From the keyboard: H opens them with Got it focused, so Space closes them
  // rather than charging a putt behind them; and the next Space is a putt,
  // not a press of a button that kept the focus.
  const spaceFor = async (ms) => {
    await page.keyboard.down('Space')
    await page.waitForTimeout(ms)
    await page.keyboard.up('Space')
    await hand.settle()
  }
  await page.keyboard.press('KeyH')
  await hand.settle()
  const byKey = (await helpShown()).open
  await spaceFor(400)
  const shut = await state(page)
  check('H opens them, and Space then closes them without a putt',
    byKey && !(await helpShown()).open && shut.strokes === 0 && shut.aim.power === 0, `strokes ${shut.strokes}`)
  await spaceFor(400)
  await settle(page)
  const after = await state(page)
  check('and the next Space putts, and does not open them again',
    after.strokes === 1 && !(await helpShown()).open, `strokes ${after.strokes}`)
  await page.evaluate(() => window.__game.goTo(0))
  await hand.settle()

  // ------------------------------------------------------------ the keyboard
  //
  // #184. The arrows turned an aim nobody could see until Space was held,
  // and the angle they turned was kept apart from the game's aim, so it
  // survived into the next hole. Read from what is drawn: the preview is a
  // pale cream nothing else on the course is.

  const cream = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const { data } = window.__game.stage.readPixels()
              let n = 0
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 235 && data[i + 1] > 225 && data[i + 2] > 180 && data[i + 2] < 225) n++
              }
              resolve(n)
            }),
          ),
        ),
    )
  const angle = (a) => Math.atan2(a.x, a.z)
  /** The turn from one aim to another, wrapped to -π..π. */
  const turnFrom = (a, b) => Math.atan2(Math.sin(angle(b) - angle(a)), Math.cos(angle(b) - angle(a)))
  const press = async (key, ms = 40) => {
    await page.keyboard.down(key)
    await page.waitForTimeout(ms)
    await page.keyboard.up(key)
    await hand.settle()
  }

  const still = await cream()
  const atRest = await state(page)
  await press('ArrowLeft', 300)
  const turned = await state(page)
  const shown = await cream()
  check(
    'an arrow key turns the aim and shows it before Space is held',
    turned.aim.preview && turnFrom(atRest.aim, turned.aim) > 0.2 && shown > still + 20,
    `turned ${turnFrom(atRest.aim, turned.aim).toFixed(2)} rad, ${still} -> ${shown} preview pixels`,
  )
  await press('Space', 20)
  const tapped = await state(page)
  check(
    'and a Space too short to charge is no stroke, and leaves the direction shown',
    tapped.strokes === 0 && tapped.canPutt && tapped.aim.preview && (await cream()) > still + 20,
    `strokes ${tapped.strokes}`,
  )

  await page.evaluate(() => window.__game.goTo(1))
  await hand.settle()
  const next = await state(page)
  await press('ArrowRight')
  const nudged = await state(page)
  const step = turnFrom(next.aim, nudged.aim)
  check(
    'a new hole starts its aim afresh, at the cup, and the arrows turn from there',
    // One short press turns a little to the right of the new hole's aim. How
    // far depends on how many frames the press spans, which on a slow renderer
    // is more than one (#182's lesson); the stale angle jumped by the whole
    // turn made on the last hole.
    !next.aim.preview && Math.abs(turnFrom(turned.aim, next.aim)) > 0.1 && step < -0.01 && step > -0.25,
    `hole 2 aim ${angle(next.aim).toFixed(2)}, one tap moved it ${step.toFixed(3)}`,
  )
  await page.evaluate(() => window.__game.goTo(0))
  await settle(page)

  // ------------------------------------------------------------ the drag

  const radius = await powerRadius(page)
  const origin = await canvasPoint(page, 0.5, 0.62, '#stage canvas')
  await hand.down(PAD, origin.x, origin.y)
  await hand.move(PAD, origin.x, origin.y + radius * 0.5)
  await hand.settle()
  const pulledBack = await state(page)
  check(
    'pulling back toward the player aims up the hole',
    pulledBack.aim.z < -0.6,
    `aim ${pulledBack.aim.x.toFixed(2)}, ${pulledBack.aim.z.toFixed(2)}`,
  )
  check(
    'and half the power radius is about half power',
    Math.abs(pulledBack.aim.power - 0.5) < 0.12,
    `power ${pulledBack.aim.power.toFixed(2)}`,
  )

  await hand.move(PAD, origin.x, origin.y + radius * 0.9)
  await hand.settle()
  const pulledFar = await state(page)
  check(
    'pulling further increases the power',
    pulledFar.aim.power > pulledBack.aim.power + 0.25,
    `${pulledBack.aim.power.toFixed(2)} -> ${pulledFar.aim.power.toFixed(2)}`,
  )

  // Sideways, to prove the aim is a direction and not just a magnitude.
  await hand.move(PAD, origin.x - radius * 0.6, origin.y)
  await hand.settle()
  const pulledLeft = await state(page)
  check(
    'pulling left aims right',
    pulledLeft.aim.x > 0.8,
    `aim.x ${pulledLeft.aim.x.toFixed(2)}`,
  )
  // Released back at the origin, so exploring the aim does not cost a stroke.
  // Letting the pull go from where it was struck the ball sideways, banked it
  // into the cup, and advanced the hole underneath the next check — which then
  // compared stroke counts across two different holes.
  await hand.move(PAD, origin.x, origin.y)
  await hand.up(PAD)
  await page.waitForTimeout(400)

  // ------------------------------------------------ a tap does not putt
  //
  // #113 asks for this explicitly, and it is worth a check of its own: a
  // mis-started drag that gets played costs a stroke the player never took.

  const beforeTap = await state(page)
  check(
    'releasing a pull back at the ball plays no stroke either',
    beforeTap.strokes === 0 && beforeTap.hole === 0,
    `hole ${beforeTap.hole + 1}, ${beforeTap.strokes} stroke(s)`,
  )
  const tap = await canvasPoint(page, 0.5, 0.62, '#stage canvas')
  await hand.down(PAD, tap.x, tap.y)
  await hand.move(PAD, tap.x + 2, tap.y + 2)
  await hand.up(PAD)
  await page.waitForTimeout(400)
  const afterTap = await state(page)
  check(
    'a tap with no pull is a cancel, not a stroke',
    afterTap.strokes === beforeTap.strokes && afterTap.phase === 'aiming',
    `${beforeTap.strokes} -> ${afterTap.strokes} strokes`,
  )

  // ---------------------------------------------------- a stroke is played

  await page.evaluate(() => window.__game.goTo(0))
  await page.waitForTimeout(500)
  const teed = await state(page)
  const held = await putt(page, hand, 0, -1, 0.85)
  check('the pull is held at power before release', held.aim.power > 0.6, `${held.aim.power.toFixed(2)}`)
  // Sampled while the ball is moving, not after. The first version checked the
  // speed once the stroke ended, which passes for the wrong reason on a stroke
  // that ends in the cup: the ball is holed at speed, and reads as a ball that
  // was never allowed to stop.
  let struckWhileRolling = false
  let sawItRolling = false
  for (let i = 0; i < 120; i++) {
    const s = await state(page)
    if (s.speed > 1) {
      sawItRolling = true
      if (s.canPutt) struckWhileRolling = true
    }
    if (s.phase !== 'rolling') break
  }
  const rolled = await settle(page)
  check(
    'releasing strikes the ball',
    rolled.strokes === teed.strokes + 1,
    `${rolled.strokes} stroke(s)`,
  )
  check(
    'and it travels up the hole',
    rolled.ball.z < teed.ball.z - 3,
    `z ${teed.ball.z.toFixed(2)} -> ${rolled.ball.z.toFixed(2)}`,
  )
  check(
    'no second stroke is allowed while the ball is still moving',
    sawItRolling && !struckWhileRolling,
    sawItRolling ? 'canPutt stayed false for the whole roll' : 'never saw the ball moving',
  )

  // ------------------------------------------------------ the climb on Rise
  //
  // The reason this hole exists, and the one that was unplayable in review: a
  // ramp to a raised green. Getting the ball onto the upper level is the whole
  // hole, and no amount of aiming does it if the geometry is wrong.
  //
  // Found by name: #141 put holes in front of it, and this used to be goTo(2).

  const riseAt = await page.evaluate(async () => {
    const { HOLES } = await import('/games/minigolf/holes.ts')
    return HOLES.findIndex((h) => h.name === 'Rise')
  })
  await page.evaluate((i) => window.__game.goTo(i), riseAt)
  await page.waitForTimeout(600)
  const atTee = await state(page)
  check('Rise is on the course, and it is the climb', riseAt >= 0 && atTee.name === 'Rise', atTee.name)
  check('and the ball starts on the lower green', atTee.ball.y < 0.3, `y ${atTee.ball.y.toFixed(2)}`)

  let climbed = null
  for (let attempt = 0; attempt < 3 && !climbed; attempt++) {
    await putt(page, hand, 0, -1, 1)
    const after = await settle(page)
    if (after.ball.y > 0.8) climbed = after
    if (after.phase === 'holed' || after.phase === 'card') {
      climbed = after
      break
    }
  }
  check(
    'a full-power putt carries the ball up the ramp to the raised green',
    climbed !== null,
    climbed ? `y ${climbed.ball.y.toFixed(2)}` : 'never left the lower green',
  )

  // --------------------------------------------------------- the scorecard

  const holes = await page.evaluate(async () => {
    const { HOLES } = await import('/games/minigolf/holes.ts')
    return HOLES.length
  })
  await page.evaluate((n) => {
    window.__game.restartCourse()
    for (let i = 0; i < n; i++) window.__game.nextHole()
  }, holes)
  await page.waitForTimeout(400)
  const finished = await state(page)
  check(
    'playing past the last hole ends the round',
    finished.phase === 'card',
    `phase ${finished.phase}`,
  )
  check(
    'and the scorecard has a row per hole',
    (await page.evaluate(() => document.querySelectorAll('.mg-card-row').length)) === holes,
    `${holes} holes`,
  )

  // -------------------------------------------------------------- the save

  await page.evaluate(async () => {
    const { recordRound } = await import('/games/minigolf/save.ts')
    recordRound(7)
  })
  check(
    'a finished round is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('minigolf_save'))
        return raw && raw.v === 1 && raw.d?.best === 7 && raw.d?.rounds >= 1
      } catch {
        return false
      }
    }),
  )

  // A best from the three-hole course (#141). Par there was 8, so a stored 5
  // is a score no nine-hole round can touch; kept, it would stand for ever,
  // in the game and on the hub's badge. The save is written exactly as the
  // old game wrote it — no course key — and read back through both readers.
  const stale = await page.evaluate(async () => {
    localStorage.setItem('minigolf_save', JSON.stringify({ v: 1, d: { best: 5, rounds: 4 } }))
    const { loadGolfSave, recordRound } = await import('/games/minigolf/save.ts')
    const { readStatuses } = await import('/games/shared/completion.ts')
    const before = { save: loadGolfSave(), hub: readStatuses().minigolf.progress }
    recordRound(29)
    const after = { save: loadGolfSave(), hub: readStatuses().minigolf.progress }
    return { before, after }
  })
  check(
    'a best from the old three-hole course is not a best on this one',
    stale.before.save.best === 0 && stale.before.hub === null,
    `game best ${stale.before.save.best}, hub badge ${JSON.stringify(stale.before.hub)}`,
  )
  check(
    'but the rounds played on it still count',
    stale.before.save.rounds === 4,
    `${stale.before.save.rounds} rounds`,
  )
  check(
    'and the next round on this course is the best',
    stale.after.save.best === 29 && stale.after.hub === 'Best 29',
    `game best ${stale.after.save.best}, hub badge ${JSON.stringify(stale.after.hub)}`,
  )

  // ------------------------------------------------------- back to the hub

  check(
    'there is a way back to the hub',
    await page.evaluate(() => {
      const a = document.querySelector('.stage3d-back')
      return Boolean(a && a.getAttribute('href'))
    }),
  )

  const passed = finish(t.log)
  await t.browser.close()
  return passed
}

process.exit((await run()) ? 0 : 1)
