// The Anomaly Room's controls (#114, #118).
//
// Looking around is the entire verb, so it gets the whole canvas and both
// input models properly rather than one properly and one as an afterthought.
// #114's original design had four-way d-pad look and argued it was "arguably
// better — deliberate, GameBoy-ish head turns"; that reasoning went with the
// shell, and what is left is a game about turning your head.
//
//   Touch    drag to look, one-to-one with the finger. Tap to flag whatever is
//            under the tap — not under a reticle, because the reticle only
//            existed to work around the d-pad.
//   Desktop  drag works too, and the HUD's "Mouse look" button turns on
//            pointer lock, where the mouse is the head and a click flags what
//            is straight ahead. Escape releases it. Behind a button rather
//            than behind a double click on the canvas, because a double click
//            on the canvas is also two flags — two guesses spent.
//
// A tap and a drag arrive through the same events, so the two are separated by
// how far the pointer travelled — and by that alone. An earlier version also
// required a tap to be released inside 350ms, which is wrong twice over: a
// deliberate tap from someone who does not hurry takes longer than that, and a
// press that never moves is a tap however long it is held. It also made the
// touch suite fail in a way that looked like the game ignoring input, because
// a CDP tap's round trips put half a second between the two events.
import { createGame } from './game'
import { createHud } from './hud'
import { createRoomAudio } from './audio'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import '../shared/stage3d.css'
import './style.css'

const parent = document.getElementById('stage')
if (!parent) throw new Error('#stage is missing from the page')

const game = createGame(parent)
exposeForQA(game)
preventZoomGestures()
const audio = createRoomAudio()

const canvas = game.stage.renderer.domElement

/**
 * Asks for pointer lock, tolerating both shapes of the API.
 *
 * Older Chromium returns undefined and newer returns a promise that rejects if
 * the document is not allowed to lock — an unhandled rejection either way if
 * you assume the wrong one, and the touch suite counts a page error as a
 * failure.
 */
function requestLook(): void {
  try {
    void Promise.resolve(canvas.requestPointerLock()).catch(() => {})
  } catch {
    // Some browsers throw synchronously instead. Nothing to do either way.
  }
}

createHud(game, audio, {
  mouseLook: requestLook,
  locked: () => document.pointerLockElement === canvas,
})

/**
 * Radians of turn per CSS pixel of drag.
 *
 * Chosen so a drag across the short side of a phone turns you about a hundred
 * and twenty degrees — far enough to sweep the room in two or three strokes,
 * short enough that a small correction stays small.
 */
const LOOK_PER_PIXEL = 0.0055

/** A press that stays within this many pixels is a tap, not a drag. */
const TAP_SLOP = 10

let dragId: number | null = null
let lastX = 0
let lastY = 0
let downX = 0
let downY = 0
let travelled = 0

canvas.addEventListener('pointerdown', (e) => {
  if (dragId !== null) return
  dragId = e.pointerId
  lastX = downX = e.clientX
  lastY = downY = e.clientY
  travelled = 0
  // The audio context cannot start before a gesture, so this is the moment.
  audio.wake()
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // Safari has thrown here for pointers that ended in the same frame.
  }
  e.preventDefault()
})

canvas.addEventListener('pointermove', (e) => {
  // Under pointer lock there is no pointer to capture and no button held, so
  // movement steers directly.
  if (document.pointerLockElement === canvas) {
    game.turn(e.movementX * LOOK_PER_PIXEL, e.movementY * LOOK_PER_PIXEL)
    return
  }
  if (e.pointerId !== dragId) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
  travelled += Math.hypot(dx, dy)
  // Negated, because a drag moves the *room*: pull left and what was off the
  // right edge comes into view, which means the head turned right. Mouse look
  // above is the opposite convention and deliberately so — under pointer lock
  // the mouse is the head, not a hand on the world.
  game.turn(-dx * LOOK_PER_PIXEL, -dy * LOOK_PER_PIXEL)
  e.preventDefault()
})

const endDrag = (e: PointerEvent) => {
  if (e.pointerId !== dragId) return
  dragId = null
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
  // Both the straight-line distance and the path length: a drag that curls
  // back to where it started has moved a long way and is not a tap.
  if (moved > TAP_SLOP || travelled > TAP_SLOP * 2) return
  const rect = canvas.getBoundingClientRect()
  const result = game.flag((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height)
  if (result) audio.sting(result.correct)
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)

// ---------------------------------------------------------- pointer lock

canvas.addEventListener('click', (e) => {
  if (document.pointerLockElement !== canvas) return
  // Locked, the pointer has no position, so a click is always the centre.
  const result = game.flag(0.5, 0.5)
  if (result) audio.sting(result.correct)
  e.preventDefault()
})

// ------------------------------------------------------------- keyboard
//
// The equivalent path: arrows turn the head, space flags what is ahead. It is
// also the only way to play without a pointer at all.

const KEY_STEP = 0.06
const held = new Set<string>()

const LOOK_KEYS = new Set([
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
  if (e.code === 'Space' || e.code === 'Enter') {
    const result = game.flag(0.5, 0.5)
    if (result) audio.sting(result.correct)
    e.preventDefault()
    return
  }
  if (LOOK_KEYS.has(e.code)) {
    held.add(e.code)
    audio.wake()
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
  if (held.has('ArrowUp') || held.has('KeyW')) pitch -= KEY_STEP
  if (held.has('ArrowDown') || held.has('KeyS')) pitch += KEY_STEP
  // Held rather than stepped per keypress, so turning is a smooth sweep and
  // not a stutter at the operating system's key-repeat rate.
  if (yaw || pitch) game.turn(yaw, pitch)
  requestAnimationFrame(pollKeys)
}
requestAnimationFrame(pollKeys)
