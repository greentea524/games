// Procedural turf textures, materials, and world-space UV mapping for Minigolf.
//
// Everything is generated onto offscreen canvases at startup so the game keeps
// its zero-asset footprint while replacing the flat green slabs with mowed
// putting-green turf: alternating lawnmower stripes, directional grass-blade
// grain, organic colour mottling, a matching bump map, and a subtle sheen
// difference between stripes.
import * as THREE from 'three'
import type { Box } from './holes'

/** Size of one full texture tile in world units (two mower stripes wide). */
const TILE_SIZE = 2.4
/** Resolution of the procedural turf textures, in pixels. */
const TEX_SIZE = 512

/** Deterministic PRNG (Mulberry32) so turf looks identical across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth periodic value noise on a [0, period) grid for seamless mottling. */
function makePeriodicNoise(period: number, seed: number): (u: number, v: number) => number {
  const rand = mulberry32(seed)
  const grid = new Float32Array(period * period)
  for (let i = 0; i < grid.length; i++) grid[i] = rand()

  const fade = (t: number) => t * t * (3 - 2 * t)
  const sample = (x: number, y: number) => {
    const gx = ((x % period) + period) % period
    const gy = ((y % period) + period) % period
    return grid[gy * period + gx]
  }

  return (u: number, v: number) => {
    const fx = u * period
    const fy = v * period
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fade(fx - x0)
    const ty = fade(fy - y0)
    const n00 = sample(x0, y0)
    const n10 = sample(x0 + 1, y0)
    const n01 = sample(x0, y0 + 1)
    const n11 = sample(x0 + 1, y0 + 1)
    const nx0 = n00 + (n10 - n00) * tx
    const nx1 = n01 + (n11 - n01) * tx
    return nx0 + (nx1 - nx0) * ty
  }
}

/** Draws a stroke wrapped across all 9 toroidal offsets so edges tile cleanly. */
function drawWrappedBlade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  size: number,
) {
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      const sx = x + ox
      const sy = y + oy
      if (sx < -12 || sx > size + 12 || sy < -12 || sy > size + 12) continue
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + dx, sy + dy)
      ctx.stroke()
    }
  }
}

interface TurfTextureSet {
  color: THREE.CanvasTexture
  bump: THREE.CanvasTexture
  roughness: THREE.CanvasTexture
}

interface TurfPalette {
  /** Base RGB for the lighter mowed stripe. */
  light: [number, number, number]
  /** Base RGB for the darker mowed stripe. */
  dark: [number, number, number]
  /** Stripe orientation: 'x' runs lengthwise along Z; 'z' runs across the slope. */
  stripeAxis: 'x' | 'z'
  seed: number
}

