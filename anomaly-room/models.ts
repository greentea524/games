// What the Anomaly Room's objects look like (#147).
//
// Every candidate used to be one box in one brown, so the room was twelve
// rectangles and a player had nothing to remember them by — "the clock" was a
// small square and "the lamp" a thin one. They are built from parts now, and
// the rule that makes that safe is the one thing in this file worth reading:
//
// **Every model fits inside its candidate's box.** The round picker in
// `rounds.ts` decides what is out of view from the box in `room.ts`, and
// projects that box's shadow; a model that poked out of it could be on screen
// while the picker believed it was not, and the player would watch it change.
// `anomaly_test.ts` builds each model and checks it against its box, so the
// picker's reasoning stays about what is actually drawn.
//
// No renderer here, only three.js objects, so the headless checks build
// exactly the meshes the game shows rather than a box standing in for them.
import * as THREE from 'three'
import type { Candidate, Pose } from './room'

/** Which of a candidate's two copies a mesh belongs to. */
export type Role = 'main' | 'twin'

interface Parts {
  add(geometry: THREE.BufferGeometry, colour: number | THREE.Color, at?: [number, number, number], options?: PartOptions): THREE.Mesh
}

interface PartOptions {
  rotation?: [number, number, number]
  emissive?: number
  flat?: boolean
  doubleSide?: boolean
}

/** A colour moved toward black (`k` < 1) or toward its own brighter self. */
const shade = (colour: number, k: number) => new THREE.Color(colour).multiplyScalar(k)

const boxGeo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

// ------------------------------------------------------------------ builders
//
// Each builds its object centred on the origin, inside a box of `size`. The
// world position, yaw and any scale a round applies all go on the group, so a
// model never has to know where it stands.

function crate(p: Parts, size: THREE.Vector3, colour: number) {
  const t = 0.07 // the frame's beam width
  const { x: w, y: h, z: d } = size
  p.add(boxGeo(w - 0.06, h - 0.06, d - 0.06), colour)
  const frame = shade(colour, 0.72)
  // The twelve edges.
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) p.add(boxGeo(w, t, t), frame, [0, sy * (h - t) / 2, sz * (d - t) / 2])
    for (const sx of [-1, 1]) p.add(boxGeo(t, t, d), frame, [sx * (w - t) / 2, sy * (h - t) / 2, 0])
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.add(boxGeo(t, h, t), frame, [sx * (w - t) / 2, 0, sz * (d - t) / 2])
  }
  // A diagonal brace across each side, which is what says "crate" rather than
  // "box". Laid inside the frame, so its ends stay within the edges.
  const brace = (across: number, onFace: number, face: 'x' | 'z', sign: number) => {
    const iw = across - 2 * t
    const ih = h - 2 * t
    const len = Math.hypot(iw, ih)
    const angle = Math.atan2(ih, iw)
    const depth = 0.025
    const offset = sign * (onFace / 2 - depth / 2)
    if (face === 'z') p.add(boxGeo(len, t * 0.8, depth), frame, [0, 0, offset], { rotation: [0, 0, angle * sign] })
    else p.add(boxGeo(depth, t * 0.8, len), frame, [offset, 0, 0], { rotation: [-angle * sign, 0, 0] })
  }
  for (const s of [-1, 1]) {
    brace(w, d, 'z', s)
    brace(d, w, 'x', s)
  }
}

function table(p: Parts, size: THREE.Vector3, colour: number) {
  const { x: w, y: h, z: d } = size
  const top = 0.06
  p.add(boxGeo(w, top, d), shade(colour, 1.15), [0, h / 2 - top / 2, 0])
  const leg = 0.08
  const legH = h - top
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      p.add(boxGeo(leg, legH, leg), colour, [sx * (w / 2 - 0.08), -h / 2 + legH / 2, sz * (d / 2 - 0.08)])
    }
  }
  // The apron under the top, between the legs.
  const apron = 0.09
  const ay = h / 2 - top - apron / 2
  for (const s of [-1, 1]) {
    p.add(boxGeo(w - 0.2, apron, 0.03), shade(colour, 0.85), [0, ay, s * (d / 2 - 0.08)])
    p.add(boxGeo(0.03, apron, d - 0.2), shade(colour, 0.85), [s * (w / 2 - 0.08), ay, 0])
  }
}

