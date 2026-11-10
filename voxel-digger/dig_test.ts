// Voxel Digger's dig rules and whether the block can be solved (#115).
//
//   npx tsx voxel-digger/dig_test.ts
//
// #115 asks for one check: that the block is always solvable — some sequence
// of digs inside the budget exposes enough of the buried shape to tell it from
// the others — with a control that buries a shape deeper than the budget
// allows and confirms the check rejects it.
//
// That is here, and so is a second failure the first would not have caught. A
// budget is not the only thing that can make a layout unwinnable: two shapes
// that differ *only* inside a pocket sealed on all six faces by shape cells
// can never be told apart, because rock cannot be dug through the buried
// object and the difference is behind it. No budget fixes that. The skull has
// two such pockets — its eye sockets — so the layout is one edit away from
// shipping, and it would render as two obviously different objects while being
// literally indistinguishable in play.
import {
  BLOCK,
  PROOF_BUDGET,
  SHAPES,
  allCells,
  cellsOf,
  key,
  makeBlock,
  neighbours,
  unkey,
  type Shape,
} from './block'
import {
  BRUSH,
  brushCells,
  createState,
  digDistances,
  digStroke,
  drillCells,
  openFaces,
  undoStroke,
  type Axis,
  type Dir,
  type DigState,
  isDiggable,
  isVisible,
  knownCells,
  removedSet,
  solve,
  survivors,
} from './dig'
import { silhouette, type Facing } from './preview'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

// --- the rules --------------------------------------------------------------

{
  const state = createState(SHAPES[0])
  const removed = removedSet(state)
  const diggableNow = allCells(BLOCK).filter((k) => isDiggable(state, k, removed))
  const surfaceCount = allCells(BLOCK).filter((k) => isVisible(BLOCK, k, removed)).length
  check(
    'only the block’s outer skin can be dug to begin with',
    diggableNow.length === surfaceCount && surfaceCount === BLOCK.size ** 3 - (BLOCK.size - 2) ** 3,
    `${diggableNow.length} cells`,
  )
  check(
    'and none of the buried shape is diggable, ever',
    allCells(BLOCK).every((k) => !state.shape.has(k) || !isDiggable(state, k)),
    `${state.shape.size} shape cells`,
  )
}

{
  // A cell one layer in is unreachable until the cell over it is gone. This is
  // the rule the whole cost model rests on: if anything could be dug at any
  // time, depth would not cost digs and the budget would mean nothing.
  const state = createState(SHAPES[0])
  const under = key(BLOCK, 5, BLOCK.size - 2, 5)
  const over = key(BLOCK, 5, BLOCK.size - 1, 5)
  const before = isDiggable(state, under)
  state.removed.push(over)
  check(
    'a buried cell becomes diggable only once its cover is gone',
    !before && isDiggable(state, under),
    'depth is what costs digs',
  )
}

// --- the solver plays by those rules ----------------------------------------

for (const shape of SHAPES) {
  // Replayed one dig at a time, checking each was legal at the moment it was
  // taken. A solver that dug straight to the answer through solid rock would
  // otherwise "prove" any layout solvable.
  const solution = solve(shape)
  const replay = createState(shape)
  let illegal = 0
  for (const k of solution.digs) {
    if (!isDiggable(replay, k)) illegal++
    replay.removed.push(k)
  }
  check(
    `${shape.name}: every dig the solver takes was legal when it took it`,
    illegal === 0,
    `${solution.digs.length} digs, ${illegal} illegal`,
  )
}

// --- solvable inside the budget ---------------------------------------------

for (const shape of SHAPES) {
  const solution = solve(shape)
  check(
    `${shape.name}: can be identified inside the dig budget`,
    solution.left === 1 && solution.digs.length <= PROOF_BUDGET,
    `${solution.digs.length} of ${PROOF_BUDGET} digs, ${solution.left} candidate(s) left`,
  )
}

{
  // The truth is always consistent with what has been seen, whatever has been
  // dug — so `survivors` can never be empty and the guess always has a right
  // answer available.
  let empty = 0
  for (const shape of SHAPES) {
    const state = createState(shape)
    for (const k of solve(shape).digs) {
      state.removed.push(k)
      const left = survivors(state)
      if (!left.some((s) => s.id === shape.id)) empty++
    }
  }
  check('the true shape is never ruled out', empty === 0)
}

// --- and the check can tell when a layout is not solvable -------------------

