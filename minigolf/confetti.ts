// Celebratory 3D confetti burst when the ball drops into the cup.
//
// Uses a single InstancedMesh so 150 tumbling paper ribbons cost one draw call
// and zero per-frame allocations.
import * as THREE from 'three'
import { prefersReducedMotion } from '../shared/motion'

const COUNT = 150

const PALETTE = [
  0xff595e, // coral red
  0xffca3a, // sunshine yellow
  0x35d68a, // mint green
  0x2ec4f1, // sky blue
  0x9b5de5, // violet
  0xf15bb5, // pink
  0xff924c, // tangerine
  0xfbfdf9, // bright white
]

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  rx: number
  ry: number
  rz: number
  vrx: number
  vry: number
  vrz: number
  swayFreq: number
  swayPhase: number
  delay: number
  age: number
  life: number
  scale: number
  landed: boolean
}

export interface ConfettiBurst {
  /** Launch a fresh celebratory fountain from the cup position. */
  burst(x: number, y: number, z: number): void
  /** Hide and reset confetti (e.g., when loading the next hole). */
  clear(): void
  update(dt: number): void
  dispose(): void
}

export function createConfetti(scene: THREE.Scene): ConfettiBurst {
  const geometry = new THREE.PlaneGeometry(0.12, 0.065)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT)
  mesh.visible = false
  mesh.frustumCulled = false
  scene.add(mesh)

  const color = new THREE.Color()
  for (let i = 0; i < COUNT; i++) {
    color.setHex(PALETTE[i % PALETTE.length])
    mesh.setColorAt(i, color)
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

  const particles: Particle[] = Array.from({ length: COUNT }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    vrx: 0,
    vry: 0,
    vrz: 0,
    swayFreq: 5,
    swayPhase: 0,
    delay: 0,
    age: 0,
    life: 4,
    scale: 1,
    landed: false,
  }))

  let active = false
  let floorY = 0
  let staticPose = false

  const dummy = new THREE.Object3D()

  function writeInstances() {
    for (let i = 0; i < COUNT; i++) {
      const p = particles[i]
      if (p.age < 0 || p.age >= p.life) {
        dummy.position.set(0, -100, 0)
        dummy.scale.setScalar(0)
      } else {
        const fadeStart = p.life - 0.65
        const fade = p.age > fadeStart ? Math.max(0, 1 - (p.age - fadeStart) / 0.65) : 1
        dummy.position.set(p.x, p.y, p.z)
        dummy.rotation.set(p.rx, p.ry, p.rz)
        dummy.scale.setScalar(p.scale * fade)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  function burst(cx: number, cy: number, cz: number) {
    floorY = cy + 0.025
    staticPose = prefersReducedMotion()
    active = true
    mesh.visible = true

    for (let i = 0; i < COUNT; i++) {
      const p = particles[i]
      const angle = Math.random() * Math.PI * 2
      const speed = 0.65 + Math.random() * 2.35
      const secondWave = i >= 100

      p.x = cx + Math.cos(angle) * (Math.random() * 0.14)
      p.y = cy + 0.12
      p.z = cz + Math.sin(angle) * (Math.random() * 0.14)
      p.vx = Math.cos(angle) * speed
      p.vy = (secondWave ? 3.2 : 3.9) + Math.random() * 3.4
      p.vz = Math.sin(angle) * speed
      p.rx = Math.random() * Math.PI * 2
      p.ry = Math.random() * Math.PI * 2
      p.rz = Math.random() * Math.PI * 2
      p.vrx = (Math.random() - 0.5) * 14
      p.vry = (Math.random() - 0.5) * 14
      p.vrz = (Math.random() - 0.5) * 14
      p.swayFreq = 3.5 + Math.random() * 3.5
      p.swayPhase = Math.random() * Math.PI * 2
      p.delay = secondWave ? 0.24 + Math.random() * 0.14 : Math.random() * 0.06
      p.age = -p.delay
      p.life = 3.2 + Math.random() * 1.4
      p.scale = 0.8 + Math.random() * 0.6
      p.landed = false

      // Under prefers-reduced-motion, display a still celebratory bloom around
      // the cup instead of fast-moving fluttering particles.
      if (staticPose) {
        const spread = 0.35 + Math.random() * 1.15
        p.x = cx + Math.cos(angle) * spread
        p.y = cy + 0.35 + Math.random() * 1.45
        p.z = cz + Math.sin(angle) * spread
        p.age = 0.5
        p.life = 999
      }
    }

    writeInstances()
  }

  function clear() {
    active = false
    mesh.visible = false
  }

  function update(dt: number) {
    if (!active || staticPose) return

    let anyAlive = false
    const drag = Math.exp(-1.95 * dt)

    for (let i = 0; i < COUNT; i++) {
      const p = particles[i]
      p.age += dt
      if (p.age < 0) {
        anyAlive = true
        continue
      }
      if (p.age >= p.life) continue
      anyAlive = true

      if (!p.landed) {
        p.vy -= 8.8 * dt
        p.vx *= drag
        p.vz *= drag
        // Limit downward terminal velocity so ribbons flutter softly like paper.
        if (p.vy < -1.85) p.vy = -1.85

        const sway = Math.sin(p.age * p.swayFreq + p.swayPhase) * 0.75
        p.x += (p.vx + sway * Math.cos(p.swayPhase)) * dt
        p.y += p.vy * dt
        p.z += (p.vz + sway * Math.sin(p.swayPhase)) * dt

        p.rx += p.vrx * dt
        p.ry += p.vry * dt
        p.rz += p.vrz * dt

        if (p.y <= floorY) {
          p.y = floorY
          p.landed = true
          // Lie flat on the grass once landed.
          p.rx = -Math.PI / 2
          p.rz = 0
        }
      }
    }

    writeInstances()
    if (!anyAlive) {
      active = false
      mesh.visible = false
    }
  }

  function dispose() {
    clear()
    geometry.dispose()
    material.dispose()
    scene.remove(mesh)
  }

  return { burst, clear, update, dispose }
}
