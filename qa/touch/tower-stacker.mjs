// Touch coverage for Tower Stacker (#110), on the standalone stage (#119).
//
// This suite used to check that the canvas was 160 game pixels wide, that the
// d-pad's sliding control reached a game with no Phaser in it, that the
// palette toggle still meant something, and that nothing but the four DMG
// tones reached the framebuffer. #119 removed every one of those things, so
// none of those checks survive.
//
// What survives is the *question* underneath the tone checks, which #119 is
// explicit about: "can the player see the thing they must react to against its
// background" does not go away with the palette. In four tones that was asked
// as "the tower is shaded across three of them and none of them is the sky's".
// In full colour it is asked as luminance — how bright the tower is, how far
// its faces spread, and how far its dimmest face sits above the sky.
//
// The stacking arithmetic, and the frustum that has to be wide enough for the
// slide on any shape of screen, are in `tower-stacker/stack_test.ts` under
// `npm run qa:units`.
import { launchTouch, canvasPoint, gameUrl, checker, PAD } from './driver.mjs'

const { check, finish } = checker()

const state = (page) =>
  page.evaluate(() => ({
    screen: window.__game.screen(),
    height: window.__game.height(),
    best: window.__game.best(),
    drops: window.__game.drops(),
    perfects: window.__game.perfects(),
    streak: window.__game.streak(),
  }))

const offset = (page) =>
  page.evaluate(() => {
    const g = window.__game
    const m = g.moving()
    if (!m) return null
    const top = g.stack()[g.stack().length - 1]
    return (m.x - top.x) + (m.z - top.z)
  })

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

/**
 * Luminance statistics of the rendered frame.
 *
 * The sky is whatever luminance covers the most pixels — it is most of the
 * frame by a distance, and reading it rather than hard-coding it means the
 * checks below stay true if the sky is ever restyled. "Block" pixels are
 * everything comfortably above it, which excludes the near-black outlines as
 * well as the sky itself; percentiles rather than a mean, so one bright flash
 * or a handful of stars cannot move the answer.
 */
const tones = (page) =>
  page.evaluate(() => {
    const { data, width, height } = window.__game.stage.readPixels()
    const luma = (i) => (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
    const hist = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const k = Math.round(luma(i) * 100) / 100
      hist.set(k, (hist.get(k) ?? 0) + 1)
    }
    const sky = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const block = []
    for (let i = 0; i < data.length; i += 4) {
      const l = luma(i)
      if (l > sky + 0.12) block.push(l)
    }
    block.sort((a, b) => a - b)
    const pct = (p) => (block.length ? block[Math.floor((block.length - 1) * p)] : 0)
    return {
      sky,
      pixels: block.length,
      coverage: block.length / (width * height),
      p05: pct(0.05),
      p25: pct(0.25),
      p50: pct(0.5),
      p95: pct(0.95),
    }
  })

