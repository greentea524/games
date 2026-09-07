// Touch coverage for the three.js game (#109, #110).
//
// This suite exists for the seam rather than for the rules. The overlap
// arithmetic — the slice, the miss, the perfect drop several levels in at a
// real slide speed — is covered by `tower-stacker/stack_test.ts` under
// `npm run qa:units`, where it can be driven frame-exactly and where the
// defect can be reintroduced and watched go red. A CDP tap cannot hit a 0.04
// window, and a check that pretends otherwise would be flaky rather than
// strict.
//
// What only touch can prove is that the GameBoy shell still works across a
// change of renderer: that a thumb on the A button reaches a game with no
// Phaser in it, that the d-pad's sliding control does too, that the palette
// toggle still means something, and that the canvas is still 160 game pixels
// wide so `canvasSpace` below matches the helper in `grid.mjs`.
//
// It also carries the DMG contrast guard. CLAUDE.md counts six sprites that
// shipped invisible in their background's tone, and notes that two of them got
// past a green run of `qa:contrast` — which in any case measures Phaser
// textures and has nothing to say about a WebGL framebuffer. So the tone
// checks here read the actual pixels the player sees.
//
// Both of the claims this suite makes that nothing else does were proven to
// fail before being trusted, by reintroducing the defect and rerunning:
//
//   - `LAMBERT_PI = 1` in tower-stacker/game.ts — the real bug this game was
//     written with, where three's Lambert BRDF divides by PI and the lighting
//     came out a third as bright — reports `light=0 lightest=0`, failing "all
//     four are actually used", both of those tone checks, and the solidity
//     check with "20 of 25 px across the waist are sky".
//   - `OVER_LOCK = 0` lets the bounced press through, and the run restarts
//     under the check's feet: "missing the tower ends the run — screen=run",
//     the bounce check, and the two retry checks all go red.
import { launchTouch, centreOf, controls, gameUrl, checker, ACT } from './driver.mjs'

const { check, finish } = checker()
let ok = true

/** The DMG ramp, as the bytes it must land in the framebuffer as. */
const TONES = {
  darkest: '15,56,15',
  dark: '48,98,48',
  light: '139,172,15',
  lightest: '155,188,15',
}
const TONE_NAME = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [v, k]))

/** Game space is 160x144; the canvas is scaled up to fit the shell. */
async function canvasSpace(page) {
  const box = (await centreOf(page, '#game canvas')).box
  return { box, scale: box.width / 160 }
}

const state = (page) =>
  page.evaluate(() => ({
    screen: window.__game.screen(),
    height: window.__game.height(),
    drops: window.__game.drops(),
    best: window.__game.best(),
    mono: window.__game.mono(),
    streak: window.__game.streak(),
  }))

/**
 * The sliding block's offset from the slab below, and how wide that slab is
 * along the axis it is sliding on.
 *
 * Null when nothing is sliding, which is how the callers below tell "the run
 * ended" from "the block is off centre". Only one axis moves at a time, so
 * summing the two deltas gives the offset and the larger of them says which
 * extent is the one that matters.
 */
const slide = (page) =>
  page.evaluate(() => {
    const g = window.__game
    const m = g.moving()
    if (!m) return null
    const top = g.stack()[g.stack().length - 1]
    const dx = m.x - top.x
    const dz = m.z - top.z
    return { off: dx + dz, extent: Math.abs(dx) >= Math.abs(dz) ? top.w : top.d }
  })

/** Just the offset, for the callers that only want to know where it is. */
const offset = async (page) => (await slide(page))?.off ?? null

/**
 * Waits until the block is closing on centre, then taps.
 *
 * A tap cannot be aimed to the frame, but it does not have to be: what these
 * checks need is a drop that *lands*, not one that lands perfectly. The
 * tolerance has to be a fraction of the slab rather than a constant, though —
 * a fixed 0.3 lands every time on a full-width block and misses outright once
 * the tower has narrowed past 0.6, which ended the run around the sixth drop
 * and left the end-screen panel sitting across the rows the tone checks
 * measure. Requiring the offset to be shrinking stops it firing on the way
 * out to the far end.
 */
