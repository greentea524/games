// Per-hole procedural parkland scenery for Minigolf.
//
// Each of the nine holes gets its own deterministically seeded landscape —
// sunlit gradient sky, rolling meadow hills, stylized pine & oak trees,
// flowering shrubs, garden boulders, a quiet pond, and drifting clouds —
// placed strictly outside the course footprint and tee camera wedge so
// scenery frames the shot without ever obstructing a putt.
//
// Props are batched into InstancedMeshes so the entire parkland renders in
// a handful of draw calls and holds a steady frame rate on mobile GPUs and
// headless software WebGL alike.
import * as THREE from 'three'
import type { Box, Hole } from './holes'
import { prefersReducedMotion } from '../shared/motion'

export const SKY_HORIZON_COLOR = 0xcfe7dc

/** Mulberry32 PRNG for deterministic per-hole layouts. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(index: number, name: string): number {
  let h = (index + 1) * 2654435761
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 2246822519)
  }
  return h >>> 0
}

/** 2D footprint of a box in XZ. */
interface Footprint {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function boxFootprints(boxes: Box[]): Footprint[] {
  return boxes.map((b) => ({
    minX: b.x - b.w / 2,
    maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2,
    maxZ: b.z + b.d / 2,
  }))
}

/** Shortest horizontal distance from (x, z) to any box footprint in the hole. */
function distToCourse(x: number, z: number, prints: Footprint[]): number {
  let best = Infinity
  for (const p of prints) {
    const dx = x < p.minX ? p.minX - x : x > p.maxX ? x - p.maxX : 0
    const dz = z < p.minZ ? p.minZ - z : z > p.maxZ ? z - p.maxZ : 0
    const d = Math.hypot(dx, dz)
    if (d < best) best = d
  }
  return best
}

function buildSkyTexture(): THREE.CanvasTexture {
  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0.0, '#448fd0')
  grad.addColorStop(0.28, '#6cb4e6')
  grad.addColorStop(0.46, '#a9d7eb')
  grad.addColorStop(0.53, '#d7ece2')
  grad.addColorStop(0.62, '#b9d8c4')
  grad.addColorStop(1.0, '#6e9c7c')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const sunX = w * 0.68
  const sunY = h * 0.28
  const sun = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 96)
  sun.addColorStop(0.0, 'rgba(255, 253, 232, 0.92)')
  sun.addColorStop(0.25, 'rgba(255, 247, 210, 0.42)')
  sun.addColorStop(1.0, 'rgba(255, 245, 200, 0.0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Smooth rolling hill elevation outside the course footprint. */
function hillElevation(
  x: number,
  z: number,
  clearDist: number,
  phaseA: number,
  phaseB: number,
  pond: { x: number; z: number } | null,
): number {
  if (clearDist <= 2.4) return -0.46
  const blend = Math.min(1, (clearDist - 2.4) / 14)
  let smooth = blend * blend * (3 - 2 * blend)

  if (pond) {
    const pd = Math.hypot(x - pond.x, z - pond.z)
    if (pd <= 3.6) return -0.46
    const pBlend = Math.min(1, (pd - 3.6) / 4.5)
    smooth *= pBlend * pBlend * (3 - 2 * pBlend)
  }

  const wave1 = Math.sin(x * 0.075 + phaseA) * Math.cos(z * 0.065 + phaseB)
  const wave2 = Math.sin(x * 0.04 - z * 0.05 + phaseB * 1.3) * 0.65
  const wave3 = Math.cos(x * 0.13 + z * 0.11 - phaseA) * 0.22
  const distRise = Math.min(2.8, Math.max(0, clearDist - 18) * 0.048)

  const h = (wave1 * 1.15 + wave2 * 0.9 + wave3 * 0.45 + 0.75 + distRise) * smooth
  return -0.46 + Math.max(0, h)
}

interface InstanceEntry {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  sx: number
  sy: number
  sz: number
  color: number
}

interface CloudPuff {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  speed: number
}

export interface SceneryController {
  rebuild(hole: Hole, holeIndex: number): void
  update(dt: number, reducedMotion: boolean): void
  dispose(): void
}

const FLOWER_COLORS = [0xf26d5b, 0xf6c94c, 0xc293e6, 0xf9f5eb]
const PINE_COLORS = [0x266544, 0x2f7850, 0x3b8b5b]

export function createScenery(scene: THREE.Scene): SceneryController {
  const root = new THREE.Group()
  scene.add(root)

  const skyTex = buildSkyTexture()
  const skyGeo = new THREE.SphereGeometry(145, 20, 12)
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const skyMesh = new THREE.Mesh(skyGeo, skyMat)
  root.add(skyMesh)

  scene.fog = new THREE.Fog(SKY_HORIZON_COLOR, 36, 128)

  // Shared geometries & materials for instanced batches.
  const geos = {
    trunk: new THREE.CylinderGeometry(0.11, 0.18, 1.0, 6),
    cone: new THREE.ConeGeometry(0.95, 1.6, 7),
    blob: new THREE.IcosahedronGeometry(0.8, 1),
    rock: new THREE.DodecahedronGeometry(0.52, 0),
    box: new THREE.BoxGeometry(1, 1, 1),
    disc: new THREE.CylinderGeometry(1.0, 1.0, 0.08, 14),
    cloud: new THREE.IcosahedronGeometry(1.0, 1),
  }

  const mats = {
    ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
    lambert: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    pond: new THREE.MeshStandardMaterial({
      color: 0x4da8c9,
      roughness: 0.24,
      metalness: 0.06,
    }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xf7fbf9, fog: false }),
  }

  const holeGroup = new THREE.Group()
  root.add(holeGroup)

  const dynamicGeometries: THREE.BufferGeometry[] = []
  let cloudMesh: THREE.InstancedMesh | null = null
  let cloudPuffs: CloudPuff[] = []
  let cloudLimit = 78

  const dummy = new THREE.Object3D()
  const tmpColor = new THREE.Color()

  function clearHole() {
    while (holeGroup.children.length > 0) {
      holeGroup.remove(holeGroup.children[0])
    }
    for (const g of dynamicGeometries) g.dispose()
    dynamicGeometries.length = 0
    cloudMesh = null
    cloudPuffs = []
  }

  function addBatch(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    entries: InstanceEntry[],
    castShadow = false,
    receiveShadow = false,
  ): THREE.InstancedMesh | null {
    if (entries.length === 0) return null
    const mesh = new THREE.InstancedMesh(geo, mat, entries.length)
    mesh.castShadow = castShadow
    mesh.receiveShadow = receiveShadow
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      dummy.position.set(e.x, e.y, e.z)
      dummy.rotation.set(e.rx, e.ry, e.rz)
      dummy.scale.set(e.sx, e.sy, e.sz)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      tmpColor.setHex(e.color)
      mesh.setColorAt(i, tmpColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    holeGroup.add(mesh)
    return mesh
  }

  function rebuild(hole: Hole, holeIndex: number) {
    clearHole()

    const rand = mulberry32(hashSeed(holeIndex, hole.name))
    const prints = boxFootprints(hole.boxes)

    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of prints) {
      minX = Math.min(minX, p.minX)
      maxX = Math.max(maxX, p.maxX)
      minZ = Math.min(minZ, p.minZ)
      maxZ = Math.max(maxZ, p.maxZ)
    }
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const courseRad = Math.hypot((maxX - minX) / 2, (maxZ - minZ) / 2)

    const teeDx = hole.cup.x - hole.tee.x
    const teeDz = hole.cup.z - hole.tee.z
    const teeLen = Math.hypot(teeDx, teeDz) || 1
    const behindTeeX = hole.tee.x - (teeDx / teeLen) * 4.8
    const behindTeeZ = hole.tee.z - (teeDz / teeLen) * 4.8

    const phaseA = rand() * Math.PI * 2
    const phaseB = rand() * Math.PI * 2

    const placed: { x: number; z: number; r: number }[] = []
    const canPlace = (x: number, z: number, propRadius: number, minCourseClear: number, tall: boolean) => {
      if (distToCourse(x, z, prints) < minCourseClear + propRadius) return false
      if (tall && Math.hypot(x - behindTeeX, z - behindTeeZ) < 4.5 + propRadius) return false
      for (const p of placed) {
        if (Math.hypot(x - p.x, z - p.z) < p.r + propRadius + 0.6) return false
      }
      return true
    }

    // Choose the pond location first so the ground mesh carves a level hollow.
    let pondPos: { x: number; z: number } | null = null
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = rand() * Math.PI * 2
      const dist = courseRad + 4.8 + rand() * 5.2
      const px = cx + Math.cos(angle) * dist
      const pz = cz + Math.sin(angle) * dist
      const dCourse = distToCourse(px, pz, prints)
      if (dCourse >= 4.2 && dCourse <= 9.5 && canPlace(px, pz, 2.8, 3.8, false)) {
        pondPos = { x: px, z: pz }
        placed.push({ x: px, z: pz, r: 3.1 })
        break
      }
    }

    // 1. Sculpted parkland ground plane with vertex-colored meadow gradients.
    const groundSize = 185
    const segs = 32
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize, segs, segs)
    groundGeo.rotateX(-Math.PI / 2)

    const pos = groundGeo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const cApron = new THREE.Color(0x2a663f)
    const cMeadow = new THREE.Color(0x3f844e)
    const cHill = new THREE.Color(0x529758)
    const cFar = new THREE.Color(0x68a671)
    const tmp = new THREE.Color()

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + cx
      const vz = pos.getZ(i) + cz
      const d = distToCourse(vx, vz, prints)
      const vy = hillElevation(vx, vz, d, phaseA, phaseB, pondPos)
      pos.setXYZ(i, vx, vy, vz)

      const elev = Math.max(0, vy + 0.46)
      if (d < 3.0) {
        tmp.copy(cApron).lerp(cMeadow, d / 3.0)
      } else if (elev < 2.2) {
        tmp.copy(cMeadow).lerp(cHill, elev / 2.2)
      } else {
        tmp.copy(cHill).lerp(cFar, Math.min(1, (elev - 2.2) / 4.0))
      }
      const tint = Math.sin(vx * 0.21 + phaseA) * Math.cos(vz * 0.19 - phaseB) * 0.035
      colors[i * 3] = Math.max(0, Math.min(1, tmp.r + tint))
      colors[i * 3 + 1] = Math.max(0, Math.min(1, tmp.g + tint * 1.1))
      colors[i * 3 + 2] = Math.max(0, Math.min(1, tmp.b + tint * 0.6))
    }

    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    groundGeo.computeVertexNormals()
    dynamicGeometries.push(groundGeo)

    const groundMesh = new THREE.Mesh(groundGeo, mats.ground)
    groundMesh.receiveShadow = true
    holeGroup.add(groundMesh)

    // Accumulators for instanced batches (shadowed near-ring vs unshadowed far).
    const trunksNear: InstanceEntry[] = []
    const trunksFar: InstanceEntry[] = []
    const conesNear: InstanceEntry[] = []
    const conesFar: InstanceEntry[] = []
    const blobsNear: InstanceEntry[] = []
    const blobsFar: InstanceEntry[] = []
    const rocks: InstanceEntry[] = []
    const woodBoxes: InstanceEntry[] = []
    const pondBanks: InstanceEntry[] = []
    const pondWaters: InstanceEntry[] = []

    // 2. Garden pond in its carved hollow.
    if (pondPos) {
      const rot = rand() * Math.PI * 2
      const cosR = Math.cos(rot)
      const sinR = Math.sin(rot)
      const baseY = -0.46

      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rand() * 0.5
        const dist = i === 0 ? 0 : 0.9 + rand() * 0.6
        const rad = i === 0 ? 1.85 + rand() * 0.45 : 1.15 + rand() * 0.45
        const lx = Math.cos(a) * dist
        const lz = Math.sin(a) * dist
        const wx = pondPos.x + lx * cosR - lz * sinR
        const wz = pondPos.z + lx * sinR + lz * cosR

        pondBanks.push({
          x: wx,
          y: baseY + 0.02,
          z: wz,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: rad + 0.22,
          sy: 0.85,
          sz: rad + 0.22,
          color: 0x7d8b7d,
        })
        pondWaters.push({
          x: wx,
          y: baseY + 0.055,
          z: wz,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: rad,
          sy: 1,
          sz: rad,
          color: 0xffffff,
        })
      }

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rand() * 0.4
        const r = 1.9 + rand() * 0.65
        const sx = (0.65 + rand() * 0.6) * 0.45
        const sy = (0.42 + rand() * 0.35) * 0.45
        const sz = (0.65 + rand() * 0.6) * 0.45
        rocks.push({
          x: pondPos.x + Math.cos(a) * r,
          y: baseY + 0.08,
          z: pondPos.z + Math.sin(a) * r,
          rx: rand() * 0.5,
          ry: rand() * Math.PI * 2,
          rz: rand() * 0.5,
          sx,
          sy,
          sz,
          color: rand() < 0.55 ? 0x8f9992 : 0x9c988a,
        })
      }

      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2
        const r = 1.75 + rand() * 0.55
        trunksFar.push({
          x: pondPos.x + Math.cos(a) * r,
          y: baseY + 0.32,
          z: pondPos.z + Math.sin(a) * r,
          rx: (rand() - 0.5) * 0.25,
          ry: rand() * Math.PI,
          rz: (rand() - 0.5) * 0.25,
          sx: 0.22,
          sy: 0.72,
          sz: 0.22,
          color: 0x4f8246,
        })
      }
    }

    // 3. Low garden accents near the course perimeter.
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + (rand() - 0.5) * 0.25
      const dist = courseRad + 1.8 + rand() * 8.5
      const px = cx + Math.cos(angle) * dist
      const pz = cz + Math.sin(angle) * dist
      const dCourse = distToCourse(px, pz, prints)
      if (!canPlace(px, pz, 0.85, 1.5, false)) continue

      const py = hillElevation(px, pz, dCourse, phaseA, phaseB, pondPos)
      const roll = rand()
      if (roll < 0.55) {
        const count = 2 + Math.floor(rand() * 2)
        for (let k = 0; k < count; k++) {
          const sc = (0.72 + rand() * 0.48) * 0.52
          blobsFar.push({
            x: px + (rand() - 0.5) * 0.55,
            y: py + sc * 0.55,
            z: pz + (rand() - 0.5) * 0.55,
            rx: 0,
            ry: rand() * Math.PI,
            rz: 0,
            sx: sc * 1.15,
            sy: sc * 0.85,
            sz: sc * 1.1,
            color: k === 0 ? 0x3a844c : 0x458f49,
          })
        }
        if (rand() < 0.65) {
          const fColor = FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]
          for (let k = 0; k < 3; k++) {
            const fa = rand() * Math.PI * 2
            const fr = 0.16 + rand() * 0.3
            blobsFar.push({
              x: px + Math.cos(fa) * fr,
              y: py + 0.38 + rand() * 0.18,
              z: pz + Math.sin(fa) * fr,
              rx: 0,
              ry: 0,
              rz: 0,
              sx: 0.12,
              sy: 0.12,
              sz: 0.12,
              color: fColor,
            })
          }
        }
      } else if (roll < 0.86) {
        const sx = 0.65 + rand() * 0.75
        const sy = 0.42 + rand() * 0.42
        const sz = 0.65 + rand() * 0.75
        rocks.push({
          x: px,
          y: py + sy * 0.28,
          z: pz,
          rx: rand() * 0.5,
          ry: rand() * Math.PI * 2,
          rz: rand() * 0.5,
          sx,
          sy,
          sz,
          color: rand() < 0.55 ? 0x8f9992 : 0x9c988a,
        })
      } else {
        const fy = angle + Math.PI / 2
        const cosF = Math.cos(fy)
        const sinF = Math.sin(fy)
        for (const sx of [-0.65, 0.65]) {
          woodBoxes.push({
            x: px + sx * cosF,
            y: py + 0.26,
            z: pz - sx * sinF,
            rx: 0,
            ry: fy,
            rz: 0,
            sx: 0.12,
            sy: 0.52,
            sz: 0.12,
            color: 0x8a6949,
          })
        }
        for (const ry of [0.22, 0.4]) {
          woodBoxes.push({
            x: px,
            y: py + ry,
            z: pz,
            rx: 0,
            ry: fy,
            rz: 0,
            sx: 1.4,
            sy: 0.07,
            sz: 0.06,
            color: 0x8a6949,
          })
        }
      }
      placed.push({ x: px, z: pz, r: 0.9 })
    }

    // 4. Parkland trees (near ring casts shadows; far ring stays unshadowed).
    const pineBias = 0.35 + (holeIndex % 3) * 0.2
    for (let i = 0; i < 64; i++) {
      const angle = rand() * Math.PI * 2
      const ring = i < 28 ? 0 : 1
      const dist =
        ring === 0
          ? courseRad + 4.2 + rand() * 14
          : courseRad + 16 + rand() * 26
      const px = cx + Math.cos(angle) * dist
      const pz = cz + Math.sin(angle) * dist
      const minClear = ring === 0 ? 3.2 : 8.0
      if (!canPlace(px, pz, 1.4, minClear, true)) continue

      const dCourse = distToCourse(px, pz, prints)
      const py = hillElevation(px, pz, dCourse, phaseA, phaseB, pondPos) - 0.08
      const near = ring === 0
      const tList = near ? trunksNear : trunksFar

      if (rand() < pineBias) {
        const s = 0.78 + rand() * 0.55
        const sy = s * (0.92 + rand() * 0.22)
        const trunkH = 0.8 + rand() * 0.45
        tList.push({
          x: px,
          y: py + trunkH * 0.5 * sy,
          z: pz,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: s,
          sy: trunkH * sy,
          sz: s,
          color: 0x6b4c35,
        })
        const cList = near ? conesNear : conesFar
        const tiers = [
          { dy: trunkH + 0.65, r: 1.0, h: 1.0, col: PINE_COLORS[0] },
          { dy: trunkH + 1.48, r: 0.78, h: 0.84, col: PINE_COLORS[1] },
          { dy: trunkH + 2.2, r: 0.53, h: 0.66, col: PINE_COLORS[2] },
        ]
        for (const t of tiers) {
          cList.push({
            x: px,
            y: py + t.dy * sy,
            z: pz,
            rx: 0,
            ry: rand() * Math.PI,
            rz: 0,
            sx: t.r * s,
            sy: t.h * sy,
            sz: t.r * s,
            color: t.col,
          })
        }
      } else {
        const s = 0.85 + rand() * 0.48
        const trunkH = 1.0 + rand() * 0.4
        tList.push({
          x: px,
          y: py + trunkH * 0.5 * s,
          z: pz,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: 1.15 * s,
          sy: trunkH * s,
          sz: 1.15 * s,
          color: 0x6b4c35,
        })
        const bList = near ? blobsNear : blobsFar
        const mainCol = rand() < 0.5 ? 0x458f49 : 0x5aa653
        const altCol = mainCol === 0x458f49 ? 0x5aa653 : 0x458f49
        bList.push({
          x: px,
          y: py + (trunkH + 0.65) * s,
          z: pz,
          rx: 0,
          ry: 0,
          rz: 0,
          sx: 1.18 * s,
          sy: 0.94 * s,
          sz: 1.12 * s,
          color: mainCol,
        })
        const puffs = 2 + Math.floor(rand() * 2)
        for (let k = 0; k < puffs; k++) {
          const pa = (k / puffs) * Math.PI * 2 + rand() * 0.8
          const ps = (0.62 + rand() * 0.25) * s
          bList.push({
            x: px + Math.cos(pa) * 0.52 * s,
            y: py + (trunkH + 0.45 + rand() * 0.35) * s,
            z: pz + Math.sin(pa) * 0.52 * s,
            rx: 0,
            ry: 0,
            rz: 0,
            sx: ps,
            sy: ps,
            sz: ps,
            color: k === 0 ? altCol : mainCol,
          })
        }
      }
      placed.push({ x: px, z: pz, r: 1.55 })
    }

    // Commit all instanced batches (total ~10 draw calls for the whole park).
    addBatch(geos.trunk, mats.lambert, trunksNear, true, false)
    addBatch(geos.trunk, mats.lambert, trunksFar, false, false)
    addBatch(geos.cone, mats.lambert, conesNear, true, false)
    addBatch(geos.cone, mats.lambert, conesFar, false, false)
    addBatch(geos.blob, mats.lambert, blobsNear, true, false)
    addBatch(geos.blob, mats.lambert, blobsFar, false, false)
    addBatch(geos.rock, mats.lambert, rocks, false, true)
    addBatch(geos.box, mats.lambert, woodBoxes, false, false)
    addBatch(geos.disc, mats.lambert, pondBanks, false, true)
    addBatch(geos.disc, mats.pond, pondWaters, false, true)

    // 5. High drifting low-poly clouds (single InstancedMesh).
    cloudLimit = 78
    for (let i = 0; i < 9; i++) {
      const speed = 0.35 + rand() * 0.45
      const baseX = cx + (rand() - 0.5) * cloudLimit * 1.8
      const baseY = 11 + rand() * 8
      const baseZ = cz + (rand() - 0.5) * cloudLimit * 1.6
      const puffs = 3 + Math.floor(rand() * 2)
      for (let k = 0; k < puffs; k++) {
        const sc = k === 0 ? 1.8 + rand() * 0.8 : 1.0 + rand() * 0.85
        cloudPuffs.push({
          x: baseX + (k - (puffs - 1) / 2) * (1.35 + rand() * 0.4),
          y: baseY + (rand() - 0.35) * 0.45,
          z: baseZ + (rand() - 0.5) * 0.9,
          sx: sc * 1.45,
          sy: sc * 0.62,
          sz: sc * 1.05,
          speed,
        })
      }
    }

    if (cloudPuffs.length > 0) {
      cloudMesh = new THREE.InstancedMesh(geos.cloud, mats.cloud, cloudPuffs.length)
      cloudMesh.frustumCulled = false
      writeClouds()
      holeGroup.add(cloudMesh)
    }

    skyMesh.position.set(cx, 0, cz)
  }

  function writeClouds() {
    if (!cloudMesh) return
    for (let i = 0; i < cloudPuffs.length; i++) {
      const c = cloudPuffs[i]
      dummy.position.set(c.x, c.y, c.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(c.sx, c.sy, c.sz)
      dummy.updateMatrix()
      cloudMesh.setMatrixAt(i, dummy.matrix)
    }
    cloudMesh.instanceMatrix.needsUpdate = true
  }

  function update(dt: number, reducedMotion: boolean) {
    if (!cloudMesh || reducedMotion || prefersReducedMotion()) return
    const minX = skyMesh.position.x - cloudLimit
    const maxX = skyMesh.position.x + cloudLimit
    for (const c of cloudPuffs) {
      c.x += c.speed * dt
      if (c.x > maxX) c.x = minX
    }
    writeClouds()
  }

  function dispose() {
    clearHole()
    scene.fog = null
    skyGeo.dispose()
    skyMat.dispose()
    skyTex.dispose()
    for (const g of Object.values(geos)) g.dispose()
    for (const m of Object.values(mats)) m.dispose()
    scene.remove(root)
  }

  return { rebuild, update, dispose }
}
