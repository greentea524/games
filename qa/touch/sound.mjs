// The five Phaser games make a sound, and their mute stops it (#142).
//
// #136 gave the three standalone games a real sound check and left these five
// out. The probe was already listening to them — every game here synthesises
// through `ctx.destination`, none uses Phaser's sound manager, so `AUDIO_PROBE`
// hears them all — but nothing read it, and there was not even a label check.
// This is that blank filled in.
//
// ## Every control is reached by touch
//
// When #142 wrote this, only Static's mute could be reached by a finger —
// `Sound: ON/OFF` in its pause overlay. The other four muted on the M key and
// nothing else, so on a phone they could not be muted at all, and this file
// drove M because it was all they had.
//
// #143 gave each a Sound item a phone can reach, and every game here is now
// driven through it with taps: START and the d-pad into Windup's pause scene,
// START into Lantern Keeper's overlay and Cart & Crate's pause panel, and the
// title menu in Pocket Dungeon, which has no pause menu. M still works on a
// keyboard and is named in each game's on-screen controls where it has them.
//
// The label is read as well as the sound, and held to the state: a label that
// flips without muting passes "the control reports it off" — it is exactly
// what a label check always measured — and fails "its label is never wrong".
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

// The other four, through the controls #143 gave them — each reached the way a
// phone player reaches it, with taps on the shell and on the screen. Until
// #143 their only mute was the M key, which a phone does not have.

/** Taps the centre of a game object, located in the 160-wide game space. */
async function tapObject(page, hand, locate) {
  const g = await page.evaluate(locate)
  if (!g) throw new Error('the control to tap is not on screen')
  const box = (await centreOf(page, 'canvas')).box
  const scale = box.width / 160
  await hand.tap(ACT, box.x + g.x * scale, box.y + g.y * scale)
  await page.waitForTimeout(150)
}

/**
 * The label a player reads, paired with the state the game holds — and a
 * record of every reading where the two disagreed. `checkSound` asserts the
 * label changes; this asserts it changes *to the truth*, which a toggle that
 * flips the word and not the mute, or the mute and not the word, both fail.
 */
function honestLabel(page, read) {
  const lies = []
  const label = async () => {
    const word = await read()
    const muted = await page.evaluate(() => window.__sound.muted())
    if ((word === 'OFF') !== muted) lies.push(`${word} while ${muted ? 'muted' : 'sounding'}`)
    return word
  }
  return { label, lies }
}