{
  // #115's own control: the shape buried deeper than the budget can reach. The
  // block is wide enough that its centre is thirteen cells in, against a
  // budget of eight — so no sequence of digs reaches anything at all.
  const deep = makeBlock(31)
  const budget = 8
  const solution = solve(SHAPES[0], SHAPES, budget, deep)
  check(
    'a shape buried deeper than the budget allows is caught',
    solution.left > 1,
    `${deep.shapeMin} cells of overburden against ${budget} digs; ${solution.left} candidates left`,
  )
  // And the same block with a budget that can reach it is fine, so the control
  // is about the depth and not about the block being unusual.
  const reachable = solve(SHAPES[0], SHAPES, PROOF_BUDGET, deep)
  check(
    'while the same block with enough digs is solvable',
    reachable.left === 1,
    `${reachable.digs.length} digs`,
  )
}

{
  // The failure a budget cannot fix. `skull` has rock pockets sealed on all
  // six faces by its own cells; a candidate that differs from it only there is
  // unreachable however long you dig.
  const skull = SHAPES.find((s) => s.id === 'skull')
  if (!skull) throw new Error('the skull is gone')
  const cells = cellsOf(BLOCK, skull)
  const sealed = allCells(BLOCK).filter(
    (k) =>
      !cells.has(k) &&
      neighbours(BLOCK, k).length === 6 &&
      neighbours(BLOCK, k).every((n) => cells.has(n)),
  )
  check('the skull really does have a sealed pocket', sealed.length > 0, `${sealed.length} of them`)

  const { x, y, z } = unkey(BLOCK, sealed[0])
  const layer = y - BLOCK.shapeMin
  const row = z - BLOCK.shapeMin
  const col = x - BLOCK.shapeMin
  const filled: Shape = {
    id: 'skull-filled',
    name: 'Skull with one socket filled',
    layers: skull.layers.map((plane, i) =>
      i === layer
        ? plane.map((line, j) =>
            j === row ? line.slice(0, col) + '#' + line.slice(col + 1) : line,
          )
        : plane,
    ),
  }
  const pair = [skull, filled]
  check(
    'two shapes differing only inside a sealed pocket are caught',
    solve(skull, pair, PROOF_BUDGET * 4).left === 2,
    'no budget can reach a difference behind the shape',
  )
  check(
    'and they really are different shapes, not the same one twice',
    cellsOf(BLOCK, filled).size === cells.size + 1,
    'one cell apart, and invisible',
  )
}

{
  // Digging everything reachable is the most a player can ever know. If that
  // still left two candidates standing, the round would be unwinnable by
  // anyone — a stronger statement than the budget check, and cheap to make.
  for (const shape of SHAPES) {
    const state = createState(shape)
    for (let guard = 0; guard < 4000; guard++) {
      const dist = digDistances(state)
      const next = [...dist.keys()].find((k) => !state.removed.includes(k))
      if (next === undefined) break
      state.removed.push(next)
    }
    const known = knownCells(state)
    check(
      `${shape.name}: is the only candidate once everything reachable is dug`,
      survivors(state).length === 1,
      `${state.removed.length} cells removed, ${known.size} known`,
    )
  }
}

// --- the drill (#152) --------------------------------------------------------
//
// A tap drills the 3×3 around the tapped cube straight in from the tapped
// face, each column until it meets the find or leaves the block. What it must
// keep is the single dig's rule, in order: every cube it takes is rock that
// was in view by the time the drill reached it. And it never takes, or passes,
// the find.

const MID = (BLOCK.size - 1) / 2
const LAST = BLOCK.size - 1

{
  const state = createState(SHAPES[0])
  const top = key(BLOCK, MID, LAST, MID)
  const core = drillCells(state, top, 1, -1)
  const cover = BLOCK.size - (BLOCK.shapeMin + BLOCK.shapeSize)
  check(
    'one tap on the middle of the top drills a 3×3 core down to the find',
    core.length === 9 * cover && core.every((k) => unkey(BLOCK, k).y >= LAST - cover + 1),
    `${core.length} cubes, ${cover} deep`,
  )
  digStroke(state, core)
  const removed = removedSet(state)
  const showing = [...state.shape].filter((k) => isVisible(BLOCK, k, removed)).length
  check('and the find is uncovered at the bottom of it', showing === 9, `${showing} cubes of the find in view`)
  const back = undoStroke(state)
  check(
    'undo puts the whole core back',
    back.length === core.length && state.removed.length === 0 && state.strokes.length === 0,
    `${back.length} cubes back`,
  )

  // A corner of the face is clear of the find all the way down.
  const corner = drillCells(state, key(BLOCK, 1, LAST, 1), 1, -1)
  check(
    'a drill that misses the find goes clean through the block',
    corner.length === 9 * BLOCK.size,
    `${corner.length} cubes, a hole ${BLOCK.size} deep`,
  )
}

