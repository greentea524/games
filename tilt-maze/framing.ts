// How far back the camera stands so the whole board is on screen (#186).
//
// The camera used to stand back by the board's longest side times a fixed
// 1.15, whatever the shape of the screen. The field of view is fixed in the
// vertical, so on a portrait phone the horizontal one is less than half of it:
// on a 390x844 screen an 11-wide board showed about 3 of its 5.5 units each
// side of the middle, and the start, the corridors by the outer walls and the
// walls themselves were off the edges. Nothing re-ran it on a resize, either.
//
// This finds the nearest distance at which every corner of the board is on
// screen, clear of the HUD: the floor's underside and the walls' tops, at
// every lean the board can take, since the board tilts toward the camera and
// away. It is a search over the projection rather than a formula, because the
// view looks down at an angle and a tilted box's corners do not reduce to one.
//
// No three.js here, so `framing_test.ts` can hold all eight boards to it at
// any screen shape. The projection is written out, not borrowed: a check that
// shared three's maths with the game could not catch the game misusing it.

import { CELL, FLOOR_THICKNESS, MAX_TILT, WALL_HEIGHT } from './physics'

/** Which way the camera stands from the board's middle: up and toward the player. */
export const VIEW_DIR = { x: 0, y: 0.95, z: 0.75 }
/** The camera's vertical field of view, in degrees. */
export const FOV = 45

/** Room kept clear on screen, in CSS pixels: the HUD along the top, and a little elsewhere. */
export const CLEAR = { top: 60, bottom: 20, side: 10 }

type V3 = { x: number; y: number; z: number }

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const unit = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

/**
 * The board's corners as the renderer leans it: three's default Euler order
 * applies `rotation.x` (the lean toward the player, `tiltZ`) after
 * `rotation.z` (the lean sideways, `-tiltX`), so a point is turned about z
 * first and then about x.
 */
export function boardCorners(cols: number, rows: number, tiltX: number, tiltZ: number): V3[] {
  const hx = (cols * CELL) / 2
  const hz = (rows * CELL) / 2
  const out: V3[] = []
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) for (const y of [-FLOOR_THICKNESS, WALL_HEIGHT]) {
    // About z by -tiltX.
    const az = -tiltX
    const x1 = x * Math.cos(az) - y * Math.sin(az)
    const y1 = x * Math.sin(az) + y * Math.cos(az)
    // About x by tiltZ.
    const ax = tiltZ
    const y2 = y1 * Math.cos(ax) - z * Math.sin(ax)
    const z2 = y1 * Math.sin(ax) + z * Math.cos(ax)
    out.push({ x: x1, y: y2, z: z2 })
  }
  return out
}

/** Every corner the board can reach: at rest, and leaned to the limit each way and both. */
export function reachableCorners(cols: number, rows: number, maxTilt = MAX_TILT): V3[] {
  const out: V3[] = []
  for (const tx of [-maxTilt, 0, maxTilt]) for (const tz of [-maxTilt, 0, maxTilt]) out.push(...boardCorners(cols, rows, tx, tz))
  return out
}

/** Where a point lands on screen, in normalised device coordinates, from a camera `distance` out along `VIEW_DIR`. */
export function project(p: V3, distance: number, aspect: number, fov = FOV): { x: number; y: number } {
  const dir = unit(VIEW_DIR)
  const eye = { x: dir.x * distance, y: dir.y * distance, z: dir.z * distance }
  const forward = { x: -dir.x, y: -dir.y, z: -dir.z }
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }))
  const up = cross(right, forward)
  const v = sub(p, eye)
  const depth = dot(v, forward)
  const t = Math.tan(((fov / 2) * Math.PI) / 180)
  return { x: dot(v, right) / (depth * t * aspect), y: dot(v, up) / (depth * t) }
}

/** The screen's room for the board, in normalised device coordinates, at a size in CSS pixels. */
export function screenRoom(width: number, height: number, clear = CLEAR) {
  return {
    left: -1 + (2 * clear.side) / width,
    right: 1 - (2 * clear.side) / width,
    bottom: -1 + (2 * clear.bottom) / height,
    top: 1 - (2 * clear.top) / height,
  }
}

/** Whether every one of these points is inside the room, from this distance. */
export function fits(points: V3[], distance: number, width: number, height: number, clear = CLEAR): boolean {
  const w = screenRoom(width, height, clear)
  return points.every((p) => {
    const s = project(p, distance, width / height)
    return s.x >= w.left && s.x <= w.right && s.y >= w.bottom && s.y <= w.top
  })
}

/**
 * The nearest distance at which the whole board fits, leaned any way it can
 * be, on a screen of this size. Nearer than it, something is off the edge;
 * further, the board is smaller than it need be.
 */
export function fitDistance(cols: number, rows: number, width: number, height: number, clear = CLEAR): number {
  const points = reachableCorners(cols, rows)
  let near = 1
  let far = 400
  if (!fits(points, far, width, height, clear)) return far
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2
    if (fits(points, mid, width, height, clear)) far = mid
    else near = mid
  }
  return far
}
