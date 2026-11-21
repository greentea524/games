// What each candidate looks like, drawn small (#152).
//
// The guess used to be four words: Skull, Fish, Coil, Key. Nothing showed what
// any of them looked like as five-by-five voxels, so a player who had dug the
// find out perfectly still had nothing to compare it with — and the shapes
// share their top two layers, so the first thing anyone uncovers is the same
// on all four.
//
// This draws a candidate as a little isometric picture for its button. It is
// drawn from the side the player is looking at the block from — one of four
// quarter-turns, from above or from below — so the picture and the block can
// be compared directly rather than turned over in the head.
//
// Pure geometry: polygons in, polygons out, no canvas and no three.js, so
// `dig_test.ts` can check that the four pictures really are different from
// every side.
import { SHAPE_SIZE, type Shape } from './block'

/** Where the block is being looked at from. */
export interface Facing {
  /**
   * Quarter-turns of the camera about the vertical axis: 0 when it sits over
   * +x and +z, counting up as the camera's yaw does.
   */
  quarter: 0 | 1 | 2 | 3
  /** True when the camera is under the block, looking up. */
  below: boolean
}

export type Face = 'cap' | 'left' | 'right'

export interface Polygon {
  face: Face
  /** Screen points, x right and y down, in units of one cube edge. */
  points: [number, number][]
}

/** The camera's facing, from its orbit angles in radians. */
export function facingOf(yaw: number, pitch: number): Facing {
  const turns = Math.floor(yaw / (Math.PI / 2))
  return { quarter: (((turns % 4) + 4) % 4) as Facing['quarter'], below: pitch < 0 }
}

/** The cells a shape fills, as coordinates inside its own box. */
export function shapeCells(shape: Shape): [number, number, number][] {
  const out: [number, number, number][] = []
  shape.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') out.push([x, y, z])
    })
  })
  return out
}

// A two-to-one isometric projection, as the camera sees the block: +x runs
// to the right and down, +z to the left and down, and y is vertical. Seen
// from below, the cells nearer the camera sit *higher* on screen instead.
const project = (x: number, y: number, z: number, below: boolean): [number, number] => [
  x - z,
  ((below ? -1 : 1) * (x + z)) / 2 - y,
]

/**
 * A shape as polygons, back to front, ready to be filled in order.
 *
 * Each cube contributes the three faces turned toward the viewer: the two
 * sides, and its top — or its underside, from below. Painter's order is
 * enough because every cube is the same size on one grid.
 */
export function shapePolygons(shape: Shape, facing: Facing): Polygon[] {
  const S = SHAPE_SIZE
  // Turn the shape so the camera's quarter becomes the +x, +z one.
  const turn = ([x, y, z]: [number, number, number]): [number, number, number] => {
    for (let i = 0; i < facing.quarter; i++) [x, z] = [S - 1 - z, x]
    return [x, y, z]
  }
  const s = facing.below ? -1 : 1
  const cells = shapeCells(shape).map(turn)
  // Nearest last. The camera sits toward +x and +z, and above or below.
  cells.sort((a, b) => a[0] + a[2] + s * a[1] - (b[0] + b[2] + s * b[1]))

  const out: Polygon[] = []
  const at = (x: number, y: number, z: number) => project(x, y, z, facing.below)
  for (const [x, y, z] of cells) {
    const yc = facing.below ? y : y + 1
    out.push({ face: 'cap', points: [at(x, yc, z), at(x + 1, yc, z), at(x + 1, yc, z + 1), at(x, yc, z + 1)] })
    // The +z side falls on the left of the picture and the +x side on the right.
    out.push({ face: 'left', points: [at(x, y, z + 1), at(x + 1, y, z + 1), at(x + 1, y + 1, z + 1), at(x, y + 1, z + 1)] })
    out.push({ face: 'right', points: [at(x + 1, y, z), at(x + 1, y, z + 1), at(x + 1, y + 1, z + 1), at(x + 1, y + 1, z)] })
  }
  return out
}

/**
 * Which face shows at each point of a coarse grid over the picture — the
 * picture reduced to something two shapes can be compared by.
 */
export function silhouette(shape: Shape, facing: Facing, step = 0.25): string {
  const polys = shapePolygons(shape, facing)
  const S = SHAPE_SIZE
  const rows: string[] = []
  for (let sy = -2 * S; sy <= S; sy += step) {
    let row = ''
    for (let sx = -S; sx <= S; sx += step) {
      let hit = '.'
      // Later polygons are nearer, so the last one containing the point wins.
      for (const p of polys) if (contains(p.points, sx + step / 2, sy + step / 2)) hit = p.face[0]
      row += hit
    }
    rows.push(row)
  }
  return rows.join('\n')
}

function contains(points: [number, number][], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
