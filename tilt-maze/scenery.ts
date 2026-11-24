// Craftsman's wooden tabletop gimbal housing, per-level desk scenery, and goal
// win sparkle burst for Tilt Maze (#188).
//
// The tilting maze sits inside a stationary outer wooden labyrinth box with
// brass corner plates, axis pivot pins, rotating control knobs, and a deep
// recessed dark-felt catch well beneath the board so every hole (`o`) reads as
// an unmistakable dark drop. Around the housing lies a dark walnut workbench
// with deterministically seeded per-level tabletop props.
import * as THREE from 'three'
import { CELL, FLOOR_THICKNESS, MAX_TILT } from './physics'
import { prefersReducedMotion } from '../shared/motion'

export const DESK_BG_COLOR = 0x130e0b

/** Mulberry32 PRNG for deterministic per-level desk layouts. */
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

/** Procedural dark walnut workbench surface with plank joints and soft vignette. */
function buildWalnutDeskTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#261912'
  ctx.fillRect(0, 0, size, size)

  const rand = mulberry32(18801)
  const plankCount = 6
  const plankH = size / plankCount

  for (let p = 0; p < plankCount; p++) {
    const y0 = p * plankH
    const toneShift = (rand() - 0.5) * 14
    const r = Math.round(42 + toneShift)
    const g = Math.round(27 + toneShift * 0.72)
    const b = Math.round(19 + toneShift * 0.55)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.fillRect(0, y0, size, plankH)

    // Fine organic wood-grain fibers along each plank.
    for (let i = 0; i < 150; i++) {
      const gy = y0 + rand() * plankH
      const dark = rand() < 0.55
      ctx.strokeStyle = dark
        ? `rgba(14, 8, 5, ${0.14 + rand() * 0.2})`
        : `rgba(88, 58, 38, ${0.08 + rand() * 0.14})`
      ctx.lineWidth = 0.8 + rand() * 2.2
      ctx.beginPath()
      ctx.moveTo(0, gy)
      const waveAmp = (rand() - 0.5) * 5
      ctx.bezierCurveTo(
        size * 0.33,
        gy + waveAmp,
        size * 0.66,
        gy - waveAmp,
        size,
        gy + (rand() - 0.5) * 2,
      )
      ctx.stroke()
    }

    // Subtle dark plank seam.
    ctx.fillStyle = 'rgba(8, 5, 3, 0.55)'
    ctx.fillRect(0, y0, size, 2)
  }

  // Soft overhead workbench lamp falloff so the labyrinth stays the focal point.
  const vig = ctx.createRadialGradient(size / 2, size / 2, size * 0.14, size / 2, size / 2, size * 0.62)
  vig.addColorStop(0.0, 'rgba(255, 224, 180, 0.08)')
  vig.addColorStop(0.6, 'rgba(0, 0, 0, 0.0)')
  vig.addColorStop(1.0, 'rgba(8, 5, 4, 0.52)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(8, Math.max(1, maxAniso))
  tex.needsUpdate = true
  return tex
}

/** Procedural warm hardwood grain for the outer wooden gimbal box. */
function buildHousingWoodTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#6d472c'
  ctx.fillRect(0, 0, size, size)

  const rand = mulberry32(18827)
  for (let i = 0; i < 240; i++) {
    const y = rand() * size
    const dark = rand() < 0.52
    ctx.strokeStyle = dark
      ? `rgba(42, 24, 12, ${0.14 + rand() * 0.22})`
      : `rgba(154, 108, 68, ${0.1 + rand() * 0.16})`
    ctx.lineWidth = 0.8 + rand() * 1.9
    ctx.beginPath()
    ctx.moveTo(0, y)
    const amp = (rand() - 0.5) * 4
    ctx.bezierCurveTo(size * 0.35, y + amp, size * 0.7, y - amp, size, y)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = Math.min(8, Math.max(1, maxAniso))
  tex.needsUpdate = true
  return tex
}