/** Replays a play one cube at a time, counting every cube that was not legal. */
function audit(shape: Shape, play: (state: DigState, take: (cells: number[]) => void) => void) {
  const state = createState(shape)
  const bad: string[] = []
  play(state, (cells) => {
    const removed = removedSet(state)
    for (const k of cells) {
      if (state.shape.has(k)) bad.push(`cube ${k} is the find`)
      else if (!isVisible(BLOCK, k, removed)) bad.push(`cube ${k} was not in view when the drill reached it`)
      removed.add(k)
    }
    digStroke(state, cells)
  })
  return { bad, taps: state.strokes.length, state }
}

type Drill = (state: DigState, k: number, axis: Axis, dir: Dir) => number[]

/** Taps on random cubes in view, on random open faces — every kind of tap. */
function randomPlay(seed: number, drill: Drill) {
  let a = seed >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return (state: DigState, take: (cells: number[]) => void) => {
    for (let i = 0; i < 40; i++) {
      const removed = removedSet(state)
      const open = allCells(BLOCK).filter((k) => isDiggable(state, k, removed))
      if (open.length === 0) return
      // Weighted toward the middle, so taps land in holes and against the
      // find rather than only on the untouched skin.
      open.sort((p, q) => depth(q) - depth(p))
      const k = open[Math.floor(rnd() ** 3 * open.length)]
      const faces = openFaces(BLOCK, k, removed)
      const face = faces[Math.floor(rnd() * faces.length)]
      const cells = drill(state, k, face.axis, face.dir)
      if (cells.length) take(cells)
    }
  }
}
const depth = (k: number) => {
  const c = unkey(BLOCK, k)
  return Math.min(c.x, c.y, c.z, LAST - c.x, LAST - c.y, LAST - c.z)
}

{
  let taps = 0
  let cubes = 0
  let stopped = 0
  const bad: string[] = []
  for (const shape of SHAPES) {
    for (let seed = 1; seed <= 6; seed++) {
      const r = audit(shape, randomPlay(seed, (st, k, axis, dir) => drillCells(st, k, axis, dir)))
      taps += r.taps
      cubes += r.state.removed.length
      bad.push(...r.bad)
      const removed = removedSet(r.state)
      stopped += [...r.state.shape].filter((k) => isVisible(BLOCK, k, removed)).length
    }
  }
  // Drills stopping against the find is the case that matters: a random play
  // that never met it would pass the audit without having tested it.
  check(
    'every cube every drill takes was rock in view when the drill reached it',
    bad.length === 0 && taps > 400 && stopped > 500,
    `${taps} random taps, ${cubes} cubes, ${bad.length} bad, ${stopped} find cubes uncovered`,
  )

  // Staged: a drill that does not stop at the find, but carries on through
  // it into the rock behind.
  const through: Drill = (st, k, axis, dir) => {
    const out: number[] = []
    for (const start of brushCells(st, k, axis)) {
      const c = unkey(BLOCK, start)
      const at = [c.x, c.y, c.z]
      while (at.every((v) => v >= 0 && v < BLOCK.size)) {
        const cell = key(BLOCK, at[0], at[1], at[2])
        if (!st.shape.has(cell) && !st.removed.includes(cell)) out.push(cell)
        at[axis] += dir
      }
    }
    return out
  }
  let caught = 0
  for (const shape of SHAPES) caught += audit(shape, randomPlay(1, through)).bad.length
  check(
    'and a drill that carries on through the find is caught',
    caught > 0,
    `${caught} cubes taken from behind it`,
  )
}

// --- a round can be played by someone who does not know the answer -----------
//
// The solver above knows what is buried and aims at it. This player does not:
// it drills the middle of each face in turn, then the four quarters of each
// face, and stops as soon as only one candidate fits what has been uncovered.
// It is the plan a person starts with.

