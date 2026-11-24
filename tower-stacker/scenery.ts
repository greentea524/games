// Altitude-layered procedural night scenery for Tower Stacker (#187).
//
// As the orthographic camera climbs with `cameraY`, the player rises from a
// dark rooftop pedestal above a twilight city skyline, past drifting night
// clouds, a crescent moon, and a faint aurora, into a multi-tier starfield
// and distant ringed planet.
//
// Everything stays strictly behind the tower along the orthographic view axis
// and uses low-contrast dark atmospheric tones near the tower's waist so the
// pastel blocks remain unmistakably legible and `qa/touch/tower-stacker.mjs`'s
// luminance and silhouette checks hold without weakening them.
import * as THREE from 'three'
import { BASE_BLOCK, BLOCK_HEIGHT } from './stack'
import { OUTLINE, SKY } from './constants'
import { VIEW_DIR } from './framing'
import { prefersReducedMotion } from '../shared/motion'

/** Mulberry32 PRNG for a deterministic, recognisable night sky across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface CloudPuff {
  screenX: number
  screenY: number
  towerY: number
  depth: number
  sx: number
  sy: number
  speed: number
  limit: number
  color: number
}

interface StarMeta {
  baseR: number
  baseG: number
  baseB: number
  freq: number
  phase: number
  amp: number
}

export interface TowerScenery {
  /** Updates sky altitude tint and decorative cloud/star motion. */
  update(dt: number, cameraY: number, elapsed: number): void
  dispose(): void
}

