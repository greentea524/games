// Per-hole procedural parkland scenery for Minigolf.
//
// Each of the nine holes gets its own deterministically seeded landscape —
// sunlit gradient sky, rolling meadow hills, stylized pine & oak trees,
// flowering shrubs, garden boulders, a quiet pond, and drifting clouds —
// placed strictly outside the course footprint and tee camera wedge so
// scenery frames the shot without ever obstructing a putt.
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

/** 2D footprint of a box in XZ, expanded for tilted ramps. */
interface Footprint {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function boxFootprints(boxes: Box[]): Footprint[] {
  return boxes.map((b) => {
    const halfW = b.w / 2
    const halfD = b.d / 2
    return {
      minX: b.x - halfW,
      maxX: b.x + halfW,
      minZ: b.z - halfD,
      maxZ: b.z + halfD,
    }
  })
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

  // Soft warm sunlit glow aligned roughly with the directional key light.
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
  // Keep a level parkland apron directly beneath and beside the course so no
  // ground geometry ever pokes up into a green, ramp, or wall.
  if (clearDist <= 2.4) return -0.46
  const blend = Math.min(1, (clearDist - 2.4) / 14)
  let smooth = blend * blend * (3 - 2 * blend)

  // Carve a level meadow hollow around the pond so water never clips a hill slope.
  if (pond) {
    const pd = Math.hypot(x - pond.x, z - pond.z)
    if (pd <= 3.6) return -0.46
    const pBlend = Math.min(1, (pd - 3.6) / 4.5)
    smooth *= pBlend * pBlend * (3 - 2 * pBlend)
  }

  const wave1 = Math.sin(x * 0.075 + phaseA) * Math.cos(z * 0.065 + phaseB)
  const wave2 = Math.sin((x * 0.04 - z * 0.05) + phaseB * 1.3) * 0.65
  const wave3 = Math.cos((x * 0.13 + z * 0.11) - phaseA) * 0.22
  const distRise = Math.min(2.8, Math.max(0, clearDist - 18) * 0.048)