function facePlayer(shape: Shape, drill: Drill = (st, k, axis, dir) => drillCells(st, k, axis, dir)) {
  const st = createState(shape)
  const face = (axis: Axis, dir: Dir, u: number, w: number) => {
    const at = [0, 0, 0]
    at[axis] = dir === -1 ? LAST : 0
    const [ua, wa] = ([0, 1, 2] as Axis[]).filter((a) => a !== axis)
    at[ua] = u
    at[wa] = w
    return key(BLOCK, at[0], at[1], at[2])
  }
  const sides: [Axis, Dir][] = [[1, -1], [2, 1], [0, -1], [2, -1], [0, 1], [1, 1]]
  const spots: [number, number][] = [[MID, MID], [MID - 2, MID - 2], [MID + 2, MID - 2], [MID - 2, MID + 2], [MID + 2, MID + 2]]
  for (const [u, w] of spots) {
    for (const [axis, dir] of sides) {
      if (survivors(st).length <= 1) break
      const cells = drill(st, face(axis, dir, u, w), axis, dir)
      if (cells.length) digStroke(st, cells)
    }
  }
  return { taps: st.strokes.length, left: survivors(st).length }
}

{
  const plays = SHAPES.map((s) => ({ s, r: facePlayer(s) }))
  check(
    'a player drilling the middle of each face names every shape in a handful of taps',
    plays.every((x) => x.r.left === 1 && x.r.taps <= 6),
    plays.map((x) => `${x.s.name} ${x.r.taps}`).join(', '),
  )
  // One cube a tap, the same plan gets nowhere: a single cube off each face
  // does not reach the find at all.
  const single: Drill = (st, k) => (isDiggable(st, k) ? [k] : [])
  const before = SHAPES.map((s) => ({ s, r: facePlayer(s, single) }))
  check(
    'where the same taps one cube at a time leave all four standing',
    before.every((x) => x.r.left === SHAPES.length),
    before.map((x) => `${x.s.name} ${x.r.taps} taps, ${x.r.left} left`).join('; '),
  )
}

// --- the pictures on the guess buttons (#152) --------------------------------
//
// A guess is a comparison between the find and four pictures, so the pictures
// have to differ — from every side they can be drawn from, including above,
// where all four shapes share their top two layers.

const FACINGS: Facing[] = []
for (const below of [false, true]) for (const quarter of [0, 1, 2, 3] as const) FACINGS.push({ quarter, below })

const differing = (a: string, b: string) => {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++
  return n
}

{
  let least = Infinity
  let where = ''
  for (const facing of FACINGS) {
    const pictures = SHAPES.map((s) => silhouette(s, facing))
    for (let i = 0; i < SHAPES.length; i++) {
      for (let j = i + 1; j < SHAPES.length; j++) {
        const d = differing(pictures[i], pictures[j])
        if (d < least) {
          least = d
          where = `${SHAPES[i].name} and ${SHAPES[j].name}, ${facing.below ? 'below' : 'above'} quarter ${facing.quarter}`
        }
      }
    }
  }
  // Sampled at a quarter of a cube, so sixteen samples is one cube face.
  check(
    'every pair of candidates draws differently from every side',
    least >= 16,
    `closest are ${where}: ${least} samples apart`,
  )

  // Staged: the skull with one eye socket filled in. It is a different shape
  // and no picture can show it — the socket is sealed inside.
  const skull = SHAPES.find((s) => s.id === 'skull')
  if (!skull) throw new Error('the skull is gone')
  const filled: Shape = {
    ...skull,
    id: 'skull-filled',
    layers: skull.layers.map((layer, y) => (y === 1 ? layer.map((row, z) => (z === 2 ? '###.#' : row)) : layer)),
  }
  const same = FACINGS.every((f) => differing(silhouette(skull, f), silhouette(filled, f)) === 0)
  check('and two shapes that differ only inside draw the same, so the check can tell', same)

  // A quarter-turn is a real turn: the key is not symmetrical, so its picture
  // must change as the block is turned and come back after four.
  const keyShape = SHAPES.find((s) => s.id === 'key')
  if (!keyShape) throw new Error('the key is gone')
  const turns = [0, 1, 2, 3].map((q) => silhouette(keyShape, { quarter: q as Facing['quarter'], below: false }))
  check(
    'the picture turns with the block',
    new Set(turns).size >= 2,
    `${new Set(turns).size} distinct views of the key from above`,
  )
}

console.log(ok ? '\nALL VOXEL DIGGER CHECKS PASS' : '\nVOXEL DIGGER CHECKS FAILED')
process.exit(ok ? 0 : 1)
