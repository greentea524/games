// A QA driver for Static: it plays the game.
//
// Everything goes through real input — held arrow keys to move, Z to interact
// and to advance dialogue — so "cannot reach it" means the tile is genuinely
// unreachable rather than that the script gave up. Pathing is BFS over the
// collision grid read out of the live scene: the tilemap layer plus every
// static physics body (props, fences, NPCs), which is what actually stops the
// player. Reading the code would not have found #93 or #96; walking the map
// did.
//
// State is read back from the `static_save` localStorage entry rather than
// from the GameState singleton, which the page does not expose. Every setFlag
// and every map entry writes that save, so it tracks the real flags and
// inventory.
//
// Deliberately not clicks, anywhere: a canvas click advances dialogue *and* is
// a tap-to-walk order to the world scene, so a click-driven reader sends the
// player marching off the moment the box closes.
import fs from 'node:fs'
import { chromium } from 'playwright-core'

export const BASE_URL = process.env.QA_URL ?? 'http://localhost:5178/games/static/'

// playwright-core ships no browsers, which keeps `npm ci` cheap for a
// dependency only the QA scripts use. Point QA_BROWSER at a Chromium binary,
// or leave it and we fall back to an installed Chrome.
const BROWSER_PATHS = [
  process.env.QA_BROWSER,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean)

function launchOptions(headless) {
  const found = BROWSER_PATHS.find((p) => fs.existsSync(p))
  if (found) return { executablePath: found, headless }
  return { channel: 'chrome', headless } // last resort: a system Chrome install
}

export class Driver {
  constructor(page) {
    this.page = page
    this.log = []
  }

