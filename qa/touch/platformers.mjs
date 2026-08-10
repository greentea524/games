// Touch coverage for the two platformers (#97).
//
// The cases worth automating here are the ones a single contact cannot reach.
// A platformer is played with a direction *held* while a second finger taps
// jump or dash, and Lantern Keeper's wall cling reads `cursors.left.isDown`
// every frame while the body is against a wall — so a held arrow has to
// survive both the second contact landing and it lifting again.
import { launchTouch, centreOf, controls, gameUrl, checker, PAD, ACT } from './driver.mjs'

const { check, finish } = checker()
let ok = true

// ---------------------------------------------------------------- Windup

async function windup() {
  console.log('\n### windup ###\n')
  const t = await launchTouch(gameUrl('windup'))
  const { page, hand } = t
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2500)
  const c = await controls(page)

  await hand.tap(ACT, c.A.x, c.A.y, 140) // menu -> play
  await page.waitForTimeout(2500)

  const st = () =>
    page.evaluate(() => {
      const s = window.__game.scene.getScene('platformer')
      const p = s.player
      return {
        active: s.scene.isActive(),
        x: p.x,
        vx: p.body.velocity.x,
        vy: p.body.velocity.y,
      }
    })

  const start = await st()
  check('A starts the game', start.active, `player at x=${start.x | 0}`)

  await hand.down(PAD, c.arm('ArrowRight').x, c.arm('ArrowRight').y)
  await page.waitForTimeout(600)
  const moved = await st()
  check('holding the d-pad moves the player', moved.x - start.x > 8, `${(moved.x - start.x).toFixed(1)}px`)

  // #68's safety property, asserted here because this is where a driven Windup
  // already exists. The spring now scales movement continuously, and the whole
  // reason that was safe to land against 32 levels tuned for constant speed is
  // that a full spring still runs at exactly the old speed. If that drifts,
  // every level's jumps get retuned by accident.
  // Tolerance is 4 rather than 1: the toy has been walking for 600ms by now
  // and has burnt a little spring, so it reads slightly under 80.
  check(
    'a full spring still runs at the original 80 px/s',
    Math.abs(Math.abs(moved.vx) - 80) < 4,
    `vx ${Math.abs(moved.vx).toFixed(1)}`,
  )

  // Second finger on A while the first stays put.
  await hand.down(ACT, c.A.x, c.A.y)
  await page.waitForTimeout(120)
  const mid = await st()
  check('A jumps while a direction is held', mid.vy < -60, `vy ${mid.vy.toFixed(0)}`)
  check('the held direction survives the second touch', mid.vx > 0, `vx ${mid.vx.toFixed(0)}`)

  await hand.up(ACT)
  await page.waitForTimeout(200)
  check('releasing A leaves the direction held', (await st()).vx > 0)

  await hand.up(PAD)
  await page.waitForTimeout(300)
  check('releasing the d-pad stops the player', Math.abs((await st()).vx) < 1)

  // And the other half of #68: a run-down spring is slower. Holding a
  // direction burns 8/s, so a few seconds is plenty to see the curve move.
  await hand.down(PAD, c.arm('ArrowLeft').x, c.arm('ArrowLeft').y)
  await page.waitForTimeout(4000)
  const drained = await st()
  await hand.release()
  await page.waitForTimeout(200)
  check(
    'a run-down spring moves slower than a full one',
    Math.abs(drained.vx) < 78 && Math.abs(drained.vx) >= 44,
    `vx ${Math.abs(drained.vx).toFixed(1)} (floor is 0.55 x 80 = 44)`,
  )

  // Roll the thumb across the pad without lifting — the case setupDpad exists
  // for.
  await hand.down(PAD, c.arm('ArrowRight').x, c.arm('ArrowRight').y)
  await page.waitForTimeout(300)
  await hand.move(PAD, c.arm('ArrowLeft').x, c.arm('ArrowLeft').y)
  await page.waitForTimeout(400)
  check('a thumb roll reverses direction without lifting', (await st()).vx < 0)
  await hand.release()
  await page.waitForTimeout(200)

  const start_ = await centreOf(page, '#btn-start')
  const paused = () => page.evaluate(() => window.__game.scene.isActive('pause'))
  await hand.tap(ACT, start_.x, start_.y, 140)
  await page.waitForTimeout(600)
  check('START pauses', await paused())
  await hand.tap(ACT, start_.x, start_.y, 140)
  await page.waitForTimeout(600)
  check('START confirms RESUME and unpauses', !(await paused()))

  ok = finish(t.log) && ok
  await t.browser.close()
}

// -------------------------------------------------------- Lantern Keeper

