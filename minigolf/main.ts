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
createHud(game)

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

/** Screen delta to an aim. Pulling back aims forward, hence the negation. */
function aimFrom(dx: number, dy: number) {
  const radius = powerRadius()
  // Screen right is world +x and screen down is world +z under this camera.
  return { x: -dx, z: -dy, power: Math.hypot(dx, dy) / radius }
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
// The equivalent path, not the primary one: rotate the aim with left/right,
// hold space to charge, release to putt.

let aimAngle = Math.PI // pointing at -z, up the hole from the tee
let charging = false
let chargeStart = 0
const CHARGE_TIME = 900

function applyKeyboardAim(power: number) {
  game.setAim(Math.sin(aimAngle), Math.cos(aimAngle), power)
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    aimAngle -= 0.08
    applyKeyboardAim(game.aim().power)
    e.preventDefault()
  } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    aimAngle += 0.08
    applyKeyboardAim(game.aim().power)
    e.preventDefault()
  } else if (e.code === 'Space' && !charging && game.canPutt()) {
    charging = true
    chargeStart = performance.now()
    e.preventDefault()
  }
})

window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || !charging) return
  charging = false
  e.preventDefault()
  if (game.aim().power >= MIN_POWER) game.strike()
  else game.cancelAim()
})

// The charge has to be sampled, not computed on release: the aim indicator
// grows while the key is held, which is the whole feedback the keyboard path
// gives.
function pollCharge() {
  if (charging) {
    // Ping-pong, so overshooting the power you wanted is recoverable by
    // holding rather than by releasing and starting again.
    const t = ((performance.now() - chargeStart) % (CHARGE_TIME * 2)) / CHARGE_TIME
    applyKeyboardAim(t <= 1 ? t : 2 - t)
  }
  requestAnimationFrame(pollCharge)
}
requestAnimationFrame(pollCharge)

window.addEventListener('blur', () => {
  charging = false
  dragId = null
  game.cancelAim()
})