function chair(p: Parts, size: THREE.Vector3, colour: number) {
  const { x: w, y: h, z: d } = size
  const seatY = 0 // seat height is half the chair's: 0.45 of 0.9
  const seat = 0.05
  const leg = 0.045
  const inset = leg / 2 + 0.01
  p.add(boxGeo(w, seat, d), shade(colour, 1.1), [0, seatY, 0])
  const below = h / 2 + seatY - seat / 2
  for (const sx of [-1, 1]) {
    // Front legs stop at the seat; back legs carry on up as the uprights.
    p.add(boxGeo(leg, below, leg), colour, [sx * (w / 2 - inset), -h / 2 + below / 2, d / 2 - inset])
    p.add(boxGeo(leg, h, leg), colour, [sx * (w / 2 - inset), 0, -d / 2 + inset])
  }
  // Back rails, so the back reads as a back from across the room.
  p.add(boxGeo(w - 0.02, 0.14, 0.035), shade(colour, 1.1), [0, h / 2 - 0.09, -d / 2 + inset])
  p.add(boxGeo(w - 0.02, 0.05, 0.03), colour, [0, seatY + 0.17, -d / 2 + inset])
  // A stretcher low between the legs.
  p.add(boxGeo(w - 0.06, 0.03, 0.03), shade(colour, 0.8), [0, -h / 2 + 0.14, 0])
}

function lamp(p: Parts, size: THREE.Vector3, colour: number) {
  const { x: w, y: h } = size
  const r = w / 2
  p.add(new THREE.CylinderGeometry(r * 0.9, r, 0.04, 20), shade(colour, 0.7), [0, -h / 2 + 0.02, 0])
  const shadeH = 0.34
  const poleH = h - 0.04 - shadeH * 0.6
  p.add(new THREE.CylinderGeometry(0.017, 0.017, poleH, 8), shade(colour, 0.6), [0, -h / 2 + 0.04 + poleH / 2, 0])
  // The shade glows a little from inside. No light of its own: the round
  // picker reasons about one key light, and a second one throwing shadows
  // would be a cue it does not know about.
  p.add(
    new THREE.CylinderGeometry(r * 0.6, r, shadeH, 20, 1, true),
    0xd9c49a,
    [0, h / 2 - shadeH / 2, 0],
    { emissive: 0x4a3518, doubleSide: true },
  )
  p.add(new THREE.SphereGeometry(0.04, 10, 8), 0xffe2a8, [0, h / 2 - shadeH * 0.55, 0], { emissive: 0x8a6a30 })
}

/** Muted spines, in the room's narrow value range. */
const BOOKS = [0x6e3b34, 0x3c4a5e, 0x7a6a3a, 0x3f5a46, 0x5a4660, 0x7b5a3a, 0x4a5a62]

function shelf(p: Parts, size: THREE.Vector3, colour: number) {
  // Mounted on the west wall: `x` runs into the room, `-x` is the wall.
  const { x: depth, y: h, z: length } = size
  const board = 0.045
  p.add(boxGeo(depth, board, length), colour, [0, -h / 2 + board / 2, 0])
  // A row of books from one end, then a gap, a jar and a box. Heights stay
  // under the box's top.
  const room = h - board
  let z = -length / 2 + 0.06
  const widths = [0.05, 0.07, 0.045, 0.06, 0.055, 0.075, 0.05, 0.065, 0.045, 0.06]
  widths.forEach((bw, i) => {
    const bh = room * (0.72 + ((i * 37) % 28) / 100)
    const bd = depth * 0.62
    p.add(boxGeo(bd, bh, bw), BOOKS[i % BOOKS.length], [-depth / 2 + bd / 2 + 0.03, -h / 2 + board + bh / 2, z + bw / 2])
    z += bw + 0.006
  })
  // One leaning against the end of the row.
  p.add(boxGeo(depth * 0.6, room * 0.85, 0.05), BOOKS[3], [-depth / 2 + depth * 0.33, -h / 2 + board + room * 0.42, z + 0.05], {
    rotation: [-0.35, 0, 0],
  })
  p.add(new THREE.CylinderGeometry(0.06, 0.06, room * 0.8, 14), 0x5d6b66, [0, -h / 2 + board + room * 0.4, length / 2 - 0.55])
  p.add(boxGeo(depth * 0.5, room * 0.55, 0.22), shade(colour, 1.25), [-depth * 0.1, -h / 2 + board + room * 0.275, length / 2 - 0.2])
}