/** Procedural brass compass face texture. */
function buildCompassFaceTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const c = size / 2

  ctx.fillStyle = '#e8dfc9'
  ctx.beginPath()
  ctx.arc(c, c, c - 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#3a3328'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(c, c, c - 10, 0, Math.PI * 2)
  ctx.stroke()

  // Cardinal tick marks.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const inner = i % 2 === 0 ? c - 26 : c - 19
    ctx.strokeStyle = i === 0 ? '#b93b2c' : '#3a3328'
    ctx.lineWidth = i % 2 === 0 ? 3 : 2
    ctx.beginPath()
    ctx.moveTo(c + Math.sin(a) * inner, c - Math.cos(a) * inner)
    ctx.lineTo(c + Math.sin(a) * (c - 10), c - Math.cos(a) * (c - 10))
    ctx.stroke()
  }

  // Compass needle (north red, south dark steel).
  ctx.fillStyle = '#c23f32'
  ctx.beginPath()
  ctx.moveTo(c, c - 34)
  ctx.lineTo(c + 7, c)
  ctx.lineTo(c - 7, c)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#2d343d'
  ctx.beginPath()
  ctx.moveTo(c, c + 34)
  ctx.lineTo(c + 7, c)
  ctx.lineTo(c - 7, c)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#c8a45c'
  ctx.beginPath()
  ctx.arc(c, c, 5, 0, Math.PI * 2)
  ctx.fill()

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

interface Sparkle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rx: number
  ry: number
  rz: number
  vr: number
  age: number
  life: number
  scale: number
}

const SPARKLE_COUNT = 64
const SPARKLE_COLORS = [0x35d6a4, 0x7ff5cf, 0xffd166, 0xfff5d6]

export interface TiltScenery {
  rebuild(cols: number, rows: number, levelIndex: number, levelName: string): void
  /** Launch a celebratory sparkle burst over the goal tile. */
  burstWin(x: number, y: number, z: number): void
  clearWin(): void
  /** Syncs the wooden housing control knobs to the live tilt and steps win sparkles. */
  update(dt: number, tiltX: number, tiltZ: number): void
  dispose(): void
}

