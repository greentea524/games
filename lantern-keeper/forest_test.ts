// The forest's stone, its backdrop and its light hold together (#172).
//
//   npx tsx lantern-keeper/forest_test.ts
import {
  BACKDROP_PX, BIOMES, FRAME_COUNT, GLOOM_ALPHA, LIGHT_RINGS, PARALLAX, SIDE, STAGE_BIOME, TILE_PX, VARIANTS, WARM_GLOW,
  biomeFor, drawBackdrop, drawTile, drawTileset, frameFor, glowRows, luminance, neighbourMask,
  type Biome, type ForestPalette, type Layer, type Painter,
} from './forest'
import { DARKNESS_ALPHA } from './constants'
import { STAGE_KEYS } from './stages'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

/** Draws into an array, counting what fell outside it. -1 is unpainted. */
function canvas(w: number, h: number) {
  const px = Array.from({ length: h }, () => Array<number>(w).fill(-1))
  let spilt = 0
  const p: Painter = (x, y, rw, rh, colour) => {
    for (let j = y; j < y + rh; j++) {
      for (let i = x; i < x + rw; i++) {
        if (i < 0 || j < 0 || i >= w || j >= h || !Number.isInteger(i) || !Number.isInteger(j)) spilt++
        else px[j][i] = colour
      }
    }
  }
  return { px, p, spilt: () => spilt }
}
const tile = (pal: ForestPalette, mask: number, variant = 0) => {
  const c = canvas(TILE_PX, TILE_PX)
  drawTile(c.p, pal, 0, mask, variant)
  return c
}
const biomes = Object.keys(BIOMES) as Biome[]
const ALL = SIDE.up | SIDE.right | SIDE.down | SIDE.left

// --- the stages
const unplaced = STAGE_KEYS.filter((k) => !(k in STAGE_BIOME))
check('every stage is a kind of place', unplaced.length === 0, unplaced.join(', '))
check('a stage nobody listed is forest, not a crash', biomeFor('nowhere') === 'forest')

// --- stone
for (const biome of biomes) {
  const pal = BIOMES[biome]
  const strip = canvas(FRAME_COUNT * TILE_PX, TILE_PX)
  drawTileset(strip.p, pal)
  const holes = strip.px.flat().filter((c) => c < 0).length
  check(`${biome}: every piece is filled and none spills`, holes === 0 && strip.spilt() === 0, `${holes} unpainted, ${strip.spilt()} outside`)

  // Open to the sky: a cap of moss along the whole top row.
  const mossy = [pal.moss, pal.mossLight, pal.mossDark]
  const capped = tile(pal, SIDE.down | SIDE.left | SIDE.right).px
  check(`${biome}: ground open to the sky has moss all along its top`, capped[0].every((c) => mossy.includes(c)))
  // Covered: no moss anywhere on it.
  const under = tile(pal, SIDE.up | SIDE.left | SIDE.right).px.flat()
  check(`${biome}: and a block with one above it has none`, !under.some((c) => mossy.includes(c)))
  // Buried: darker than a block with a face showing.
  const mean = (px: number[][]) => px.flat().reduce((a, c) => a + luminance(c), 0) / (TILE_PX * TILE_PX)
  const buried = mean(tile(pal, ALL).px)
  const face = mean(tile(pal, SIDE.up | SIDE.down | SIDE.right).px)
  check(`${biome}: the inside of a cliff is darker than its face`, buried < face * 0.7, `${buried.toFixed(3)} against ${face.toFixed(3)}`)
  // The two drawings of a piece differ, or a floor is one block repeated.
  const a = tile(pal, SIDE.down, 0).px.flat().join()
  const b = tile(pal, SIDE.down, 1).px.flat().join()
  check(`${biome}: the two drawings of a piece differ`, a !== b)

  // The order of things, by brightness. The forest behind is darker than any
  // stone with a face, and moss is the brightest thing that is not a light.
  const L = luminance
  const behind = Math.max(L(pal.void), L(pal.far), L(pal.farLit), L(pal.mid), L(pal.midLit), L(pal.near))
  check(`${biome}: the forest behind is darker than the stone in front`, behind < L(pal.stone) * 0.75, `${behind.toFixed(3)} against ${L(pal.stone).toFixed(3)}`)
  check(`${biome}: the layers get lighter toward the middle distance`, L(pal.void) < L(pal.far) && L(pal.far) < L(pal.mid) && L(pal.farLit) < L(pal.midLit))
  check(`${biome}: the near leaves are darker than what is behind them`, L(pal.near) < L(pal.far))
  check(`${biome}: moss is brighter than stone`, L(pal.mossLight) > L(pal.moss) && L(pal.moss) > L(pal.stoneLight), `${L(pal.moss).toFixed(3)} against ${L(pal.stoneLight).toFixed(3)}`)
  check(`${biome}: and the light is brighter than moss`, L(WARM_GLOW.colour) > L(pal.mossLight))
  check(`${biome}: the gloom is dark, and not black`, pal.gloom !== 0 && L(pal.gloom) < L(pal.far))
}
// The control for the order: the first forest palette had its near leaves
// lighter than the far trunks, and they read as part of the ground.
const wrong = { ...BIOMES.forest, near: BIOMES.forest.midLit }
check('and the check can fail: near leaves as light as the middle distance', !(luminance(wrong.near) < luminance(wrong.far)))

