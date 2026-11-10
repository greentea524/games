// Touch coverage for Voxel Digger (#115), on the standalone stage (#118).
//
// The dig rules, whether a block can be solved inside its budget, and the
// instance bookkeeping are all checked headless under `npm run qa:units`, in
// `voxel-digger/dig_test.ts` and `voxel-digger/instances_test.ts`.
//
// This file covers the join between a finger and a cube, which for this game
// is the whole of #115's "hard part" — the issue spent a paragraph on moving a
// 3D cursor with a d-pad, and the answer turned out to be that with a canvas
// there is no cursor: a tap raycasts to an instance and the instance maps back
// to a cube. What has to be true is that the cube that disappears is the one
// under the finger, that a drag turns the block instead of digging it, and
// that two fingers zoom rather than spinning it.
import { launchTouch, canvasPoint, gameUrl, checker, PAD, ACT } from './driver.mjs'

const { check, finish } = checker()

const state = (page) =>
  page.evaluate(() => ({
    digs: window.__game.digs(),
    dug: window.__game.dug(),
    phase: window.__game.phase(),
    exposed: window.__game.exposed(),
    view: window.__game.view(),
    answer: window.__game.answer(),
  }))

const canvasMetrics = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('#stage > canvas')
    return {
      cssWidth: c.clientWidth,
      cssHeight: c.clientHeight,
      bufferWidth: c.width,
      dpr: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })

/** Looks straight down at the block, where a narrow shaft is diggable. */
const lookDown = (page) =>
  page.evaluate(async () => {
    const g = window.__game
    g.orbit(0, 1.42 - g.view().pitch)
    await new Promise((r) => requestAnimationFrame(r))
  })

