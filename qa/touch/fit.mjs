// The picture fits the screen it is drawn in (#183).
//
// Three of the five games size their canvas with Phaser's FIT mode, which
// measures #game's whole box, border and padding included. The canvas came out
// 60px wider than the space inside, and `overflow: hidden` cut 15px off each
// side on every device: between 6 and 12 game pixels, half a tile on a short
// phone. It was there for the life of the shell and nothing looked for it,
// because every check places its taps from the canvas's own box, and every
// screenshot was clipped to that box too.
//
// So this measures what a player can see: the canvas against the space inside
// #game's border and padding. It is run at the suite's phone size and at a
// short one, where the crop was at its worst.
import { launchTouch, gameUrl, checker } from './driver.mjs'

const { check, finish } = checker()
const GAMES = ['static', 'windup', 'lantern-keeper', 'pocket-dungeon', 'cart-crate']
const SIZES = [undefined, { width: 390, height: 664 }]

/** How far the canvas runs past the space inside #game, on each side, in CSS pixels. */
const overhang = (page) =>
  page.evaluate(() => {
    const game = document.querySelector('#game')
    const canvas = game.querySelector('canvas')
    const g = game.getBoundingClientRect()
    const c = canvas.getBoundingClientRect()
    const cs = getComputedStyle(game)
    const px = (v) => parseFloat(v) || 0
    // The padding box: what `overflow: hidden` leaves visible.
    const left = g.left + px(cs.borderLeftWidth)
    const right = g.right - px(cs.borderRightWidth)
    const top = g.top + px(cs.borderTopWidth)
    const bottom = g.bottom - px(cs.borderBottomWidth)
    return {
      left: left - c.left, right: c.right - right, top: top - c.top, bottom: c.bottom - bottom,
      canvas: `${Math.round(c.width)}x${Math.round(c.height)}`,
    }
  })

for (const name of GAMES) {
  for (const viewport of SIZES) {
    const t = await launchTouch(gameUrl(name), viewport ? { viewport } : {})
    await t.page.waitForSelector('#game canvas')
    await t.page.waitForTimeout(1500)
    const o = await overhang(t.page)
    const worst = Math.max(o.left, o.right, o.top, o.bottom)
    check(
      `${name}: the whole picture is inside the screen${viewport ? `, at ${viewport.width}x${viewport.height}` : ''}`,
      worst <= 0.5,
      worst <= 0.5 ? `canvas ${o.canvas}, nothing hidden` : `canvas ${o.canvas}, ${worst.toFixed(1)}px hidden at an edge`,
    )
    await t.browser.close()
  }
}

// The control: take the rule away, and the check must see the crop come back.
{
  const t = await launchTouch(gameUrl('pocket-dungeon'))
  await t.page.waitForSelector('#game canvas')
  await t.page.waitForTimeout(1500)
  await t.page.addStyleTag({ content: '#game canvas { max-width: none !important; max-height: none !important; }' })
  await t.page.waitForTimeout(200)
  const o = await overhang(t.page)
  check('and the check can fail: without the rule, the edges are hidden again', Math.max(o.left, o.right) > 5, `${Math.max(o.left, o.right).toFixed(1)}px a side`)
  await t.browser.close()
}

process.exit(finish() ? 0 : 1)
