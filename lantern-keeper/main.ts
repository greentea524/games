import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { PlayScene } from './scenes/PlayScene'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'

function integerZoom(): number {
  const isMobile = window.matchMedia('(pointer: coarse)').matches
  const availableHeight = isMobile ? window.innerHeight - 250 : window.innerHeight
  return Math.max(
    1,
    Math.min(
      Math.floor(window.innerWidth / GBC_WIDTH),
      Math.floor(availableHeight / GBC_HEIGHT),
    ),
  )
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GBC_WIDTH,
  height: GBC_HEIGHT,
  zoom: integerZoom(),
  pixelArt: true,
  backgroundColor: '#0f1a12',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 500 } },
  },
  scene: [BootScene, PlayScene],
})

window.addEventListener('resize', () => game.scale.setZoom(integerZoom()))

declare global {
  interface Window {
    __game?: Phaser.Game
  }
}
window.__game = game

// Set up mobile on-screen controls
document.querySelectorAll('.d-btn, .a-btn').forEach((btn) => {
  const key = btn.getAttribute('data-key')
  if (!key) return

  const dispatchKey = (type: 'keydown' | 'keyup') => {
    const KEY_CODES: Record<string, number> = {
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      KeyX: 88,
    }
    const event = new KeyboardEvent(type, {
      code: key,
      key: key,
      bubbles: true,
    })
    Object.defineProperty(event, 'keyCode', { get: () => KEY_CODES[key] })
    window.dispatchEvent(event)
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    dispatchKey('keydown')
  })

  const release = (e: Event) => {
    e.preventDefault()
    dispatchKey('keyup')
  }

  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('pointerout', release)
})

// Overlay logic for Pause and Info
const overlay = document.getElementById('overlay')
const overlayText = document.getElementById('overlay-text')
let overlayMode: 'pause' | 'info' | null = null

function toggleOverlay(mode: 'pause' | 'info') {
  if (!overlay || !overlayText) return
  if (overlayMode === mode) {
    game.scene.resume('play')
    overlay.classList.add('hidden')
    overlayMode = null
  } else {
    game.scene.pause('play')
    overlay.classList.remove('hidden')
    overlayMode = mode
    
    if (mode === 'pause') {
      overlayText.innerHTML = '<h2>PAUSED</h2><p>Press START to resume</p>'
    } else {
      overlayText.innerHTML = '<h2>LANTERN KEEPER</h2><p>A GBC-style puzzle platformer.<br/><br/>Light the lanterns to reveal the path and unlock new abilities.<br/><br/>Press SELECT to resume.</p>'
    }
  }
}

document.getElementById('btn-start')?.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  toggleOverlay('pause')
})

document.getElementById('btn-select')?.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  toggleOverlay('info')
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') toggleOverlay('pause')
  if (e.key === 'Shift') toggleOverlay('info')
})

// Prevent zooming via double-tap and pinch on iOS
document.addEventListener('dblclick', (event) => {
  event.preventDefault()
}, { passive: false })

document.addEventListener('touchstart', (event) => {
  if (event.touches.length > 1) {
    event.preventDefault()
  }
}, { passive: false })