export function createTiltScenery(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
): TiltScenery {
  const root = new THREE.Group()
  scene.add(root)

  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const deskTex = buildWalnutDeskTexture(maxAniso)
  const housingTex = buildHousingWoodTexture(maxAniso)
  const compassTex = buildCompassFaceTexture()

  const mats = {
    desk: new THREE.MeshStandardMaterial({
      map: deskTex,
      roughness: 0.82,
      metalness: 0.04,
    }),
    wood: new THREE.MeshStandardMaterial({
      map: housingTex,
      roughness: 0.68,
      metalness: 0.05,
    }),
    woodDark: new THREE.MeshStandardMaterial({
      color: 0x472d1b,
      roughness: 0.76,
      metalness: 0.04,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xc9a55b,
      roughness: 0.36,
      metalness: 0.48,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x8e99a6,
      roughness: 0.38,
      metalness: 0.45,
    }),
    // Deep velvet-dark catch well directly beneath the tilting maze so holes
    // (`o`) remain crisp, unmistakable dark drops.
    well: new THREE.MeshBasicMaterial({ color: 0x06080c }),
    compassFace: new THREE.MeshLambertMaterial({ map: compassTex }),
    marbleGold: new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.25, metalness: 0.2 }),
    marbleMint: new THREE.MeshStandardMaterial({ color: 0x35d6a4, roughness: 0.25, metalness: 0.15 }),
    marbleSteel: new THREE.MeshStandardMaterial({ color: 0xaab7c8, roughness: 0.22, metalness: 0.45 }),
    marbleAmber: new THREE.MeshStandardMaterial({ color: 0xd97a4a, roughness: 0.28, metalness: 0.15 }),
  }

  // Shared prop geometries.
  const geos = {
    desk: new THREE.PlaneGeometry(76, 76),
    pin: new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10),
    knobStem: new THREE.CylinderGeometry(0.11, 0.11, 0.42, 10),
    knobGrip: new THREE.CylinderGeometry(0.32, 0.34, 0.34, 14),
    knobRing: new THREE.CylinderGeometry(0.345, 0.345, 0.06, 14),
    knobNotch: new THREE.BoxGeometry(0.08, 0.36, 0.12),
    compassBody: new THREE.CylinderGeometry(0.62, 0.66, 0.2, 20),
    compassFace: new THREE.CircleGeometry(0.54, 20),
    compassRing: new THREE.TorusGeometry(0.14, 0.035, 8, 16),
    marble: new THREE.SphereGeometry(0.22, 16, 12),
    weight: new THREE.CylinderGeometry(0.26, 0.3, 0.48, 12),
    weightCap: new THREE.SphereGeometry(0.11, 10, 8),
    ruler: new THREE.BoxGeometry(3.8, 0.07, 0.56),
    rulerEdge: new THREE.BoxGeometry(3.8, 0.075, 0.08),
    block: new THREE.BoxGeometry(0.85, 0.42, 0.62),
  }
  geos.desk.rotateX(-Math.PI / 2)
  geos.compassFace.rotateX(-Math.PI / 2)

  // Sparkle burst InstancedMesh for level completion.
  const sparkleGeo = new THREE.OctahedronGeometry(0.1, 0)
  const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const sparkleMesh = new THREE.InstancedMesh(sparkleGeo, sparkleMat, SPARKLE_COUNT)
  sparkleMesh.visible = false
  sparkleMesh.frustumCulled = false
  root.add(sparkleMesh)

  const tmpColor = new THREE.Color()
  for (let i = 0; i < SPARKLE_COUNT; i++) {
    tmpColor.setHex(SPARKLE_COLORS[i % SPARKLE_COLORS.length])
    sparkleMesh.setColorAt(i, tmpColor)
  }
  if (sparkleMesh.instanceColor) sparkleMesh.instanceColor.needsUpdate = true

  const sparkles: Sparkle[] = Array.from({ length: SPARKLE_COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    vr: 0,
    age: 0,
    life: 1.5,
    scale: 1,
  }))
  let sparklesActive = false
  let sparklesStatic = false

  const dummy = new THREE.Object3D()

  function writeSparkles() {
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const s = sparkles[i]
      if (s.age < 0 || s.age >= s.life) {
        dummy.position.set(0, -100, 0)
        dummy.scale.setScalar(0)
      } else {
        const t = s.age / s.life
        const fade = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1
        dummy.position.set(s.x, s.y, s.z)
        dummy.rotation.set(s.rx, s.ry, s.rz)
        dummy.scale.setScalar(s.scale * fade)
      }
      dummy.updateMatrix()
      sparkleMesh.setMatrixAt(i, dummy.matrix)
    }
    sparkleMesh.instanceMatrix.needsUpdate = true
  }

  function burstWin(x: number, y: number, z: number) {
    sparklesStatic = prefersReducedMotion()
    sparklesActive = true
    sparkleMesh.visible = true

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const s = sparkles[i]
      const a = (i / SPARKLE_COUNT) * Math.PI * 2 + Math.random() * 0.4
      const spd = 0.8 + Math.random() * 2.1
      s.x = x + Math.cos(a) * 0.14
      s.y = y + 0.18
      s.z = z + Math.sin(a) * 0.14
      s.vx = Math.cos(a) * spd
      s.vy = 2.4 + Math.random() * 3.0
      s.vz = Math.sin(a) * spd
      s.rx = Math.random() * Math.PI
      s.ry = Math.random() * Math.PI
      s.rz = Math.random() * Math.PI
      s.vr = (Math.random() - 0.5) * 9
      s.age = 0
      s.life = 1.4 + Math.random() * 0.8
      s.scale = 0.75 + Math.random() * 0.7

      if (sparklesStatic) {
        const rad = 0.45 + Math.random() * 0.9
        s.x = x + Math.cos(a) * rad
        s.y = y + 0.4 + Math.random() * 0.85
        s.z = z + Math.sin(a) * rad
        s.age = 0.3
        s.life = 999
      }
    }
    writeSparkles()
  }

  function clearWin() {
    sparklesActive = false
    sparkleMesh.visible = false
  }

  // Stationary per-level housing + desk props group.
  const levelGroup = new THREE.Group()
  root.add(levelGroup)

  const dynamicGeos: THREE.BufferGeometry[] = []
  let knobXSpin: THREE.Group | null = null
  let knobZSpin: THREE.Group | null = null

  function clearLevel() {
    while (levelGroup.children.length > 0) {
      levelGroup.remove(levelGroup.children[0])
    }
    for (const g of dynamicGeos) g.dispose()
    dynamicGeos.length = 0
    knobXSpin = null
    knobZSpin = null
  }

  function makeKnob(): { mount: THREE.Group; spin: THREE.Group } {
    const mount = new THREE.Group()
    const spin = new THREE.Group()
    mount.add(spin)
    const stem = new THREE.Mesh(geos.knobStem, mats.brass)
    stem.position.y = 0.21
    const grip = new THREE.Mesh(geos.knobGrip, mats.woodDark)
    grip.position.y = 0.52
    grip.castShadow = true
    const ring = new THREE.Mesh(geos.knobRing, mats.brass)
    ring.position.y = 0.52
    const notch = new THREE.Mesh(geos.knobNotch, mats.brass)
    notch.position.set(0.28, 0.52, 0)
    spin.add(stem, grip, ring, notch)
    return { mount, spin }
  }

  function makeCompass(): THREE.Group {
    const g = new THREE.Group()
    const body = new THREE.Mesh(geos.compassBody, mats.brass)
    body.position.y = 0.1
    body.castShadow = true
    body.receiveShadow = true
    const face = new THREE.Mesh(geos.compassFace, mats.compassFace)
    face.position.y = 0.205
    const ring = new THREE.Mesh(geos.compassRing, mats.brass)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 0.1, -0.74)
    g.add(body, face, ring)
    return g
  }

  function makeMarbleTray(rand: () => number): THREE.Group {
    const g = new THREE.Group()
    const baseGeo = new THREE.BoxGeometry(2.3, 0.16, 1.1)
    const rimLongGeo = new THREE.BoxGeometry(2.3, 0.18, 0.12)
    const rimShortGeo = new THREE.BoxGeometry(0.12, 0.18, 0.86)
    dynamicGeos.push(baseGeo, rimLongGeo, rimShortGeo)

    const base = new THREE.Mesh(baseGeo, mats.woodDark)
    base.position.y = 0.08
    base.castShadow = true
    base.receiveShadow = true
    g.add(base)

    for (const sz of [-0.49, 0.49]) {
      const r = new THREE.Mesh(rimLongGeo, mats.wood)
      r.position.set(0, 0.22, sz)
      r.castShadow = true
      g.add(r)
    }
    for (const sx of [-1.09, 1.09]) {
      const r = new THREE.Mesh(rimShortGeo, mats.wood)
      r.position.set(sx, 0.22, 0)
      r.castShadow = true
      g.add(r)
    }

    const marbleMats = [mats.marbleGold, mats.marbleMint, mats.marbleSteel, mats.marbleAmber]
    const count = 3 + (rand() < 0.5 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geos.marble, marbleMats[i % marbleMats.length])
      m.position.set(-0.68 + i * 0.46 + (rand() - 0.5) * 0.08, 0.38, (rand() - 0.5) * 0.24)
      m.castShadow = true
      g.add(m)
    }
    return g
  }

  function makeRuler(): THREE.Group {
    const g = new THREE.Group()
    const body = new THREE.Mesh(geos.ruler, mats.wood)
    body.position.y = 0.035
    body.castShadow = true
    body.receiveShadow = true
    const edge = new THREE.Mesh(geos.rulerEdge, mats.brass)
    edge.position.set(0, 0.038, 0.24)
    g.add(body, edge)
    return g
  }

  function makeBrassWeight(): THREE.Group {
    const g = new THREE.Group()
    const body = new THREE.Mesh(geos.weight, mats.brass)
    body.position.y = 0.24
    body.castShadow = true
    const cap = new THREE.Mesh(geos.weightCap, mats.brass)
    cap.position.y = 0.54
    cap.castShadow = true
    g.add(body, cap)
    return g
  }

  function rebuild(cols: number, rows: number, levelIndex: number, levelName: string) {
    clearLevel()
    clearWin()

    const rand = mulberry32(hashSeed(levelIndex, levelName))

    const wide = cols * CELL
    const deep = rows * CELL
    const hx = wide / 2
    const hz = deep / 2

    // Keep the dark catch well safely below the board's lowest possible corner
    // at simultaneous max tilt on both axes.
    const maxDrop = (hx + hz) * Math.sin(MAX_TILT) + FLOOR_THICKNESS
    const wellY = -(maxDrop + 0.45)
    const deskY = wellY - 0.16

    // Outer wooden gimbal box dimensions hugging the board with clear tilt gap.
    const gap = 0.38
    const frameThick = 0.56
    const innerW = wide + gap * 2
    const innerD = deep + gap * 2
    const outerW = innerW + frameThick * 2
    const outerD = innerD + frameThick * 2
    const boxTopY = 0.24
    const boxHeight = boxTopY - deskY
    const boxMidY = (boxTopY + deskY) / 2

    // 1. Dark walnut workbench surface.
    const desk = new THREE.Mesh(geos.desk, mats.desk)
    desk.position.set(0, deskY, 0)
    desk.receiveShadow = true
    levelGroup.add(desk)

    // 2. Deep recessed dark-felt catch well directly under the tilting board.
    const wellGeo = new THREE.PlaneGeometry(innerW + 0.1, innerD + 0.1)
    wellGeo.rotateX(-Math.PI / 2)
    dynamicGeos.push(wellGeo)
    const well = new THREE.Mesh(wellGeo, mats.well)
    well.position.set(0, wellY, 0)
    levelGroup.add(well)

    // 3. Four stationary outer wooden gimbal box walls.
    const wallNSGeo = new THREE.BoxGeometry(outerW, boxHeight, frameThick)
    const wallEWGeo = new THREE.BoxGeometry(frameThick, boxHeight, innerD)
    const trimNSGeo = new THREE.BoxGeometry(outerW + 0.04, 0.08, frameThick + 0.04)
    const trimEWGeo = new THREE.BoxGeometry(frameThick + 0.04, 0.08, innerD + 0.04)
    const cornerGeo = new THREE.BoxGeometry(frameThick + 0.08, 0.12, frameThick + 0.08)
    dynamicGeos.push(wallNSGeo, wallEWGeo, trimNSGeo, trimEWGeo, cornerGeo)

    for (const sz of [-1, 1]) {
      const z = sz * (innerD / 2 + frameThick / 2)
      const wall = new THREE.Mesh(wallNSGeo, mats.wood)
      wall.position.set(0, boxMidY, z)
      wall.castShadow = true
      wall.receiveShadow = true
      levelGroup.add(wall)

      const trim = new THREE.Mesh(trimNSGeo, mats.woodDark)
      trim.position.set(0, boxTopY + 0.04, z)
      trim.receiveShadow = true
      levelGroup.add(trim)
    }

    for (const sx of [-1, 1]) {
      const x = sx * (innerW / 2 + frameThick / 2)
      const wall = new THREE.Mesh(wallEWGeo, mats.wood)
      wall.position.set(x, boxMidY, 0)
      wall.castShadow = true
      wall.receiveShadow = true
      levelGroup.add(wall)

      const trim = new THREE.Mesh(trimEWGeo, mats.woodDark)
      trim.position.set(x, boxTopY + 0.04, 0)
      trim.receiveShadow = true
      levelGroup.add(trim)
    }

    // Brushed brass corner brackets on all four top corners.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bracket = new THREE.Mesh(cornerGeo, mats.brass)
        bracket.position.set(
          sx * (innerW / 2 + frameThick / 2),
          boxTopY + 0.05,
          sz * (innerD / 2 + frameThick / 2),
        )
        levelGroup.add(bracket)
      }
    }

    // 4. Axis pivot pins connecting housing walls toward the tilting board.
    for (const sx of [-1, 1]) {
      const pin = new THREE.Mesh(geos.pin, mats.steel)
      pin.rotation.z = Math.PI / 2
      pin.position.set(sx * (hx + gap * 0.65), -0.05, 0)
      levelGroup.add(pin)
    }
    for (const sz of [-1, 1]) {
      const pin = new THREE.Mesh(geos.pin, mats.steel)
      pin.rotation.x = Math.PI / 2
      pin.position.set(0, -0.05, sz * (hz + gap * 0.65))
      levelGroup.add(pin)
    }

    // 5. Classic wooden/brass labyrinth control knobs on the +X and +Z sides.
    const kx = makeKnob()
    kx.mount.rotation.z = -Math.PI / 2
    kx.mount.position.set(outerW / 2, boxTopY - 0.52, 0)
    levelGroup.add(kx.mount)
    knobXSpin = kx.spin

    const kz = makeKnob()
    kz.mount.rotation.x = Math.PI / 2
    kz.mount.position.set(0, boxTopY - 0.52, outerD / 2)
    levelGroup.add(kz.mount)
    knobZSpin = kz.spin

    // 6. Per-level seeded craftsman tabletop props placed past the back wall's
    // sightline shadow (`boxHeight * 0.79`) so the compass, marble tray, ruler,
    // and weights sit clearly in view on the walnut desk behind the box.
    const halfOuterW = outerW / 2
    const halfOuterD = outerD / 2
    const farZ = -(halfOuterD + boxHeight * 0.82 + 1.05)
    const flipX = rand() < 0.5 ? 1 : -1

    // Wooden marble tray holding spare marbles along one side of the far apron.
    const tray = makeMarbleTray(rand)
    tray.position.set(
      flipX * (halfOuterW * 0.52 + rand() * 0.4),
      deskY,
      farZ - 0.15 - rand() * 0.45,
    )
    tray.rotation.y = (rand() - 0.5) * 0.24
    levelGroup.add(tray)

    // Brass pocket compass opposite the marble tray along the far apron.
    const compass = makeCompass()
    compass.position.set(
      -flipX * (halfOuterW * 0.56 + rand() * 0.45),
      deskY,
      farZ - 0.1 - rand() * 0.4,
    )
    compass.rotation.y = (rand() - 0.5) * 0.5
    levelGroup.add(compass)

    // Brass-edged wooden ruler resting slightly further back on the workbench.
    const ruler = makeRuler()
    ruler.position.set(
      (rand() - 0.5) * 1.4,
      deskY,
      farZ - 1.35 - rand() * 0.45,
    )
    ruler.rotation.y = (rand() - 0.5) * 0.14
    levelGroup.add(ruler)

    // Pair of brass calibration weights & a small wooden block near outer flanks.
    const w1 = makeBrassWeight()
    w1.position.set(-flipX * (halfOuterW * 0.12 + rand() * 0.3), deskY, farZ - 0.35)
    levelGroup.add(w1)

    const w2 = makeBrassWeight()
    w2.scale.setScalar(0.76)
    w2.position.set(w1.position.x + flipX * 0.62, deskY, farZ - 0.55)
    levelGroup.add(w2)

    const woodBlock = new THREE.Mesh(geos.block, mats.wood)
    woodBlock.position.set(
      flipX * (halfOuterW * 0.62 + rand() * 0.3),
      deskY + 0.21,
      halfOuterD + 1.35 + rand() * 0.4,
    )
    woodBlock.rotation.y = 0.25 + rand() * 0.65
    woodBlock.castShadow = true
    woodBlock.receiveShadow = true
    levelGroup.add(woodBlock)
  }

  function update(dt: number, tiltX: number, tiltZ: number) {
    // Spin the wooden labyrinth control knobs cleanly around their own shafts.
    if (knobXSpin) knobXSpin.rotation.y = tiltZ * 3.2
    if (knobZSpin) knobZSpin.rotation.y = -tiltX * 3.2

    if (!sparklesActive || sparklesStatic) return

    let anyAlive = false
    const drag = Math.exp(-2.4 * dt)
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const s = sparkles[i]
      s.age += dt
      if (s.age >= s.life) continue
      anyAlive = true
      s.vy -= 5.8 * dt
      s.vx *= drag
      s.vz *= drag
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.z += s.vz * dt
      s.rx += s.vr * dt
      s.ry += s.vr * 0.8 * dt
    }
    writeSparkles()
    if (!anyAlive) {
      sparklesActive = false
      sparkleMesh.visible = false
    }
  }

  function dispose() {
    clearLevel()
    clearWin()
    scene.remove(root)
    deskTex.dispose()
    housingTex.dispose()
    compassTex.dispose()
    for (const g of Object.values(geos)) g.dispose()
    for (const m of Object.values(mats)) m.dispose()
    sparkleGeo.dispose()
    sparkleMat.dispose()
  }

  return { rebuild, burstWin, clearWin, update, dispose }
}