async function tapWhenNearCentre(page, hand, point, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let previous = Infinity
  while (Date.now() < deadline) {
    const s = await slide(page)
    if (s === null) return false
    const abs = Math.abs(s.off)
    // A quarter of the slab: comfortably inside the overlap even after the
    // round trip this poll costs, at every width the run reaches.
    if (abs < s.extent * 0.25 && abs < previous) {
      await hand.tap(ACT, point.x, point.y, 90)
      await page.waitForTimeout(120)
      return true
    }
    previous = abs
  }
  return false
}

/**
 * Gets a run going with at least `minHeight` blocks on it.
 *
 * The tone checks need a tower on screen *and* a screen with no panel over it,
 * so they cannot simply take whatever state the drops above left behind.
 */
async function towerOfAtLeast(page, hand, c, minHeight) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await state(page)).screen !== 'run') {
      await page.waitForTimeout(600)
      await hand.tap(ACT, c.A.x, c.A.y, 140)
      await page.waitForTimeout(400)
    }
    while ((await state(page)).screen === 'run') {
      const s = await state(page)
      if (s.height >= minHeight) return s
      if (!(await tapWhenNearCentre(page, hand, c.A))) break
    }
  }
  return state(page)
}

/** Colour histogram of the framebuffer, skipping the rows the HUD writes in. */
const histogram = (page, loRow, hiRow) =>
  page.evaluate(
    ([lo, hi]) => {
      const px = window.__game.readPixels() // RGBA, rows bottom-up
      const counts = {}
      for (let y = lo; y <= hi; y++) {
        for (let x = 0; x < 160; x++) {
          const i = (y * 160 + x) * 4
          const k = `${px[i]},${px[i + 1]},${px[i + 2]}`
          counts[k] = (counts[k] ?? 0) + 1
        }
      }
      return counts
    },
    [loRow, hiRow],
  )

