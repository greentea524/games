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
  DIG_BUDGET,
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
  openAxes,
  undoStroke,
  type Axis,
  type DigState,
  isDiggable,
  isVisible,
  knownCells,
  removedSet,
  solve,
  survivors,
} from './dig'

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
    solution.left === 1 && solution.digs.length <= DIG_BUDGET,
    `${solution.digs.length} of ${DIG_BUDGET} digs, ${solution.left} candidate(s) left`,
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
  const reachable = solve(SHAPES[0], SHAPES, DIG_BUDGET, deep)
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
    solve(skull, pair, DIG_BUDGET * 4).left === 2,
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

// --- the brush (#151) --------------------------------------------------------
//
// A tap digs a 3×3 patch across the tapped face, one layer deep. The rules it
// must keep are the single dig's — only rock, only rock in view — plus two of
// its own: it stays on the tapped layer, and it does not jump the find.

const MID = (BLOCK.size - 1) / 2
const LAST = BLOCK.size - 1

{
  const state = createState(SHAPES[0])
  const top = key(BLOCK, MID, LAST, MID)
  const first = brushCells(state, top, 1)
  check(
    'a tap on the untouched top takes a 3×3 patch of it, one layer deep',
    first.length === 9 && first.every((k) => unkey(BLOCK, k).y === LAST),
    `${first.length} cubes`,
  )
  // Straight down, one tap at a time, until the find stops it.
  let taps = 0
  for (let d = 0; d < BLOCK.size; d++) {
    const cells = brushCells(state, key(BLOCK, MID, LAST - d, MID), 1)
    if (!cells.length) break
    digStroke(state, cells)
    taps++
  }
  check(
    'and each tap goes exactly one cube deeper — depth costs what it always did',
    taps === BLOCK.shapeMin && state.removed.length === 9 * BLOCK.shapeMin,
    `${taps} taps to reach the find under ${BLOCK.shapeMin} cubes of cover`,
  )
  const before = state.removed.length
  const back = undoStroke(state)
  check(
    'undo puts a whole tap back',
    back.length === 9 && state.removed.length === before - 9 && state.strokes.length === taps - 1,
    `${back.length} cubes back, ${state.strokes.length} taps left`,
  )
}

/** Is every cube of every tap in a play one that tap was allowed to take? */
function audit(shape: Shape, play: (state: DigState, take: (cells: number[]) => void) => void) {
  const state = createState(shape)
  const bad: string[] = []
  play(state, (cells) => {
    const removed = removedSet(state)
    const t = unkey(BLOCK, cells[0])
    const layer = (['x', 'y', 'z'] as const).filter((a) => cells.every((k) => unkey(BLOCK, k)[a] === t[a]))
    if (layer.length === 0) bad.push('a patch off its layer')
    for (const k of cells) {
      if (!isDiggable(state, k, removed)) bad.push(`cube ${k} out of view or not rock`)
      const c = unkey(BLOCK, k)
      if (Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y), Math.abs(c.z - t.z)) > 2 * BRUSH) bad.push(`cube ${k} beyond the patch`)
    }
    digStroke(state, cells)
  })
  return { bad, taps: state.strokes.length }
}