/** Widest run of non-sky pixels across the tower, and any sky inside it. */
const solidity = (page) =>
  page.evaluate(() => {
    const { data, width, height } = window.__game.stage.readPixels()
    const luma = (x, y) => {
      const i = ((height - 1 - y) * width + x) * 4
      return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
    }
    const hist = new Map()
    for (let i = 0; i < data.length; i += 4) {
      const k = Math.round(((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255) * 100) / 100
      hist.set(k, (hist.get(k) ?? 0) + 1)
    }
    const sky = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const isSky = (x, y) => Math.abs(luma(x, y) - sky) <= 0.04
    let best = null
    // The lower half of the frame, where the tower is: the top of a run is
    // sky, and the widest scanline up there measures nothing.
    for (let y = Math.floor(height * 0.45); y < Math.floor(height * 0.9); y++) {
      let lo = -1
      let hi = -1
      for (let x = 0; x < width; x++) {
        if (!isSky(x, y)) {
          if (lo < 0) lo = x
          hi = x
        }
      }
      if (lo >= 0 && (!best || hi - lo > best.hi - best.lo)) best = { y, lo, hi }
    }
    if (!best) return null
    let inside = 0
    for (let x = best.lo; x <= best.hi; x++) if (isSky(x, best.y)) inside++
    return { width: best.hi - best.lo + 1, inside, row: best.y }
  })

/** Drops on the frame the block is closest to centred, so the run survives. */
const dropTight = (page, want = 0.14) =>
  page.evaluate(
    (limit) =>
      new Promise((resolve) => {
        const g = window.__game
        let last = Infinity
        const tick = () => {
          const m = g.moving()
          if (!m) return resolve(false)
          const top = g.stack()[g.stack().length - 1]
          const off = Math.abs(m.x - top.x) + Math.abs(m.z - top.z)
          if (off <= limit || off > last + 0.4) {
            g.press()
            return resolve(true)
          }
          last = off
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    want,
  )

async function run() {
  console.log('\n### tower-stacker ###\n')
  const t = await launchTouch(gameUrl('tower-stacker'))
  const { page, hand } = t
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)

  // ------------------------------------------------- the stage's contract

  const m = await canvasMetrics(page)
  check(
    'the canvas fills the viewport rather than a fixed 160x144 box',
    m.cssWidth === m.viewport.width && m.cssHeight === m.viewport.height,
    `canvas ${m.cssWidth}x${m.cssHeight}, viewport ${m.viewport.width}x${m.viewport.height}`,
  )
  check(
    'and its drawing buffer is scaled by the device pixel ratio, capped at 2',
    m.bufferWidth === Math.round(m.cssWidth * Math.min(m.dpr, 2)),
    `buffer ${m.bufferWidth} at dpr ${m.dpr}`,
  )

  // -------------------------------------------------------- title and start

  const opening = await state(page)
  check('the game opens on the title screen', opening.screen === 'title')
  check(
    'the title panel names the game',
    await page.evaluate(() => document.querySelector('.ts-panel-title')?.textContent === 'Tower Stacker'),
  )

  // A tap on the canvas, not on a button. #119 replaces the d-pad and the A
  // button with the canvas itself, so this is the whole control surface now.
  const centre = await canvasPoint(page, 0.5, 0.55, '#stage canvas')
  await hand.tap(PAD, centre.x, centre.y)
  await page.waitForTimeout(300)
  const started = await state(page)
  check('a tap anywhere starts a run', started.screen === 'run', `screen=${started.screen}`)
  check('and the run starts from an empty tower', started.height === 0)

  // ---------------------------------------------------------- a tap drops

  const beforeDrop = await state(page)
  await hand.tap(PAD, centre.x, centre.y)
  await page.waitForTimeout(250)
  const afterDrop = await state(page)
  check('a tap drops the block', afterDrop.drops === beforeDrop.drops + 1, `${afterDrop.drops} drop(s)`)
  check('and one tap is one drop', afterDrop.drops - beforeDrop.drops === 1)

  // A tap in a corner, well away from the tower, to make the point that the
  // whole canvas is the button — there is nothing to aim at any more.
  const corner = await canvasPoint(page, 0.12, 0.2, '#stage canvas')
  const beforeCorner = await state(page)
  await hand.tap(PAD, corner.x, corner.y)
  await page.waitForTimeout(250)
  check(
    'a tap in the corner drops too',
    (await state(page)).drops === beforeCorner.drops + 1,
    'the canvas is the button',
  )

  // ------------------------------------- the tower, as the framebuffer has it

  // Restarted and built deliberately: the taps above were blind and may have
  // left the tower a single sliver wide, which measures nothing.
  //
  // What this no longer has to do is care whether the run is still going. On
  // the GameBoy shell the HUD was composited into the same framebuffer, so the
  // end screen's footer covered the rows the tone checks read and measuring
  // after a miss reported the frame as mostly sky. The HUD is DOM now, over
  // the canvas rather than in it, so `readPixels` sees the tower either way.
  await page.evaluate(() => {
    const g = window.__game
    if (g.screen() !== 'run') g.press()
  })
  await page.waitForTimeout(300)
  for (let i = 0; i < 8; i++) {
    if ((await state(page)).screen !== 'run') break
    await dropTight(page, 0.05)
  }
  // Past the perfect flash, which is transient and would skew the top end.
  await page.waitForTimeout(700)
  const live = await state(page)
  check(
    'there is a real tower on screen to measure',
    live.height >= 3,
    `${live.height} blocks, screen=${live.screen}`,
  )

  const tone = await tones(page)
  check(
    'the tower covers a real part of the frame',
    tone.coverage > 0.02,
    `${(tone.coverage * 100).toFixed(1)}% of pixels`,
  )

  // The defect CLAUDE.md counts six times, in the form this game can have it:
  // a block face rendered at the sky's own value, which would punch a hole in
  // the tower rather than making a sprite vanish.
  check(
    'the dimmest part of the tower is clear of the sky',
    tone.p05 - tone.sky >= 0.25,
    `${tone.p05.toFixed(3)} against a sky of ${tone.sky.toFixed(3)}`,
  )

  // And the bug this game shipped with in development. three's Lambert BRDF
  // carries a 1/PI factor and applies it to the ambient term too, so lighting
  // rigged from the raw intensities comes out a third as bright: every face
  // lands at nearly the same value, the tower reads as one flat silhouette,
  // and every functional check above still passes — the blocks drop, the tower
  // grows, the score counts.
  //
  // Proven to fail: making `lambertIntensity` in shared/stage3d.ts return its
  // argument takes the median from 0.765 to 0.456 and the spread from 0.22 to
  // 0.14, and turns both of these red.
  check(
    'the tower is lit to the brightness the rig was designed for',
    tone.p50 >= 0.6,
    `median ${tone.p50.toFixed(3)} — 1/PI missing would put it near 0.46`,
  )
  check(
    'and its faces are spread across a real range, not one flat value',
    tone.p95 - tone.p25 >= 0.18,
    `${tone.p25.toFixed(3)}..${tone.p95.toFixed(3)}`,
  )

  const solid = await solidity(page)
  check(
    'the tower has a measurable silhouette',
    solid !== null && solid.width > 40,
    solid ? `${solid.width} px wide at row ${solid.row}` : 'no tower found',
  )
  if (solid) {
    check(
      'and it is solid — no face has vanished into the sky',
      solid.inside / solid.width < 0.15,
      `${solid.inside} of ${solid.width} px across the waist are sky`,
    )
  }

  // ------------------------------------------------- ending and restarting

  // Drive the run into the ground: drop at the far end of the travel, which is
  // past the edge of the slab below by construction.
  //
  // The second tap is the point — it models the thumb bouncing on the surface
  // that just ended the run, which is what the end screen's input lock exists
  // to absorb. Detecting the end and *then* tapping does not test it: the
  // detection is a round trip, and by the time it lands the half-second lock
  // has often already expired.
  //
  // Bounded by the clock rather than by iterations. One poll is about ten
  // milliseconds and one sweep of the block takes seconds, so an iteration cap
  // that looks generous can expire before the block reaches the far end.
  // A run has to be in progress for any of this to mean anything. The tower
  // built above may have toppled on its last drop, and an earlier version of
  // this went straight into the loop, found no moving block, and reported the
  // end screen's input lock as untested while claiming to have tested it.
  await page.evaluate(() => {
    const g = window.__game
    if (g.screen() !== 'run') g.press()
  })
  await page.waitForTimeout(600)
  check('a run is in progress before the miss is driven', (await state(page)).screen === 'run')

  let ended = false
  let bounced = false
  const deadline = Date.now() + 25_000
  while (!ended && Date.now() < deadline) {
    const o = await offset(page)
    if (o === null) {
      ended = true
      break
    }
    if (Math.abs(o) > 0.95) {
      await hand.tap(PAD, centre.x, centre.y, 60)
      await hand.tap(PAD, centre.x, centre.y, 60)
      bounced = true
      await page.waitForTimeout(150)
      ended = (await state(page)).screen === 'over'
    }
  }
  const over = await state(page)
  check('missing the tower ends the run', over.screen === 'over', `screen=${over.screen}`)
  check(
    'and the height reached is saved as the best',
    over.best === over.height,
    `best=${over.best}, height=${over.height}`,
  )
  check(
    'a bounced press does not skip the end screen',
    bounced && over.screen === 'over',
    'shared/runSummary applies the same lock for the same reason',
  )
  check(
    'the end panel reports the run',
    await page.evaluate(() => document.querySelector('.ts-panel-body')?.textContent?.includes('Height')),
  )

  await page.waitForTimeout(700)
  await hand.tap(PAD, centre.x, centre.y)
  await page.waitForTimeout(400)
  const retried = await state(page)
  check('a tap after it retries', retried.screen === 'run', `screen=${retried.screen}`)
  check('and the retry starts from an empty tower', retried.height === 0)
  check('while the best is kept', retried.best === over.best, `best=${retried.best}`)

  // -------------------------------------------------------- the save survives

  const saved = over.best
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#stage canvas')
  await page.waitForTimeout(1200)
  check('the best height survives a reload', (await state(page)).best === saved, `${saved}`)
  check(
    'and it is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('tower_stacker_save'))
        return raw && raw.v === 1 && typeof raw.d?.best === 'number'
      } catch {
        return false
      }
    }),
    'the hub reads this key through shared/completion',
  )

  // ------------------------------------------------------------- the sound

  const label = () => page.evaluate(() => document.querySelector('.ts-sound')?.textContent)
  const on = await label()
  await page.evaluate(() => document.querySelector('.ts-sound').click())
  check('the sound can be turned off', (await label()) !== on, `${on} -> ${await label()}`)
  await page.evaluate(() => document.querySelector('.ts-sound').click())
  check('and back on', (await label()) === on, on)

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
