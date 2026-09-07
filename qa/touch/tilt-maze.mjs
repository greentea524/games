// Touch coverage for the first standalone 3D game (#112), and the first
// exercise of the stage it runs on (#118).
//
// Everything else in this directory drives the GameBoy shell: a 160x144 canvas
// at an integer zoom, a `.d-pad`, `.a-btn` elements, system buttons. This game
// has none of that. Its canvas is whatever size the viewport gives it and its
// only control is the canvas itself, so the suite works in normalised
// coordinates through `canvasPoint` rather than game-space through
// `canvasSpace`.
//
// The rules — the tunnelling defence, the level geometry, whether each board
// can be finished at all — are in `tilt-maze/tilt_test.ts` under
// `npm run qa:units`, where they run headless in milliseconds. This file
// covers the seam: that the stage sizes itself and keeps up, that a drag
// leans the board, and that a level can be won with a thumb.
import { launchTouch, canvasPoint, gameUrl, checker, PAD } from './driver.mjs'

const { check, finish } = checker()
let ok = true

const state = (page) =>
  page.evaluate(() => ({
    level: window.__game.level(),
    name: window.__game.levelName(),
    phase: window.__game.phase(),
    tilt: window.__game.tilt(),
    ball: window.__game.ball(),
    velocity: window.__game.velocity(),
    drops: window.__game.drops(),
  }))

const canvasMetrics = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('#stage canvas')
    return {
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
      bufferWidth: c.width,
      bufferHeight: c.height,
      dpr: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })

/** Where the goal of the current level sits, in board coordinates. */
const goalOf = (page) =>
  page.evaluate(async () => {
    const { LEVELS } = await import('/games/tilt-maze/levels.ts')
    const grid = LEVELS[window.__game.level()].grid
    for (let row = 0; row < grid.length; row++) {
      const col = grid[row].indexOf('G')
      if (col >= 0) {
        return { x: col - (grid[0].length - 1) / 2, z: row - (grid.length - 1) / 2 }
      }
    }
    return null
  })

/**
 * Holds a drag that encodes a lean.
 *
 * The game maps a drag vector to a tilt, scaled by a radius derived from the
 * viewport — so moving the held contact *is* steering, and this drives the
 * game the way a thumb does rather than reaching past the input layer to
 * `steer()`.
 */
async function dragTo(page, hand, origin, sx, sz) {
  const radius = await page.evaluate(() => {
    const c = document.querySelector('#stage canvas')
    return Math.max(40, Math.min(c.clientWidth, c.clientHeight) * 0.22)
  })
  await hand.move(PAD, origin.x + sx * radius, origin.y + sz * radius)
}

