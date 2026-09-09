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
  createState,
  digDistances,
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

console.log(ok ? '\nALL VOXEL DIGGER CHECKS PASS' : '\nVOXEL DIGGER CHECKS FAILED')
process.exit(ok ? 0 : 1)