async function run() {
  console.log('\n### tower-stacker ###\n')
  const t = await launchTouch(gameUrl('tower-stacker'))
  const { page, hand } = t
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1500)
  const c = await controls(page)

  // ------------------------------------------------- the shell's own contract

  const cv = await canvasSpace(page)
  check(
    'the canvas is upscaled from a 160x144 target at an integer zoom',
    cv.box.width / 160 === cv.box.height / 144 && Number.isInteger(cv.box.width / 160),
    `${cv.box.width}x${cv.box.height} — ${cv.box.width / 160}x`,
  )
  check(
    'the backing store really is 160x144, not a scaled-up one',
    await page.evaluate(() => {
      const el = document.querySelector('#game canvas')
      return el.width === 160 && el.height === 144
    }),
    'setPixelRatio(1) and setSize(160, 144, false)',
  )

  check('the game opens on the title screen', (await state(page)).screen === 'title')

  // ------------------------------------------------------------ the A button

  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(400)
  const started = await state(page)
  check('a thumb on A starts a run', started.screen === 'run', `screen=${started.screen}`)
  check('and the run starts from an empty tower', started.height === 0, `height=${started.height}`)
  check(
    'a block is sliding above it',
    (await offset(page)) !== null,
    'shared/dpad and shared/buttons reach a game with no Phaser in it',
  )

  // A tap on A has to reach the game through the shell's synthetic key event.
  // This is the whole point of the foundation issue: no adapter, same modules.
  const droppedByA = await tapWhenNearCentre(page, hand, c.A)
  check('a thumb on A drops the block', droppedByA)
  const afterA = await state(page)
  check('the tower grew', afterA.height === 1, `height=${afterA.height}`)
  check('and the drop was counted', afterA.drops === 1, `drops=${afterA.drops}`)

  // -------------------------------------------------------------- the d-pad

  // `shared/dpad.ts` is a single sliding control that derives a direction from
  // where the finger is, not four buttons — so it is worth proving the game
  // reads its ArrowDown at all, rather than assuming a keyboard-shaped path.
  const droppedByPad = await tapWhenNearCentre(page, hand, c.arm('ArrowDown'))
  check('the d-pad down arm drops too', droppedByPad)
  check('and it counted as one drop, not two', (await state(page)).drops === 2)

  // --------------------------------------------------------------- START

  // START carries `data-key="Enter"`, so it is claimed by `setupButtons` like
  // any other key button. Windup shipped a START wired to nothing (#97), and
  // the system buttons are hidden on desktop — touch is the only place this
  // control exists at all.
  const startBtn = await centreOf(page, '#btn-start')
  const droppedByStart = await tapWhenNearCentre(page, hand, startBtn)
  check('START drops as well', droppedByStart)
  check('and it, too, counted once', (await state(page)).drops === 3)

  // ------------------------------------------------------ several drops in

  const deep = await towerOfAtLeast(page, hand, c, 6)
  check(
    'a thumb can get several drops into a run',
    deep.screen === 'run' && deep.height >= 6,
    `height=${deep.height} after ${deep.drops} drops, screen=${deep.screen}`,
  )

  // --------------------------------------------- the DMG tones, as rendered
  //
  // `readPixels` hands back rows bottom-up, so the height and BEST lines the
  // HUD writes across the top of the frame are the *high* rows, and the footer
  // bar is rows 0..27. Rows 30..110 are clear of both — but only while a run
  // is live: the end screen draws that footer, and the first version of this
  // measured it by accident after the run died early, found a 160px-wide
  // "tower" and reported the frame as mostly sky.

  check('the tone checks below are measuring a live run', deep.screen === 'run')
  const mono = await histogram(page, 30, 110)
  const monoColours = Object.keys(mono)
  check(
    'in MONO nothing but the four DMG tones reaches the framebuffer',
    monoColours.every((k) => k in TONE_NAME),
    monoColours.map((k) => TONE_NAME[k] ?? k).join(' '),
  )
  check(
    'and all four are actually used',
    Object.values(TONES).every((v) => (mono[v] ?? 0) > 0),
    Object.entries(TONES).map(([n, v]) => `${n}=${mono[v] ?? 0}`).join(' '),
  )

  // The check that would have caught the bug this game shipped with in
  // development. three's Lambert BRDF carries a 1/PI factor and applies it to
  // the ambient term too, so lighting rigged from the raw intensities came out
  // a third as bright: every face of every block landed on `dark`, the tower
  // rendered as one flat silhouette, and `lightest` disappeared from the 3D
  // layer entirely. Every functional check above still passed — the blocks
  // dropped, the tower grew, the score counted.
  //
  // Proven to fail: dropping `LAMBERT_PI` back to 1 in tower-stacker/game.ts
  // takes `lightest` to 0 pixels here and turns this red.
  for (const name of ['dark', 'light', 'lightest']) {
    check(
      `blocks are shaded across three tones — ${name} covers a real area`,
      (mono[TONES[name]] ?? 0) >= 150,
      `${mono[TONES[name]] ?? 0} px`,
    )
  }

  // And the defect CLAUDE.md counts six times: a feature drawn in its
  // background's tone. Here that would be a block face quantising to the sky,
  // which would punch a hole in the tower rather than making a sprite vanish.
  // Scanning across the tower's waist says it is solid: the only sky-toned
  // pixels between its edges should be the one-pixel seams between slabs.
  const solidity = await page.evaluate(
    ([sky]) => {
      const px = window.__game.readPixels()
      const at = (x, y) => {
        const i = (y * 160 + x) * 4
        return `${px[i]},${px[i + 1]},${px[i + 2]}`
      }
      // Find the widest scanline in the lower half — the tower's waist.
      let best = null
      for (let y = 30; y <= 80; y++) {
        let lo = -1
        let hi = -1
        for (let x = 0; x < 160; x++) {
          if (at(x, y) !== sky) {
            if (lo < 0) lo = x
            hi = x
          }
        }
        if (lo >= 0 && (!best || hi - lo > best.hi - best.lo)) best = { y, lo, hi }
      }
      if (!best) return null
      let skyInside = 0
      for (let x = best.lo; x <= best.hi; x++) if (at(x, best.y) === sky) skyInside++
      return { ...best, width: best.hi - best.lo + 1, skyInside }
    },
    [TONES.darkest],
  )
  check('the tower has a measurable silhouette', solidity !== null && solidity.width > 20,
    solidity ? `${solidity.width} px wide at row ${solidity.y}` : 'no tower found')
  if (solidity) {
    check(
      'and it is solid — no face has vanished into the sky tone',
      solidity.skyInside / solidity.width < 0.15,
      `${solidity.skyInside} of ${solidity.width} px across the waist are sky`,
    )
  }

  // ------------------------------------------------------- the palette toggle

  const paletteBtn = await centreOf(page, '#palette-toggle')
  await hand.tap(ACT, paletteBtn.x, paletteBtn.y, 140)
  await page.waitForTimeout(400)
  check('tapping the toggle switches to COLOR', !(await state(page)).mono)
  check(
    'and the label follows',
    (await page.textContent('#palette-label')) === 'COLOR',
    await page.textContent('#palette-label'),
  )

  const colour = await histogram(page, 20, 100)
  check(
    'COLOR puts colours on the screen that MONO cannot make',
    Object.keys(colour).some((k) => !(k in TONE_NAME)),
    `${Object.keys(colour).length} distinct colours`,
  )
  // Still four levels per channel: the toggle changes the palette, not the
  // bit depth. Anything else would make COLOR a different renderer rather
  // than a different palette.
  // The HUD is composited *after* the quantise so its glyphs keep the exact
  // colours hud.ts picked, which means its own pixels are legitimately off the
  // ramp. They are listed as whole colours rather than as allowed channel
  // values: allowing the channels would let a genuinely unquantised 3D pixel
  // through on a coincidence, which is what the first version of this did.
  const HUD_COLOURS = new Set([
    TONES.darkest, // the text shadow, and the panels
    TONES.dark, // the panel borders and the star field
    TONES.light, // the streak counter
    TONES.lightest, // MONO's ink
    '248,248,240', // COLOR's ink
  ])
  const unquantised = Object.keys(colour).filter(
    (k) => !HUD_COLOURS.has(k) && k.split(',').some((ch) => ![0, 85, 170, 255].includes(Number(ch))),
  )
  check(
    'and COLOR is still quantised to four levels per channel',
    unquantised.length === 0,
    unquantised.length ? unquantised.join(' ') : 'every 3D pixel is on the ramp',
  )

  await hand.tap(ACT, paletteBtn.x, paletteBtn.y, 140)
  await page.waitForTimeout(300)
  check('and tapping it again comes back to MONO', (await state(page)).mono)

  // ------------------------------------------------- ending and restarting

  // Drive the run into the ground: tap at the far end of the travel, which is
  // past the edge of the slab below by construction.
  //
  // The second tap is the point: it models the thumb bouncing on the button
  // that just ended the run, which is exactly what the end screen's input lock
  // exists to absorb. Testing the lock by detecting the end and *then* tapping
  // does not work — the detection is a round trip, and by the time it lands
  // the half-second lock has often already expired, so the check passed the
  // press through and then failed on a run that had restarted.
  // Bounded by the clock, not by iterations. Each turn of this loop is a single
  // poll costing about ten milliseconds, while one sweep of the block takes
  // three seconds or more — so a forty-iteration cap never survived long
  // enough to see the block reach the far end at all, and the run was still
  // going when everything below it was measured.
  let ended = false
  let bounced = false
  const missDeadline = Date.now() + 20_000
  while (!ended && Date.now() < missDeadline) {
    const o = await offset(page)
    if (o === null) {
      ended = true
      break
    }
    if (Math.abs(o) > 0.95) {
      await hand.tap(ACT, c.A.x, c.A.y, 60)
      await hand.tap(ACT, c.A.x, c.A.y, 60)
      bounced = true
      await page.waitForTimeout(150)
      ended = (await state(page)).screen === 'over'
    }
  }
  const over = await state(page)
  check('missing the tower ends the run', over.screen === 'over', `screen=${over.screen}`)
  check('and the height reached is saved as the best', over.best === over.height,
    `best=${over.best}, height=${over.height}`)
  check(
    'a bounced press does not skip the end screen',
    bounced && over.screen === 'over',
    'shared/runSummary applies the same lock for the same reason',
  )

  await page.waitForTimeout(700)
  await hand.tap(ACT, c.A.x, c.A.y, 120)
  await page.waitForTimeout(400)
  const retried = await state(page)
  check('a tap after it retries', retried.screen === 'run', `screen=${retried.screen}`)
  check('and the retry starts from an empty tower', retried.height === 0)
  check('while the best is kept', retried.best === over.best, `best=${retried.best}`)

  // -------------------------------------------------------- the save survives

  const saved = over.best
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1200)
  check(
    'the best height survives a reload',
    (await state(page)).best === saved,
    `${(await state(page)).best} vs ${saved}`,
  )
  check(
    'and it is stored through shared/storage, envelope and all',
    await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('tower_stacker_save'))
        return raw && raw.v === 1 && typeof raw.d?.best === 'number' && raw.d.runs > 0
      } catch {
        return false
      }
    }),
    'the hub reads this key through shared/completion',
  )

  // ------------------------------------------------------- the 340px branch
  //
  // #109 asks for every viewport the shell supports, and shell.css shrinks the
  // d-pad to 132px below 340px so it does not collide with the action buttons.
  // The canvas is sized by the pre-init script, which is a different code path
  // from the one that ran at 390px.

  await page.setViewportSize({ width: 320, height: 720 })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1200)
  const narrowPad = await centreOf(page, '.d-pad')
  check('at 320px the d-pad takes its shrunk size', narrowPad.box.width === 132,
    `${narrowPad.box.width}px`)
  const narrowCv = await canvasSpace(page)
  check(
    'and the game still renders at an integer zoom of 160x144',
    Number.isInteger(narrowCv.box.width / 160) &&
      narrowCv.box.width / 160 === narrowCv.box.height / 144 &&
      narrowCv.box.width / 160 >= 1,
    `${narrowCv.box.width}x${narrowCv.box.height} — ${narrowCv.box.width / 160}x`,
  )
  const narrowControls = await controls(page)
  await hand.tap(ACT, narrowControls.A.x, narrowControls.A.y, 140)
  await page.waitForTimeout(400)
  check('and A still starts a run there', (await state(page)).screen === 'run')
  check(
    'with a block sliding',
    (await offset(page)) !== null,
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

/**
 * The same run again with reduced motion asked for.
 *
 * `shared/motion.ts` draws the line at decoration: the shake, the chip's spin
 * and the blinking prompt go, the slide and the camera's rise stay, because
 * those are the information the game runs on. What is checked here is that the
 * reduced path still plays — a branch that throws would take the game with it,
 * and nothing else in the suite exercises it.
 */
async function reducedMotion() {
  console.log('\n### tower-stacker, reduced motion ###\n')
  const t = await launchTouch(gameUrl('tower-stacker'))
  const { page, hand } = t
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('#game canvas')
  await page.waitForTimeout(1200)
  const c = await controls(page)

  check(
    'the page reports the preference',
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
  )

  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(400)
  for (let i = 0; i < 4; i++) {
    if ((await state(page)).screen !== 'run') break
    await tapWhenNearCentre(page, hand, c.A)
  }
  const s = await state(page)
  check('the game still plays with reduced motion', s.screen === 'run' && s.height >= 3,
    `height=${s.height}, screen=${s.screen}`)

  // The rise is not decoration. A player who asked for less motion still has
  // to be able to see how high the tower is, and the camera is how the game
  // says so — so it must still be tracking the top of the stack.
  check(
    'and the camera still follows the tower up',
    await page.evaluate(() => {
      const px = window.__game.readPixels()
      // The top slab sits near the middle of the frame whatever the height,
      // because the camera targets it. If the rise had been gated the tower
      // would have climbed out of the top of the frame by now.
      let lit = 0
      for (let y = 55; y <= 90; y++) {
        for (let x = 0; x < 160; x++) {
          const i = (y * 160 + x) * 4
          if (`${px[i]},${px[i + 1]},${px[i + 2]}` !== '15,56,15') lit++
        }
      }
      return lit > 300
    }),
    'the top of the stack is still framed',
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

await run()
await reducedMotion()
process.exit(ok ? 0 : 1)
