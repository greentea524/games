// Touch coverage for the two grid movers (#97).
//
// Neither of these is driven by the d-pad alone. Cart & Crate reads a swipe
// anywhere on the canvas, and Pocket Dungeon takes both a swipe *and* a tap on
// an adjacent tile. Those are canvas gestures rather than DOM buttons, so
// nothing the keyboard suites do touches them.
import { launchTouch, centreOf, controls, gameUrl, checker, ACT } from './driver.mjs'

const { check, finish } = checker()
let ok = true

/** Game space is 160x144; the canvas is scaled up to fit the shell. */
async function canvasSpace(page) {
  const box = (await centreOf(page, 'canvas')).box
  const scale = box.width / 160
  return {
    box,
    scale,
    /** Game-space point -> client point. */
    at: (gx, gy) => ({ x: box.x + gx * scale, y: box.y + gy * scale }),
  }
}

// ----------------------------------------------------------- Cart & Crate

async function cartCrate() {
  console.log('\n### cart-crate ###\n')
  const t = await launchTouch(gameUrl('cart-crate'))
  const { page, hand } = t
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2500)
  const c = await controls(page)

  // mainmenu -> levelselect -> board. Both confirm on Z.
  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(1200)
  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(1800)

  const cv = await canvasSpace(page)
  const st = () =>
    page.evaluate(() => {
      const s = window.__game.scene.getScene('board')
      return {
        active: s.scene.isActive(),
        tx: s.playerTX,
        ty: s.playerTY,
        moving: s.isMoving,
        facing: s.facing,
      }
    })

  check('A reaches the board from the menus', (await st()).active)

  // A swipe is pointerdown -> drag -> pointerup, compared in game space with
  // a 15px minimum. Swiping from the board centre keeps the gesture on the
  // canvas whichever way it goes.
  const swipe = async (dx, dy) => {
    const from = cv.at(80, 72)
    await hand.down(ACT, from.x, from.y)
    // Several moves, so this is a drag rather than a teleport — the handler
    // only reads the endpoints, but a real thumb produces the intermediate
    // ones and a future gesture recogniser would need them.
    for (let i = 1; i <= 4; i++) {
      await hand.move(ACT, from.x + (dx * cv.scale * i) / 4, from.y + (dy * cv.scale * i) / 4)
      await page.waitForTimeout(25)
    }
    await hand.up(ACT)
    await page.waitForTimeout(450)
  }

  // Try each direction and record which ones actually moved the player. The
  // level's walls and crates mean not every direction is open from wherever
  // the player starts, so this asserts on the facing (always set) and on at
  // least one axis of travel, rather than demanding four successful moves
  // from a layout that may not allow them.
  const moves = []
  for (const [name, dx, dy] of [
    ['right', 40, 0],
    ['down', 0, 40],
    ['left', -40, 0],
    ['up', 0, -40],
  ]) {
    const before = await st()
    await swipe(dx, dy)
    const after = await st()
    moves.push({ name, before, after, moved: after.tx !== before.tx || after.ty !== before.ty })
    check(`swiping ${name} is read as ${name}`, after.facing === name, `facing ${after.facing}`)
  }
  check(
    'at least one swipe actually moved the player',
    moves.some((m) => m.moved),
    moves.map((m) => `${m.name}:${m.moved ? 'moved' : 'blocked'}`).join(' '),
  )

  // A tap that does not travel far enough must not move anything. 15px in
  // game space is ~37 client px here, so a 10px client wobble is well under.
  const beforeTap = await st()
  const p = cv.at(80, 72)
  await hand.down(ACT, p.x, p.y)
  await hand.move(ACT, p.x + 10, p.y)
  await hand.up(ACT)
  await page.waitForTimeout(400)
  const afterTap = await st()
  check(
    'a tap below the swipe threshold does not move the player',
    afterTap.tx === beforeTap.tx && afterTap.ty === beforeTap.ty,
    `${beforeTap.tx},${beforeTap.ty} -> ${afterTap.tx},${afterTap.ty}`,
  )

  // #66's regression, which only touch can produce. Level 1's solution is
  // RRRR, and the four probe swipes above walk a square back to the start
  // tile, so the level is still winnable from here.
  //
  // The bug: the summary dismisses on pointerdown, and the matching pointerup
  // — same tap, milliseconds later — used to find the gate already cleared
  // and run the advance-on-any-input path on top of the fade, clearing two
  // levels from one press. A keyboard never sees it, because Z produces no
  // pointerup.
  const atStart = await st()
  if (atStart.tx !== 2 || atStart.ty !== 2) {
    check('level 1 is back at its start tile', false, `player at ${atStart.tx},${atStart.ty}`)
  } else {
    const level = () =>
      page.evaluate(() => {
        const s = window.__game.scene.getScene('board')
        return {
          crates: s.crates.filter((c) => !c.destroyed).length,
          targets: s.floorGrid.flat().filter((c) => c === 'T').length,
          summaryOpen: s.summaryOpen,
        }
      })
    for (let i = 0; i < 4; i++) await swipe(40, 0)
    // 3 bounces of 150ms yoyo, then the panel, then its 400ms input lock.
    await page.waitForTimeout(2000)
    check('winning a level opens the run summary', (await level()).summaryOpen)
    check(
      'the summary prompt reads for touch, not for a keyboard',
      await page.evaluate(() =>
        window.__game.scene
          .getScene('board')
          .children.list.some((o) => o.type === 'Text' && o.text === 'Tap to continue'),
      ),
      'shared/runSummary picks this off (hover: hover) and (pointer: fine)',
    )

    const p2 = cv.at(80, 72)
    await hand.tap(ACT, p2.x, p2.y, 120)
    await page.waitForTimeout(2500) // 400ms fade, then the scene restart

    // Level 1 has one crate and one target; level 2 has two of each; level 3
    // is back to one. So the crate count separates "advanced once" from
    // "advanced twice" without depending on a level index the page does not
    // publish.
    const after = await level()
    check(
      'dismissing the summary by tap advances exactly one level',
      after.crates === 2 && after.targets === 2,
      `next level has ${after.crates} crate(s) and ${after.targets} target(s); level 2 has 2 of each, level 3 has 1`,
    )
  }

  ok = finish(t.log) && ok
  await t.browser.close()
}

