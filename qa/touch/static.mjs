// Touch coverage for Static (#97).
//
// Static is the odd one out: the d-pad turns as well as walks, the A button
// both talks to people and advances the box, and a dialogue choice is picked
// by tapping the option *on the canvas* rather than with a control. That last
// one is the only place in any of the five games where the canvas itself is a
// touch target, so it is the one most likely to rot unnoticed.
import { launchTouch, centreOf, controls, gameUrl, checker, ACT } from './driver.mjs'

const { check, finish } = checker()

const t = await launchTouch(gameUrl('static'))
const { page, hand } = t

// Seed a save mid-story, standing one tile below Gus. Reaching this state by
// playing would duplicate what static/qa/playthrough.mjs already does; what is
// under test here is the input path, so the position is given.
await page.evaluate(() =>
  localStorage.setItem(
    'static_save',
    JSON.stringify({
      v: 1,
      d: {
        chapter: 2,
        flags: { got_flashlight: 1, baker_vanished: 1, heard_about_house: 1 },
        inventory: ['flashlight'],
        itemsFound: ['flashlight'],
        world: 'normal',
        mapKey: 'town',
        tx: 15,
        ty: 9,
      },
    }),
  ),
)
await page.reload({ waitUntil: 'load' })
await page.waitForSelector('canvas')
await page.waitForTimeout(2400)

const c = await controls(page)
const SELECT = await centreOf(page, '#btn-select')
const START = await centreOf(page, '#btn-start')

const ui = () =>
  page.evaluate(() => {
    const g = window.__game
    const u = g.scene.getScene('ui')
    const w = g.scene.getScene('world')
    return {
      map: w.mapKey,
      facing: w.facing,
      dialogue: u.box.visible,
      speaker: u.nameText.text,
      body: u.bodyText.text,
      choice: u.choiceMode,
      inv: u.inv.visible,
    }
  })

await hand.tap(ACT, c.A.x, c.A.y, 140) // CONTINUE
await page.waitForTimeout(2000)
check('A reaches the world from the title', (await ui()).map === 'town')

// Gus is on the tile directly above, so a tap up turns rather than walks.
await hand.tap(ACT, c.arm('ArrowUp').x, c.arm('ArrowUp').y, 90)
await page.waitForTimeout(300)
check('the d-pad turns the player', (await ui()).facing === 'up')

await hand.tap(ACT, c.A.x, c.A.y, 140)
await page.waitForTimeout(500)
let s = await ui()
check('A opens dialogue with an NPC', s.dialogue, `${s.speaker}: ${s.body?.slice(0, 30)}`)

for (let i = 0; i < 6 && !(await ui()).choice; i++) {
  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(450)
}
s = await ui()
check('A advances dialogue to a choice', s.choice, s.body?.slice(0, 40))

// Pick the second option by tapping the text where it is drawn. Game space is
// 160px wide, so the canvas box gives the scale.
const opt = await page.evaluate(() => {
  const o = window.__game.scene.getScene('ui').choiceTexts[1]
  return o?.visible ? { x: o.x, y: o.y } : null
})
if (!opt) {
  check('a choice can be picked by tapping it', false, 'choice texts not visible')
} else {
  const cb = (await centreOf(page, 'canvas')).box
  const scale = cb.width / 160
  await hand.tap(ACT, cb.x + opt.x * scale, cb.y + opt.y * scale, 140)
  await page.waitForTimeout(700)
  const flags = await page.evaluate(() => JSON.parse(localStorage.getItem('static_save')).d.flags)
  check(
    'a choice can be picked by tapping it',
    !!(flags.skeptic || flags.believer),
    `believer=${!!flags.believer} skeptic=${!!flags.skeptic}`,
  )
}

for (let i = 0; i < 12 && (await ui()).dialogue; i++) {
  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(400)
}

await hand.tap(ACT, SELECT.x, SELECT.y, 140)
await page.waitForTimeout(600)
check('SELECT opens the inventory', (await ui()).inv)

await hand.tap(ACT, c.B.x, c.B.y, 140)
await page.waitForTimeout(600)
check('B closes the inventory', !(await ui()).inv)

await hand.tap(ACT, START.x, START.y, 140)
await page.waitForTimeout(700)
check(
  'START opens the pause overlay',
  await page.evaluate(() => !document.getElementById('overlay').classList.contains('hidden')),
)

// The interact prompt over an NPC's head is labelled off
// `(hover: hover) and (pointer: fine)` — 'Z' on a desktop, 'A' on a phone,
// matching the button the player can actually see. This is the only one of
// the hover-dependent strings that is drawn into the game rather than into
// the DOM, so nothing else would catch it flipping.
check(
  'the interact prompt is labelled for the on-screen button',
  await page.evaluate(() => {
    const w = window.__game.scene.getScene('world')
    const labels = []
    w.children.list.forEach((o) => {
      if (o.type === 'Container') o.list?.forEach((k) => k.type === 'Text' && labels.push(k.text))
      if (o.type === 'Text') labels.push(o.text)
    })
    // Positive *and* negative: asserting only the absence of 'Z' would pass
    // just as happily if the traversal never found the prompt at all.
    return { labels, ok: labels.includes('A') && !labels.includes('Z') }
  }).then((r) => r.ok),
  "a phone has no Z key, so the prompt reads 'A'",
)

const ok = finish(t.log)
await t.browser.close()
process.exit(ok ? 0 : 1)