function picture(p: Parts, size: THREE.Vector3, colour: number) {
  // On the west wall: `x` is depth, and the painting faces `+x`.
  const { x: depth, y: h, z: w } = size
  const bar = 0.07
  const frame = shade(colour, 0.8)
  for (const s of [-1, 1]) {
    p.add(boxGeo(depth, bar, w), frame, [0, s * (h / 2 - bar / 2), 0])
    p.add(boxGeo(depth, h - 2 * bar, bar), frame, [0, 0, s * (w / 2 - bar / 2)])
  }
  // The canvas sits back in the frame, a little dusk landscape: sky, a hill,
  // a moon. Each layer stands a few millimetres proud of the last, so none of
  // them share a plane and flicker.
  const ch = h - 2 * bar
  const cw = w - 2 * bar
  const back = -depth / 2 + 0.01
  p.add(boxGeo(0.02, ch, cw), 0x4f6273, [back + 0.01, 0, 0])
  p.add(boxGeo(0.02, ch * 0.42, cw), 0x3f5340, [back + 0.014, -ch / 2 + ch * 0.21, 0])
  p.add(boxGeo(0.02, ch * 0.2, cw * 0.55), 0x4a6048, [back + 0.017, -ch / 2 + ch * 0.42 + ch * 0.05, -cw * 0.18], {
    rotation: [0.25, 0, 0],
  })
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 18), 0xd8d0b0, [back + 0.026, ch * 0.22, cw * 0.24], {
    rotation: [0, 0, Math.PI / 2],
    emissive: 0x2a2618,
  })
}

function rug(p: Parts, size: THREE.Vector3, colour: number) {
  const { x: w, y: h, z: d } = size
  // Stacked rather than coplanar, each layer an eighth of the rug's height
  // above the last, so the border and medallion never fight the field for the
  // same pixels. The top layer meets the top of the box and nothing passes it.
  const layer = (w2: number, d2: number, k: number, c: number | THREE.Color, turn = 0) =>
    p.add(boxGeo(w2, h * k, d2), c, [0, -h / 2 + (h * k) / 2, 0], { rotation: [0, turn, 0] })
  layer(w, d, 0.5, colour)
  layer(w - 0.22, d - 0.22, 0.625, 0x7a5a3c)
  layer(w - 0.36, d - 0.36, 0.75, shade(colour, 1.15))
  layer(0.5, 0.5, 0.875, 0x7a5a3c, Math.PI / 4)
  layer(0.26, 0.26, 1, 0x5c6a72, Math.PI / 4)
}

function bin(p: Parts, size: THREE.Vector3, colour: number) {
  const { x: w, y: h } = size
  const r = w / 2
  const rim = 0.014
  p.add(new THREE.CylinderGeometry(r - rim, r * 0.8, h - 0.02, 22, 1, true), colour, [0, -0.01, 0], { doubleSide: true })
  p.add(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.02, 22), shade(colour, 0.7), [0, -h / 2 + 0.01, 0])
  p.add(new THREE.TorusGeometry(r - rim, rim, 6, 24), shade(colour, 1.3), [0, h / 2 - rim, 0], { rotation: [Math.PI / 2, 0, 0] })
  // Something thrown away, so it reads as a bin and not a pipe.
  p.add(new THREE.IcosahedronGeometry(0.07, 0), 0xb8b0a0, [0.03, -h / 2 + 0.09, -0.02], { flat: true })
}

