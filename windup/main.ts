import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { GameState } from './state'
import { BootScene } from './scenes/BootScene'
import { PlatformerScene } from './scenes/PlatformerScene'
import { UIScene } from './scenes/UIScene'

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
  scene: [BootScene, PlatformerScene, UIScene],
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
  }
  const event = new KeyboardEvent(type, {
    key: keyMap[code] || code,
    code: code,
    bubbles: true,
    cancelable: true,
  })
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

    const platformerScene = game.scene.getScene('platformer') as PlatformerScene
    if (platformerScene) {
      platformerScene.reloadPalette()
    }
  })

  updatePaletteBtn()
}
