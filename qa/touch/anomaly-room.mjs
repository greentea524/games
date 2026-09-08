// Touch coverage for the Anomaly Room (#114), on the standalone stage (#118).
//
// The rules — that nothing is ever changed while it is on screen, and that
// every change is visible from where the player stands — are in
// `anomaly-room/anomaly_test.ts` under `npm run qa:units`, where they run
// headless in seconds against real frustum and raycast maths.
//
// What is left for here is the seam, and for this game the seam is unusually
// load-bearing: looking around is the entire verb, and a drag and a tap arrive
// through exactly the same events. The game separates them by distance and
// duration, so a suite that only ever sent clean gestures would never find the
// case that actually breaks — a slightly shaky tap that turns the room instead
// of flagging, or a short drag that flags something on the way past and spends
// a guess the player never meant to.
import { launchTouch, canvasPoint, gameUrl, checker, PAD } from './driver.mjs'

const { check, finish } = checker()

const state = (page) =>
  page.evaluate(() => ({
    round: window.__game.round(),
    misses: window.__game.misses(),
    phase: window.__game.phase(),
    look: window.__game.look(),
    armed: window.__game.armed(),
    anomaly: window.__game.anomaly(),
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

/** Waits until the round has actually armed, which needs a frame or two. */
async function waitArmed(page, limitMs = 8000) {
  const deadline = Date.now() + limitMs
  while (Date.now() < deadline) {
    const s = await state(page)
    if (s.armed) return s
  }
  return state(page)
}

/**
 * Where the changed object is on screen, as normalised canvas coordinates, or
 * null if it is not in view.
 *
 * Found by sweeping the game's own `probe`, which resolves a screen point
 * exactly the way `flag` does. Working the position out here with a second
 * copy of the projection would check this suite's arithmetic rather than the
 * game's, and would happily pass while tapping flagged something else.
 */
const anomalyAt = (page) =>
  page.evaluate(() => {
    const g = window.__game
    const wanted = g.anomaly()?.id
    if (!wanted) return null
    for (let ny = 0.1; ny <= 0.92; ny += 0.02) {
      for (let nx = 0.05; nx <= 0.96; nx += 0.02) {
        if (g.probe(nx, ny) === wanted) return { nx, ny }
      }
    }
    return null
  })

/** Turns the head to an absolute yaw and pitch through the game's own API. */
async function lookAt(page, yaw, pitch) {
  await page.evaluate(([y, p]) => {
    const g = window.__game
    const c = g.look()
    g.turn(-(y - c.yaw), -(p - c.pitch))
  }, [yaw, pitch])
}

/** Sweeps the room until the changed object is on screen, and returns where. */
async function findAnomaly(page) {
  for (let i = 0; i < 24; i++) {
    await lookAt(page, (i / 24) * Math.PI * 2, i % 2 === 0 ? -0.15 : 0.15)
    const at = await anomalyAt(page)
    if (at) return at
  }
  return null
}

async function run() {
  console.log('\n### anomaly-room ###\n')
  const t = await launchTouch(gameUrl('anomaly-room'))
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
  check('the game opens on the first round', opening.round === 0, `round ${opening.round + 1}`)
  check('with every guess intact', opening.misses === 0 && opening.phase === 'looking')

  const armed = await waitArmed(page)
  check('and something changes without being asked', armed.armed, armed.anomaly?.label ?? 'nothing')

  // ------------------------------------------------------ drag to look

  await lookAt(page, 0, 0)
  const centre = await canvasPoint(page, 0.5, 0.5, '#stage canvas')
  const before = await state(page)
  await hand.down(PAD, centre.x, centre.y)
  await hand.move(PAD, centre.x - 60, centre.y)
  await hand.move(PAD, centre.x - 140, centre.y)
  const dragged = await state(page)
  await hand.up(PAD)
  check(
    'dragging left turns the head right',
    dragged.look.yaw < before.look.yaw - 0.3,
    `yaw ${before.look.yaw.toFixed(2)} -> ${dragged.look.yaw.toFixed(2)}`,
  )

  const beforePitch = (await state(page)).look.pitch
  await hand.down(PAD, centre.x, centre.y)
  await hand.move(PAD, centre.x, centre.y + 70)
  await hand.move(PAD, centre.x, centre.y + 150)
  const pitched = await state(page)
  await hand.up(PAD)
  check(
    'and dragging down looks up',
    pitched.look.pitch > beforePitch + 0.3,
    `pitch ${beforePitch.toFixed(2)} -> ${pitched.look.pitch.toFixed(2)}`,
  )

  // The clamp #114 asks for. Without it a long drag rolls the view past
  // vertical and the room turns upside down, which no amount of dragging
  // recovers from.
  for (let i = 0; i < 6; i++) {
    await hand.down(PAD, centre.x, centre.y - 200)
    await hand.move(PAD, centre.x, centre.y + 200)
    await hand.up(PAD)
  }
  const pinned = await state(page)
  check(
    'pitch stops short of straight up however far you drag',
    Math.abs(pinned.look.pitch) <= (80 * Math.PI) / 180 + 1e-6,
    `${((pinned.look.pitch * 180) / Math.PI).toFixed(1)} degrees`,
  )
  check(
    'and the horizon never rolls',
    Math.abs(pinned.look.roll) < 1e-6,
    'yaw before pitch, so looking around cannot tip the room',
  )

  // --------------------------------------------- a drag is not a tap

  const steady = await state(page)
  check(
    'turning the room around costs no guesses',
    steady.misses === 0 && steady.round === 0,
    `${steady.misses} miss(es) after six full drags`,
  )

  // ------------------------------------------------ tapping a wall is free

  await lookAt(page, 0, 0.5)
  const ceiling = await canvasPoint(page, 0.5, 0.2, '#stage canvas')
  const beforeWall = await state(page)
  await hand.tap(PAD, ceiling.x, ceiling.y)
  await page.waitForTimeout(250)
  const afterWall = await state(page)
  check(
    'tapping the room itself is neither right nor wrong',
    afterWall.misses === beforeWall.misses && afterWall.phase === 'looking',
    'a missed tap should not cost a life',
  )

  // ------------------------------------------------------- flagging

  await waitArmed(page)
  // Somewhere on screen that is a real object but not the changed one. `probe`
  // already returns null for the room's own shell, so anything it names is a
  // thing the player could legitimately flag.
  const wrongTarget = await page.evaluate(() => {
    const g = window.__game
    const wanted = g.anomaly()?.id
    for (let ny = 0.15; ny <= 0.9; ny += 0.02) {
      for (let nx = 0.05; nx <= 0.96; nx += 0.02) {
        const id = g.probe(nx, ny)
        if (id && id !== wanted) return { nx, ny, id }
      }
    }
    return null
  })
  if (wrongTarget) {
    const spot = await canvasPoint(page, wrongTarget.nx, wrongTarget.ny, '#stage canvas')
    const beforeMiss = await state(page)
    await hand.tap(PAD, spot.x, spot.y)
    await page.waitForTimeout(250)
    const afterMiss = await state(page)
    check(
      'flagging the wrong object costs a guess',
      afterMiss.misses === beforeMiss.misses + 1 && afterMiss.phase === 'wrong',
      `flagged ${wrongTarget.id}, ${afterMiss.misses} miss(es)`,
    )
    check(
      'and the round is unchanged, not replaced',
      afterMiss.anomaly?.label === beforeMiss.anomaly?.label && afterMiss.round === beforeMiss.round,
      'a miss costs a guess, not the round',
    )
    await page.evaluate(() => window.__game.next())
    await page.waitForTimeout(200)
  } else {
    check('a wrong object is reachable to flag', false, 'nothing else was on screen')
  }

  const at = await findAnomaly(page)
  check('the changed object can be found by looking around', at !== null)
  if (at) {
    const spot = await canvasPoint(page, at.nx, at.ny, '#stage canvas')
    const beforeHit = await state(page)
    await hand.tap(PAD, spot.x, spot.y)
    await page.waitForTimeout(250)
    const afterHit = await state(page)
    check(
      'tapping it scores the round',
      afterHit.round === beforeHit.round + 1 && afterHit.phase === 'right',
      `round ${beforeHit.round + 1} -> ${afterHit.round + 1}`,
    )
    check(
      'and the panel names what it was',
      await page.evaluate(() => document.querySelector('.ar-panel-body')?.textContent?.length > 0),
    )
  }

  // ---------------------------------------------------------- the sound

  const soundLabel = () => page.evaluate(() => document.querySelector('.ar-sound')?.textContent)
  check(
    'mouse look is not offered on a touch device',
    await page.evaluate(() => document.querySelector('.ar-look')?.hidden === true),
    'nothing to lock on a phone',
  )
  const onLabel = await soundLabel()
  await page.evaluate(() => document.querySelector('.ar-sound').click())
  const offLabel = await soundLabel()
  check('the sound can be turned off', onLabel !== offLabel, `${onLabel} -> ${offLabel}`)
  await page.evaluate(() => document.querySelector('.ar-sound').click())
  check('and back on', (await soundLabel()) === onLabel, onLabel)

  // ------------------------------------------------------------- the save

  await page.evaluate(async () => {
    const { recordRun } = await import('/games/anomaly-room/save.ts')
    recordRun(5, false)
  })
  check(
    'a finished run is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('anomaly_room_save'))
        return raw && raw.v === 1 && raw.d?.best === 5 && raw.d?.cleared === 0
      } catch {
        return false
      }
    }),
  )

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
