// Minigolf's controls (#113, #118).
//
// Drag back from the ball, slingshot style: direction sets the aim, distance
// sets the power. #113's original version specified a charging meter on a
// button, because "a drag-based control would not work on the d-pad at all" —
// that constraint went with the GameBoy shell, and drag is the control this
// game actually wants. Pulling back to hit forwards is also the gesture
// everyone already knows from a dozen other games.
import { createGame, MIN_POWER } from './game'
import { createHud } from './hud'
import { loadGolfSave, recordRound } from './save'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import '../shared/stage3d.css'
import './style.css'

const parent = document.getElementById('stage')
if (!parent) throw new Error('#stage is missing from the page')

const game = createGame(parent)
exposeForQA(game)
preventZoomGestures()
const hud = createHud(game)

game.onChange(() => {
  if (game.phase() === 'card') {
    const card = game.card()
    recordRound(card.reduce((a, b) => a + b, 0))
  }
})
void loadGolfSave

// --------------------------------------------------------------- the drag

/**
 * Pointer travel for full power, as a fraction of the smaller viewport side.
 *
 * Relative rather than absolute pixels, so the same gesture means the same
 * power on a phone and on a desktop.
 */
const POWER_RADIUS = 0.28

const canvas = game.stage.renderer.domElement
let dragId: number | null = null
let originX = 0
let originY = 0

function powerRadius(): number {
  const { width, height } = game.stage.size()
  return Math.max(50, Math.min(width, height) * POWER_RADIUS)
}

/** Screen delta to an aim in the camera's horizontal frame. Pulling back aims forward. */
function aimFrom(dx: number, dy: number) {
  const radius = powerRadius()
  const { forwardX, forwardZ, rightX, rightZ } = game.cameraBasis()
  return {
    x: rightX * -dx + forwardX * dy,
    z: rightZ * -dx + forwardZ * dy,
    power: Math.hypot(dx, dy) / radius,
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (dragId !== null || !game.canPutt()) return
  dragId = e.pointerId
  originX = e.clientX
  originY = e.clientY
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // Safari has thrown here for pointers that ended in the same frame.
  }
  e.preventDefault()
})

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== dragId) return
  const aim = aimFrom(e.clientX - originX, e.clientY - originY)
  game.setAim(aim.x, aim.z, aim.power)
  e.preventDefault()
})

const endDrag = (e: PointerEvent) => {
  if (e.pointerId !== dragId) return
  dragId = null
  // A pull that never went anywhere is a cancel, not a stroke. #113 calls this
  // out and it matters more than it sounds: a mis-started drag that has to be
  // played costs a stroke the player never meant to take.
  if (game.aim().power < MIN_POWER) game.cancelAim()
  else game.strike()
}
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
canvas.addEventListener('lostpointercapture', endDrag)

// ------------------------------------------------------------- the keyboard
//
// The equivalent path, not the primary one: turn the aim with left/right,
// hold space to charge, release to putt.
//
// The angle is read from the game's own aim every time, never kept here
// (#184). It was a variable of its own, synced to the camera when a hole or a
// stroke began, so it drifted from the aim the game was drawing: turned on one
// hole, it fired at the old angle on the next, and after a stroke the first
// press jumped the aim. The game points the aim at the cup at every new hole,
// re-tee and rest, and this follows it.

/** Turning speed while an arrow is held, in radians a second. */
const TURN_RATE = 1.6
/** One tap's turn, for a press too short to span a frame. */
const TAP_TURN = 0.03
const CHARGE_TIME = 900

let charging = false
let chargeStart = 0
/** Which arrows are held down. */
const held = { left: false, right: false }

const aimAngle = () => {
  const a = game.aim()
  return Math.atan2(a.x, a.z)
}

/**
 * Turns the aim by `by` radians, showing its direction (left is positive).
 * Not gated on the ball being at rest: just after a hole loads it is still
 * settling onto the tee, and a turn then is harmless. `previewAim` ignores
 * anything but the aiming phase.
 */
function turnAim(by: number) {
  const angle = aimAngle() + by
  game.previewAim(Math.sin(angle), Math.cos(angle))
}

window.addEventListener('keydown', (e) => {
  // Nothing turns or putts behind the how-to-play panel.
  if (hud.helpOpen()) return
  const left = e.code === 'ArrowLeft' || e.code === 'KeyA'
  const right = e.code === 'ArrowRight' || e.code === 'KeyD'
  if (left || right) {
    // Held keys turn in the frame loop below, smoothly, rather than in steps
    // at the system's key-repeat rate. A first press also turns a little at
    // once, so a tap shorter than a frame still does something.
    if (!e.repeat) turnAim(left ? TAP_TURN : -TAP_TURN)
    if (left) held.left = true
    else held.right = true
    e.preventDefault()
  } else if (e.code === 'KeyV') {
    game.toggleView()
    e.preventDefault()
  } else if (e.code === 'Space' && !charging && game.canPutt()) {
    charging = true
    chargeStart = performance.now()
    e.preventDefault()
  }
})

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') held.left = false
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') held.right = false
  if (e.code !== 'Space' || !charging) return
  charging = false
  e.preventDefault()
  if (game.aim().power >= MIN_POWER) game.strike()
  else {
    // Too short to be a stroke: a cancel, and the direction stays on show.
    game.cancelAim()
    const a = game.aim()
    game.previewAim(a.x, a.z)
  }
})

// The charge has to be sampled, not computed on release: the aim indicator
// grows while the key is held, which is the whole feedback the keyboard path
// gives. Held arrows turn the aim here too, by the time since the last frame.
let lastFrame = performance.now()
function pollKeys(now: number) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000)
  lastFrame = now
  const turn = (held.left ? 1 : 0) - (held.right ? 1 : 0)
  if (turn !== 0) turnAim(turn * TURN_RATE * dt)
  if (charging) {
    // Ping-pong, so overshooting the power you wanted is recoverable by
    // holding rather than by releasing and starting again.
    const t = ((now - chargeStart) % (CHARGE_TIME * 2)) / CHARGE_TIME
    const a = game.aim()
    game.setAim(a.x, a.z, t <= 1 ? t : 2 - t)
  }
  requestAnimationFrame(pollKeys)
}
requestAnimationFrame(pollKeys)

window.addEventListener('blur', () => {
  charging = false
  held.left = false
  held.right = false
  dragId = null
  game.cancelAim()
})
