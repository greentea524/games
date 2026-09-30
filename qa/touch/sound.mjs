// The five Phaser games make a sound, and their mute stops it (#142).
//
// #136 gave the three standalone games a real sound check and left these five
// out. The probe was already listening to them — every game here synthesises
// through `ctx.destination`, none uses Phaser's sound manager, so `AUDIO_PROBE`
// hears them all — but nothing read it, and there was not even a label check.
// This is that blank filled in.
//
// ## The controls are not what #142 expected
//
// #142 describes five in-game menus with a Sound item, a cursor to drive in
// each. Only Static has one: `Sound: ON/OFF` in its pause overlay, which is an
// HTML button a finger can reach. The other four mute on the **M key and
// nothing else** — no menu item, no shell button, and no mention of M anywhere
// on screen. So on a phone, which is the device this directory drives, those
// four cannot be muted at all.
//
// That is a gap in the games, not in this check, and it is recorded rather
// than fixed here: adding a control to four menus is a design change, not a
// test. What this file can honestly check is that each game's real control
// does what it says, so the four are driven by M through the keyboard — the
// only way a player can reach it — and Static by a tap on its button.
//
// ## What is read
//
// Sound through the analyser, as #136 does. State through `window.__sound`,
// published by `exposeSoundForQA` under `?qa=1`: four of the five show their
// mute state nowhere, so without it "the control reports it off" would have
// nothing to read. Static's label is on screen and is read there instead,
// because what the player sees is the claim.
//
// `play` is a cursor move on a menu, which is audible in all five — measured
// at 0.013 to 0.022 against `AUDIBLE`'s 0.004 — and one sound effect, fired
// through `window.__sound.effect`, which each game hands over from its own
// `main.ts`. A mute has to stop every path a game makes sound through, so the
// check makes sound through more than one: in three of these the cursor alone
// is mostly music, and a mute that stopped the music and not the effects would
// have passed.
//
// ## Cart & Crate's effects have never made a sound
//
// Written down because this check reads green for it and the reason matters.
// Its effects are ZzFX, and the port in `cart-crate/audio.ts` has four faults,
// measured while writing this: `zzfx` passes `zzfxG`'s `[Z]` to `zzfxP`
// unspread, so every buffer is one sample long and that sample is NaN — every
// move, push, dock and win has always been silence. Spread it, and the next
// line replaces volume-times-envelope with a bare `Math.sin`, so each effect is
// a full-scale sine (a move at 0.49 RMS, the win clipping at 1.23). Fix that,
// and the amplitude line multiplies by the oscillator's running phase, which
// grows without bound. And the effects connect to `destination` directly,
// bypassing the master gain the mute turns down.
//
// Repairing that synth is choosing what seven sounds sound like, which is not
// a test's job, so it is left for its own issue. What this check hears for Cart
// & Crate today is its music, which the mute does stop. It still fires the
// game's real `playMove`, so the day the synth is repaired this check hears
// the effects too. Repaired with the bypass left in, they would sound through
// the mute — past the gain it turns down, straight into the analyser — and
// "nothing comes out of it" should go red. That is reasoned, not run: with
// the synth as it is there was no working effect to leak.
//
// The effect is handed over by the game rather than reached with `import()`:
// see `exposeSoundForQA` for the module-copy trap that cost a run.
import { launchTouch, gameUrl, checker, checkSound, controls, centreOf, ACT } from './driver.mjs'

const { check, finish } = checker()
let ok = true

/**
 * One cursor move, held long enough for Phaser to see it, then one of the
 * game's sound effects, then a listen.
 */
const play = (page) => async () => {
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(80)
  await page.keyboard.up('ArrowDown')
  await page.evaluate(() => window.__sound.effect())
  // A cycle of Cart & Crate's tune, not a moment of it. Its music has a rest
  // of about half a second every second and a half — measured in 250 ms
  // windows: 0.018 0.013 0.015 0.012 0.002 0.000, and round again — and it is
  // the only sound that game really makes. At 500 ms a listen could land in
  // the rest: a mute that left the gain alone read 3.2e-3 and passed.
  await page.waitForTimeout(1500)
}

/** The state the game holds, as the label for a game that shows none. */
const mutedState = (page) => () =>
  page.evaluate(() => (window.__sound ? (window.__sound.muted() ? 'muted' : 'sounding') : 'no handle'))

/** M, held across a frame: Phaser's key events are processed on its update. */
const pressM = (page) => async () => {
  await page.keyboard.down('KeyM')
  await page.waitForTimeout(80)
  await page.keyboard.up('KeyM')
  await page.waitForTimeout(80)
}

async function run(name, drive) {
  console.log(`\n### sound: ${name} ###\n`)
  const t = await launchTouch(gameUrl(name))
  try {
    await t.page.waitForSelector('canvas')
    await t.page.waitForTimeout(1500)
    const named = (label, pass, note) => check(`${name}: ${label}`, pass, note)
    await drive(t, named)
  } finally {
    await t.browser.close()
  }
  if (!finish(t.log)) ok = false
}

// Static: the one game whose mute a finger can reach. Into the world from a
// seeded save, START for the pause overlay, and a tap on the Sound button.
await run('static', async ({ page, hand }, named) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'static_save',
      JSON.stringify({
        v: 1,
        d: { chapter: 1, flags: {}, inventory: [], itemsFound: [], world: 'normal', mapKey: 'town', tx: 15, ty: 9 },
      }),
    ),
  )
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2400)
  const c = await controls(page)
  await hand.tap(ACT, c.A.x, c.A.y, 140) // CONTINUE
  await page.waitForTimeout(2000)
  const START = await centreOf(page, '#btn-start')
  await hand.tap(ACT, START.x, START.y, 140)
  await page.waitForTimeout(700)
  const button = '#pause-item-4'
  named('the pause overlay has a Sound item', await page.evaluate((b) => /Sound: (ON|OFF)/.test(document.querySelector(b)?.textContent ?? ''), button))
  await checkSound({
    page,
    check: named,
    play: play(page),
    // The label is what the player reads. The selection marker "> " comes and
    // goes as the cursor moves, so only the state word is compared.
    label: () => page.evaluate((b) => document.querySelector(b)?.textContent.match(/ON|OFF/)?.[0], button),
    toggle: async () => {
      const p = await centreOf(page, button)
      await hand.tap(ACT, p.x, p.y, 120)
    },
  })
})

// The other four: M on the title menu, the only mute any of them has.
for (const name of ['windup', 'lantern-keeper', 'pocket-dungeon', 'cart-crate']) {
  await run(name, async ({ page }, named) => {
    named('publishes its mute state and an effect for this check', await page.evaluate(() => typeof window.__sound?.muted === 'function' && typeof window.__sound?.effect === 'function'))
    await checkSound({ page, check: named, play: play(page), label: mutedState(page), toggle: pressM(page) })
  })
}

process.exit(ok ? 0 : 1)
