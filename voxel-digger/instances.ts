// Which instance is which cube (#115).
//
// The block is one `InstancedMesh`, which is the technique #115 is here to
// teach: a thousand-odd cubes in a single draw call. Removing one means either
// scaling that instance to nothing — cheap to write, and it leaves the vertex
// work in place for ever — or moving the last live instance into the freed
// slot and shrinking `count`, which keeps the draw exactly as small as the
// block is.
//
// The second is the right answer and it has a trap in it. `instanceId` from a
// raycast is a *slot*, not a cube, and swapping changes which cube is in which
// slot. Get the bookkeeping wrong and the game still runs, still draws the
// right number of cubes, and deletes the wrong one when you tap — a bug that
// looks like a raycasting problem and is not.
//
// So the bookkeeping lives here, with no three.js in it, and is checked
// directly rather than through the renderer.

export interface InstanceIndex {
  /** Live instances. Slots `0..count-1` are drawn. */
  count(): number
  /** The cell drawn in a slot, or -1 if the slot is past the live range. */
  cellOf(slot: number): number
  /** The slot a cell is drawn in, or -1 if it has been removed. */
  slotOf(cell: number): number
  /**
   * Takes a cell out of the draw.
   *
   * Returns the slot that needs rewriting and the cell that moved into it, or
   * null when the cell was not live. `moved` is null when the removed cell was
   * already the last one, in which case shrinking the count is all it takes.
   */
  remove(cell: number): { slot: number; moved: number | null } | null
  /** Puts a cell back at the end of the draw, for undo. Returns its slot. */
  restore(cell: number): number
  /** Live cells, in slot order. */
  live(): number[]
}

export interface IndexOptions {
  /**
   * Off, `remove` shrinks the count without moving the last instance into the
   * freed slot — the bug this module exists to avoid. Nothing in the game
   * passes this; `instances_test.ts` uses it to watch the check go red.
   */
  swap?: boolean
}

export function createIndex(cells: number[], options: IndexOptions = {}): InstanceIndex {
  const { swap = true } = options
  const slotCell = cells.slice()
  const cellSlot = new Map<number, number>()
  cells.forEach((cell, slot) => cellSlot.set(cell, slot))
  let count = cells.length

  return {
    count: () => count,
    cellOf: (slot) => (slot >= 0 && slot < count ? slotCell[slot] : -1),
    slotOf: (cell) => {
      const slot = cellSlot.get(cell)
      return slot === undefined || slot >= count ? -1 : slot
    },
    remove(cell) {
      const slot = cellSlot.get(cell)
      if (slot === undefined || slot >= count) return null
      const last = count - 1
      let moved: number | null = null
      if (swap && slot !== last) {
        moved = slotCell[last]
        slotCell[slot] = moved
        cellSlot.set(moved, slot)
      }
      cellSlot.delete(cell)
      count--
      return { slot, moved }
    },
    restore(cell) {
      const slot = count
      slotCell[slot] = cell
      cellSlot.set(cell, slot)
      count++
      return slot
    },
    live() {
      return slotCell.slice(0, count)
    },
  }
}
