// Tower Stacker's controls (#110, #119).
//
// The whole of the shell wiring this file used to do is gone. There is no
// d-pad, no A button, no bezel and no palette toggle, because #119 moved the
// game onto `shared/stage3d.ts` and the game has exactly one verb: a tap
// anywhere on the canvas drops the block. That is a better fit than the d-pad
// ever was — a four-way pad in front of a falling block invites steering it,
// which is not a thing this game does.
//
// Keeping the keyboard costs nothing and is the only way to play without a
// pointer, so every key someone might reach for still drops.
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

/**
 * A tap on the canvas drops.
 *
 * `pointerdown` rather than `click`: the drop is a timing decision, and a
 * click does not fire until the finger lifts. On a run at speed that is the
 * difference between the block the player aimed at and the next one.
 */
canvas.addEventListener('pointerdown', (e) => {
  // Only the primary contact. A second finger landing mid-run would otherwise
  // spend a drop the player did not ask for.
  if (!e.isPrimary) return
  ensureCtx()
  game.press()
  e.preventDefault()
})

// ------------------------------------------------------------- keyboard

/**
 * Everything that drops a block.
 *
 * A one-verb game should take every key a player might reach for. The GameBoy
 * build's `ArrowDown` is still here: it cost nothing then and costs nothing
 * now, and a falling block invites it.
 */
const DROP_KEYS = new Set(['KeyZ', 'KeyX', 'Space', 'Enter', 'ArrowDown', 'NumpadEnter'])

// Keydown repeats while a key is held, and a repeat is not a new press — one
// held key would otherwise drop the whole tower in a second.
const held = new Set<string>()

window.addEventListener('keydown', (e) => {
  if (!DROP_KEYS.has(e.code)) return
  // Space and the arrows scroll the page.
  e.preventDefault()
  if (held.has(e.code)) return
  held.add(e.code)
  ensureCtx()
  game.press()
})

window.addEventListener('keyup', (e) => held.delete(e.code))

// A key held down when the tab loses focus never sends its keyup, which would
// leave the code latched and the next real press ignored.
window.addEventListener('blur', () => held.clear())
