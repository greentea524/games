// Tower Stacker's shell wiring (#109, #110).
//
// This is the file the foundation issue is really about. Everything below is
// the same shared module the five Phaser games call, used from a game that has
// no Phaser in it — `shared/dpad.ts`, `shared/buttons.ts`, `shared/noZoom.ts`,
// `shared/devtools.ts` and `shared/shell.css` all turn out to need nothing
// renderer-specific, because the d-pad and the buttons talk to the game
// through synthetic key events on `window` rather than through Phaser.
//
// The one Phaser-specific thing in the shell is the `input: { windowEvents:
// false }` config the other five carry, and it has no counterpart here: that
// exists because Phaser installs window-level pointer handlers that swallow
// the shell's own button presses. three.js installs nothing.
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

// The HUD draws its text into a 2D canvas, and canvas text does *not* trigger
// a webfont load the way a DOM node does — without this the shell would fetch
// `Press Start 2P` for the logo and the HUD would silently render in the
// browser's default monospace forever. Nothing waits on it: the loop redraws
// the HUD every frame, so the glyphs swap in as soon as it resolves.
void document.fonts?.load(`8px ${FONT}`)

/**
 * Synthetic key events for the on-screen controls.
 *
 * The other five games define legacy `keyCode`/`which` here because Phaser
 * reads them. Nothing in this game does — the listeners below read `code` —
 * so this is the plain event and the legacy properties would be cargo.
 */
const dispatch = (type: 'keydown' | 'keyup', code: string) => {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
}

setupButtons({ dispatch, onPress: () => void ensureCtx() })
setupDpad({ dispatch, onPress: () => void ensureCtx() })
preventZoomGestures()

/**
 * Everything that drops a block.
 *
 * A one-verb game should take every button a player might reach for. Down is
 * included because a d-pad in front of a falling block invites it, and
 * `shared/dpad.ts` emits it as a plain `ArrowDown` like any other arm.
 */
const DROP_KEYS = new Set(['KeyZ', 'KeyX', 'Space', 'Enter', 'ArrowDown', 'NumpadEnter'])

// Keydown repeats while a key is held, and a repeat is not a new press — one
// held button would otherwise drop the whole tower in a second.
const held = new Set<string>()

window.addEventListener('keydown', (e) => {
  if (!DROP_KEYS.has(e.code)) return
  // Space and the arrows scroll the page. The shell is `overflow: hidden`, so
  // this costs nothing and avoids the shell twitching under a held key.
  e.preventDefault()
  if (held.has(e.code)) return
  held.add(e.code)
  ensureCtx()
  game.press()
})

window.addEventListener('keyup', (e) => {
  held.delete(e.code)
})

// A key held down when the tab loses focus never sends its keyup, which would
// leave the code latched and the next real press ignored.
window.addEventListener('blur', () => held.clear())

// SELECT mutes. It is wired by hand rather than through `setupButtons`
// because it invokes a function rather than standing for a key — the same
// split `shared/buttons.ts` describes for Windup's and Cart & Crate's SELECT.
const btnSelect = document.getElementById('btn-select')
if (btnSelect) {
  const toggleMute = (e: Event) => {
    e.preventDefault()
    setMuted(!isMuted())
    // `.latched` is the shell's class for a mode that is running, as opposed
    // to a button being held (#81).
    btnSelect.classList.toggle('latched', isMuted())
    if (!isMuted()) playBlip()
  }
  btnSelect.addEventListener('click', toggleMute)
  btnSelect.addEventListener('touchstart', toggleMute, { passive: false })
}

// The palette toggle. In 3D this drives a uniform on the post pass rather than
// a texture reload, but it is the same switch with the same two states, which
// is the point of quantising to four tones at all.
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