check('frames: sixteen pieces, twice', FRAME_COUNT === 32 && frameFor(ALL, 0) === 15 && frameFor(0, 1) === 16 && frameFor(5, 3) === frameFor(5, 1))
const grid = ['.#.', '###', '.#.']
const solid = (x: number, y: number) => grid[y]?.[x] === '#'
check('a block with all four neighbours is buried', neighbourMask(solid, 1, 1) === ALL)
check('and one at the top of a column has only the one under it', neighbourMask(solid, 1, 0) === SIDE.down)
check('nothing past the edge of the map counts as stone', neighbourMask(solid, 0, 1) === SIDE.right)
check('there are two drawings of each', VARIANTS === 2)

// --- the forest behind
for (const biome of biomes) {
  for (const layer of ['far', 'mid', 'near'] as Layer[]) {
    const c = canvas(BACKDROP_PX, BACKDROP_PX)
    drawBackdrop(c.p, BIOMES[biome], layer, biome)
    const painted = c.px.flat().filter((v) => v >= 0).length
    const share = painted / (BACKDROP_PX * BACKDROP_PX)
    // Something there, and not a wall: the layer behind must show through.
    check(`${biome} ${layer}: drawn, wrapped at its edges, and not solid`, c.spilt() === 0 && share > 0.04 && share < 0.6, `${(share * 100).toFixed(0)}% painted, ${c.spilt()} outside`)
  }
  // A trunk runs the whole height, so the picture joins itself top to bottom.
  const far = canvas(BACKDROP_PX, BACKDROP_PX)
  drawBackdrop(far.p, BIOMES[biome], 'far', biome)
  const top = far.px[0].map((v) => v >= 0)
  const bottom = far.px[BACKDROP_PX - 1].map((v) => v >= 0)
  // The seam is no worse a step than any two rows next to each other inside
  // the picture: a root leans and a shaft of light slants, so rows differ,
  // but a trunk cut off at the seam would differ by its whole width.
  const rowDiff = (a: boolean[], b: boolean[]) => a.filter((v, k) => v !== b[k]).length
  const rows = far.px.map((row) => row.map((v) => v >= 0))
  let widest = 0
  for (let y = 0; y + 1 < BACKDROP_PX; y++) widest = Math.max(widest, rowDiff(rows[y], rows[y + 1]))
  const seam = rowDiff(bottom, top)
  check(`${biome}: the far layer joins at the seam`, seam <= widest && top.includes(true), `${seam} pixels step there, ${widest} at most inside`)
}
// Each kind of place has a backdrop of its own, not one forest in four
// colours (#175). Measured on shape alone: which pixels are painted.
const shape = (biome: Biome, layer: Layer) => {
  const c = canvas(BACKDROP_PX, BACKDROP_PX)
  drawBackdrop(c.p, BIOMES.forest, layer, biome)
  return c.px.flat().map((v) => v >= 0)
}
for (const layer of ['far', 'mid'] as Layer[]) {
  const shapes = biomes.map((b) => [b, shape(b, layer)] as const)
  let closest = Infinity
  let pair = ''
  shapes.forEach(([a, sa], i) => shapes.slice(i + 1).forEach(([b, sb]) => {
    const differ = sa.filter((v, k) => v !== sb[k]).length / sa.length
    if (differ < closest) { closest = differ; pair = `${a} and ${b}` }
  }))
  check(`the ${layer} layers of the four kinds of place differ in shape`, closest > 0.05, `the closest are ${pair}, ${(closest * 100).toFixed(1)}% apart`)
}
const marshA = shape('marsh', 'far')
const marshB = shape('marsh', 'far')
check('and the check can fail: one place against itself does not', marshA.every((v, k) => v === marshB[k]))
check('the further a layer, the less it moves', PARALLAX.far < PARALLAX.mid && PARALLAX.mid < PARALLAX.near && PARALLAX.near < 1)

// --- light
const dimmer = STAGE_KEYS.filter((k) => !(GLOOM_ALPHA[k] < DARKNESS_ALPHA[k] - 0.15))
check('every stage is lighter in the dark than it was', dimmer.length === 0, dimmer.join(', '))
check('and none is so light the dark stops mattering', STAGE_KEYS.every((k) => GLOOM_ALPHA[k] >= 0.45))
// The order between stages is what it was: only the floor was raised.
const order = (table: Record<string, number>) => [...STAGE_KEYS].sort((a, b) => table[a] - table[b] || a.localeCompare(b))
const before = order(DARKNESS_ALPHA)
const after = order(GLOOM_ALPHA)
const kept = STAGE_KEYS.every((a) => STAGE_KEYS.every((b) => !(DARKNESS_ALPHA[a] < DARKNESS_ALPHA[b]) || GLOOM_ALPHA[a] <= GLOOM_ALPHA[b]))
check('no stage that was darker than another is now lighter than it', kept, `${before.join(' ')} / ${after.join(' ')}`)

const rings = LIGHT_RINGS
check('a light is rings, each inside the last and lifting more', rings.every((r, i) => i === 0 || (r.reach < rings[i - 1].reach && r.lift > rings[i - 1].lift)))
check('its middle is fully lit and its edge only partly', rings[rings.length - 1].lift === 1 && rings[0].lift < 0.5 && rings[0].reach === 1)

const glow = glowRows(48)
const mid = glow[24][24]
check('the glow is brightest at its middle and gone at its corner', mid === 1 && glow[0][0] === 0 && glow[24][47] < 0.2)
const steps = new Set(glow.flat())
check('and is stepped, not smooth', steps.size <= 5, `${steps.size} strengths`)

console.log(failed ? `\n${failed} FAILED` : '\nALL FOREST CHECKS PASS')
process.exit(failed ? 1 : 0)