async function run() {
  console.log('\n### voxel-digger ###\n')
  const t = await launchTouch(gameUrl('voxel-digger'))
  const { page, hand } = t
  await page.waitForSelector('#stage > canvas')
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

  const opening = await state(page)
  check('the block starts untouched', opening.digs === 0 && opening.exposed === 0)
  check('and nothing is buried in plain sight', opening.answer === null, 'the answer is withheld')

  // ------------------------------------------------- a tap drills (#152)

  const centre = await canvasPoint(page, 0.5, 0.5, '#stage > canvas')
  const aimed = await page.evaluate(() => window.__game.probe(0.5, 0.5))
  check('there is a cube under the middle of the screen', aimed?.kind === 'rock', `${aimed?.cell}`)

  await hand.tap(PAD, centre.x, centre.y)
  await page.waitForTimeout(250)
  const afterTap = await state(page)
  // More than the nine cubes of one layer: the drill carries on in.
  check(
    'a tap spends one dig and drills a core into the block',
    afterTap.digs === 1 && afterTap.dug > 9,
    `${afterTap.digs} dig, ${afterTap.dug} cubes`,
  )
  check(
    'and it digs the cube that was under the finger',
    (await page.evaluate((cell) => window.__game.probe(0.5, 0.5)?.cell !== cell, aimed.cell)) === true,
    'the cube that was there is gone',
  )

  // ------------------------------------------------------------- the undo
  //
  // #115 asks for this by name: a mis-tap that spends one of a limited number
  // of digs is far more annoying than one that costs nothing.

  await page.evaluate(() => document.querySelector('.vd-undo').click())
  await page.waitForTimeout(200)
  const undone = await state(page)
  check(
    'undo puts the whole core back and refunds the dig',
    undone.digs === 0 && undone.dug === 0,
    `${undone.digs} digs, ${undone.dug} cubes out`,
  )
  check(
    'and the cube really is back where it was',
    (await page.evaluate((cell) => window.__game.probe(0.5, 0.5)?.cell === cell, aimed.cell)) === true,
    'the same cube is under the same point',
  )
  check(
    'undo is unavailable with nothing to undo',
    await page.evaluate(() => document.querySelector('.vd-undo').disabled === true),
  )

  // ------------------------------------------------------- a drag is not a tap

  const beforeDrag = await state(page)
  await hand.down(PAD, centre.x, centre.y)
  await hand.move(PAD, centre.x - 50, centre.y)
  await hand.move(PAD, centre.x - 120, centre.y)
  const dragging = await state(page)
  await hand.up(PAD)
  await page.waitForTimeout(200)
  const afterDrag = await state(page)
  check(
    'dragging turns the block',
    Math.abs(dragging.view.yaw - beforeDrag.view.yaw) > 0.5,
    `yaw ${beforeDrag.view.yaw.toFixed(2)} -> ${dragging.view.yaw.toFixed(2)}`,
  )
  check(
    'and turning it digs nothing',
    afterDrag.digs === beforeDrag.digs,
    `${afterDrag.digs} digs after a full drag`,
  )

  // -------------------------------------------------------- two fingers zoom

  const before = await state(page)
  const a = await canvasPoint(page, 0.38, 0.5, '#stage > canvas')
  const b = await canvasPoint(page, 0.62, 0.5, '#stage > canvas')
  await hand.down(PAD, a.x, a.y)
  await hand.down(ACT, b.x, b.y)
  await hand.move(PAD, a.x - 70, a.y)
  await hand.move(ACT, b.x + 70, b.y)
  const pinched = await state(page)
  await hand.up(ACT)
  await hand.up(PAD)
  await page.waitForTimeout(200)
  check(
    'spreading two fingers zooms in',
    pinched.view.distance < before.view.distance - 1,
    `${before.view.distance.toFixed(1)} -> ${pinched.view.distance.toFixed(1)}`,
  )
  check(
    'and a pinch does not spin the block while it zooms',
    Math.abs(pinched.view.yaw - before.view.yaw) < 0.25,
    `yaw moved ${Math.abs(pinched.view.yaw - before.view.yaw).toFixed(3)}`,
  )
  check(
    'nor does it dig',
    (await state(page)).digs === before.digs,
    'two fingers are a camera, not a tool',
  )

  // ------------------------------------------------- digging down to the find

  // Orange pixels on screen: the find, seen directly or glowing through rock.
  const orange = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const { data } = window.__game.stage.readPixels()
              let n = 0
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 120 && data[i] - data[i + 2] > 80) n++
              }
              resolve(n)
            }),
          ),
        ),
    )
  /** Deals a chosen shape, so no check here depends on which one came up. */
  const deal = (index) =>
    page.evaluate((i) => {
      const random = Math.random
      Math.random = () => i / 4 + 0.01
      window.__game.restart()
      Math.random = random
    }, index)
  const lowAngle = () =>
    page.evaluate(() => {
      const g = window.__game
      const v = g.view()
      g.orbit(0.7 - v.yaw, 0.3 - v.pitch)
    })

  // Every shape in turn. The coil is hollow, so a drill down its middle goes
  // clean through and uncovers nothing — which is fair, and is why this tries
  // the middle first and then works outward rather than insisting on one tap.
  for (const [index, name] of ['Skull', 'Fish', 'Coil', 'Key'].entries()) {
    await deal(index)
    await lookDown(page)
    for (const nx of [0.5, 0.42, 0.36, 0.3]) {
      await page.evaluate((x) => window.__game.dig(x, 0.5), nx)
      if ((await state(page)).exposed > 0) break
    }
    const reached = await state(page)
    check(
      `${name}: a tap or two straight down reaches it`,
      reached.exposed > 0 && reached.digs <= 3,
      `${reached.exposed} cube(s) showing after ${reached.digs} dig(s)`,
    )
    // From a low angle the hole's own walls are in the way, and what was
    // uncovered has to show through the rock (#152).
    await lowAngle()
    const glowing = await orange()
    await page.evaluate(() => window.__game.setGlow(false))
    const without = await orange()
    await page.evaluate(() => window.__game.setGlow(true))
    check(
      `${name}: and what was uncovered shows through the rock`,
      glowing > without + 400,
      `${glowing} orange pixels with the glow, ${without} without`,
    )
  }

  // The control, on the skull: one drill down the middle, where from a low
  // angle no ray reaches the find at all — so without the glow there is
  // nothing on screen, and the count above cannot be passing on a direct view.
  await deal(0)
  await lookDown(page)
  await page.evaluate(() => window.__game.dig(0.5, 0.5))
  const found = await state(page)
  await lowAngle()
  const hidden = await page.evaluate(() => {
    const g = window.__game
    for (let ny = 0.1; ny <= 0.9; ny += 0.01) {
      for (let nx = 0.05; nx <= 0.95; nx += 0.01) if (g.probe(nx, ny)?.kind === 'find') return false
    }
    return true
  })
  check('from a low angle the hole hides the find itself', hidden, 'no ray reaches it')
  await page.evaluate(() => window.__game.setGlow(false))
  const dark = await orange()
  await page.evaluate(() => window.__game.setGlow(true))
  check('and without the glow there is nothing to see — the check can tell', dark === 0, `${dark} orange pixels`)
  await lookDown(page)

  // ------------------------------------- the pictures on the guesses (#152)

  const pictures = await page.evaluate(() =>
    [...document.querySelectorAll('.vd-guess canvas')].map((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
      return { painted: n, url: c.toDataURL() }
    }),
  )
  check(
    'every guess carries a picture of its shape',
    pictures.length === 4 && pictures.every((p) => p.painted > 500),
    pictures.map((p) => p.painted).join(', ') + ' painted pixels',
  )
  check('and no two pictures are the same', new Set(pictures.map((p) => p.url)).size === 4)
  await page.evaluate(() => {
    const g = window.__game
    g.orbit(Math.PI / 2, 0)
  })
  await page.waitForTimeout(150)
  const turned = await page.evaluate(() => [...document.querySelectorAll('.vd-guess canvas')].map((c) => c.toDataURL()))
  check(
    'and they turn when the block is turned',
    turned.filter((url, i) => url !== pictures[i].url).length >= 1,
    `${turned.filter((url, i) => url !== pictures[i].url).length} of 4 redrawn after a quarter-turn`,
  )
  await page.evaluate(() => {
    const g = window.__game
    g.orbit(-Math.PI / 2, 0)
  })

  // Where the find can actually be seen, rather than where it was assumed to
  // be. A shaft straight down uncovers the cube *beside* its floor as often as
  // the one under it, so the ray that dug the shaft usually still lands on
  // rock — an earlier version of this check asserted otherwise and failed for
  // a reason that had nothing to do with the game.
  const findAt = await page.evaluate(() => {
    const g = window.__game
    for (let ny = 0.2; ny <= 0.8; ny += 0.01) {
      for (let nx = 0.2; nx <= 0.8; nx += 0.01) {
        if (g.probe(nx, ny)?.kind === 'find') return { nx, ny }
      }
    }
    return null
  })
  check('and the find is in view from the shaft', findAt !== null)

  if (findAt) {
    const spot = await canvasPoint(page, findAt.nx, findAt.ny, '#stage > canvas')
    const beforeFindTap = await state(page)
    await hand.tap(PAD, spot.x, spot.y)
    await page.waitForTimeout(250)
    check(
      'tapping the find itself costs nothing',
      (await state(page)).digs === beforeFindTap.digs,
      'the thing you are uncovering is not a tax',
    )
  }

  // ------------------------------------------------------------- the guess

  const guessed = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.vd-guess')]
    buttons[0].click()
    return { label: buttons[0].textContent, phase: window.__game.phase() }
  })
  await page.waitForTimeout(200)
  const ended = await state(page)
  check(
    'naming a shape ends the round',
    ended.phase === 'right' || ended.phase === 'wrong',
    `guessed ${guessed.label}, phase ${ended.phase}`,
  )
  check(
    'and only then does the game say what it was',
    ended.answer !== null,
    `it was the ${ended.answer?.name}`,
  )
  check(
    'the panel reports the round',
    await page.evaluate(() => document.querySelector('.vd-panel-title')?.textContent?.length > 0),
  )

  // -------------------------------------------------------------- the save

  // Cleared first, because the guess above may have been right — and a correct
  // guess records the round's own dig count, which is lower than the number
  // written here. `recordFind` keeps the *smaller* best, so the check passed
  // only on the runs where the blind guess happened to be wrong. Asserting
  // against a known-empty save makes the result the same every time.
  const saved = await page.evaluate(async () => {
    localStorage.removeItem('voxel_digger_save')
    const { recordFind } = await import('/games/voxel-digger/save.ts')
    recordFind(11)
    try {
      const raw = JSON.parse(localStorage.getItem('voxel_digger_save'))
      return { v: raw?.v, best: raw?.d?.best, finds: raw?.d?.finds }
    } catch {
      return null
    }
  })
  check(
    'a find is stored through shared/storage, envelope and all',
    saved?.v === 1 && saved.best === 11 && saved.finds >= 1,
    saved ? `v${saved.v} best ${saved.best} finds ${saved.finds}` : 'unreadable',
  )
  // #151: a best counted one cube a tap is not a best in taps of a patch.
  const migrated = await page.evaluate(async () => {
    localStorage.setItem('voxel_digger_save', JSON.stringify({ v: 1, d: { best: 3, finds: 7 } }))
    const { loadDiggerSave } = await import('/games/voxel-digger/save.ts')
    return loadDiggerSave()
  })
  check(
    'a best from one-cube digs is set aside, and the finds are kept',
    migrated.best === 0 && migrated.finds === 7,
    `best ${migrated.best}, finds ${migrated.finds}`,
  )
  await page.evaluate(() => {
    localStorage.removeItem('voxel_digger_save')
  })
  await page.evaluate(async () => {
    const { recordFind } = await import('/games/voxel-digger/save.ts')
    recordFind(11)
  })
  check(
    'and a better round replaces it while a worse one does not',
    await page.evaluate(async () => {
      const { recordFind } = await import('/games/voxel-digger/save.ts')
      recordFind(20)
      const worse = JSON.parse(localStorage.getItem('voxel_digger_save')).d.best
      recordFind(4)
      const better = JSON.parse(localStorage.getItem('voxel_digger_save')).d.best
      return worse === 11 && better === 4
    }),
    'fewer digs is a better round',
  )

  check(
    'there is a way back to the hub',
    await page.evaluate(() => {
      const el = document.querySelector('.stage3d-back')
      return Boolean(el && el.getAttribute('href'))
    }),
  )

  const passed = finish(t.log)
  await t.browser.close()
  return passed
}

process.exit((await run()) ? 0 : 1)
