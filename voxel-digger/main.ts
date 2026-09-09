// Voxel Digger's controls (#115, #118).
//
// #115 calls the cursor "the hard part" and spends a paragraph choosing
// between two ways to move a 3D cursor with a d-pad. None of that survives the
// change of shell: with a canvas and a pointer there is no cursor at all, and
// a tap raycasts straight to a cube.
//
//   Touch    one finger drags to orbit, two fingers pinch to zoom, a tap digs.
//   Desktop  drag to orbit, wheel to zoom, click to dig.
//
// A tap and a drag arrive through the same events and are told apart by how
// far the pointer moved — no time limit, for the reason written up in
// `qa/touch/README.md`: a deliberate tap from someone who does not hurry takes
// longer than any threshold worth setting.
import { createGame } from './game'
import { createHud } from './hud'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import '../shared/stage3d.css'
import './style.css'

const parent = document.getElementById('stage')
if (!parent) throw new Error('#stage is missing from the page')

const game = createGame(parent)
exposeForQA(game)
preventZoomGestures()
createHud(game)

const canvas = game.stage.renderer.domElement

/** Radians of orbit per CSS pixel of drag. */
const ORBIT_PER_PIXEL = 0.008
/** A press that stays within this many pixels is a tap, not a drag. */
const TAP_SLOP = 10

interface Contact {
  x: number
  y: number
}

const contacts = new Map<number, Contact>()
let downX = 0
let downY = 0
let travelled = 0
/** Distance between the two fingers when a pinch started. */
let pinchFrom = 0

const spread = (): number => {
  const [a, b] = [...contacts.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}

canvas.addEventListener('pointerdown', (e) => {
  contacts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (contacts.size === 1) {
    downX = e.clientX
    downY = e.clientY
    travelled = 0
  } else if (contacts.size === 2) {
    pinchFrom = spread()
  }
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // Safari has thrown here for pointers that ended in the same frame.
  }
  e.preventDefault()
})

canvas.addEventListener('pointermove', (e) => {
  const contact = contacts.get(e.pointerId)
  if (!contact) return
  const dx = e.clientX - contact.x
  const dy = e.clientY - contact.y
  contact.x = e.clientX
  contact.y = e.clientY

  if (contacts.size >= 2) {
    // Pinching, not orbiting. Two fingers moving together would otherwise spin
    // the block while they zoom, which makes the zoom feel broken.
    const now = spread()
    if (pinchFrom > 0 && now > 0) {
      game.zoom(pinchFrom / now)
      pinchFrom = now
    }
    travelled += Math.hypot(dx, dy)
    e.preventDefault()
    return
  }

  travelled += Math.hypot(dx, dy)
  // Negated, because a drag turns the *block*: pull left and its right side
  // comes round to face you.
  game.orbit(-dx * ORBIT_PER_PIXEL, dy * ORBIT_PER_PIXEL)
  e.preventDefault()
})

const endContact = (e: PointerEvent) => {
  if (!contacts.has(e.pointerId)) return
  const wasAlone = contacts.size === 1
  contacts.delete(e.pointerId)
  if (contacts.size < 2) pinchFrom = 0
  if (!wasAlone) return
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
  if (moved > TAP_SLOP || travelled > TAP_SLOP * 2) return
  const rect = canvas.getBoundingClientRect()
  game.dig((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
}
canvas.addEventListener('pointerup', endContact)
canvas.addEventListener('pointercancel', endContact)

canvas.addEventListener(
  'wheel',
  (e) => {
    game.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1)
    e.preventDefault()
  },
  { passive: false },
)

// ------------------------------------------------------------- keyboard
//
// Arrows orbit, +/- zoom, Z undoes. The only way to play with no pointer.

const KEY_STEP = 0.08
const held = new Set<string>()

const ORBIT_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
])

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyZ') {
    game.undo()
    e.preventDefault()
    return
  }
  if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    game.zoom(1 / 1.12)
    e.preventDefault()
    return
  }
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    game.zoom(1.12)
    e.preventDefault()
    return
  }
  if (ORBIT_KEYS.has(e.code)) {
    held.add(e.code)
    e.preventDefault()
  }
})
window.addEventListener('keyup', (e) => held.delete(e.code))
window.addEventListener('blur', () => held.clear())

function pollKeys() {
  let yaw = 0
  let pitch = 0
  if (held.has('ArrowLeft') || held.has('KeyA')) yaw -= KEY_STEP
  if (held.has('ArrowRight') || held.has('KeyD')) yaw += KEY_STEP
  if (held.has('ArrowUp') || held.has('KeyW')) pitch += KEY_STEP
  if (held.has('ArrowDown') || held.has('KeyS')) pitch -= KEY_STEP
  if (yaw || pitch) game.orbit(yaw, pitch)
  requestAnimationFrame(pollKeys)
}
requestAnimationFrame(pollKeys)
