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
// ## The effect is also heard alone
//
// Cart & Crate's effects never made a sound until #144 — its ZzFX port built a
// one-sample NaN buffer — and every check here read green for it, because a
// listen that includes music cannot tell a silent effect from a working one.
// So at the end of each game's run, its music is stopped through
// `window.__sound.silence`, the room is confirmed silent, and the effect is
// fired alone and must be heard.
//
// The first version of this measured on the title "before any input", where
// four of the five are silent, and it was wrong in the way it was meant to
// catch: the first effect call resumes the context, and the menu music queued
// at load starts with it. Against `main`'s silent ZzFX it read 0.0179 — the
// music's first note — and passed. Stopping the music is the only way to know
// what is being heard.
//
// The effect is handed over by the game rather than reached with `import()`:
// see `exposeSoundForQA` for the module-copy trap that cost a run.
import {
  launchTouch,
  gameUrl,
  checker,
  checkSound,
  controls,
  centreOf,
  ACT,
  AUDIBLE,
  audioPeak,
  resetAudio,
} from './driver.mjs'

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

/**
 * The game's effect, heard by itself (#144): the music stopped, the notes it
 * had already scheduled let finish, the room confirmed silent, then the effect.
 */
async function effectAlone(page, named) {
  await page.evaluate(() => window.__sound.silence())
  // A track schedules a quarter-second ahead and its longest note is about
  // 0.6 s, so this outlasts anything it had queued.
  await page.waitForTimeout(1500)
  await resetAudio(page)
  await page.waitForTimeout(600)
  const background = await audioPeak(page)
  named(
    'its music can be stopped, for the next check',
    background.peak < AUDIBLE,
    `peak ${background.peak.toFixed(4)} with the music stopped, floor ${AUDIBLE}`,
  )
  await resetAudio(page)
  await page.evaluate(() => window.__sound.effect())
  await page.waitForTimeout(600)
  const alone = await audioPeak(page)
  named(
    'its effect is audible on its own',
    alone.peak >= AUDIBLE,
    `peak ${alone.peak.toFixed(4)}, nothing else playing, floor ${AUDIBLE}`,
  )
}

async function run(name, drive) {
  console.log(`\n### sound: ${name} ###\n`)
  const t = await launchTouch(gameUrl(name))
  try {
    await t.page.waitForSelector('canvas')
    await t.page.waitForTimeout(1500)
    const named = (label, pass, note) => check(`${name}: ${label}`, pass, note)
    await drive(t, named)
    await effectAlone(t.page, named)
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
    named('publishes its mute state, an effect and a way to stop its music', await page.evaluate(() => ['muted', 'effect', 'silence'].every((k) => typeof window.__sound?.[k] === 'function')))
    await checkSound({ page, check: named, play: play(page), label: mutedState(page), toggle: pressM(page) })
  })
}

process.exit(ok ? 0 : 1)