const DRIVES = {
  // Windup: START in a level opens its pause scene; SOUND is the second row,
  // reached with the d-pad and taken with A.
  async windup({ page, hand }, named) {
    const c = await controls(page)
    const START = await centreOf(page, '#btn-start')
    await hand.tap(ACT, START.x, START.y, 140) // START on the title starts a level
    await page.waitForTimeout(1500)
    await hand.tap(ACT, START.x, START.y, 140) // and in a level, pauses it
    await page.waitForTimeout(600)
    const paused = await page.evaluate(() => window.__game.scene.isActive('pause'))
    named('START opens the pause menu', paused)
    const pause = () => page.evaluate(() => {
      const p = window.__game.scene.getScene('pause')
      return { index: p.selectedIndex, items: p.menuItems, word: p.menuTexts[p.menuItems.indexOf('SOUND')]?.text.match(/ON|OFF/)?.[0] }
    })
    named('and it has a SOUND item', (await pause()).items.includes('SOUND'), (await pause()).items.join(' / '))
    const { label, lies } = honestLabel(page, async () => (await pause()).word)
    await checkSound({
      page,
      check: named,
      play: play(page),
      label,
      toggle: async () => {
        // `play` moves the cursor, so walk it back to SOUND with the d-pad.
        for (let i = 0; i < 4; i++) {
          const p = await pause()
          if (p.items[p.index] === 'SOUND') break
          await hand.tap(ACT, c.arm('ArrowDown').x, c.arm('ArrowDown').y, 90)
          await page.waitForTimeout(150)
        }
        await hand.tap(ACT, c.A.x, c.A.y, 120)
        await page.waitForTimeout(150)
      },
    })
    named('and its label is never wrong', lies.length === 0, lies.join('; ') || 'matched the state at every reading')
  },

  // Lantern Keeper: A starts a game, START opens the HTML pause overlay, and
  // Sound is a button on it.
  async 'lantern-keeper'({ page, hand }, named) {
    const c = await controls(page)
    await hand.tap(ACT, c.A.x, c.A.y, 140)
    await page.waitForTimeout(2000)
    const START = await centreOf(page, '#btn-start')
    await hand.tap(ACT, START.x, START.y, 140)
    await page.waitForTimeout(600)
    const button = '#btn-pause-sound'
    named('START opens the pause overlay, with a Sound button', await page.evaluate((b) => !!document.querySelector(b), button))
    const { label, lies } = honestLabel(page, () =>
      page.evaluate((b) => document.querySelector(b)?.textContent.match(/ON|OFF/)?.[0], button),
    )
    await checkSound({
      page,
      check: named,
      play: play(page),
      label,
      toggle: async () => {
        const p = await centreOf(page, button)
        await hand.tap(ACT, p.x, p.y, 120)
        await page.waitForTimeout(150)
      },
    })
    named('and its label is never wrong', lies.length === 0, lies.join('; ') || 'matched the state at every reading')
  },

  // Pocket Dungeon has no pause menu, so its SOUND is on the title, between
  // runs — tapped there.
  async 'pocket-dungeon'({ page, hand }, named) {
    const row = () => page.evaluate(() => {
      const t = window.__game.scene.getScene('title')
      return t.menuItems[2]?.text.match(/ON|OFF/)?.[0]
    })
    named('the title has a SOUND row', !!(await row()))
    const { label, lies } = honestLabel(page, row)
    await checkSound({
      page,
      check: named,
      play: play(page),
      label,
      toggle: () =>
        tapObject(page, hand, () => {
          const b = window.__game.scene.getScene('title').menuItems[2].getBounds()
          return { x: b.centerX, y: b.centerY }
        }),
    })
    named('and its label is never wrong', lies.length === 0, lies.join('; ') || 'matched the state at every reading')
  },

  // Cart & Crate: START on the title, A on the level select, START on the
  // board for the pause panel, and a tap on its sixth row.
  async 'cart-crate'({ page, hand }, named) {
    const c = await controls(page)
    const START = await centreOf(page, '#btn-start')
    await hand.tap(ACT, START.x, START.y, 140)
    await page.waitForTimeout(1200)
    await hand.tap(ACT, c.A.x, c.A.y, 140)
    await page.waitForTimeout(1500)
    await hand.tap(ACT, START.x, START.y, 140)
    await page.waitForTimeout(600)
    const open = await page.evaluate(() => window.__game.scene.getScene('ui').pauseOpen)
    named('START on a board opens the pause panel', open)
    const row = () => page.evaluate(() => {
      const t = window.__game.scene.getScene('ui').pauseOptionsText[5]
      return t?.text.match(/SOUND: (ON|OFF)/)?.[1]
    })
    named('and it has a SOUND row', !!(await row()))
    const { label, lies } = honestLabel(page, row)
    await checkSound({
      page,
      check: named,
      play: play(page),
      label,
      toggle: () =>
        tapObject(page, hand, () => {
          const b = window.__game.scene.getScene('ui').pauseOptionsText[5].getBounds()
          return { x: b.centerX, y: b.centerY }
        }),
    })
    named('and its label is never wrong', lies.length === 0, lies.join('; ') || 'matched the state at every reading')
  },
}

for (const name of ['windup', 'lantern-keeper', 'pocket-dungeon', 'cart-crate']) {
  await run(name, async (t, named) => {
    named('publishes its mute state, an effect and a way to stop its music', await t.page.evaluate(() => ['muted', 'effect', 'silence'].every((k) => typeof window.__sound?.[k] === 'function')))
    await DRIVES[name](t, named)
  })
}

process.exit(ok ? 0 : 1)
