import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { GameState } from './state'
import { BootScene } from './scenes/BootScene'
import { MainMenuScene } from './scenes/MainMenuScene'
import { LevelSelectScene } from './scenes/LevelSelectScene'
import { BoardScene } from './scenes/BoardScene'
import { UIScene } from './scenes/UIScene'
import { setupDpad } from '../shared/dpad'
import { setupButtons } from '../shared/buttons'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GBC_WIDTH,
  height: GBC_HEIGHT,
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
    // Phaser's `inputWindowEvents` default adds window-level touch handlers so
    // it can track pointers that begin outside the canvas. Every game here
    // puts its d-pad and A/B buttons in the DOM beside the canvas, so that
    // default feeds every button press into the game's pointer system: one
    // pointer sticks `isDown`, and the next real tap on the game is swallowed
    // reconciling it. Touches outside the canvas are button presses here, not
    // game input (#97).
    input: { windowEvents: false },
  scene: [BootScene, MainMenuScene, LevelSelectScene, BoardScene, UIScene],
}

export const game = new Phaser.Game(config)
exposeForQA(game)

const dispatchKey = (code: string, type: 'keydown' | 'keyup') => {
  const keyMap: Record<string, string> = {
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    KeyZ: 'z',
    KeyX: 'x',
    Enter: 'Enter',
  }
  const event = new KeyboardEvent(type, {
    key: keyMap[code] || code,
    code: code,
    bubbles: true,
    cancelable: true,
  })
  
  const keyCodeMap: Record<string, number> = {
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    KeyZ: 90,
    KeyX: 88,
    Enter: 13,
  }
  Object.defineProperty(event, 'keyCode', { get: () => keyCodeMap[code] || 0 })
  Object.defineProperty(event, 'which', { get: () => keyCodeMap[code] || 0 })
  
  window.dispatchEvent(event)
}

// The d-pad arms are excluded: setupDpad below drives them as one control.
setupButtons({ dispatch: (type, code) => dispatchKey(code, type) })

// A double tap in the dead space around the d-pad used to zoom the shell in,
// with no way to zoom back out — the page has nothing scrollable to double-tap
// on. Static and Lantern Keeper each had their own copy of the fix; this game
// never did.
preventZoomGestures()

setupDpad({ dispatch: (type, code) => dispatchKey(code, type) })

// SELECT button (Reset Level)
const btnSelect = document.getElementById('btn-select')
if (btnSelect) {
  const triggerReset = (e: Event) => {
    e.preventDefault()
    const boardScene = game?.scene?.getScene('board') as BoardScene
    if (boardScene) boardScene.resetLevel()
  }
  btnSelect.addEventListener('click', triggerReset)
  btnSelect.addEventListener('touchstart', triggerReset, { passive: false })
}

// START button (Pause Menu / Confirm)
const btnStart = document.getElementById('btn-start')
if (btnStart) {
  const triggerStart = (e: Event) => {
    e.preventDefault()
    
    // If on main menu, START acts as ENTER
    const mainMenuScene = game?.scene?.getScene('mainmenu') as MainMenuScene
    if (mainMenuScene && mainMenuScene.scene.isActive()) {
      dispatchKey('Enter', 'keydown')
      setTimeout(() => dispatchKey('Enter', 'keyup'), 50)
      return
    }

    const uiScene = game?.scene?.getScene('ui') as UIScene
    const boardScene = game?.scene?.getScene('board') as BoardScene
    if (GameState.uiBlocking && uiScene && !uiScene.isPauseOpen()) {
      if (boardScene && 'nextLevel' in boardScene) {
         // boardScene.nextLevel doesn't exist anymore, so we just toggle pause
         uiScene.togglePauseMenu()
      }
    } else if (uiScene && uiScene.scene.isActive()) {
      uiScene.togglePauseMenu()
    }
  }
  btnStart.addEventListener('click', triggerStart)
  btnStart.addEventListener('touchstart', triggerStart, { passive: false })
}

// Palette Toggle Switch
const paletteBtn = document.getElementById('palette-toggle')
if (paletteBtn) {
  const labelEl = document.getElementById('palette-label')
  const trackEl = document.getElementById('palette-track')
  const knobEl = document.getElementById('palette-knob')

  const updatePaletteBtn = () => {
    const isGbc = GameState.paletteMode === 'gbc'
    if (labelEl) {
      labelEl.textContent = isGbc ? 'COLOR' : 'MONO'
      labelEl.style.color = isGbc ? '#ffcc00' : '#9bbc0f'
    }
    if (trackEl) {
      trackEl.style.background = isGbc ? '#1c2838' : '#0f140f'
      trackEl.style.borderColor = isGbc ? '#385888' : '#306230'
    }
    if (knobEl) {
      knobEl.style.transform = isGbc ? 'translateX(12px)' : 'translateX(0px)'
      knobEl.style.background = isGbc ? '#ff4444' : '#9bbc0f'
    }
  }

  paletteBtn.addEventListener('click', () => {
    const nextMode = GameState.paletteMode === 'dmg' ? 'gbc' : 'dmg'
    GameState.setPaletteMode(nextMode)
    updatePaletteBtn()

    const boardScene = game.scene.getScene('board') as BoardScene
    if (boardScene) {
      boardScene.reloadPalette()
    }
  })

  updatePaletteBtn()
}

import { ensureCtx } from './audio'
import '../shared/shell.css'
const initAudio = () => {
  ensureCtx()
  document.removeEventListener('click', initAudio)
  document.removeEventListener('keydown', initAudio)
  document.removeEventListener('touchstart', initAudio)
}
document.addEventListener('click', initAudio, { once: true })
document.addEventListener('keydown', initAudio, { once: true })
document.addEventListener('touchstart', initAudio, { once: true, passive: true })