async function run() {
  console.log('\n### tilt-maze ###\n')
  const t = await launchTouch(gameUrl('tilt-maze'))
  const { page, hand } = t
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1500)

  // ------------------------------------------------- the stage's contract

  const m = await canvasMetrics(page)
  check(
    'the canvas fills the viewport rather than a fixed box',
    m.cssWidth === m.viewport.width && m.cssHeight === m.viewport.height,
    `canvas ${m.cssWidth}x${m.cssHeight}, viewport ${m.viewport.width}x${m.viewport.height}`,
  )
  check(
    'and its drawing buffer is scaled by the device pixel ratio',
    m.bufferWidth === Math.round(m.cssWidth * Math.min(m.dpr, 2)),
    `buffer ${m.bufferWidth}x${m.bufferHeight} at dpr ${m.dpr}`,
  )
  // The ceiling exists because a phone at DPR 3 asks for nine times the
  // fragments for a difference nobody sees on a moving scene.
  check(
    'with the ratio capped at 2',
    m.bufferWidth <= m.cssWidth * 2,
    `${(m.bufferWidth / m.cssWidth).toFixed(2)}x`,
  )

  // The claim nothing else in this repo tests. The stage watches its parent
  // with a ResizeObserver rather than listening for a window `resize`, because
  // the parent can change size without the window doing so.
  await page.setViewportSize({ width: 500, height: 700 })
  await page.waitForTimeout(400)
  const resized = await canvasMetrics(page)
  check(
    'the canvas follows a resize',
    resized.cssWidth === 500 && resized.cssHeight === 700,
    `${resized.cssWidth}x${resized.cssHeight} after resizing to 500x700`,
  )
  check(
    'and its drawing buffer is rebuilt to match',
    resized.bufferWidth === Math.round(500 * Math.min(resized.dpr, 2)),
    `buffer ${resized.bufferWidth}x${resized.bufferHeight}`,
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)

  // ------------------------------------------------------- the game opens

  const opening = await state(page)
  check('the game opens on the first level', opening.level === 0, `${opening.name}`)
  check('and it is playable', opening.phase === 'playing')
  check(
    'the board starts level',
    Math.abs(opening.tilt.x) < 0.02 && Math.abs(opening.tilt.z) < 0.02,
    `tilt ${opening.tilt.x.toFixed(3)}, ${opening.tilt.z.toFixed(3)}`,
  )

  // ------------------------------------------------------------ the drag

  const centre = await canvasPoint(page, 0.5, 0.5, '#stage canvas')
  await hand.down(PAD, centre.x, centre.y)
  await dragTo(page, hand, centre, 1, 0)
  await page.waitForTimeout(500)
  const leaned = await state(page)
  check(
    'dragging right leans the board right',
    leaned.tilt.x > 0.1,
    `tilt.x ${leaned.tilt.x.toFixed(3)}`,
  )
  check(
    'and the marble rolls that way',
    leaned.ball.x > opening.ball.x,
    `x ${opening.ball.x.toFixed(2)} -> ${leaned.ball.x.toFixed(2)}`,
  )

  await dragTo(page, hand, centre, 0, 1)
  await page.waitForTimeout(500)
  const leanedZ = await state(page)
  check(
    'dragging down leans the board toward the viewer',
    leanedZ.tilt.z > 0.1,
    `tilt.z ${leanedZ.tilt.z.toFixed(3)}`,
  )

  await hand.up(PAD)
  await page.waitForTimeout(700)
  const released = await state(page)
  check(
    'releasing returns the board to level',
    Math.abs(released.tilt.x) < 0.06 && Math.abs(released.tilt.z) < 0.06,
    `tilt ${released.tilt.x.toFixed(3)}, ${released.tilt.z.toFixed(3)}`,
  )

  // ----------------------------------------------------- winning a level

  // Driven entirely through a held drag. The controller damps by velocity as
  // well as pulling toward the goal — steering only by position can only ever
  // be full lean one way or the other, and rolls the marble wall to wall for
  // ever without ever coming to rest on the goal.
  await page.evaluate(() => window.__game.restart())
  await page.waitForTimeout(300)
  const goal = await goalOf(page)
  check('the level has a goal to reach', goal !== null)

  await hand.down(PAD, centre.x, centre.y)
  const deadline = Date.now() + 25_000
  let won = false
  while (Date.now() < deadline) {
    const s = await state(page)
    if (s.phase !== 'playing') {
      won = true
      break
    }
    const clamp = (n) => Math.max(-1, Math.min(1, n))
    await dragTo(
      page,
      hand,
      centre,
      clamp((goal.x - s.ball.x) * 0.55 - s.velocity.x * 0.45),
      clamp((goal.z - s.ball.z) * 0.55 - s.velocity.z * 0.45),
    )
  }
  await hand.up(PAD)
  const after = await state(page)
  check(
    'a level can be won with a thumb on the board',
    won && after.phase !== 'playing',
    `phase=${after.phase} after ${after.drops} drop(s)`,
  )

  // ------------------------------------------- the hole, and the restart

  // Level 2 puts a hole directly on the line between start and goal, so
  // steering straight at it is the way to fall in — which is what makes it a
  // level rather than a corridor.
  await page.evaluate(() => window.__game.goTo(1))
  await page.waitForTimeout(300)
  const holeGoal = await goalOf(page)
  await hand.down(PAD, centre.x, centre.y)
  await dragTo(page, hand, centre, holeGoal.x > 0 ? 1 : -1, 0)
  const dropDeadline = Date.now() + 12_000
  let dropped = false
  while (Date.now() < dropDeadline && !dropped) {
    dropped = (await state(page)).drops > 0
  }
  await hand.up(PAD)
  const fell = await state(page)
  check('driving straight into a hole drops the marble', dropped, `${fell.drops} drop(s)`)
  check(
    'and it is put back rather than the run ending',
    fell.phase === 'playing',
    'a hole costs position, not the level',
  )

  await page.waitForTimeout(600)
  await page.evaluate(() => document.querySelector('.tm-btn').click())
  await page.waitForTimeout(400)
  const restarted = await state(page)
  check('the restart button resets the level', restarted.drops === 0 && restarted.phase === 'playing')

  // ------------------------------------------------------------ the save

  await page.evaluate(() => window.__game.goTo(2))
  await page.waitForTimeout(200)
  // The HUD records progress when a level is advanced through, so write it the
  // way the game does rather than reaching into storage.
  await page.evaluate(async () => {
    const { recordProgress } = await import('/games/tilt-maze/save.ts')
    recordProgress(2, false)
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)
  check(
    'progress survives a reload',
    (await state(page)).level === 2,
    `resumed on level ${(await state(page)).level + 1}`,
  )
  check(
    'and is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('tilt_maze_save'))
        return raw && raw.v === 1 && typeof raw.d?.reached === 'number'
      } catch {
        return false
      }
    }),
    'the hub reads this key through shared/completion',
  )

  // ------------------------------------------------------- back to the hub

  check(
    'there is a way back to the hub',
    await page.evaluate(() => {
      const a = document.querySelector('.stage3d-back')
      return !!a && a.getAttribute('href').includes('/games/')
    }),
    'the standalone counterpart to the shell\'s "< Games" link',
  )

  // The win panel is styled `display: flex`, which beats the `hidden`
  // attribute's own default — so it needs the rule in shared/stage3d.css to
  // actually disappear. It shipped visible once, its "Next level" button
  // floating over the board during play.
  check(
    'the win panel is really hidden during play',
    await page.evaluate(() => {
      const p = document.querySelector('.tm-panel')
      return p.hidden && getComputedStyle(p).display === 'none'
    }),
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

/**
 * The same game with reduced motion asked for.
 *
 * There is nothing decorative to strip here — the board's lean and the
 * marble's roll are the game — so what is checked is that the reduced path
 * still plays, and that the lean is *not* gated, which would leave a player
 * who asked for less motion holding a board that never tips.
 */
async function reducedMotion() {
  console.log('\n### tilt-maze, reduced motion ###\n')
  const t = await launchTouch(gameUrl('tilt-maze'))
  const { page, hand } = t
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)

  check(
    'the page reports the preference',
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  )

  const before = await state(page)
  const centre = await canvasPoint(page, 0.5, 0.5, '#stage canvas')
  await hand.down(PAD, centre.x, centre.y)
  await dragTo(page, hand, centre, 1, 0)
  await page.waitForTimeout(700)
  const during = await state(page)
  await hand.up(PAD)

  check(
    'the board still leans with reduced motion',
    during.tilt.x > 0.1,
    `tilt.x ${during.tilt.x.toFixed(3)} — the lean is the game, not a flourish`,
  )
  check(
    'and the marble still rolls',
    during.ball.x > before.ball.x,
    `x ${before.ball.x.toFixed(2)} -> ${during.ball.x.toFixed(2)}`,
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

await run()
await reducedMotion()
process.exit(ok ? 0 : 1)