/** Soft radial halo texture for the crescent moon's glow (no hard disc edge). */
function buildMoonGlowTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const half = size / 2
  const grad = ctx.createRadialGradient(half, half, half * 0.22, half, half, half)
  grad.addColorStop(0.0, 'rgba(68, 102, 160, 0.22)')
  grad.addColorStop(0.55, 'rgba(54, 86, 142, 0.09)')
  grad.addColorStop(1.0, 'rgba(40, 68, 120, 0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Soft horizontal aurora gradient texture for upper-atmosphere ribbons. */
function buildAuroraTexture(): THREE.CanvasTexture {
  const w = 256
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const vGrad = ctx.createLinearGradient(0, 0, 0, h)
  vGrad.addColorStop(0.0, 'rgba(36, 118, 128, 0.0)')
  vGrad.addColorStop(0.45, 'rgba(42, 148, 134, 0.42)')
  vGrad.addColorStop(0.75, 'rgba(72, 92, 168, 0.28)')
  vGrad.addColorStop(1.0, 'rgba(54, 46, 118, 0.0)')
  ctx.fillStyle = vGrad
  ctx.fillRect(0, 0, w, h)

  // Fade left and right ends softly so the ribbon has no hard box edges.
  ctx.globalCompositeOperation = 'destination-in'
  const hGrad = ctx.createLinearGradient(0, 0, w, 0)
  hGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)')
  hGrad.addColorStop(0.18, 'rgba(0, 0, 0, 1)')
  hGrad.addColorStop(0.82, 'rgba(0, 0, 0, 1)')
  hGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = hGrad
  ctx.fillRect(0, 0, w, h)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function createTowerScenery(scene: THREE.Scene): TowerScenery {
  const root = new THREE.Group()
  scene.add(root)

  // Orthonormal camera basis matching Tower Stacker's orthographic view.
  // Pushing background geometry along `viewFwd` places it cleanly behind the
  // tower without shifting its screen projection.
  const viewDir = new THREE.Vector3(VIEW_DIR.x, VIEW_DIR.y, VIEW_DIR.z).normalize()
  const viewFwd = viewDir.clone().negate()
  const camRight = new THREE.Vector3().crossVectors(viewFwd, new THREE.Vector3(0, 1, 0)).normalize()
  const camUp = new THREE.Vector3().crossVectors(camRight, viewFwd).normalize()

  // Orientation facing the orthographic camera (local +Z points toward camera).
  const billboardBasis = new THREE.Matrix4().makeBasis(camRight, camUp, viewDir)
  const billboardQuat = new THREE.Quaternion().setFromRotationMatrix(billboardBasis)

  const tmpPos = new THREE.Vector3()
  function placeAt(screenX: number, screenY: number, towerY: number, depth: number, out: THREE.Vector3) {
    out
      .set(0, towerY, 0)
      .addScaledVector(camRight, screenX)
      .addScaledVector(camUp, screenY)
      .addScaledVector(viewFwd, depth)
  }

  const rand = mulberry32(18701)
  const disposables: { dispose(): void }[] = []

  // --------------------------------------------------- 1. Rooftop pedestal
  //
  // Anchors BASE_BLOCK so the tower stands on a stepped architectural plinth
  // instead of floating in empty space. Kept dark enough that even its sunlit
  // +Y face stays strictly below `sky + 0.12`, so `qa/touch/tower-stacker.mjs`
  // measures only the tower slabs in `tones()`.
  const pedestalEdgeMat = new THREE.LineBasicMaterial({ color: OUTLINE })
  const pedestalTopMat = new THREE.MeshLambertMaterial({ color: 0x151e30, flatShading: true })
  const pedestalFootMat = new THREE.MeshLambertMaterial({ color: 0x101726, flatShading: true })
  disposables.push(pedestalEdgeMat, pedestalTopMat, pedestalFootMat)

  const baseBottomY = -BLOCK_HEIGHT / 2
  const plinthTiers = [
    { w: BASE_BLOCK.w + 0.16, h: 0.22, d: BASE_BLOCK.d + 0.16, y: baseBottomY - 0.11, mat: pedestalTopMat },
    { w: BASE_BLOCK.w + 0.36, h: 0.34, d: BASE_BLOCK.d + 0.36, y: baseBottomY - 0.39, mat: pedestalFootMat },
    { w: BASE_BLOCK.w + 0.54, h: 1.4, d: BASE_BLOCK.d + 0.54, y: baseBottomY - 1.26, mat: pedestalFootMat },
  ]
  for (const tier of plinthTiers) {
    const geo = new THREE.BoxGeometry(tier.w, tier.h, tier.d)
    const edgesGeo = new THREE.EdgesGeometry(geo)
    disposables.push(geo, edgesGeo)
    const mesh = new THREE.Mesh(geo, tier.mat)
    mesh.position.set(BASE_BLOCK.x, tier.y, BASE_BLOCK.z)
    mesh.add(new THREE.LineSegments(edgesGeo, pedestalEdgeMat))
    root.add(mesh)
  }

  // ------------------------------------------------ 2. Twilight city skyline
  //
  // Two atmospheric silhouette bands behind the tower base (y <= ~3.5).
  // Colours are intentionally deep twilight indigo (far) and near-midnight
  // slate (near) with subdued warm amber window glints so they stay cleanly
  // separated from the bright pastel tower slabs and within the sky luminance
  // tolerance checked by `qa/touch/tower-stacker.mjs`.
  interface RectEntry {
    screenX: number
    screenY: number
    towerY: number
    depth: number
    w: number
    h: number
    color: number
  }
  const skylineRects: RectEntry[] = []
  const windowRects: RectEntry[] = []

  // Horizon deck below the skyline so the city sits on a dark base.
  skylineRects.push({
    screenX: 0,
    screenY: -4.2,
    towerY: 0,
    depth: 30,
    w: 22,
    h: 5.8,
    color: 0x090e1a,
  })

  // Far indigo skyline silhouettes (depth 26).
  let fx = -7.6
  while (fx < 7.6) {
    const w = 0.34 + rand() * 0.52
    const h = 1.6 + rand() * 3.1
    const cx = fx + w / 2
    skylineRects.push({
      screenX: cx,
      screenY: -2.6 + h / 2,
      towerY: 0,
      depth: 26,
      w,
      h,
      color: rand() < 0.5 ? 0x121d36 : 0x101a31,
    })
    // Occasional rooftop spire or step-back crown on taller far towers.
    if (h > 3.2 && rand() < 0.6) {
      skylineRects.push({
        screenX: cx,
        screenY: -2.6 + h + 0.14,
        towerY: 0,
        depth: 26,
        w: w * 0.55,
        h: 0.28,
        color: 0x121d36,
      })
      if (rand() < 0.65) {
        skylineRects.push({
          screenX: cx,
          screenY: -2.6 + h + 0.48,
          towerY: 0,
          depth: 26,
          w: 0.04,
          h: 0.44,
          color: 0x121d36,
        })
      }
    }
    fx += w - 0.03 + rand() * 0.1
  }

  // Nearer dark midnight silhouettes (depth 20) with subtle warm window glints.
  let nx = -7.4
  while (nx < 7.4) {
    const w = 0.32 + rand() * 0.46
    const h = 1.2 + rand() * 2.35
    const cx = nx + w / 2
    const bottomY = -2.8
    skylineRects.push({
      screenX: cx,
      screenY: bottomY + h / 2,
      towerY: 0,
      depth: 20,
      w,
      h,
      color: rand() < 0.5 ? 0x080c16 : 0x0a0f1c,
    })

    // Sparse dimmed warm amber window dots on near buildings.
    const cols = Math.max(1, Math.floor((w - 0.08) / 0.14))
    const rows = Math.max(1, Math.floor((h - 0.3) / 0.2))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rand() > 0.32) continue
        const wx = cx - ((cols - 1) * 0.12) / 2 + c * 0.12
        const wy = bottomY + 0.32 + r * 0.19
        windowRects.push({
          screenX: wx,
          screenY: wy,
          towerY: 0,
          depth: 19.6,
          w: 0.055,
          h: 0.07,
          color: rand() < 0.72 ? 0x241d14 : 0x182236,
        })
      }
    }
    nx += w + rand() * 0.14
  }

  const planeGeo = new THREE.PlaneGeometry(1, 1)
  const flatBasicMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false })
  disposables.push(planeGeo, flatBasicMat)

  const dummy = new THREE.Object3D()
  const tmpColor = new THREE.Color()

  function buildRectBatch(entries: RectEntry[]): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(planeGeo, flatBasicMat, entries.length)
    mesh.frustumCulled = false
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      placeAt(e.screenX, e.screenY, e.towerY, e.depth, tmpPos)
      dummy.position.copy(tmpPos)
      dummy.quaternion.copy(billboardQuat)
      dummy.scale.set(e.w, e.h, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      tmpColor.setHex(e.color)
      mesh.setColorAt(i, tmpColor)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    root.add(mesh)
    return mesh
  }

  buildRectBatch(skylineRects)
  if (windowRects.length > 0) buildRectBatch(windowRects)

  // --------------------------------------------- 3. Drifting night clouds
  //
  // Stratified soft dark-slate cloud ribbons spanning lower-to-mid sky
  // (tower heights ~10 to ~100 blocks, world y = 2.8 to 28).
  const cloudPuffs: CloudPuff[] = []
  const cloudGeo = new THREE.CircleGeometry(0.5, 16)
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  disposables.push(cloudGeo, cloudMat)

  const cloudBands = [
    { towerY: 3.4, count: 4, limit: 7.5, depth: 24, speed: 0.08, color: 0x131e36 },
    { towerY: 6.2, count: 5, limit: 8.0, depth: 25, speed: 0.11, color: 0x142038 },
    { towerY: 9.8, count: 4, limit: 8.5, depth: 27, speed: 0.14, color: 0x131d34 },
    { towerY: 14.5, count: 3, limit: 8.5, depth: 29, speed: 0.16, color: 0x111a2f },
  ]
  for (const band of cloudBands) {
    for (let i = 0; i < band.count; i++) {
      const baseX = -band.limit + ((i + 0.5) / band.count) * band.limit * 2 + (rand() - 0.5) * 1.4
      const baseY = (rand() - 0.5) * 0.9
      const dir = i % 2 === 0 ? 1 : -1
      const speed = band.speed * (0.8 + rand() * 0.45) * dir
      const puffs = 3 + Math.floor(rand() * 2)
      for (let k = 0; k < puffs; k++) {
        const sc = k === 0 ? 1.15 + rand() * 0.4 : 0.65 + rand() * 0.45
        cloudPuffs.push({
          screenX: baseX + (k - (puffs - 1) / 2) * 0.58,
          screenY: baseY + (k === 0 ? 0.06 : -0.04 + (rand() - 0.5) * 0.12),
          towerY: band.towerY,
          depth: band.depth + k * 0.05,
          sx: sc * 1.75,
          sy: sc * 0.42,
          speed,
          limit: band.limit,
          color: band.color,
        })
      }
    }
  }

  const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudPuffs.length)
  cloudMesh.frustumCulled = false
  for (let i = 0; i < cloudPuffs.length; i++) {
    tmpColor.setHex(cloudPuffs[i].color)
    cloudMesh.setColorAt(i, tmpColor)
  }
  if (cloudMesh.instanceColor) cloudMesh.instanceColor.needsUpdate = true
  root.add(cloudMesh)

  function writeClouds() {
    for (let i = 0; i < cloudPuffs.length; i++) {
      const c = cloudPuffs[i]
      placeAt(c.screenX, c.screenY, c.towerY, c.depth, tmpPos)
      dummy.position.copy(tmpPos)
      dummy.quaternion.copy(billboardQuat)
      dummy.scale.set(c.sx, c.sy, 1)
      dummy.updateMatrix()
      cloudMesh.setMatrixAt(i, dummy.matrix)
    }
    cloudMesh.instanceMatrix.needsUpdate = true
  }
  writeClouds()

  // ---------------------------------------- 4. Crescent moon (upper sky)
  //
  // Sits in the upper-right sky around height 10–15 (visible on the hub
  // thumbnail and mid-run climb), well above the lower-half waist rows scanned
  // by `solidity()`.
  const moonGroup = new THREE.Group()
  const moonGlowTex = buildMoonGlowTexture()
  const moonDiskGeo = new THREE.CircleGeometry(0.34, 24)
  const moonGlowGeo = new THREE.PlaneGeometry(1.55, 1.55)
  const moonLitMat = new THREE.MeshBasicMaterial({ color: 0xb6cceb, depthWrite: false })
  const moonShadowMat = new THREE.MeshBasicMaterial({ color: SKY, depthWrite: false })
  const moonGlowMat = new THREE.MeshBasicMaterial({
    map: moonGlowTex,
    transparent: true,
    depthWrite: false,
  })
  disposables.push(moonGlowTex, moonDiskGeo, moonGlowGeo, moonLitMat, moonShadowMat, moonGlowMat)

  const moonGlow = new THREE.Mesh(moonGlowGeo, moonGlowMat)
  moonGlow.position.z = -0.06
  const moonLit = new THREE.Mesh(moonDiskGeo, moonLitMat)
  const moonMask = new THREE.Mesh(moonDiskGeo, moonShadowMat)
  moonMask.position.set(0.14, 0.08, 0.04)
  moonMask.scale.setScalar(0.95)

  moonGroup.add(moonGlow, moonLit, moonMask)
  placeAt(1.38, 1.05, 3.1, 32, tmpPos)
  moonGroup.position.copy(tmpPos)
  moonGroup.quaternion.copy(billboardQuat)
  root.add(moonGroup)

  // -------------------------------------- 5. Upper-atmosphere aurora ribbon
  const auroraTex = buildAuroraTexture()
  const auroraGeo = new THREE.PlaneGeometry(7.2, 1.35, 16, 1)
  const aPos = auroraGeo.attributes.position
  for (let i = 0; i < aPos.count; i++) {
    const ax = aPos.getX(i)
    aPos.setY(i, aPos.getY(i) + Math.sin(ax * 0.75) * 0.24)
  }
  auroraGeo.computeVertexNormals()
  const auroraMat = new THREE.MeshBasicMaterial({
    map: auroraTex,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  })
  disposables.push(auroraTex, auroraGeo, auroraMat)

  const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat)
  placeAt(-0.4, 0.3, 13.5, 34, tmpPos)
  auroraMesh.position.copy(tmpPos)
  auroraMesh.quaternion.copy(billboardQuat)
  root.add(auroraMesh)

  // ----------------------------------- 6. High-altitude ringed planet (cosmos)
  //
  // A real sphere with depthWrite enabled lets the far half of the tilted ring
  // tuck cleanly behind the planet body while the front half crosses over it.
  const planetGroup = new THREE.Group()
  const planetGeo = new THREE.SphereGeometry(0.55, 24, 16)
  const ringGeo = new THREE.RingGeometry(0.74, 1.06, 36)
  const planetMat = new THREE.MeshBasicMaterial({ color: 0x3b355c })
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x675f96,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  disposables.push(planetGeo, ringGeo, planetMat, ringMat)

  const planetBody = new THREE.Mesh(planetGeo, planetMat)
  const planetRing = new THREE.Mesh(ringGeo, ringMat)
  planetRing.rotation.set(1.22, 0.2, -0.35)
  planetGroup.add(planetBody, planetRing)
  placeAt(-1.35, 0.4, 24.0, 38, tmpPos)
  planetGroup.position.copy(tmpPos)
  planetGroup.quaternion.copy(billboardQuat)
  root.add(planetGroup)

  // -------------------------------------- 7. Multi-tier twinkling starfield
  //
  // Deterministic stars beginning cleanly above the city skyline's light
  // pollution (y >= 4.2, ~15+ blocks high) up into deep space (y = 64).
  // Starting above the lower waist rows keeps city silhouettes unspotted and
  // guarantees `qa/touch/tower-stacker.mjs`'s `solidity()` check sees only the
  // tower across the waist.
  const STAR_COUNT = 540
  const starPositions = new Float32Array(STAR_COUNT * 3)
  const starColors = new Float32Array(STAR_COUNT * 3)
  const starMeta: StarMeta[] = []
  const starTints = [
    new THREE.Color(0x526b94), // cool slate-blue (low sky)
    new THREE.Color(0x7592bf), // ice blue
    new THREE.Color(0x9fb6d8), // crisp white-blue
    new THREE.Color(0xb8a98a), // pale warm star
  ]

  for (let i = 0; i < STAR_COUNT; i++) {
    const sx = (rand() - 0.5) * 9.5
    const ty = 4.2 + Math.pow(rand(), 1.15) * 60
    const depth = 30 + rand() * 14
    placeAt(sx, 0, ty, depth, tmpPos)
    starPositions[i * 3] = tmpPos.x
    starPositions[i * 3 + 1] = tmpPos.y
    starPositions[i * 3 + 2] = tmpPos.z

    // Keep low-altitude stars subtle so they stay clean against the city sky,
    // brightening slightly as the player enters space.
    const altBoost = Math.min(1, Math.max(0, (ty - 4) / 16))
    const tint = starTints[Math.floor(rand() * starTints.length)]
    const brightness = 0.55 + altBoost * 0.45 * (0.65 + rand() * 0.35)
    const r = tint.r * brightness
    const g = tint.g * brightness
    const b = tint.b * brightness
    starColors[i * 3] = r
    starColors[i * 3 + 1] = g
    starColors[i * 3 + 2] = b
    starMeta.push({
      baseR: r,
      baseG: g,
      baseB: b,
      freq: 1.2 + rand() * 2.4,
      phase: rand() * Math.PI * 2,
      amp: 0.14 + rand() * 0.18,
    })
  }

  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starColorAttr = new THREE.BufferAttribute(starColors, 3)
  starGeo.setAttribute('color', starColorAttr)
  const starMat = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    depthWrite: false,
  })
  disposables.push(starGeo, starMat)
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  stars.renderOrder = -2
  root.add(stars)

  // ----------------------------------------- 8. Altitude sky colour progression
  const skyLow = new THREE.Color(SKY) // 0x0e1420 — twilight navy at low/mid altitude
  const skyMid = new THREE.Color(0x0b101c) // midnight blue around cloud deck
  const skyHigh = new THREE.Color(0x060912) // deep cosmos at high altitude
  const skyNow = new THREE.Color(SKY)

  function update(dt: number, cameraY: number, elapsed: number) {
    // Shift background sky smoothly from twilight navy into deep cosmos as
    // the tower climbs past the clouds, while holding steady near SKY at the
    // base and mid-low heights.
    if (cameraY <= 4) {
      skyNow.copy(skyLow)
    } else if (cameraY <= 14) {
      skyNow.copy(skyLow).lerp(skyMid, (cameraY - 4) / 10)
    } else {
      skyNow.copy(skyMid).lerp(skyHigh, Math.min(1, (cameraY - 14) / 14))
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(skyNow)
    }
    // Keep the moon's dark cutout disc matched to the live sky colour so the
    // crescent stays crisp at every altitude.
    moonShadowMat.color.copy(skyNow)

    // Decorative motion: pause completely under prefers-reduced-motion.
    if (prefersReducedMotion()) return

    for (const c of cloudPuffs) {
      c.screenX += c.speed * dt
      if (c.screenX > c.limit) c.screenX = -c.limit
      else if (c.screenX < -c.limit) c.screenX = c.limit
    }
    writeClouds()

    // Gentle star twinkle.
    for (let i = 0; i < STAR_COUNT; i++) {
      const m = starMeta[i]
      const factor = 1 + Math.sin(elapsed * m.freq + m.phase) * m.amp
      starColors[i * 3] = Math.min(1, m.baseR * factor)
      starColors[i * 3 + 1] = Math.min(1, m.baseG * factor)
      starColors[i * 3 + 2] = Math.min(1, m.baseB * factor)
    }
    starColorAttr.needsUpdate = true
  }

  function dispose() {
    scene.remove(root)
    for (const d of disposables) d.dispose()
  }

  return { update, dispose }
}
