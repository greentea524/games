import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { GameState } from './state'
import { BootScene } from './scenes/BootScene'
import { MainMenuScene } from './scenes/MainMenuScene'
import { BoardScene } from './scenes/BoardScene'
import { UIScene } from './scenes/UIScene'

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
  scene: [BootScene, MainMenuScene, BoardScene, UIScene],
}

export const game = new Phaser.Game(config)

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

document.querySelectorAll('[data-key]').forEach((btn) => {
  const code = btn.getAttribute('data-key')
  if (!code) return

  const handlePress = (e: Event) => {
    e.preventDefault()
    btn.classList.add('active-kb')
    dispatchKey(code, 'keydown')
  }

  const handleRelease = (e: Event) => {
    e.preventDefault()
    btn.classList.remove('active-kb')
    dispatchKey(code, 'keyup')
  }

  btn.addEventListener('touchstart', handlePress, { passive: false })
  btn.addEventListener('touchend', handleRelease, { passive: false })
  btn.addEventListener('mousedown', handlePress)
  btn.addEventListener('mouseup', handleRelease)
  btn.addEventListener('mouseleave', handleRelease)
})

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