function plant(p: Parts, size: THREE.Vector3, _colour: number) {
  const { x: w, y: h } = size
  const potH = 0.34
  const potR = 0.17
  const pot = 0x7a5844
  p.add(new THREE.CylinderGeometry(potR, potR * 0.75, potH, 18), pot, [0, -h / 2 + potH / 2, 0])
  p.add(new THREE.CylinderGeometry(potR + 0.015, potR + 0.015, 0.05, 18), shade(pot, 1.15), [0, -h / 2 + potH - 0.025, 0])
  p.add(new THREE.CylinderGeometry(potR - 0.01, potR - 0.01, 0.01, 18), 0x2e261e, [0, -h / 2 + potH - 0.002, 0])
  p.add(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 6), 0x4a3c2a, [0, -h / 2 + potH + 0.15, 0])
  // Low-poly foliage: a few faceted clumps, kept inside the box's width.
  const leaf = [0x3f6a44, 0x4b7a4c, 0x35593a]
  const max = w / 2
  const clumps: [number, number, number, number][] = [
    [0, -h / 2 + potH + 0.22, 0, 0.24],
    [0.07, -h / 2 + potH + 0.44, 0.04, 0.2],
    [-0.06, -h / 2 + potH + 0.68, -0.03, 0.16],
  ]
  clumps.forEach(([x, y, z, r], i) => {
    const rr = Math.min(r, max - Math.hypot(x, z))
    p.add(new THREE.IcosahedronGeometry(rr, 0), leaf[i % leaf.length], [x, Math.min(y, h / 2 - rr), z], {
      rotation: [i * 0.7, i * 1.3, 0],
      flat: true,
    })
  })
}

function clock(p: Parts, size: THREE.Vector3, colour: number) {
  // On the north wall: `z` is depth, and the face looks along `+z`.
  const { x: w, z: depth } = size
  const r = w / 2
  const facing: [number, number, number] = [Math.PI / 2, 0, 0]
  const back = -depth / 2
  p.add(new THREE.CylinderGeometry(r, r, 0.05, 32), shade(colour, 0.55), [0, 0, back + 0.025], { rotation: facing })
  p.add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.01, 32), 0xd9d1bc, [0, 0, back + 0.055], { rotation: facing })
  p.add(new THREE.TorusGeometry(r * 0.93, r * 0.07, 8, 32), shade(colour, 0.7), [0, 0, back + 0.05])
  const front = back + 0.06
  const ink = 0x2a2622
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const long = i % 3 === 0
    p.add(boxGeo(long ? 0.018 : 0.01, long ? 0.05 : 0.03, 0.006), ink, [Math.sin(a) * r * 0.68, Math.cos(a) * r * 0.68, front + 0.003], {
      rotation: [0, 0, -a],
    })
  }
  // Hands at ten past ten, the shop-window time, so both read at a distance.
  const hand = (len: number, width: number, angle: number, z: number) => {
    const g = boxGeo(width, len, 0.006)
    g.translate(0, len / 2 - 0.02, 0)
    p.add(g, ink, [0, 0, z], { rotation: [0, 0, -angle] })
  }
  hand(r * 0.48, 0.022, (10 / 12) * Math.PI * 2 + 0.08, front + 0.008)
  hand(r * 0.7, 0.014, (2 / 12) * Math.PI * 2, front + 0.013)
  p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 12), ink, [0, 0, front + 0.012], { rotation: facing })
}

function stool(p: Parts, size: THREE.Vector3, colour: number) {
  const { x: w, y: h } = size
  const r = w / 2
  const seat = 0.05
  p.add(new THREE.CylinderGeometry(r, r * 0.95, seat, 24), shade(colour, 1.12), [0, h / 2 - seat / 2, 0])
  // Four splayed legs, wider at the floor than at the seat.
  const legW = 0.032
  const topR = r * 0.6
  const footR = r - legW
  const topY = h / 2 - seat
  const footY = -h / 2
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const top = new THREE.Vector3(Math.cos(a) * topR, topY, Math.sin(a) * topR)
    // Raised a little: a tilted leg's lower corner dips below its centre line.
    const foot = new THREE.Vector3(Math.cos(a) * footR, footY + legW * 0.6, Math.sin(a) * footR)
    const dir = top.clone().sub(foot)
    const mesh = p.add(boxGeo(legW, dir.length(), legW), colour, [(top.x + foot.x) / 2, (top.y + foot.y) / 2, (top.z + foot.z) / 2])
    mesh.quaternion.setFromUnitVectors(up, dir.normalize())
  }
  const ringY = footY + 0.17
  const t = (ringY - footY) / (topY - footY)
  p.add(new THREE.TorusGeometry(footR + (topR - footR) * t, 0.011, 6, 24), shade(colour, 0.8), [0, ringY, 0], {
    rotation: [Math.PI / 2, 0, 0],
  })
}