  const h = (wave1 * 1.15 + wave2 * 0.9 + wave3 * 0.45 + 0.75 + distRise) * smooth
  return -0.46 + Math.max(0, h)
}

interface CloudItem {
  group: THREE.Group
  speed: number
  limit: number
}

export interface SceneryController {
  rebuild(hole: Hole, holeIndex: number): void
  update(dt: number, reducedMotion: boolean): void
  dispose(): void
}

export function createScenery(scene: THREE.Scene): SceneryController {
  const root = new THREE.Group()
  scene.add(root)

  // Sky dome + atmospheric horizon haze.
  const skyTex = buildSkyTexture()
  const skyGeo = new THREE.SphereGeometry(145, 24, 16)
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const skyMesh = new THREE.Mesh(skyGeo, skyMat)
  root.add(skyMesh)

  scene.fog = new THREE.Fog(SKY_HORIZON_COLOR, 36, 128)

  // Shared prop geometries & materials reused across holes.
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.18, 1.0, 6)
  const pineBotGeo = new THREE.ConeGeometry(0.95, 1.6, 7)
  const pineMidGeo = new THREE.ConeGeometry(0.74, 1.35, 7)
  const pineTopGeo = new THREE.ConeGeometry(0.5, 1.05, 7)
  const canopyGeo = new THREE.IcosahedronGeometry(0.82, 1)
  const shrubGeo = new THREE.IcosahedronGeometry(0.42, 1)
  const blossomGeo = new THREE.IcosahedronGeometry(0.1, 0)
  const rockGeo = new THREE.DodecahedronGeometry(0.52, 0)
  const cloudPuffGeo = new THREE.IcosahedronGeometry(1.0, 1)
  const pondGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.08, 16)
  const reedGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.72, 5)
  const postGeo = new THREE.BoxGeometry(0.12, 0.52, 0.12)
  const railGeo = new THREE.BoxGeometry(1.4, 0.07, 0.06)

  const materials = {
    ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4c35 }),
    pineA: new THREE.MeshLambertMaterial({ color: 0x266544 }),
    pineB: new THREE.MeshLambertMaterial({ color: 0x2f7850 }),
    pineC: new THREE.MeshLambertMaterial({ color: 0x3b8b5b }),
    oakA: new THREE.MeshLambertMaterial({ color: 0x458f49 }),
    oakB: new THREE.MeshLambertMaterial({ color: 0x5aa653 }),
    shrub: new THREE.MeshLambertMaterial({ color: 0x3a844c }),
    rock: new THREE.MeshLambertMaterial({ color: 0x8f9992 }),
    rockWarm: new THREE.MeshLambertMaterial({ color: 0x9c988a }),
    pond: new THREE.MeshStandardMaterial({
      color: 0x4da8c9,
      roughness: 0.24,
      metalness: 0.06,
    }),
    pondEdge: new THREE.MeshLambertMaterial({ color: 0x7d8b7d }),
    reed: new THREE.MeshLambertMaterial({ color: 0x4f8246 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x8a6949 }),
    cloud: new THREE.MeshBasicMaterial({ color: 0xf7fbf9, fog: false }),
    flowers: [
      new THREE.MeshLambertMaterial({ color: 0xf26d5b }),
      new THREE.MeshLambertMaterial({ color: 0xf6c94c }),
      new THREE.MeshLambertMaterial({ color: 0xc293e6 }),
      new THREE.MeshLambertMaterial({ color: 0xf9f5eb }),
    ],
  }

  const holeGroup = new THREE.Group()
  root.add(holeGroup)

  const dynamicGeometries: THREE.BufferGeometry[] = []
  let clouds: CloudItem[] = []

  function clearHole() {
    while (holeGroup.children.length > 0) {
      holeGroup.remove(holeGroup.children[0])
    }
    for (const g of dynamicGeometries) g.dispose()
    dynamicGeometries.length = 0
    clouds = []
  }

  function makePineTree(rand: () => number): THREE.Group {
    const g = new THREE.Group()
    const trunkH = 0.8 + rand() * 0.45
    const trunk = new THREE.Mesh(trunkGeo, materials.trunk)
    trunk.scale.set(1, trunkH, 1)
    trunk.position.y = trunkH * 0.5
    trunk.castShadow = true
    g.add(trunk)

    const tones = [materials.pineA, materials.pineB, materials.pineC]
    const bot = new THREE.Mesh(pineBotGeo, tones[0])
    bot.position.y = trunkH + 0.65
    bot.rotation.y = rand() * Math.PI
    bot.castShadow = true
    g.add(bot)

    const mid = new THREE.Mesh(pineMidGeo, tones[1])
    mid.position.y = trunkH + 1.48
    mid.rotation.y = rand() * Math.PI
    mid.castShadow = true
    g.add(mid)

    const top = new THREE.Mesh(pineTopGeo, tones[2])
    top.position.y = trunkH + 2.2
    top.rotation.y = rand() * Math.PI
    top.castShadow = true
    g.add(top)

    const s = 0.78 + rand() * 0.55
    g.scale.set(s, s * (0.92 + rand() * 0.22), s)
    return g
  }

  function makeOakTree(rand: () => number): THREE.Group {
    const g = new THREE.Group()
    const trunkH = 1.0 + rand() * 0.4
    const trunk = new THREE.Mesh(trunkGeo, materials.trunk)
    trunk.scale.set(1.15, trunkH, 1.15)
    trunk.position.y = trunkH * 0.5
    trunk.castShadow = true
    g.add(trunk)

    const mainMat = rand() < 0.5 ? materials.oakA : materials.oakB
    const altMat = mainMat === materials.oakA ? materials.oakB : materials.oakA

    const crown = new THREE.Mesh(canopyGeo, mainMat)
    crown.position.set(0, trunkH + 0.65, 0)
    crown.scale.set(1.15, 0.92, 1.1)
    crown.castShadow = true
    g.add(crown)

    const puffs = 2 + Math.floor(rand() * 2)
    for (let i = 0; i < puffs; i++) {
      const a = (i / puffs) * Math.PI * 2 + rand() * 0.8
      const p = new THREE.Mesh(canopyGeo, i === 0 ? altMat : mainMat)
      p.scale.setScalar(0.62 + rand() * 0.25)
      p.position.set(Math.cos(a) * 0.52, trunkH + 0.45 + rand() * 0.35, Math.sin(a) * 0.52)
      p.castShadow = true
      g.add(p)
    }

    const s = 0.85 + rand() * 0.48
    g.scale.setScalar(s)
    return g
  }

  function makeShrub(rand: () => number): THREE.Group {
    const g = new THREE.Group()
    const count = 2 + Math.floor(rand() * 2)
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(shrubGeo, i === 0 ? materials.shrub : materials.oakA)
      const sc = 0.72 + rand() * 0.48
      m.scale.set(sc * 1.15, sc * 0.85, sc * 1.1)
      m.position.set((rand() - 0.5) * 0.55, sc * 0.32, (rand() - 0.5) * 0.55)
      m.castShadow = true
      g.add(m)
    }
    // Tiny colorful blossoms on some shrubs for warm garden character.
    if (rand() < 0.65) {
      const flowerMat = materials.flowers[Math.floor(rand() * materials.flowers.length)]
      const dots = 3 + Math.floor(rand() * 3)
      for (let i = 0; i < dots; i++) {
        const b = new THREE.Mesh(blossomGeo, flowerMat)
        const a = rand() * Math.PI * 2
        const r = 0.16 + rand() * 0.32
        b.position.set(Math.cos(a) * r, 0.38 + rand() * 0.2, Math.sin(a) * r)
        g.add(b)
      }
    }
    return g
  }

  function makeBoulder(rand: () => number): THREE.Mesh {
    const rock = new THREE.Mesh(rockGeo, rand() < 0.55 ? materials.rock : materials.rockWarm)
    const sx = 0.65 + rand() * 0.75
    const sy = 0.42 + rand() * 0.42
    const sz = 0.65 + rand() * 0.75
    rock.scale.set(sx, sy, sz)
    rock.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5)
    rock.position.y = sy * 0.28
    rock.castShadow = true
    rock.receiveShadow = true
    return rock
  }

  function makePond(rand: () => number): THREE.Group {
    const g = new THREE.Group()
    const lobes = 3
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + rand() * 0.5
      const dist = i === 0 ? 0 : 0.9 + rand() * 0.6
      const rad = i === 0 ? 1.85 + rand() * 0.45 : 1.15 + rand() * 0.45
      const ox = Math.cos(a) * dist
      const oz = Math.sin(a) * dist

      const bank = new THREE.Mesh(pondGeo, materials.pondEdge)
      bank.scale.set(rad + 0.22, 0.85, rad + 0.22)
      bank.position.set(ox, 0.02, oz)
      bank.receiveShadow = true
      g.add(bank)

      const water = new THREE.Mesh(pondGeo, materials.pond)
      water.scale.set(rad, 1, rad)
      water.position.set(ox, 0.055, oz)
      water.receiveShadow = true
      g.add(water)
    }

    // Ring of pebbles and reeds around the pond edge.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rand() * 0.4
      const r = 1.9 + rand() * 0.65
      const pebble = makeBoulder(rand)
      pebble.scale.multiplyScalar(0.45)
      pebble.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r)
      g.add(pebble)
    }
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2
      const r = 1.75 + rand() * 0.55
      const reed = new THREE.Mesh(reedGeo, materials.reed)
      reed.position.set(Math.cos(a) * r, 0.32, Math.sin(a) * r)
      reed.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI, (rand() - 0.5) * 0.25)
      g.add(reed)
    }

    return g
  }

  function makeFenceSegment(): THREE.Group {
    const g = new THREE.Group()
    for (const sx of [-0.65, 0.65]) {
      const post = new THREE.Mesh(postGeo, materials.wood)
      post.position.set(sx, 0.26, 0)
      post.castShadow = true
      g.add(post)
    }
    for (const y of [0.22, 0.4]) {
      const rail = new THREE.Mesh(railGeo, materials.wood)
      rail.position.set(0, y, 0)
      rail.castShadow = true
      g.add(rail)
    }
    return g
  }

  function makeCloud(rand: () => number): THREE.Group {
    const g = new THREE.Group()
    const puffs = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < puffs; i++) {
      const p = new THREE.Mesh(cloudPuffGeo, materials.cloud)
      const sc = i === 0 ? 1.8 + rand() * 0.8 : 1.0 + rand() * 0.9
      p.scale.set(sc * 1.45, sc * 0.62, sc * 1.05)
      p.position.set(
        (i - (puffs - 1) / 2) * (1.35 + rand() * 0.4),
        (rand() - 0.35) * 0.45,
        (rand() - 0.5) * 0.9,
      )
      g.add(p)
    }
    return g
  }

  function rebuild(hole: Hole, holeIndex: number) {
    clearHole()

    const rand = mulberry32(hashSeed(holeIndex, hole.name))
    const prints = boxFootprints(hole.boxes)

    // Course center & radius for centering the terrain and rings of props.
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

    // Direction behind the tee where the opening 3D camera sits — keep tall
    // trees out of this wedge so they never stand in front of the lens.
    const teeDx = hole.cup.x - hole.tee.x
    const teeDz = hole.cup.z - hole.tee.z
    const teeLen = Math.hypot(teeDx, teeDz) || 1
    const behindTeeX = hole.tee.x - (teeDx / teeLen) * 4.8
    const behindTeeZ = hole.tee.z - (teeDz / teeLen) * 4.8

    const phaseA = rand() * Math.PI * 2
    const phaseB = rand() * Math.PI * 2

    // Keep track of placed props to prevent overlapping.
    const placed: { x: number; z: number; r: number }[] = []
    const canPlace = (x: number, z: number, propRadius: number, minCourseClear: number, tall: boolean) => {
      if (distToCourse(x, z, prints) < minCourseClear + propRadius) return false
      if (tall && Math.hypot(x - behindTeeX, z - behindTeeZ) < 4.5 + propRadius) return false
      for (const p of placed) {
        if (Math.hypot(x - p.x, z - p.z) < p.r + propRadius + 0.6) return false
      }
      return true
    }

    // Choose the pond location first so the ground mesh carves a level hollow
    // underneath it instead of sloping through the water surface.
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
    const segs = 68
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
      // Subtle per-vertex meadow warmth variation.
      const tint = Math.sin(vx * 0.21 + phaseA) * Math.cos(vz * 0.19 - phaseB) * 0.035
      colors[i * 3] = Math.max(0, Math.min(1, tmp.r + tint))
      colors[i * 3 + 1] = Math.max(0, Math.min(1, tmp.g + tint * 1.1))
      colors[i * 3 + 2] = Math.max(0, Math.min(1, tmp.b + tint * 0.6))
    }

    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    groundGeo.computeVertexNormals()
    dynamicGeometries.push(groundGeo)

    const groundMesh = new THREE.Mesh(groundGeo, materials.ground)
    groundMesh.receiveShadow = true
    holeGroup.add(groundMesh)

    // 2. Place the garden pond in its carved hollow.
    if (pondPos) {
      const pond = makePond(rand)
      pond.position.set(pondPos.x, -0.46, pondPos.z)
      pond.rotation.y = rand() * Math.PI * 2
      holeGroup.add(pond)
    }

    // 3. Low garden accents near the course perimeter (shrubs, boulders, wooden fences).
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + (rand() - 0.5) * 0.25
      const dist = courseRad + 1.8 + rand() * 8.5
      const px = cx + Math.cos(angle) * dist
      const pz = cz + Math.sin(angle) * dist
      const dCourse = distToCourse(px, pz, prints)
      if (!canPlace(px, pz, 0.85, 1.5, false)) continue

      const py = hillElevation(px, pz, dCourse, phaseA, phaseB, pondPos)
      const roll = rand()
      let obj: THREE.Object3D
      if (roll < 0.55) {
        obj = makeShrub(rand)
      } else if (roll < 0.86) {
        obj = makeBoulder(rand)
      } else {
        obj = makeFenceSegment()
        obj.rotation.y = angle + Math.PI / 2
      }
      obj.position.set(px, py, pz)
      holeGroup.add(obj)
      placed.push({ x: px, z: pz, r: 0.9 })
    }

    // 4. Midground & background parkland trees (mix of pine and oak, varied per hole).
    const pineBias = 0.35 + (holeIndex % 3) * 0.2
    const treeAttempts = 85
    for (let i = 0; i < treeAttempts; i++) {
      const angle = rand() * Math.PI * 2
      const ring = i < 36 ? 0 : 1
      const dist =
        ring === 0
          ? courseRad + 4.2 + rand() * 14
          : courseRad + 16 + rand() * 26
      const px = cx + Math.cos(angle) * dist
      const pz = cz + Math.sin(angle) * dist
      const minClear = ring === 0 ? 3.2 : 8.0
      if (!canPlace(px, pz, 1.4, minClear, true)) continue

      const dCourse = distToCourse(px, pz, prints)
      const py = hillElevation(px, pz, dCourse, phaseA, phaseB, pondPos)
      const tree = rand() < pineBias ? makePineTree(rand) : makeOakTree(rand)
      tree.position.set(px, py - 0.08, pz)
      holeGroup.add(tree)
      placed.push({ x: px, z: pz, r: 1.55 })
    }

    // 5. High drifting low-poly clouds.
    const cloudCount = 10
    for (let i = 0; i < cloudCount; i++) {
      const cloud = makeCloud(rand)
      const limit = 78
      const x = cx + (rand() - 0.5) * limit * 1.8
      const y = 11 + rand() * 8
      const z = cz + (rand() - 0.5) * limit * 1.6
      cloud.position.set(x, y, z)
      holeGroup.add(cloud)
      clouds.push({
        group: cloud,
        speed: 0.35 + rand() * 0.45,
        limit,
      })
    }

    // Keep sky centered on the hole.
    skyMesh.position.set(cx, 0, cz)
  }

  function update(dt: number, reducedMotion: boolean) {
    if (reducedMotion || prefersReducedMotion()) return
    for (const c of clouds) {
      c.group.position.x += c.speed * dt
      if (c.group.position.x > skyMesh.position.x + c.limit) {
        c.group.position.x = skyMesh.position.x - c.limit
      }
    }
  }

  function dispose() {
    clearHole()
    scene.fog = null
    skyGeo.dispose()
    skyMat.dispose()
    skyTex.dispose()
    trunkGeo.dispose()
    pineBotGeo.dispose()
    pineMidGeo.dispose()
    pineTopGeo.dispose()
    canopyGeo.dispose()
    shrubGeo.dispose()
    blossomGeo.dispose()
    rockGeo.dispose()
    cloudPuffGeo.dispose()
    pondGeo.dispose()
    reedGeo.dispose()
    postGeo.dispose()
    railGeo.dispose()
    materials.ground.dispose()
    materials.trunk.dispose()
    materials.pineA.dispose()
    materials.pineB.dispose()
    materials.pineC.dispose()
    materials.oakA.dispose()
    materials.oakB.dispose()
    materials.shrub.dispose()
    materials.rock.dispose()
    materials.rockWarm.dispose()
    materials.pond.dispose()
    materials.pondEdge.dispose()
    materials.reed.dispose()
    materials.wood.dispose()
    materials.cloud.dispose()
    for (const f of materials.flowers) f.dispose()
    scene.remove(root)
  }

  return { rebuild, update, dispose }
}