// --------------------------------------------------------- Pocket Dungeon

async function pocketDungeon() {
  console.log('\n### pocket-dungeon ###\n')
  const t = await launchTouch(gameUrl('pocket-dungeon'))
  const { page, hand } = t
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2500)
  const c = await controls(page)

  await hand.tap(ACT, c.A.x, c.A.y, 140) // START RUN
  await page.waitForTimeout(2000)

  const st = () =>
    page.evaluate(() => {
      const s = window.__game.scene.getScene('dungeon')
      return {
        active: s.scene.isActive(),
        tx: s.playerTX,
        ty: s.playerTY,
        facing: s.facing,
        w: s.mapWidth,
        h: s.mapHeight,
      }
    })

  check('A starts a run', (await st()).active)

  // Find a direction that is open, so the movement checks assert on a move
  // that the level actually permits.
  const openDir = await page.evaluate(() => {
    const s = window.__game.scene.getScene('dungeon')
    // `grid` is an array of strings, one per row, indexed [y][x].
    const grid = s.grid
    const dirs = [
      ['right', 1, 0],
      ['left', -1, 0],
      ['down', 0, 1],
      ['up', 0, -1],
    ]
    for (const [name, dx, dy] of dirs) {
      const nx = s.playerTX + dx
      const ny = s.playerTY + dy
      if (nx < 0 || ny < 0 || nx >= s.mapWidth || ny >= s.mapHeight) continue
      const tile = grid?.[ny]?.[nx]
      if (tile === undefined || tile === '#') continue
      return { name, dx, dy }
    }
    return null
  })

  if (!openDir) {
    check('an open neighbouring tile was found', false, 'could not read the floor grid')
  } else {
    // D-pad first.
    const before = await st()
    const armFor = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown' }[
      openDir.name
    ]
    await hand.tap(ACT, c.arm(armFor).x, c.arm(armFor).y, 140)
    await page.waitForTimeout(700)
    const afterPad = await st()
    check(
      'the d-pad moves the player one tile',
      afterPad.tx === before.tx + openDir.dx && afterPad.ty === before.ty + openDir.dy,
      `${before.tx},${before.ty} -> ${afterPad.tx},${afterPad.ty} (${openDir.name})`,
    )

    // Then tap-to-move: Pocket Dungeon *does* have this, unlike Static.
    // A tap on an adjacent tile steps onto it.
    const cv = await canvasSpace(page)
    const target = await page.evaluate(
      ([dx, dy]) => {
        const s = window.__game.scene.getScene('dungeon')
        const TILE = 16
        const wx = (s.playerTX + dx) * TILE + TILE / 2
        const wy = (s.playerTY + dy) * TILE + TILE / 2
        // World -> screen, since the camera follows the player.
        const cam = s.cameras.main
        return { x: wx - cam.scrollX, y: wy - cam.scrollY, tx: s.playerTX + dx, ty: s.playerTY + dy }
      },
      [-openDir.dx, -openDir.dy], // step back the way we came: known open
    )
    const beforeTap = await st()
    const pt = cv.at(target.x, target.y)
    await hand.tap(ACT, pt.x, pt.y, 100)
    await page.waitForTimeout(700)
    const afterTap = await st()
    check(
      'tapping an adjacent tile steps onto it',
      afterTap.tx === target.tx && afterTap.ty === target.ty,
      `${beforeTap.tx},${beforeTap.ty} -> ${afterTap.tx},${afterTap.ty}, wanted ${target.tx},${target.ty}`,
    )
  }

  // The game-over panel. Reaching it by play would take a full run, so the
  // scene is started directly — what is under test is that the panel responds
  // to a touch, not the route to it.
  await page.evaluate(() => {
    const g = window.__game
    g.scene.stop('dungeon')
    g.scene.start('gameover', { victory: false })
  })
  await page.waitForTimeout(1500)
  check(
    'the game over screen comes up',
    await page.evaluate(() => window.__game.scene.isActive('gameover')),
  )

  // The shared panel ignores input for its first 400ms (inputLockMs), so a
  // key or thumb already down when the run ended cannot skip it.
  const cv2 = await canvasSpace(page)
  const mid = cv2.at(80, 100)
  await page.waitForTimeout(600)
  await hand.tap(ACT, mid.x, mid.y, 140)
  await page.waitForTimeout(1500)
  // Only the canvas tap — pressing A as well would confirm START RUN on the
  // title it just returned to, and the run that started would look like the
  // panel never dismissed.
  check(
    'the run summary dismisses on a canvas tap',
    await page.evaluate(() => window.__game.scene.isActive('title')),
  )

  ok = finish(t.log) && ok
  await t.browser.close()
}

await cartCrate()
await pocketDungeon()
process.exit(ok ? 0 : 1)
