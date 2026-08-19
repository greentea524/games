// Generates assets/climb.json — The Quiet Climb (#91).
//
//   node lantern-keeper/scripts/generate_climb.cjs
//
// A gentle vertical stage: wide sturdy platforms in a staircase, no complex
// jumps. Script-generated for the same reason as the Grove and level 4 — the
// shape is regular, and a script is what makes the step sizes checkable.
//
// The two numbers that matter are RISE and RUN below. A single jump clears
// about 2.8 tiles of height (see the movement budget in PlayScene), so a rise
// of 2 is comfortably inside it with no double jump, dash or cling. Platforms
// overlap horizontally, so each step is mostly upward rather than a leap.
const fs = require('fs')
const path = require('path')

const WIDTH = 40
const HEIGHT = 56

const GRASS = 1
const EARTH = 2
const ROCK = 5

/** Vertical gain per step, in tiles. Must stay under a single jump. */
const RISE = 2
/** Horizontal shift per step. Less than PLATFORM_W, so steps overlap. */
const RUN = 3
const PLATFORM_W = 7
/** The lowest platform, and where the staircase stops. */
const BASE_Y = 50
const TOP_Y = 6
/** Keep the staircase off the side walls. */
const MIN_X = 3
const MAX_X = WIDTH - 3 - PLATFORM_W

const data = new Array(WIDTH * HEIGHT).fill(0)
const set = (x, y, t) => {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) data[y * WIDTH + x] = t
}

// A solid floor at the bottom. This is the whole safety story of the stage:
// the only fall that hurts in this game is one that reaches the world-bounds
// floor, so a climb with ground under it cannot punish a missed jump with
// anything worse than losing height.
for (let y = HEIGHT - 3; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) set(x, y, y === HEIGHT - 3 ? GRASS : EARTH)
}
// Side walls and a ceiling, so the stage is closed.
for (let y = 0; y < HEIGHT; y++) {
  for (let d = 0; d < 2; d++) {
    set(d, y, ROCK)
    set(WIDTH - 1 - d, y, ROCK)
  }
}
for (let x = 0; x < WIDTH; x++) set(x, 0, ROCK)

// The staircase: zig-zag between the walls, gaining RISE each step.
const platforms = []
let x = MIN_X
let dir = 1
for (let y = BASE_Y; y >= TOP_Y; y -= RISE) {
  platforms.push({ x, y, w: PLATFORM_W })
  // One tile thick, like every other platform in this game. An earth row
  // underneath was tried and removed: steps are two tiles apart, so the
  // underside of one platform sat directly above the surface of the next and
  // cut its landing area from seven tiles to three.
  for (let i = 0; i < PLATFORM_W; i++) set(x + i, y, GRASS)
  const next = x + dir * RUN
  if (next < MIN_X || next > MAX_X) {
    dir *= -1
    x += dir * RUN
  } else {
    x = next
  }
}

/**
 * Lanterns, one every few platforms plus the summit.
 *
 * Fewer than the Grove: this stage is about the climb rather than about the
 * light, and a lantern on every platform would turn a breather into a
 * collectathon. `climb_summit` is last and is what advances the stage.
 */
const chosen = [2, 7, 12, 17].map((i) => platforms[i]).filter(Boolean)
const summit = platforms[platforms.length - 1]
const objects = [
  ...chosen.map((p, i) => ({ name: `climb_lamp_${i}`, p })),
  { name: 'climb_summit', p: summit },
].map((entry, i) => ({
  id: i + 1,
  name: entry.name,
  x: (entry.p.x + Math.floor(entry.p.w / 2)) * 8 + 4,
  y: entry.p.y * 8 - 3,
  point: true,
  rotation: 0,
  type: '',
  visible: true,
  width: 0,
  height: 0,
}))

const map = {
  compressionlevel: -1,
  height: HEIGHT,
  width: WIDTH,
  tilewidth: 8,
  tileheight: 8,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  nextlayerid: 3,
  nextobjectid: objects.length + 1,
  tilesets: [
    {
      columns: 8,
      firstgid: 1,
      image: 'tiles.png',
      imageheight: 8,
      imagewidth: 64,
      margin: 0,
      name: 'tiles',
      spacing: 0,
      tilecount: 8,
      tileheight: 8,
      tilewidth: 8,
    },
  ],
  layers: [
    {
      data,
      height: HEIGHT,
      width: WIDTH,
      id: 1,
      name: 'ground',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      x: 0,
      y: 0,
    },
    {
      draworder: 'topdown',
      id: 2,
      name: 'lanterns',
      objects,
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
  ],
}

const out = path.join(__dirname, '..', 'assets', 'climb.json')
fs.writeFileSync(out, JSON.stringify(map))

// Report the worst step the layout actually produced, rather than the one it
// was meant to produce.
let worstRise = 0
let worstRun = 0
for (let i = 1; i < platforms.length; i++) {
  const a = platforms[i - 1]
  const b = platforms[i]
  worstRise = Math.max(worstRise, a.y - b.y)
  const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  worstRun = Math.max(worstRun, overlap > 0 ? 0 : Math.abs(b.x - a.x))
}
console.log(`wrote ${out}: ${WIDTH}x${HEIGHT}, ${platforms.length} platforms, ${objects.length} lanterns`)
console.log(`worst step: ${worstRise} tiles up, ${worstRun} tiles across with no overlap`)
