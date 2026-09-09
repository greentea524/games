// Tube Runner's controls (#111, #120).
//
// The shell wiring this file used to do is gone: no d-pad, no A button, no
// bezel, no palette toggle. #120 offers two replacements for the d-pad —
// hold zones on the left and right halves of the canvas, or a drag whose
// horizontal component sets the direction — and this is the hold zones.
//
// **That choice is not a preference.** #120's second note says rotation must
// stay a direct angular velocity rather than an eased one, because the
// fairness bound in `track.ts` is derived from `ROTATE_SPEED` being a rate the
// player actually achieves; anything slower makes every generated track
// harder than the bound promises. A drag invites easing — mapping travel to
// rate, ramping in, adding inertia — and each of those quietly breaks the
// bound while feeling like an improvement. A hold zone has nothing to ease:
// the finger is down or it is not, and the rate is the constant the generator
// was told about.
//
// It also keeps exactly the property the d-pad had and this suite used to
// check: sliding a thumb from one side to the other reverses the turn without
// ever passing through "not turning", because both contacts are tracked and
// the newest side wins.
import { createGame } from './game'
import { createHud } from './hud'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import { ensureCtx, isMuted, playBlip, setMuted } from './audio'
import '../shared/stage3d.css'
import './style.css'

const parent = document.getElementById('stage')
if (!parent) throw new Error('#stage is missing from the page')

const game = createGame(parent)
exposeForQA(game)
preventZoomGestures()
createHud(game, {
  muted: isMuted,
  setMuted(next) {
    setMuted(next)
    if (!next) playBlip()
  },
})

const canvas = game.stage.renderer.domElement

/** Which side of the canvas a point is on. */
const sideOf = (clientX: number): -1 | 1 => {
  const rect = canvas.getBoundingClientRect()
  return clientX - rect.left < rect.width / 2 ? -1 : 1
}

/**
 * Every contact currently down, and which way it is asking to turn.
 *
 * A map rather than a single value so that a thumb sliding across the middle
 * of the screen reverses cleanly: the pointer is still down, `pointermove`
 * updates its side, and the turn flips without a gap. With one value it would
 * take a lift and a re-press to change direction, which in a game about lining
 * up with a gap is the difference between a correction and a crash.
 */
const contacts = new Map<number, -1 | 1>()

function applySteering() {
  // The most recent contact wins. Two thumbs down on opposite sides is a
  // player changing their mind, not a request to stop — cancelling to zero
  // there would strand them mid-turn.
  const sides = [...contacts.values()]
  game.steer(sides.length === 0 ? 0 : sides[sides.length - 1])
}

canvas.addEventListener('pointerdown', (e) => {
  ensureCtx()
  // Off the run screens, a press is the button. There is no separate A any
  // more, so the same tap that turns during a run starts the next one.
  if (game.screen() !== 'run') {
    game.press()
    e.preventDefault()
    return
  }
  contacts.set(e.pointerId, sideOf(e.clientX))
  applySteering()
  try {
    canvas.setPointerCapture(e.pointerId)
  } catch {
    // Safari has thrown here for pointers that ended in the same frame.
  }
  e.preventDefault()
})

canvas.addEventListener('pointermove', (e) => {
  if (!contacts.has(e.pointerId)) return
  const side = sideOf(e.clientX)
  if (contacts.get(e.pointerId) === side) return
  contacts.set(e.pointerId, side)
  applySteering()
})

const release = (e: PointerEvent) => {
  if (!contacts.delete(e.pointerId)) return
  applySteering()
}
canvas.addEventListener('pointerup', release)
canvas.addEventListener('pointercancel', release)
// A pointer whose capture is lost never sends `pointerup` to this element, and
// a direction latched on with nothing to release it turns the player for ever.
canvas.addEventListener('lostpointercapture', release)
window.addEventListener('blur', () => {
  contacts.clear()
  applySteering()
})

// ------------------------------------------------------------- keyboard

const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])
const CONFIRM = new Set(['KeyZ', 'KeyX', 'Space', 'Enter', 'NumpadEnter'])

const keys = new Set<string>()

function applyKeys() {
  const left = [...LEFT].some((k) => keys.has(k))
  const right = [...RIGHT].some((k) => keys.has(k))
  // Both at once cancels rather than picking a winner. A keyboard can hold two
  // arrows where a thumb cannot be on two sides at once, and drifting under
  // both would be a surprise either way.
  game.steer(left === right ? 0 : left ? -1 : 1)
}

window.addEventListener('keydown', (e) => {
  if (CONFIRM.has(e.code)) {
    e.preventDefault()
    if (keys.has(e.code)) return
    keys.add(e.code)
    ensureCtx()
    game.press()
    return
  }
  if (!LEFT.has(e.code) && !RIGHT.has(e.code)) return
  e.preventDefault()
  if (keys.has(e.code)) return
  keys.add(e.code)
  ensureCtx()
  applyKeys()
})

window.addEventListener('keyup', (e) => {
  if (!keys.delete(e.code)) return
  if (LEFT.has(e.code) || RIGHT.has(e.code)) applyKeys()
})

window.addEventListener('blur', () => {
  keys.clear()
  applyKeys()
})
