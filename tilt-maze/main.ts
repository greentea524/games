// Tilt Maze's controls (#112, #118).
//
// Per-game and touch-first, which is what #118 asks for and what the GameBoy
// shell could not give: leaning a board is analogue and two-axis, and a
// four-way d-pad can express neither. Dragging can express both.
//
// Both paths feed one `steer(x, z)`, so the tuning lives in one place and the
// keyboard is genuinely the same control rather than a second implementation
// of it.
import { createGame, nextLevel } from './game'
import { createHud } from './hud'
import { LEVELS } from './levels'
import { loadTiltSave, recordProgress } from './save'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import '../shared/stage3d.css'
import './style.css'

const parent = document.getElementById('stage')
if (!parent) throw new Error('#stage is missing from the page')

const game = createGame(parent)
exposeForQA(game)
preventZoomGestures()

// Resume where the player got to. Never past the end, and never a level they
// have not reached — a corrupt save costs a position, not a working game.
const saved = loadTiltSave()
if (saved.reached > 0 && saved.reached < LEVELS.length && !saved.completed) {
  game.goTo(saved.reached)
}

createHud(game, () => {
  nextLevel(game)
  recordProgress(game.level(), false)
})

game.onChange(() => {
  const phase = game.phase()
  if (phase === 'complete') recordProgress(LEVELS.length - 1, true)
})

// ------------------------------------------------------------------- drag

/**
 * How far the pointer must travel for a full lean, as a fraction of the
 * smaller viewport dimension.
 *
 * Relative rather than absolute pixels: the same gesture should mean the same
 * lean on a phone and on a desktop, and a fixed pixel radius makes a full lean
 * a flick on one and a haul on the other.
 */
const DRAG_RADIUS = 0.22

const canvas = game.stage.renderer.domElement
let dragId: number | null = null
let originX = 0
let originY = 0

function dragRadius(): number {
  const { width, height } = game.stage.size()
  return Math.max(40, Math.min(width, height) * DRAG_RADIUS)
}

canvas.addEventListener('pointerdown', (e) => {
  if (dragId !== null) return
  dragId = e.pointerId
  originX = e.clientX
  originY = e.clientY
  // Capture, so a drag that leaves the canvas keeps steering instead of
  // sticking at whatever lean it had when it crossed the edge — the same
  // reason `shared/dpad.ts` captures.
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // Safari has thrown here for pointers that ended in the same frame.
  }
  e.preventDefault()
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId) return
  const r = dragRadius()
  // Screen right is world +x and screen down is world +z under this camera,
  // so the board leans toward wherever the finger is pulling: you drag in the
  // direction you want the marble to go.
  game.steer((e.clientX - originX) / r, (e.clientY - originY) / r)
  e.preventDefault()
})

const endDrag = (e: PointerEvent) => {
  if (e.pointerId !== dragId) return
  dragId = null
  game.steer(keyX(), keyZ())
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
// A pointer can be lost without either of the above — a system gesture, or the
// element being re-laid out mid-drag. Without this the board stays leaning.
canvas.addEventListener('lostpointercapture', endDrag)

// --------------------------------------------------------------- keyboard

const held = new Set<string>()
const LEFT = ['ArrowLeft', 'KeyA']
const RIGHT = ['ArrowRight', 'KeyD']
const UP = ['ArrowUp', 'KeyW']
const DOWN = ['ArrowDown', 'KeyS']
const axis = (neg: string[], pos: string[]) =>
  (pos.some((k) => held.has(k)) ? 1 : 0) - (neg.some((k) => held.has(k)) ? 1 : 0)
const keyX = () => axis(LEFT, RIGHT)
const keyZ = () => axis(UP, DOWN)

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') {
    game.restart()
    return
  }
  if (![...LEFT, ...RIGHT, ...UP, ...DOWN].includes(e.code)) return
  // The arrows scroll a page. This one has nothing to scroll, but the default
  // still fights a held key on some browsers.
  e.preventDefault()
  held.add(e.code)
  if (dragId === null) game.steer(keyX(), keyZ())
})

window.addEventListener('keyup', (e) => {
  if (!held.delete(e.code)) return
  if (dragId === null) game.steer(keyX(), keyZ())
})

// A key held when the tab loses focus never sends its keyup, which would leave
// the board leaning and the marble rolling while nobody is watching.
window.addEventListener('blur', () => {
  held.clear()
  dragId = null
  game.steer(0, 0)
})
