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

  /**
   * Waits for the play scene to be the live one before driving it.
   *
   * Every stage transition now routes through the world map (#88), which takes
   * a second or two. Without this the next section restarts a scene that is
   * about to be replaced by the map's own handover, and the restart is lost.
   */
  const settleOnPlay = async () => {
    for (let i = 0; i < 30; i++) {
      const live = await page.evaluate(() => window.__game.scene.getScene('play').scene.isActive())
      if (live) return true
      await page.waitForTimeout(300)
    }
    return false
  }

  // --- ambience (#65) ------------------------------------------------------
  //
  // Checked here because a browser and a loaded level are already open. The
  // placement rule is the part worth asserting: this game has no fall damage,
  // so a deep drop is not a hazard and only a fall to the world floor is. The
  // first version signed any drop of six tiles or more, which put warnings on
  // ledges that are completely safe to step off.
  const ambience = await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    // The scene keeps the layer, not the map — the map hangs off the layer.
    const ground = s.groundLayer ?? null
    const map = ground?.tilemap
    const signs = s.children.list.filter((o) => o.texture && o.texture.key === 'signpost')
    const solid = (x, y) => {
      if (!ground || x < 0 || y < 0 || x >= map.width || y >= map.height) return false
      const t = ground.getTileAt(x, y)
      return !!t && t.index >= 1
    }
    // Every sign must have a void — empty all the way to the map floor — on
    // the side it faces.
    const misplaced = signs.filter((sign) => {
      const tx = Math.floor(sign.x / 8)
      const ty = Math.floor((sign.y + 6) / 8)
      const side = sign.flipX ? tx - 1 : tx + 1
      // The side being warned about has to be a real column of the map. An
      // earlier version of this check omitted that, which let it agree with
      // the bug it was meant to catch: `solid` reads false past the map edge,
      // so the outermost column looked like a bottomless drop and every level
      // signposted its own border. The check passed because it made the same
      // assumption the code did.
      if (side < 0 || side >= map.width) return true
      for (let d = ty; d < map.height; d++) if (solid(side, d)) return true
      return false
    })
    return {
      hasMap: !!map && !!ground,
      signs: signs.length,
      misplaced: misplaced.length,
      fireflies: s.fireflies?.length ?? 0,
      cap: s.fireflies?.length <= 40,
      belowDarkness: (s.fireflies ?? []).every((f) => f.sprite.depth < 10),
      noBodies: [...signs, ...(s.fireflies ?? []).map((f) => f.sprite)].every((o) => !o.body),
    }
  })
  check('fireflies spawn and stay under the cap', ambience.fireflies > 0 && ambience.cap,
    `${ambience.fireflies}`)
  check('fireflies sit below the darkness, so unlit corners dim them', ambience.belowDarkness)
  check('neither fireflies nor signposts carry a physics body', ambience.noBodies)
  if (ambience.hasMap) {
    // Level 1 legitimately has no signposted ledge: nothing on it drops to the
    // world floor. This asserts the absence is honest rather than accidental —
    // it used to report one sign, which turned out to be the map's own border.
    // The stage with real voids is the Mossy Bridge, checked further down.
    check('level 1 signposts nothing, because nothing on it is a real drop',
      ambience.misplaced === 0 && ambience.signs === 0,
      `${ambience.signs} signs, ${ambience.misplaced} facing solid ground`)
  } else {
    check('the level exposes its tilemap for the signpost check', false,
      'could not reach map/groundLayer')
  }

  // --- The Firefly Grove (#90) ---------------------------------------------
  //
  // Structural, not scripted play: a platformer's traversability cannot be
  // proved by walking it in a check, but the things that make a stage
  // *impossible* are all measurable. The gap width is the important one — the
  // movement budget puts a single jump at about 2.8 tiles, so a 4-tile gap on
  // the spine would be a wall for a player who arrives without the upgrades.
  check('the previous stage handed back to play before the next check', await settleOnPlay())
  await page.evaluate(() => {
    window.__game.scene.getScene('play').scene.restart({ levelKey: 'grove' })
  })
  await page.waitForTimeout(2200)
  const grove = await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    const g = s.groundLayer
    const map = g.tilemap
    const solid = (x, y) => {
      const t = g.getTileAt(x, y)
      return !!t && t.index >= 1
    }
    const FLOOR = 14
    let widest = 0
    let run = 0
    for (let x = 1; x < map.width - 1; x++) {
      if (!solid(x, FLOOR)) {
        run++
        widest = Math.max(widest, run)
      } else run = 0
    }
    return {
      key: s.levelKey,
      widest,
      lanterns: s.lanterns.length,
      hasCloser: s.lanterns.some((l) => l.name === 'grove_heart'),
      spawnGrounded: solid(Math.floor(s.player.x / 8), Math.floor(s.player.y / 8) + 1),
      fireflies: s.fireflies.length,
      grounded: s.lanterns.every((l) => {
        const tx = Math.floor(l.sprite.x / 8)
        const ty = Math.floor(l.sprite.y / 8)
        for (let d = ty; d < Math.min(ty + 4, map.height); d++) if (solid(tx, d)) return true
        return false
      }),
    }
  })
  check('the grove loads', grove.key === 'grove')
  check('the player spawns on solid ground', grove.spawnGrounded)
  check('no gap on the spine exceeds a single jump', grove.widest <= 3, `widest ${grove.widest} tiles`)
  check('every lantern stands on ground', grove.grounded, `${grove.lanterns} lanterns`)
  check('it carries enough lanterns to read as a grove', grove.lanterns >= 5 && grove.fireflies > 0,
    `${grove.lanterns} lanterns, ${grove.fireflies} fireflies`)

  // A stage that cannot be left is worse than a stage that is too hard, so the
  // exit is exercised rather than inspected. An earlier version of this check
  // read the call out of lightLantern's source text and stayed red after the
  // wiring was already correct — it was testing the shape of the code.
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    s.lightLantern(s.lanterns.find((l) => l.name === 'grove_heart'))
  })
  let landed = grove.key
  for (let i = 0; i < 20 && landed !== 'level2'; i++) {
    await page.waitForTimeout(500)
    landed = await page.evaluate(() => window.__game.scene.getScene('play').levelKey)
  }
  check('lighting the closing lantern leads on to the marsh', landed === 'level2', `landed on ${landed}`)

  // --- The Quiet Climb (#91) ------------------------------------------------
  //
  // The step sizes are the whole design. Re-derived from the tilemap rather
  // than read back from the generator, so this checks the level that shipped
  // rather than the intent behind it.
  check('the previous stage handed back to play before the next check', await settleOnPlay())
  await page.evaluate(() => {
    window.__game.scene.getScene('play').scene.restart({ levelKey: 'climb' })
  })
  await page.waitForTimeout(2200)
  const climb = await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    const g = s.groundLayer
    const map = g.tilemap
    const solid = (x, y) => {
      const t = g.getTileAt(x, y)
      return !!t && t.index >= 1
    }
    // Find each platform: a run of solid tiles with open air above it.
    const rows = []
    for (let y = 1; y < map.height - 3; y++) {
      let run = null
      for (let x = 2; x < map.width - 2; x++) {
        const isTop = solid(x, y) && !solid(x, y - 1)
        if (isTop) {
          if (!run) run = { y, x, w: 0 }
          run.w++
        } else if (run) {
          rows.push(run)
          run = null
        }
      }
      if (run) rows.push(run)
    }
    rows.sort((a, b) => b.y - a.y) // bottom upward

    // Climbability, proved rather than guessed at.
    //
    // The first version of this asserted two geometric rules — minimum
    // platform width, and horizontal overlap between consecutive platforms —
    // and both were the wrong question. What matters is whether the summit can
    // actually be reached from the floor, so this walks a reachability graph:
    // an edge exists where the rise is inside the jump budget and the
    // horizontal offset is inside reach. If the summit is reachable, the stage
    // is climbable, whatever shape the platforms happen to be.
    const MAX_RISE = 2 // tiles, comfortably inside a single jump
    const MAX_REACH = 4 // tiles of horizontal offset from a standing jump
    const reaches = (a, b) => {
      const rise = a.y - b.y
      if (rise <= 0 || rise > MAX_RISE) return false
      const gap = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
      return gap <= MAX_REACH
    }
    const seen = new Set([0])
    const queue = [0]
    while (queue.length) {
      const i = queue.shift()
      for (let j = 0; j < rows.length; j++) {
        if (seen.has(j) || !reaches(rows[i], rows[j])) continue
        seen.add(j)
        queue.push(j)
      }
    }
    const topIndex = rows.reduce((best, r, i) => (r.y < rows[best].y ? i : best), 0)
    let worstRise = 0
    let narrowest = Infinity
    for (let i = 1; i < rows.length; i++) {
      worstRise = Math.max(worstRise, rows[i - 1].y - rows[i].y)
      narrowest = Math.min(narrowest, rows[i].w)
    }
    return {
      key: s.levelKey,
      platforms: rows.length,
      worstRise,
      narrowest: rows.length ? narrowest : 0,
      summitReachable: seen.has(topIndex),
      reached: seen.size,
      lanterns: s.lanterns.length,
      hasSummit: s.lanterns.some((l) => l.name === 'climb_summit'),
      // A solid floor is the safety story: the only fall that hurts reaches
      // the world-bounds floor, so ground underneath means a missed jump costs
      // height and nothing else.
      floored: solid(Math.floor(map.width / 2), map.height - 3),
      spawnGrounded: solid(Math.floor(s.player.x / 8), Math.floor(s.player.y / 8) + 1),
    }
  })
  check('the climb loads', climb.key === 'climb', `${climb.platforms} platforms`)
  check('the player spawns on solid ground', climb.spawnGrounded)
  check('the stage has a floor, so a missed jump only costs height', climb.floored)
  check('no step exceeds a single jump', climb.worstRise <= 2, `worst rise ${climb.worstRise} tiles`)
  check('every platform is wide enough to land on', climb.narrowest >= 4, `narrowest ${climb.narrowest} tiles`)
  check('the summit is reachable from the floor', climb.summitReachable,
    `${climb.reached}/${climb.platforms} platforms reachable`)
  check('the summit lantern is present', climb.hasSummit, `${climb.lanterns} lanterns`)

  await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    s.lightLantern(s.lanterns.find((l) => l.name === 'climb_summit'))
  })
  let climbLanded = climb.key
  for (let i = 0; i < 20 && climbLanded !== 'level3'; i++) {
    await page.waitForTimeout(500)
    climbLanded = await page.evaluate(() => window.__game.scene.getScene('play').levelKey)
  }
  check('lighting the summit leads on to the canopy', climbLanded === 'level3', `landed on ${climbLanded}`)

  // --- The Mossy Bridge (#92) -----------------------------------------------
  //
  // This stage has no floor on purpose — a missed jump falls to the
  // world-bounds floor and respawns, which is what makes it a bridge. That
  // raises the stakes on gap width, so it is the number under test, along
  // with the fact that the deck is genuinely crossable end to end.
  check('the previous stage handed back to play before the next check', await settleOnPlay())
  await page.evaluate(() => {
    window.__game.scene.getScene('play').scene.restart({ levelKey: 'bridge' })
  })
  await page.waitForTimeout(2200)
  const bridge = await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    const g = s.groundLayer
    const map = g.tilemap
    const solid = (x, y) => {
      const t = g.getTileAt(x, y)
      return !!t && t.index >= 1
    }
    const DECK = 9
    let widest = 0
    let run = 0
    for (let x = 1; x < map.width - 1; x++) {
      if (!solid(x, DECK)) {
        run++
        widest = Math.max(widest, run)
      } else run = 0
    }
    // Walk the deck: every gap must be jumpable, so the far side is reachable.
    let x = 1
    let crossed = true
    while (x < map.width - 1) {
      if (solid(x, DECK)) {
        x++
        continue
      }
      let gap = 0
      while (x + gap < map.width && !solid(x + gap, DECK)) gap++
      if (gap > 3) crossed = false
      x += gap
    }
    return {
      key: s.levelKey,
      widest,
      crossable: crossed,
      lanterns: s.lanterns.length,
      hasEnd: s.lanterns.some((l) => l.name === 'bridge_end'),
      spawnGrounded: solid(Math.floor(s.player.x / 8), Math.floor(s.player.y / 8) + 1),
      // Every lantern must stand on the deck, not hang over a gap.
      lanternsOnDeck: s.lanterns.every((l) => solid(Math.floor(l.sprite.x / 8), DECK)),
      // The piers are decoration; none may reach the bottom, or a fall would
      // land on one and turn the void into a route under the bridge.
      pierClear: (() => {
        for (let px = 1; px < map.width - 1; px++) {
          if (solid(px, map.height - 1) && px > 8 && px < map.width - 10) return false
        }
        return true
      })(),
      signposts: (() => {
        const signs = s.children.list.filter((o) => o.texture && o.texture.key === 'signpost')
        const bad = signs.filter((sign) => {
          const tx = Math.floor(sign.x / 8)
          const ty = Math.floor((sign.y + 6) / 8)
          const side = sign.flipX ? tx - 1 : tx + 1
          if (side < 0 || side >= map.width) return true
          for (let d = ty; d < map.height; d++) if (solid(side, d)) return true
          return false
        })
        return { count: signs.length, bad: bad.length }
      })(),
    }
  })
  check('the bridge loads', bridge.key === 'bridge', `${bridge.lanterns} lanterns`)
  check('the player spawns on the landing, not over the void', bridge.spawnGrounded)
  check('no gap exceeds a single jump', bridge.widest <= 3, `widest ${bridge.widest} tiles`)
  check('the deck can be crossed end to end', bridge.crossable)
  check('every lantern stands on the deck', bridge.lanternsOnDeck)
  check('nothing under the deck reaches the bottom', bridge.pierClear)
  check('the far-side lantern is present', bridge.hasEnd)
  // #65's signposts should find this stage on their own — it is the only one
  // with real voids beside the walkway.
  check('the gap edges are signposted', bridge.signposts.count >= 4, `${bridge.signposts.count} signs`)
  check('and every sign faces a real gap rather than the map border',
    bridge.signposts.bad === 0, `${bridge.signposts.bad} misplaced`)

  await page.evaluate(() => {
    const s = window.__game.scene.getScene('play')
    s.lightLantern(s.lanterns.find((l) => l.name === 'bridge_end'))
  })
  let bridgeLanded = bridge.key
  for (let i = 0; i < 20 && bridgeLanded !== 'level4'; i++) {
    await page.waitForTimeout(500)
    bridgeLanded = await page.evaluate(() => window.__game.scene.getScene('play').levelKey)
  }
  check('crossing leads on to the hollow', bridgeLanded === 'level4', `landed on ${bridgeLanded}`)

  // --- the world map, and stage registration (#88) --------------------------
  //
  // Every stage key must have a tilemap actually loaded. `stages.ts` is the
  // list, but BootScene does the loading, and a key with no map behind it
  // fails at `make.tilemap` the moment the player reaches it — which is a
  // crash halfway through a run rather than at boot.
  check('the bridge handed back to play', await settleOnPlay())
  const registry = await page.evaluate(async () => {
    const { STAGE_KEYS, STAGES } = await import('/games/lantern-keeper/stages.ts')
    const g = window.__game
    return {
      keys: STAGE_KEYS,
      missing: STAGE_KEYS.filter((k) => !g.cache.tilemap.has(k)),
      titles: STAGES.map((s) => s.title),
    }
  })
  check('every stage in the list has a tilemap loaded', registry.missing.length === 0,
    registry.missing.join(', ') || `${registry.keys.length} stages`)

  await page.evaluate(() => {
    window.__game.scene.getScene('play').scene.start('map', { from: 'level1', levelKey: 'level3' })
  })
  await page.waitForTimeout(900)
  const map = await page.evaluate(() => {
    const s = window.__game.scene.getScene('map')
    if (!s.scene.isActive()) return null
    const nodes = []
    for (let i = 0; i < 7; i++) nodes.push(s.nodeAt(i))
    return {
      onScreen: nodes.every((n) => n.x >= 4 && n.x <= 156 && n.y >= 20 && n.y <= 112),
      nodes: nodes.length,
      markers: s.children.list.filter((o) => o.texture && /lantern/.test(o.texture.key)).length,
    }
  })
  check('the world map opens between stages', map !== null)
  check('every node fits between the title and the label', map?.onScreen,
    JSON.stringify(map?.nodes))
  check('a node is drawn per stage, plus the travelling marker',
    map?.markers === registry.keys.length + 1, `${map?.markers} sprites`)

  // The map must hand over rather than becoming a dead end.
  let handedOver = false
  for (let i = 0; i < 24 && !handedOver; i++) {
    await page.waitForTimeout(500)
    handedOver = await page.evaluate(() => window.__game.scene.getScene('play').scene.isActive())
  }
  check('and it hands over to the stage', handedOver)

  ok = finish(t.log) && ok
  await t.browser.close()
}

await windup()
await lanternKeeper()
process.exit(ok ? 0 : 1)