async function lanternKeeper() {
  console.log('\n### lantern-keeper ###\n')
  const t = await launchTouch(gameUrl('lantern-keeper'))
  const { page, hand } = t
  await page.waitForSelector('canvas')
  await page.waitForTimeout(2500)
  const c = await controls(page)

  await hand.tap(ACT, c.A.x, c.A.y, 140)
  await page.waitForTimeout(2000)

  // Grant the traversal upgrades so dash and cling are exercisable from level
  // one. They are earned later in a real run; what is under test here is the
  // input path, not the unlock order.
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    s.hasDash = true
    s.hasWallCling = true
    s.hasDoubleJump = true
  })

  const st = () =>
    page.evaluate(() => {
      const s = window.__game.scene.getScene('play')
      const p = s.player
      return {
        active: s.scene.isActive(),
        x: p.x,
        vx: p.body.velocity.x,
        vy: p.body.velocity.y,
        grounded: p.body.blocked.down,
        wall: p.body.blocked.left ? 'left' : p.body.blocked.right ? 'right' : null,
        dashing: s.dashingUntil > s.time.now,
        fuel: s.fuelRatio(),
        radius: s.playerLightRadius(),
      }
    })

  const start = await st()
  check('A starts the level', start.active, `player at x=${start.x | 0}`)

  // #70: the lantern burns down, and the light goes with it. Drains on a
  // timer, so this needs no input at all — which is also the point: standing
  // still must not conserve it.
  const t0 = await st()
  await page.waitForTimeout(3000)
  const t3 = await st()
  check(
    'the lantern burns fuel while standing still',
    t3.fuel < t0.fuel - 0.05,
    `${t0.fuel.toFixed(2)} -> ${t3.fuel.toFixed(2)}`,
  )
  check(
    'the light radius shrinks with the fuel',
    t3.radius < t0.radius && t3.radius >= 5,
    `${t0.radius.toFixed(1)} -> ${t3.radius.toFixed(1)} (floor is GLOW.minRadius 5)`,
  )

  // Lighting a lantern is the refuel. Driving to one by input would be a
  // platforming run; what is under test is the refill, so it is called
  // directly.
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    s.lightLantern(s.lanterns.find((l) => !l.lit && l.name !== 'heart_tree'))
  })
  await page.waitForTimeout(200)
  const refuelled = await st()
  check(
    'lighting a lantern refills the tank',
    refuelled.fuel > 0.95,
    `${t3.fuel.toFixed(2)} -> ${refuelled.fuel.toFixed(2)}`,
  )

  await hand.down(PAD, c.arm('ArrowRight').x, c.arm('ArrowRight').y)
  await page.waitForTimeout(600)
  check('holding the d-pad moves the player', (await st()).x - start.x > 8)

  await hand.down(ACT, c.A.x, c.A.y)
  await page.waitForTimeout(110)
  const jumped = await st()
  check('A jumps while a direction is held', jumped.vy < -60, `vy ${jumped.vy.toFixed(0)}`)
  check('the held direction survives the second touch', jumped.vx > 0, `vx ${jumped.vx.toFixed(0)}`)
  await hand.up(ACT)
  await page.waitForTimeout(500)

  // The dash burst is DASH.durationMs (100ms) long, so this samples *during*
  // it. Waiting for the tap to finish and then reading velocity sees the run
  // speed again, which looks exactly like a dash that never fired.
  const beforeDash = await st()
  await hand.down(ACT, c.B.x, c.B.y)
  let peakVx = 0
  let sawDash = false
  for (let i = 0; i < 8; i++) {
    const cur = await st()
    if (cur.dashing) sawDash = true
    peakVx = Math.max(peakVx, Math.abs(cur.vx))
    await page.waitForTimeout(20)
  }
  await hand.up(ACT)
  check(
    'B dashes while a direction is held',
    sawDash && peakVx > Math.abs(beforeDash.vx) + 40,
    `peak vx ${peakVx.toFixed(0)} vs run ${Math.abs(beforeDash.vx).toFixed(0)}`,
  )
  await hand.release()
  await page.waitForTimeout(600)

  // Wall cling. Walk into whatever stops us rather than hardcoding a tile —
  // level geometry moves, and a stale coordinate would fail for the wrong
  // reason.
  await hand.down(PAD, c.arm('ArrowRight').x, c.arm('ArrowRight').y)
  let hitWall = false
  for (let i = 0; i < 40 && !hitWall; i++) {
    await page.waitForTimeout(120)
    hitWall = (await st()).wall === 'right'
  }
  if (!hitWall) {
    check('a wall was reachable by walking right', false, 'never blocked')
    await hand.release()
  } else {
    // Only samples taken while genuinely airborne *and* against the wall
    // count. A grounded player also reports vy 0, which would pass this
    // vacuously — as it did on the first run of this check.
    await hand.tap(ACT, c.A.x, c.A.y, 110)
    const airborne = []
    for (let i = 0; i < 25; i++) {
      const cur = await st()
      if (!cur.grounded && cur.wall === 'right') airborne.push(cur.vy)
      await page.waitForTimeout(40)
    }
    const falling = airborne.filter((v) => v > 0)
    check(
      'wall cling engages with the arrow held under touch',
      falling.length >= 2 && falling.every((v) => v <= 30),
      `${airborne.length} airborne-on-wall samples, falling vy ${falling.map((v) => v.toFixed(0)).join(',') || '(none)'}`,
    )
    await hand.release()
  }

  ok = finish(t.log) && ok
  await t.browser.close()
}

await windup()
await lanternKeeper()
process.exit(ok ? 0 : 1)
