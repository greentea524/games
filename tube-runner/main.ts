// Tube Runner's shell wiring (#111).
//
// The same shared modules as Tower Stacker, used the same way — which is the
// claim #109 made and this file is the second piece of evidence for. The only
// difference worth noting is that this game reads the d-pad as a *held*
// direction rather than as a press: rotating is its one verb, and
// `shared/dpad.ts` emits a matching `keyup` when a thumb slides off an arm or
// lifts, so a held direction is exactly as reliable here as it is under
// Phaser.
import { createGame } from './game'
import { setupDpad } from '../shared/dpad'
import { setupButtons } from '../shared/buttons'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import { ensureCtx, isMuted, playBlip, setMuted } from './audio'
import { FONT } from './constants'
import '../shared/shell.css'

const parent = document.getElementById('game')
if (!parent) throw new Error('#game is missing from the shell')

const game = createGame(parent)
exposeForQA(game)

// Canvas text does not trigger a webfont load the way a DOM node does, so
// without this the HUD would render in the browser's default monospace for
// ever. Nothing waits on it: the loop redraws every frame.
void document.fonts?.load(`8px ${FONT}`)

const dispatch = (type: 'keydown' | 'keyup', code: string) => {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
}

setupButtons({ dispatch, onPress: () => void ensureCtx() })
setupDpad({ dispatch, onPress: () => void ensureCtx() })
preventZoomGestures()

const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])
const CONFIRM = new Set(['KeyZ', 'KeyX', 'Space', 'Enter', 'NumpadEnter'])

// Which directions are down, so releasing one while the other is still held
// resumes that one rather than stopping. A player rolling a thumb across the
// pad produces exactly that overlap.
const held = new Set<string>()

function applySteering() {
  const left = [...LEFT].some((k) => held.has(k))
  const right = [...RIGHT].some((k) => held.has(k))
  // Both at once cancels rather than picking a winner: `shared/dpad.ts` never
  // emits two arms at once, but a keyboard can, and drifting under two held
  // keys would be a surprise either way.
  game.steer(left === right ? 0 : left ? -1 : 1)
}

window.addEventListener('keydown', (e) => {
  if (CONFIRM.has(e.code)) {
    e.preventDefault()
    if (held.has(e.code)) return
    held.add(e.code)
    ensureCtx()
    game.press()
    return
  }
  if (!LEFT.has(e.code) && !RIGHT.has(e.code)) return
  e.preventDefault()
  held.add(e.code)
  applySteering()
})

window.addEventListener('keyup', (e) => {
  if (!held.delete(e.code)) return
  if (LEFT.has(e.code) || RIGHT.has(e.code)) applySteering()
})

// A key held when the tab loses focus never sends its keyup, which would leave
// the player rotating for ever.
window.addEventListener('blur', () => {
  held.clear()
  applySteering()
})

// SELECT mutes, wired by hand because it invokes a function rather than
// standing for a key — the split `shared/buttons.ts` describes.
const btnSelect = document.getElementById('btn-select')
if (btnSelect) {
  const toggleMute = (e: Event) => {
    e.preventDefault()
    setMuted(!isMuted())
    btnSelect.classList.toggle('latched', isMuted())
    if (!isMuted()) playBlip()
  }
  btnSelect.addEventListener('click', toggleMute)
  btnSelect.addEventListener('touchstart', toggleMute, { passive: false })
}

const paletteBtn = document.getElementById('palette-toggle')
if (paletteBtn) {
  const labelEl = document.getElementById('palette-label')
  const trackEl = document.getElementById('palette-track')
  const knobEl = document.getElementById('palette-knob')

  const paint = () => {
    const isColour = !game.mono()
    if (labelEl) {
      labelEl.textContent = isColour ? 'COLOR' : 'MONO'
      labelEl.style.color = isColour ? '#ffcc00' : '#9bbc0f'
    }
    if (trackEl) {
      trackEl.style.background = isColour ? '#1c2838' : '#0f140f'
      trackEl.style.borderColor = isColour ? '#385888' : '#306230'
    }
    if (knobEl) {
      knobEl.style.transform = isColour ? 'translateX(12px)' : 'translateX(0px)'
      knobEl.style.background = isColour ? '#ff4444' : '#9bbc0f'
    }
  }

  paletteBtn.addEventListener('click', () => {
    game.setPalette(!game.mono())
    paint()
  })
  paint()
}