const BUILDERS: Record<string, (p: Parts, size: THREE.Vector3, colour: number) => void> = {
  crate,
  'crate-tall': crate,
  table,
  chair,
  lamp,
  shelf,
  picture,
  rug,
  bin,
  plant,
  clock,
  stool,
}

/**
 * Builds a candidate's model at its home size, centred on the origin.
 *
 * Every mesh in it carries the candidate's id as its name and `role` in its
 * user data, so a raycast hit on any part — a chair leg, a clock hand —
 * resolves to the object without walking the scene graph.
 */
export function buildModel(candidate: Candidate, role: Role): THREE.Group {
  const group = new THREE.Group()
  group.name = candidate.id
  const size = new THREE.Vector3(candidate.size.x, candidate.size.y, candidate.size.z)
  const parts: Parts = {
    add(geometry, colour, at = [0, 0, 0], options = {}) {
      const material = new THREE.MeshLambertMaterial({
        color: colour,
        emissive: options.emissive ?? 0x000000,
        flatShading: options.flat ?? false,
        side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(at[0], at[1], at[2])
      if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2])
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.name = candidate.id
      mesh.userData.role = role
      group.add(mesh)
      return mesh
    },
  }
  const builder = BUILDERS[candidate.id]
  if (!builder) throw new Error(`no model for ${candidate.id}`)
  builder(parts, size, candidate.colour)
  return group
}

/**
 * Puts a candidate's two copies where a pose says.
 *
 * Scale is relative to the home size the model was built at, so a model keeps
 * its proportions until a round deliberately changes them. Shared by the game
 * and by `anomaly_test.ts`, which must pose the room the same way the player
 * sees it.
 */
export function applyPose(main: THREE.Object3D, twin: THREE.Object3D, candidate: Candidate, pose: Pose): void {
  const sx = pose.size.x / candidate.size.x
  const sy = pose.size.y / candidate.size.y
  const sz = pose.size.z / candidate.size.z
  main.visible = pose.visible
  main.position.set(pose.position.x, pose.position.y, pose.position.z)
  main.scale.set(sx, sy, sz)
  main.rotation.y = pose.yaw
  twin.visible = pose.twin !== null
  // Parked at home when unused rather than left at the origin. A hidden twin
  // still answers a raycast, and the origin is the floor under the player's
  // feet: looking straight down used to flag the crate.
  const at = pose.twin ?? pose.position
  twin.position.set(at.x, at.y, at.z)
  twin.scale.set(sx, sy, sz)
  twin.rotation.y = pose.yaw
}

/**
 * Which candidate a raycast actually lands on, or null for nothing.
 *
 * Three's raycaster does not skip hidden objects, and that used to decide what
 * a tap meant. An object that vanished in an earlier round kept catching taps
 * where it had stood — and anything behind it — and each one cost a guess. So
 * hidden meshes are passed over, with one exception: the spot an object
 * vanished from in *this* round, which is the only way to point at something
 * that is gone.
 *
 * `shell` names the room's own walls; hitting one first is a missed tap.
 */
export function resolveHit(
  hits: readonly THREE.Intersection[],
  shell: ReadonlySet<string>,
  vanishedNow: string | null,
): string | null {
  for (const hit of hits) {
    const id = hit.object.name
    if (shell.has(id)) return null
    if (shown(hit.object)) return id
    if (id === vanishedNow && hit.object.userData.role === 'main') return id
  }
  return null
}

function shown(object: THREE.Object3D | null): boolean {
  for (let o = object; o; o = o.parent) if (!o.visible) return false
  return true
}
