import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { GameState } from './state'
import { BootScene } from './scenes/BootScene'
import { MainMenuScene } from './scenes/MainMenuScene'
import { PlatformerScene } from './scenes/PlatformerScene'
import { UIScene } from './scenes/UIScene'
import { PauseScene } from './scenes/PauseScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GBC_WIDTH,
  height: GBC_HEIGHT,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MainMenuScene, PlatformerScene, UIScene, PauseScene],
}

export const game = new Phaser.Game(config)

// Same handle static/ and lantern-keeper/ already expose: a read-only way to
// reach the running game from the console or a driven browser.
declare global {
  interface Window {
    __game?: Phaser.Game
  }
}
window.__game = game

const dispatchKey = (code: string, type: 'keydown' | 'keyup') => {
  const keyMap: Record<string, string> = {
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    KeyZ: 'z',
    KeyX: 'x',
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
    Escape: 27,
    Space: 32,
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

const togglePalette = (e?: Event) => {
  if (e) e.preventDefault()
  GameState.setPaletteMode(GameState.paletteMode === 'gbc' ? 'dmg' : 'gbc')
  const scene = game.scene.getScene('platformer') as PlatformerScene
  if (scene && scene.sys.isActive()) {
    scene.reloadPalette()
  }
}

document.getElementById('btn-palette')?.addEventListener('click', togglePalette)
document.getElementById('btn-palette')?.addEventListener('touchstart', togglePalette, { passive: false })
document.getElementById('btn-select')?.addEventListener('click', togglePalette)
document.getElementById('btn-select')?.addEventListener('touchstart', togglePalette, { passive: false })