  static async launch({ headless = true } = {}) {
    let browser
    try {
      browser = await chromium.launch(launchOptions(headless))
    } catch (e) {
      throw new Error(
        'could not start a browser for the QA run. Set QA_BROWSER to a Chromium ' +
          `binary, or install Chrome.\n  underlying error: ${e.message}`,
      )
    }
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } })
    const d = new Driver(page)
    page.on('pageerror', (e) => d.log.push({ kind: 'pageerror', text: e.message }))
    page.on('console', (m) => {
      // "Failed to load resource" is the console echo of a failed request, and
      // requestfailed below reports the same thing with the URL attached —
      // which is the part that decides whether it matters.
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
        d.log.push({ kind: 'console.error', text: m.text() })
      }
    })
    // A request that fails is only the game's problem when it was the game's
    // request. The page pulls its font from a CDN, so an offline or
    // proxied machine will always fail that one, and failing the suite over it
    // would train everyone to ignore the output.
    page.on('requestfailed', (req) => {
      if (!req.url().startsWith(new URL(BASE_URL).origin)) return
      // ERR_ABORTED is a cancellation, not a failure. Every boot navigates and
      // then reloads to seed the save, which cancels the in-flight favicon
      // fetch — the harness's own doing, not the game's.
      const why = req.failure()?.errorText ?? 'unknown'
      if (why.includes('ERR_ABORTED')) return
      d.log.push({ kind: 'requestfailed', text: `${req.url()} — ${why}` })
    })
    d.browser = browser
    return d
  }

  // ---- lifecycle ----

  /** Boots straight into `save` (a Saved payload), or a fresh New Game. */
  async boot(save, { palette = 'gbc' } = {}) {
    await this.page.goto(BASE_URL, { waitUntil: 'load' })
    await this.page.evaluate(([s, pal]) => {
      localStorage.setItem('static_palette', pal)
      if (s) localStorage.setItem('static_save', JSON.stringify({ v: 1, d: s }))
      else localStorage.removeItem('static_save')
    }, [save ?? null, palette])
    await this.page.reload({ waitUntil: 'load' })
    await this.page.waitForSelector('canvas')
    await this.page.waitForFunction(() => window.__game?.scene?.getScene('title')?.scene?.isActive())
    await this.page.waitForTimeout(400)
    // Continue is index 0 when a save exists; New Game is the only entry when not.
    await this.page.keyboard.press('KeyZ')
    await this.page.waitForFunction(() => {
      const w = window.__game?.scene?.getScene('world')
      return w?.scene?.isActive() && w.player
    })
    await this.page.waitForTimeout(1200) // fade-in + any on-entry delayedCall
  }

  async close() {
    await this.browser.close()
  }

  // ---- probes ----

  /** Story flags + inventory, straight out of the autosave. */
  async save() {
    return this.page.evaluate(() => {
      const raw = localStorage.getItem('static_save')
      if (!raw) return null
      try {
        return JSON.parse(raw).d
      } catch {
        return null
      }
    })
  }

  async scene() {
    return this.page.evaluate(() => {
      const g = window.__game
      const w = g.scene.getScene('world')
      const ui = g.scene.getScene('ui')
      return {
        mapKey: w.mapKey,
        active: w.scene.isActive(),
        transitioning: w.transitioning,
        tx: Math.floor(w.player.x / 16),
        ty: Math.floor(w.player.y / 16),
        facing: w.facing,
        dark: !!w.darkness,
        npcs: w.npcs.map((n) => ({
          id: n.def.id,
          tx: Math.floor(n.sprite.x / 16),
          ty: Math.floor(n.sprite.y / 16),
        })),
        interactables: w.interactables.map((i) => ({
          tx: Math.floor(i.x / 16),
          ty: Math.floor(i.y / 16),
        })),
        doors: w.doors.map((d) => ({
          target: d.target,
          tx: Math.floor(d.zone.x / 16),
          ty: Math.floor(d.zone.y / 16),
        })),
        dialogue: ui?.scene.isActive() ? ui.box.visible : false,
        speaker: ui?.scene.isActive() ? ui.nameText.text : '',
        body: ui?.scene.isActive() ? ui.bodyText.text : '',
        choice: ui?.scene.isActive() ? ui.choiceMode : false,
      }
    })
  }

  /**
   * Passability grid for the current map.
   *
   * Tilemap collision alone is not enough — bushes, fences, the fountain and
   * NPCs are static physics bodies stamped on top of walkable ground, and they
   * stop the player just as hard.
   */
  async grid() {
    return this.page.evaluate(() => {
      const w = window.__game.scene.getScene('world')
      const layer = w.groundLayer
      const W = layer.tilemap.width
      const H = layer.tilemap.height
      const g = []
      for (let y = 0; y < H; y++) {
        const row = []
        for (let x = 0; x < W; x++) {
          const t = layer.getTileAt(x, y)
          row.push(t && t.collides ? 0 : 1)
        }
        g.push(row)
      }
      // Static bodies: mark every tile their AABB touches.
      for (const body of w.physics.world.staticBodies.entries) {
        if (body.gameObject === w.player) continue
        // Door/pickup trigger zones are overlap-only; they do not block.
        if (body.gameObject instanceof Phaser.GameObjects.Zone) continue
        const x0 = Math.floor(body.left / 16)
        const x1 = Math.floor((body.right - 1) / 16)
        const y0 = Math.floor(body.top / 16)
        const y1 = Math.floor((body.bottom - 1) / 16)
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if (g[y] && g[y][x] !== undefined) g[y][x] = 0
          }
        }
      }
      return g
    })
  }

  // ---- movement ----

  /** Tiles adjacent to (tx,ty) that the player can actually stand on. */
  static approaches(grid, tx, ty) {
    return [
      [tx, ty - 1, 'down'],
      [tx, ty + 1, 'up'],
      [tx - 1, ty, 'right'],
      [tx + 1, ty, 'left'],
    ].filter(([x, y]) => grid[y]?.[x] === 1)
  }

  static bfs(grid, from, to) {
    const key = ([x, y]) => `${x},${y}`
    const q = [from]
    const prev = new Map([[key(from), null]])
    while (q.length) {
      const cur = q.shift()
      if (cur[0] === to[0] && cur[1] === to[1]) {
        const path = []
        let n = cur
        while (n) {
          path.unshift(n)
          n = prev.get(key(n))
        }
        return path
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur[0] + dx
        const ny = cur[1] + dy
        if (grid[ny]?.[nx] !== 1) continue
        if (prev.has(key([nx, ny]))) continue
        prev.set(key([nx, ny]), cur)
        q.push([nx, ny])
      }
    }
    return null
  }

  /** Walks to a tile with real input. Returns false if unreachable or stuck. */
  async walkTo(tx, ty, { grid = null } = {}) {
    const g = grid ?? (await this.grid())
    const s = await this.scene()
    const path = Driver.bfs(g, [s.tx, s.ty], [tx, ty])
    if (!path) return false
    const startMap = s.mapKey
    for (let i = 1; i < path.length; i++) {
      const [nx, ny] = path[i]
      const cur = await this.scene()
      if (cur.mapKey !== startMap) return true // a door on the way took us out
      const key =
        nx > cur.tx ? 'ArrowRight' : nx < cur.tx ? 'ArrowLeft' : ny > cur.ty ? 'ArrowDown' : ny < cur.ty ? 'ArrowUp' : null
      if (!key) continue
      // Square up before every step, so the 10px body clears the 16px gap it
      // is about to walk through.
      await this.snapToTile()
      if (!(await this.stepUntil(key, nx, ny))) return false
    }
    return true
  }

  /**
   * Holds a direction until the player is centred on the target tile *along
   * the axis being walked*, or gives up.
   *
   * Centred, not merely inside the tile: the player body is 10px wide in a
   * 16px tile, so a walker that stops the instant it crosses a tile boundary
   * leaves 5px of body hanging into the neighbouring column. Every later move
   * along the other axis then catches on whatever is beside it — which is how
   * a perfectly walkable doorway reads as a blocked one.
   *
   * Only the moving axis is tested. Testing both deadlocks: `face()` nudges
   * the player a couple of pixels off the perpendicular centre, and a
   * both-axes predicate then never comes true, so the walker holds the key
   * until its timeout and sails past the target. `walkTo` re-centres the
   * perpendicular axis between steps instead.
   */
  async stepUntil(key, tx, ty, budgetMs = 1600) {
    const from = (await this.scene()).mapKey
    const axis = key === 'ArrowLeft' || key === 'ArrowRight' ? 'x' : 'y'
    await this.page.keyboard.down(key)
    const ok = await this.page
      .waitForFunction(
        ([tx, ty, from, axis]) => {
          const w = window.__game.scene.getScene('world')
          if (!w?.player) return true
          if (w.mapKey !== from) return true // walked through a door
          const pos = axis === 'x' ? w.player.x : w.player.y
          const target = (axis === 'x' ? tx : ty) * 16 + 8
          return Math.abs(pos - target) <= 3
        },
        [tx, ty, from, axis],
        { timeout: budgetMs, polling: 20 },
      )
      .then(() => true)
      .catch(() => false)
    await this.page.keyboard.up(key)
    await this.page.waitForTimeout(60)
    return ok
  }

  /**
   * Squares the player up on the centre of the tile they are standing in.
   *
   * Held-key movement always leaves a few pixels of residual on the axis it
   * travelled, and the body is 10px in a 16px tile — only 3px of clearance a
   * side. Turning 90° with 2px of drift pokes the body into the neighbouring
   * row, and if that neighbour is a wall the player is stopped dead in what
   * looks like open ground. (That is exactly how the route past the hedge to
   * the north of town reads as blocked: 2px of drift catches the roof corner
   * at (7,16).)
   *
   * The correction is applied directly rather than by tapping keys, because
   * converging on a sub-pixel target with 60px/s movement and frame polling
   * oscillates. It cannot tunnel through anything: the destination is the
   * centre of a tile the player already legally occupies, and centring can
   * only move the 10px body *away* from that tile's edges. Anything larger
   * than a tile's worth of residual is left alone and reported.
   */
  async snapToTile() {
    return this.page.evaluate(() => {
      const w = window.__game.scene.getScene('world')
      if (!w?.player) return false
      const cx = Math.floor(w.player.x / 16) * 16 + 8
      const cy = Math.floor(w.player.y / 16) * 16 + 8
      if (Math.abs(cx - w.player.x) > 8 || Math.abs(cy - w.player.y) > 8) return false
      w.player.x = cx
      w.player.y = cy
      w.player.body.reset(cx, cy)
      return true
    })
  }

  /** Faces a tile from an adjacent square (a tap, so the player barely moves). */
  async face(dir) {
    const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir]
    await this.page.keyboard.down(key)
    await this.page.waitForTimeout(40)
    await this.page.keyboard.up(key)
    await this.page.waitForTimeout(120)
  }

  // ---- interaction ----

  /** Phaser polls Key.isDown per frame, so a zero-length press can be missed. */
  async pressZ() {
    await this.page.keyboard.down('KeyZ')
    await this.page.waitForTimeout(140)
    await this.page.keyboard.up('KeyZ')
    await this.page.waitForTimeout(200)
  }

  /**
   * Walks to whatever is on (tx,ty), turns to face it and interacts.
   * Returns the speaker name, or null if no dialogue opened.
   */
  async interactWith(tx, ty, { grid = null } = {}) {
    const g = grid ?? (await this.grid())
    const spots = Driver.approaches(g, tx, ty)
    for (const [ax, ay, dir] of spots) {
      if (!(await this.walkTo(ax, ay, { grid: g }))) continue
      await this.face(dir)
      await this.pressZ()
      const s = await this.scene()
      if (s.dialogue) return s.speaker
    }
    return null
  }

  /**
   * Reads dialogue to the end with the Z key, picking `choice` if one appears.
   *
   * Deliberately not clicks. A canvas click advances the dialogue *and* is a
   * tap-to-walk order to the world scene, so a click-driven reader sends the
   * player marching off toward the tap point the moment the box closes — which
   * looks exactly like a pathing failure on the next step.
   */
  async readDialogue({ choice = 0, max = 30 } = {}) {
    const seen = []
    for (let i = 0; i < max; i++) {
      const s = await this.scene()
      if (!s.dialogue) break
      seen.push(s.body)
      if (s.choice) {
        for (let n = 0; n < choice; n++) {
          // Held, not pressed: moveChoice runs off Phaser's per-frame
          // JustDown poll, which a zero-length press slips between.
          await this.page.keyboard.down('ArrowDown')
          await this.page.waitForTimeout(140)
          await this.page.keyboard.up('ArrowDown')
          await this.page.waitForTimeout(150)
        }
        await this.pressZ()
        break
      }
      await this.pressZ()
    }
    await this.page.waitForTimeout(300)
    return seen
  }

  /**
   * Waits for a dialogue box to open.
   *
   * Narration beats set their flag first and open the box a few hundred ms
   * later (the vanishings flash static for 380ms in between), so waiting on
   * the flag alone and reading immediately finds nothing and leaves the box to
   * open over whatever the next step is doing.
   */
  async waitForDialogue(timeoutMs = 4000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      if ((await this.scene()).dialogue) return true
      await this.page.waitForTimeout(150)
    }
    return false
  }

  /** Waits for a narration box to appear, then reads it to the end. */
  async readNarration(opts) {
    if (!(await this.waitForDialogue())) return []
    return this.readDialogue(opts)
  }

  /** Waits for a flag to appear in the autosave. */
  async waitForFlag(flag, timeoutMs = 6000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      const s = await this.save()
      if (s?.flags?.[flag]) return true
      await this.page.waitForTimeout(250)
    }
    return false
  }

  /**
   * Screenshots the game canvas into QA_SHOTS (default `static/qa/shots/`,
   * gitignored). Only useful when something failed and you want to see it.
   */
  async shot(name) {
    const dir = process.env.QA_SHOTS ?? new URL('shots/', import.meta.url).pathname
    fs.mkdirSync(dir, { recursive: true })
    await this.page.locator('canvas').screenshot({ path: `${dir}/${name}.png` })
  }

  /**
   * Flood-fills the walkable tiles reachable from the player's current
   * position. NPCs count as solid, because they are — that is how the frozen
   * Baker sealed off a quarter of the Static town (#96).
   */
  async reachable(grid) {
    const g = grid ?? (await this.grid())
    const s = await this.scene()
    const seen = new Set([`${s.tx},${s.ty}`])
    const queue = [[s.tx, s.ty]]
    while (queue.length) {
      const [x, y] = queue.shift()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (g[ny]?.[nx] !== 1 || seen.has(`${nx},${ny}`)) continue
        seen.add(`${nx},${ny}`)
        queue.push([nx, ny])
      }
    }
    return seen
  }

  /** Renders a map as text, for a failure message worth reading. */
  static render(grid, reachable, marks = []) {
    const at = (x, y) => marks.find((m) => m.tx === x && m.ty === y)
    const rows = [
      '    ' + [...Array(grid[0].length).keys()].map((i) => i % 10).join(''),
    ]
    for (let y = 0; y < grid.length; y++) {
      let row = ''
      for (let x = 0; x < grid[0].length; x++) {
        const mark = at(x, y)
        if (mark) row += mark.char
        else if (grid[y][x] !== 1) row += '#'
        else row += reachable.has(`${x},${y}`) ? '.' : 'o'
      }
      rows.push(String(y).padStart(3) + ' ' + row)
    }
    return rows.join('\n')
  }
}