/** Taps from random cubes in view, on random open faces — every kind of tap. */
function randomPlay(seed: number, patch: (state: DigState, k: number, axis: Axis) => number[]) {
  let a = seed >>> 0
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return (state: DigState, take: (cells: number[]) => void) => {
    for (let i = 0; i < 80; i++) {
      const removed = removedSet(state)
      // Weighted toward the middle, so taps go down shafts and into walls and
      // reach the find rather than skimming the skin.
      const open = allCells(BLOCK).filter((k) => isDiggable(state, k, removed))
      open.sort((p, q) => depth(q) - depth(p))
      const k = open[Math.floor(rnd() ** 4 * open.length)]
      const axes = openAxes(BLOCK, k, removed)
      const cells = patch(state, k, axes[Math.floor(rnd() * axes.length)])
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
  const bad: string[] = []
  let deepest = 0
  for (const shape of SHAPES) {
    for (let seed = 1; seed <= 6; seed++) {
      const r = audit(shape, randomPlay(seed, (st, k, axis) => brushCells(st, k, axis)))
      taps += r.taps
      bad.push(...r.bad)
    }
    const s = createState(shape)
    randomPlay(1, (st, k, axis) => brushCells(st, k, axis))(s, (cells) => digStroke(s, cells))
    deepest = Math.max(deepest, ...s.removed.map(depth))
  }
  // Reaching past the cover matters: the find stopping a patch is only
  // exercised by taps that get in among it.
  check(
    'every cube every tap takes is rock in view, on the tapped layer, inside the patch',
    bad.length === 0 && taps > 1000 && deepest > BLOCK.shapeMin,
    `${taps} random taps, ${bad.length} bad cubes, reaching ${deepest} deep`,
  )

  // Staged: a plain square, taking whatever sits in the 3×3 around the tap.
  const square = (st: DigState, k: number, axis: Axis) => {
    const c = unkey(BLOCK, k)
    const at = [c.x, c.y, c.z]
    const [u, w] = ([0, 1, 2] as Axis[]).filter((x) => x !== axis)
    const out: number[] = []
    for (let du = -BRUSH; du <= BRUSH; du++) {
      for (let dw = -BRUSH; dw <= BRUSH; dw++) {
        const n = [...at]
        n[u] += du
        n[w] += dw
        if (n.every((v) => v >= 0 && v < BLOCK.size)) {
          const nk = key(BLOCK, n[0], n[1], n[2])
          if (!st.removed.includes(nk)) out.push(nk)
        }
      }
    }
    return out
  }
  let caught = 0
  for (const shape of SHAPES) caught += audit(shape, randomPlay(1, square)).bad.length
  check(
    'and a plain square patch, which ignores the rules, is caught taking what it should not',
    caught > 0,
    `${caught} bad cubes`,
  )
}

/**
 * A player digging straight shafts into the middles of the faces, one face
 * after another, stopping as soon as only one candidate fits. Not clever — it
 * does not know where the shapes differ — which is the point: it is the plan
 * a person starts with.
 */
function shaftPlayer(shape: Shape, radius: number) {
  const st = createState(shape)
  const faces: [Axis, (d: number) => number][] = [
    [1, (d) => key(BLOCK, MID, LAST - d, MID)],
    [2, (d) => key(BLOCK, MID, MID, d)],
    [0, (d) => key(BLOCK, LAST - d, MID, MID)],
    [2, (d) => key(BLOCK, MID, MID, LAST - d)],
    [0, (d) => key(BLOCK, d, MID, MID)],
    [1, (d) => key(BLOCK, MID, d, MID)],
  ]
  for (const [axis, at] of faces) {
    for (let d = 0; d < BLOCK.size && survivors(st).length > 1; d++) {
      const cells = brushCells(st, at(d), axis, radius)
      if (!cells.length) break
      digStroke(st, cells)
    }
  }
  return { taps: st.strokes.length, left: survivors(st).length }
}

{
  const wide = SHAPES.map((s) => ({ s, r: shaftPlayer(s, BRUSH) }))
  const narrow = SHAPES.map((s) => ({ s, r: shaftPlayer(s, 0) }))
  const worst = Math.max(...wide.map((x) => x.r.taps))
  check(
    'a player digging straight shafts names every shape inside the budget',
    wide.every((x) => x.r.left === 1 && x.r.taps <= DIG_BUDGET),
    `${wide.map((x) => `${x.s.name} ${x.r.taps}`).join(', ')} of ${DIG_BUDGET} taps`,
  )
  check(
    'with about half the taps the same plan took one cube at a time',
    Math.max(...narrow.map((x) => x.r.taps)) >= 2 * worst - 2,
    `${narrow.map((x) => `${x.s.name} ${x.r.taps}`).join(', ')} one cube a tap`,
  )
}

console.log(ok ? '\nALL VOXEL DIGGER CHECKS PASS' : '\nVOXEL DIGGER CHECKS FAILED')
process.exit(ok ? 0 : 1)
