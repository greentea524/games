// Generates assets/bridge.json — The Mossy Bridge (#92).
//
//   node lantern-keeper/scripts/generate_bridge.cjs
//
// A cinematic straight shot: one long deck across a void, with simple gaps.
// Script-generated like the Grove, the Climb and level 4.
//
// The drama here is the drop. Unlike the Climb, this stage deliberately has
// no floor — a missed jump falls to the world-bounds floor and respawns, and
// that is what makes it read as a bridge rather than as a corridor. It is
// also what puts the DANGER signposts from #65 on it: they place themselves
// on ledges whose neighbouring column is empty to the bottom of the map,
// which on this stage is every gap edge.
//
// Because the fall has a cost, the gaps are the gentlest in the game.
const fs = require('fs')
const path = require('path')

const WIDTH = 124
const HEIGHT = 18
const DECK_Y = 9

const GRASS = 1
const EARTH = 2
const ROCK = 5

/**
 * Deck gaps, as [startX, width].
 *
 * Two and three tiles only. A single jump clears about 2.8 tiles, so every one
 * of these is crossable without the double jump — the brief says "very simple
 * gaps", and a stage whose failure state is a respawn is not the place to ask
 * for precision.
 */
const GAPS = [
  [22, 2],
  [40, 3],
  [56, 2],
  [72, 3],
  [90, 2],
  [104, 3],
]

/** Ruined piers hanging under the deck, for the ancient look. */
const PIERS = [10, 30, 48, 64, 82, 98, 114]

const data = new Array(WIDTH * HEIGHT).fill(0)
const set = (x, y, t) => {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) data[y * WIDTH + x] = t
}
const inGap = (x) => GAPS.some(([gx, gw]) => x >= gx && x < gx + gw)

// The deck: one tile thick, so the void under it reads immediately.
for (let x = 0; x < WIDTH; x++) {
  if (inGap(x)) continue
  set(x, DECK_Y, GRASS)
}

// Piers: short stubs of ruined stone hanging beneath the deck. Decorative —
// they never reach the bottom, so they cannot be landed on and turned into a
// route that skips the bridge.
for (const px of PIERS) {
  if (inGap(px)) continue
  for (let d = 1; d <= 3; d++) {
    set(px, DECK_Y + d, EARTH)
    set(px + 1, DECK_Y + d, EARTH)
  }
}

// Solid landings at both ends, so the stage starts and finishes on ground
// rather than on a one-tile ledge over nothing.
for (let x = 0; x < 8; x++) {
  for (let y = DECK_Y; y < HEIGHT; y++) set(x, y, y === DECK_Y ? GRASS : EARTH)
}
for (let x = WIDTH - 10; x < WIDTH; x++) {
  for (let y = DECK_Y; y < HEIGHT; y++) set(x, y, y === DECK_Y ? GRASS : EARTH)
}

// Cliff walls at both ends and a ceiling, closing the scene in.
for (let y = 0; y < HEIGHT; y++) {
  set(0, y, ROCK)
  set(WIDTH - 1, y, ROCK)
}
for (let x = 0; x < WIDTH; x++) set(x, 0, ROCK)

/**
 * Lanterns along the deck, and the one that ends the stage.
 *
 * Spaced so each sits between two gaps: the light arrives as a reward for the
 * crossing just made rather than as something to collect on the way past.
 */
const LANTERNS = [
  { name: 'bridge_lamp_a', tx: 14 },
  { name: 'bridge_lamp_b', tx: 33 },
  { name: 'bridge_lamp_c', tx: 50 },
  { name: 'bridge_lamp_d', tx: 66 },
  { name: 'bridge_lamp_e', tx: 96 },
  { name: 'bridge_end', tx: WIDTH - 5 },
]

const objects = LANTERNS.map((l, i) => ({
  id: i + 1,
  name: l.name,
  x: l.tx * 8 + 4,
  y: DECK_Y * 8 - 3,
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

const out = path.join(__dirname, '..', 'assets', 'bridge.json')
fs.writeFileSync(out, JSON.stringify(map))

// Verify no lantern was placed over a gap, which would put it in mid-air.
const overGap = LANTERNS.filter((l) => inGap(l.tx))
console.log(`wrote ${out}: ${WIDTH}x${HEIGHT}, ${GAPS.length} gaps, ${objects.length} lanterns`)
console.log(`widest gap: ${Math.max(...GAPS.map((g) => g[1]))} tiles`)
if (overGap.length) {
  console.error(`ERROR: lanterns floating over a gap: ${overGap.map((l) => l.name).join(', ')}`)
  process.exit(1)
}
