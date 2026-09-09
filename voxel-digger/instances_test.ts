// The instance index stays a bijection (#115).
//
//   npx tsx voxel-digger/instances_test.ts
//
// `instanceId` from a raycast is a slot in the `InstancedMesh`, not a cube.
// Removing a cube moves the last live instance into the freed slot, so slots
// and cubes drift apart constantly and the map between them is the only thing
// that keeps a tap pointed at the thing under the finger.
//
// Getting it wrong does not crash and does not look like a bookkeeping bug: the
// block still draws, the count is still right, and tapping deletes a cube
// somewhere else. That is why this is checked here rather than being left to
// show up as "the raycasting is off".
import { createIndex } from './instances'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/** Mulberry32, so a failing sequence is the same one next run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CELLS = 400

/** Every claim the renderer relies on, checked against a plain `Set`. */
function faults(index: ReturnType<typeof createIndex>, expected: Set<number>): string[] {
  const out: string[] = []
  if (index.count() !== expected.size) {
    out.push(`count ${index.count()} but ${expected.size} cells are live`)
  }
  const seen = new Set<number>()
  for (let slot = 0; slot < index.count(); slot++) {
    const cell = index.cellOf(slot)
    if (!expected.has(cell)) out.push(`slot ${slot} draws cell ${cell}, which is gone`)
    if (seen.has(cell)) out.push(`cell ${cell} is drawn in two slots`)
    seen.add(cell)
    if (index.slotOf(cell) !== slot) out.push(`cell ${cell} maps back to slot ${index.slotOf(cell)}`)
  }
  for (const cell of expected) {
    if (index.slotOf(cell) < 0) out.push(`live cell ${cell} has no slot`)
  }
  return out
}

/**
 * Removes and restores cells at random, checking after every single step.
 *
 * After every step, not at the end: the interesting failures are transient —
 * a slot that briefly points at a cell that has just moved — and a check that
 * only looks at the final state can watch the index heal itself.
 */
function exercise(swap: boolean, seed = 7): string[] {
  const cells = Array.from({ length: CELLS }, (_, i) => i * 3)
  const index = createIndex(cells, { swap })
  const live = new Set(cells)
  const removed: number[] = []
  const rng = seeded(seed)
  const faultsFound: string[] = []

  for (let step = 0; step < 1200; step++) {
    const undo = removed.length > 0 && rng() < 0.25
    if (undo) {
      const cell = removed.pop()!
      index.restore(cell)
      live.add(cell)
    } else {
      const pool = [...live]
      if (pool.length === 0) continue
      const cell = pool[Math.floor(rng() * pool.length)]
      index.remove(cell)
      live.delete(cell)
      removed.push(cell)
    }
    faultsFound.push(...faults(index, live))
    if (faultsFound.length) break
  }
  return faultsFound
}

{
  const found = exercise(true)
  check(
    'slots and cubes stay in step through a thousand digs and undos',
    found.length === 0,
    found[0] ?? `${CELLS} cells`,
  )
}

{
  // The bug, put back: shrink the count without moving the last live instance
  // into the freed slot. The block still draws the right number of cubes; it
  // just draws the wrong ones, and a tap deletes something else.
  const found = exercise(false)
  check(
    'and shrinking the count without swapping is caught',
    found.length > 0,
    found[0] ?? 'nothing went wrong, which means this check proves nothing',
  )
}

{
  // Removing the last live instance is the case the swap must skip: there is
  // nothing to move, and moving it onto itself would leave a stale entry.
  const index = createIndex([10, 20, 30])
  const result = index.remove(30)
  check(
    'removing the last instance needs no swap',
    result?.moved === null && index.count() === 2 && index.live().join() === '10,20',
    `slot ${result?.slot}`,
  )
}

{
  const index = createIndex([10, 20, 30])
  const result = index.remove(10)
  check(
    'removing any other moves the last one into its slot',
    result?.slot === 0 && result?.moved === 30 && index.cellOf(0) === 30,
    `slot ${result?.slot} now draws ${index.cellOf(0)}`,
  )
  check('and a cell that is gone reports no slot', index.slotOf(10) === -1)
  check('removing it twice is a no-op', index.remove(10) === null && index.count() === 2)
}

console.log(ok ? '\nALL INSTANCE INDEX CHECKS PASS' : '\nINSTANCE INDEX CHECKS FAILED')
process.exit(ok ? 0 : 1)
