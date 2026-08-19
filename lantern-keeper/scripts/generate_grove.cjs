// Generates assets/grove.json — The Firefly Grove (#90).
//
//   node lantern-keeper/scripts/generate_grove.cjs
//
// Written as a script rather than hand-authored in Tiled for the same reason
// level 4 was: the shape is regular, and a script makes the traversal budget
// checkable. The gap widths below are the whole design constraint.
//
// The brief is a *relaxed* horizontal stage: flat terrain, small hops, and
// enough lanterns that the fireflies added in #65 have something to gather
// around. It sits after level 1, where the player already has every traversal
// ability, so nothing here needs to be hard — the difficulty is deliberately
// below what the player can do by this point.
const fs = require('fs')
const path = require('path')

const WIDTH = 104
const HEIGHT = 18
const FLOOR_Y = 14 // the walkable spine

// Glade tiles, matching level 1 — this is the same forest, one clearing over.
const GRASS = 1
const EARTH = 2
const ROCK = 5

/**
 * Every gap in the spine, as [startX, width].
 *
 * Three tiles is the ceiling here on purpose. A single jump clears about 2.8
 * tiles (see the movement budget in PlayScene), so every one of these is
 * crossable without the double jump, dash or wall cling — which keeps the
 * stage relaxed for a player who has all three, and keeps it honest if the
 * level order ever changes and someone arrives here with none of them.
 */
const GAPS = [
  [18, 2],
  [30, 3],
  [44, 2],
  [58, 3],
  [72, 2],
  [86, 3],
]

/** Small hops: [x, width, heightAboveFloor]. */
const LEDGES = [
  [12, 4, 3],
  [24, 5, 2],
  [37, 4, 3],
  [51, 5, 2],
  [65, 4, 3],
  [79, 5, 2],
  [93, 4, 2],
]

const data = new Array(WIDTH * HEIGHT).fill(0)
const set = (x, y, t) => {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) data[y * WIDTH + x] = t
}
const inGap = (x) => GAPS.some(([gx, gw]) => x >= gx && x < gx + gw)

// The spine: a grass surface with earth beneath it, broken by the gaps.
for (let x = 0; x < WIDTH; x++) {
  if (inGap(x)) continue
  set(x, FLOOR_Y, GRASS)
  for (let y = FLOOR_Y + 1; y < HEIGHT; y++) set(x, y, EARTH)
}

// Hop ledges above the spine.
for (const [lx, lw, lh] of LEDGES) {
  for (let i = 0; i < lw; i++) set(lx + i, FLOOR_Y - lh, GRASS)
}

// Walls at both ends, so the player cannot walk out of the map.
for (let y = 0; y < HEIGHT; y++) {
  set(0, y, ROCK)
  set(WIDTH - 1, y, ROCK)
}

// A low canopy of rock along the top, to close the stage in.
for (let x = 0; x < WIDTH; x++) set(x, 0, ROCK)

/**
 * Lanterns, spread along the spine.
 *
 * Fireflies spawn per lantern (#65), capped at 40 overall, so six lanterns is
 * what makes this stage read as a grove full of them rather than a corridor
 * with a few. `grove_heart` is last and is what advances the stage; the rest
 * grant nothing, because every ability is already in hand by now and a
 * breather is not the place to introduce a mechanic.
 */
const LANTERNS = [
  { name: 'grove_lamp_a', tx: 8 },
  { name: 'grove_lamp_b', tx: 26 },
  { name: 'grove_lamp_c', tx: 40 },
  { name: 'grove_lamp_d', tx: 54 },
  { name: 'grove_lamp_e', tx: 68 },
  { name: 'grove_heart', tx: 97 },
]

const objects = LANTERNS.map((l, i) => ({
  id: i + 1,
  name: l.name,
  x: l.tx * 8 + 4,
  y: FLOOR_Y * 8 - 3,
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

const out = path.join(__dirname, '..', 'assets', 'grove.json')
fs.writeFileSync(out, JSON.stringify(map))
console.log(`wrote ${out}: ${WIDTH}x${HEIGHT}, ${GAPS.length} gaps, ${LEDGES.length} ledges, ${objects.length} lanterns`)
console.log(`widest gap: ${Math.max(...GAPS.map((g) => g[1]))} tiles`)