function buildTurfTextures(palette: TurfPalette, maxAnisotropy: number): TurfTextureSet {
  const size = TEX_SIZE
  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = size
  colorCanvas.height = size
  const colorCtx = colorCanvas.getContext('2d')!

  const bumpCanvas = document.createElement('canvas')
  bumpCanvas.width = size
  bumpCanvas.height = size
  const bumpCtx = bumpCanvas.getContext('2d')!

  const roughCanvas = document.createElement('canvas')
  roughCanvas.width = size
  roughCanvas.height = size
  const roughCtx = roughCanvas.getContext('2d')!

  const colorImg = colorCtx.createImageData(size, size)
  const bumpImg = bumpCtx.createImageData(size, size)
  const roughImg = roughCtx.createImageData(size, size)

  const macroNoise = makePeriodicNoise(4, palette.seed + 11)
  const midNoise = makePeriodicNoise(12, palette.seed + 29)
  const microNoise = makePeriodicNoise(48, palette.seed + 53)
  const grainRand = mulberry32(palette.seed + 97)

  const [lr, lg, lb] = palette.light
  const [dr, dg, db] = palette.dark

  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const idx = (y * size + x) * 4

      // Soft mower-roller stripe transition (2 stripes per tile).
      const stripeCoord = palette.stripeAxis === 'x' ? u : v
      const wave = Math.sin(stripeCoord * Math.PI * 2)
      // Gently sharpen the sine wave so stripes have broad flat bands with a
      // soft feathered transition at the roller edge.
      const stripeT = 0.5 + 0.5 * Math.tanh(wave * 3.8)

      // Multi-octave organic lawn mottling so large fairways feel alive.
      const mottle =
        (macroNoise(u, v) - 0.5) * 0.65 +
        (midNoise(u, v) - 0.5) * 0.35 +
        (microNoise(u, v) - 0.5) * 0.2
      const grain = (grainRand() - 0.5) * 14

      // Slight warm-sunlit shift on lighter patches, cooler-deep shift on darker.
      const baseR = dr + (lr - dr) * stripeT + mottle * 18 + grain * 0.7
      const baseG = dg + (lg - dg) * stripeT + mottle * 24 + grain
      const baseB = db + (lb - db) * stripeT + mottle * 10 + grain * 0.5

      colorImg.data[idx] = Math.max(0, Math.min(255, Math.round(baseR)))
      colorImg.data[idx + 1] = Math.max(0, Math.min(255, Math.round(baseG)))
      colorImg.data[idx + 2] = Math.max(0, Math.min(255, Math.round(baseB)))
      colorImg.data[idx + 3] = 255

      // Bump height: soft turf unevenness + fine micro-speckle.
      const height = 128 + mottle * 34 + grain * 1.9
      const hByte = Math.max(0, Math.min(255, Math.round(height)))
      bumpImg.data[idx] = hByte
      bumpImg.data[idx + 1] = hByte
      bumpImg.data[idx + 2] = hByte
      bumpImg.data[idx + 3] = 255

      // Roughness: blades bent toward the light (light stripe) catch a subtle
      // velvety sheen; blades bent away (dark stripe) read slightly more matte.
      const rough = 236 - stripeT * 24 - mottle * 14 + grain * 0.6
      const rByte = Math.max(185, Math.min(250, Math.round(rough)))
      roughImg.data[idx] = rByte
      roughImg.data[idx + 1] = rByte
      roughImg.data[idx + 2] = rByte
      roughImg.data[idx + 3] = 255
    }
  }

  colorCtx.putImageData(colorImg, 0, 0)
  bumpCtx.putImageData(bumpImg, 0, 0)
  roughCtx.putImageData(roughImg, 0, 0)

  // Overlay fine directional grass blades so the surface reads as lush cropped
  // turf up close and soft felt-like grass at distance.
  const bladeRand = mulberry32(palette.seed + 211)
  const bladeCount = 11000
  colorCtx.lineCap = 'round'
  bumpCtx.lineCap = 'round'

  for (let i = 0; i < bladeCount; i++) {
    const x = bladeRand() * size
    const y = bladeRand() * size
    const u = x / size
    const v = y / size

    const stripeCoord = palette.stripeAxis === 'x' ? u : v
    const inLightStripe = Math.sin(stripeCoord * Math.PI * 2) >= 0

    // Blades in alternating stripes lean in opposite directions, mimicking a
    // reel mower's roller pass.
    const baseAngle =
      palette.stripeAxis === 'x'
        ? inLightStripe
          ? -Math.PI * 0.42
          : Math.PI * 0.58
        : inLightStripe
          ? -Math.PI * 0.08
          : Math.PI * 0.92
    const angle = baseAngle + (bladeRand() - 0.5) * 0.85
    const len = 2.2 + bladeRand() * 3.8
    const dx = Math.cos(angle) * len
    const dy = Math.sin(angle) * len

    const tone = bladeRand()
    let stroke: string
    let bumpShade: number
    if (tone < 0.34) {
      // Deep turf crevice / shadow blade.
      stroke = 'rgba(18, 66, 36, 0.28)'
      bumpShade = 84
    } else if (tone < 0.78) {
      // Mid-green healthy blade.
      stroke = inLightStripe ? 'rgba(72, 178, 96, 0.24)' : 'rgba(48, 146, 80, 0.24)'
      bumpShade = 152
    } else {
      // Sunlit warm yellow-green blade tip.
      stroke = inLightStripe ? 'rgba(128, 212, 108, 0.26)' : 'rgba(92, 184, 96, 0.20)'
      bumpShade = 212
    }

    const width = 0.8 + bladeRand() * 0.65
    colorCtx.strokeStyle = stroke
    colorCtx.lineWidth = width
    drawWrappedBlade(colorCtx, x, y, dx, dy, size)

    bumpCtx.strokeStyle = `rgba(${bumpShade}, ${bumpShade}, ${bumpShade}, 0.30)`
    bumpCtx.lineWidth = width
    drawWrappedBlade(bumpCtx, x, y, dx, dy, size)
  }

  const setup = (canvas: HTMLCanvasElement, isColor: boolean): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy))
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    return tex
  }

  return {
    color: setup(colorCanvas, true),
    bump: setup(bumpCanvas, false),
    roughness: setup(roughCanvas, false),
  }
}

/**
 * Side-face texture for green slabs: a crisp turf lip along the top edge that
 * transitions into darker cut-turf / mossy earth below, so raised greens and
 * steps read as solid tiers rather than uniform blocks.
 */
function buildSideTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0.0, '#2e8850')
  grad.addColorStop(0.16, '#236b3e')
  grad.addColorStop(0.35, '#1d5233')
  grad.addColorStop(1.0, '#163b26')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const rand = mulberry32(409)
  // Subtle organic grain on the cut edge.
  for (let i = 0; i < 1600; i++) {
    const x = rand() * w
    const y = rand() * h
    const isTop = y < h * 0.24
    ctx.fillStyle = isTop
      ? rand() < 0.5
        ? 'rgba(76, 172, 96, 0.22)'
        : 'rgba(18, 64, 34, 0.25)'
      : rand() < 0.5
        ? 'rgba(42, 92, 58, 0.18)'
        : 'rgba(10, 32, 20, 0.24)'
    ctx.fillRect(x, y, 1 + rand() * 2, 2 + rand() * 4)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export interface GrassMaterials {
  /** Multi-material array for flat green BoxGeometry (sides + mowed top). */
  flat: THREE.Material[]
  /** Multi-material array for sloped ramp BoxGeometry (sides + cross-mowed top). */
  slope: THREE.Material[]
  /** Trimmed turf collar material around the cup. */
  cupCollar: THREE.MeshStandardMaterial
  dispose(): void
}

export function createGrassMaterials(renderer: THREE.WebGLRenderer): GrassMaterials {
  const maxAniso = renderer.capabilities.getMaxAnisotropy()

  const flatSet = buildTurfTextures(
    {
      light: [68, 168, 98],
      dark: [50, 142, 82],
      stripeAxis: 'x',
      seed: 101,
    },
    maxAniso,
  )

  // Ramps keep a slightly deeper, cooler green tone and cross-slope mower
  // stripes so every climb or drop reads immediately before the ball moves.
  const slopeSet = buildTurfTextures(
    {
      light: [54, 148, 88],
      dark: [40, 124, 73],
      stripeAxis: 'z',
      seed: 307,
    },
    maxAniso,
  )

  const sideTex = buildSideTexture(maxAniso)

  const flatTop = new THREE.MeshStandardMaterial({
    map: flatSet.color,
    bumpMap: flatSet.bump,
    bumpScale: 0.032,
    roughnessMap: flatSet.roughness,
    roughness: 1.0,
    metalness: 0.0,
  })

  const slopeTop = new THREE.MeshStandardMaterial({
    map: slopeSet.color,
    bumpMap: slopeSet.bump,
    bumpScale: 0.032,
    roughnessMap: slopeSet.roughness,
    roughness: 1.0,
    metalness: 0.0,
  })

  const sideMat = new THREE.MeshStandardMaterial({
    map: sideTex,
    roughness: 0.94,
    metalness: 0.0,
  })

  const bottomMat = new THREE.MeshLambertMaterial({ color: 0x133320 })

  const cupCollar = new THREE.MeshStandardMaterial({
    color: 0x4db56c,
    roughness: 0.9,
    metalness: 0.0,
  })

  // BoxGeometry face group order: +X, -X, +Y (top), -Y (bottom), +Z, -Z.
  const flat = [sideMat, sideMat, flatTop, bottomMat, sideMat, sideMat]
  const slope = [sideMat, sideMat, slopeTop, bottomMat, sideMat, sideMat]

  return {
    flat,
    slope,
    cupCollar,
    dispose() {
      flatSet.color.dispose()
      flatSet.bump.dispose()
      flatSet.roughness.dispose()
      slopeSet.color.dispose()
      slopeSet.bump.dispose()
      slopeSet.roughness.dispose()
      sideTex.dispose()
      flatTop.dispose()
      slopeTop.dispose()
      sideMat.dispose()
      bottomMat.dispose()
      cupCollar.dispose()
    },
  }
}

/**
 * Builds a BoxGeometry for a green slab with world-aligned UVs on its top face
 * and aspect-correct UVs on its side faces.
 *
 * Without this, a 4x12 corridor stretches the turf 3x along Z compared to X,
 * and adjacent slabs on L- and U-shaped holes (Elbow, Shelf, Summit) show a
 * hard texture seam where they meet.
 */
export function createGreenGeometry(box: Box): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(box.w, box.h, box.d)
  const pos = geo.attributes.position
  const norm = geo.attributes.normal
  const uv = geo.attributes.uv

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i)
    const ly = pos.getY(i)
    const lz = pos.getZ(i)
    const nx = norm.getX(i)
    const ny = norm.getY(i)
    const nz = norm.getZ(i)

    if (ny > 0.5) {
      // Top playing surface: world-scaled UVs aligned across adjacent slabs.
      const u = (box.x + lx) / TILE_SIZE
      const v = (box.z + lz) / TILE_SIZE
      uv.setXY(i, u, v)
    } else if (ny < -0.5) {
      uv.setXY(i, (box.x + lx) / TILE_SIZE, (box.z + lz) / TILE_SIZE)
    } else if (Math.abs(nx) > 0.5) {
      // ±X side faces: horizontal distance along Z, vertical 0..1 bottom-to-top.
      const u = (box.z + lz) / TILE_SIZE
      const v = (ly + box.h / 2) / box.h
      uv.setXY(i, u, v)
    } else if (Math.abs(nz) > 0.5) {
      // ±Z side faces: horizontal distance along X, vertical 0..1 bottom-to-top.
      const u = (box.x + lx) / TILE_SIZE
      const v = (ly + box.h / 2) / box.h
      uv.setXY(i, u, v)
    }
  }

  uv.needsUpdate = true
  return geo
}
