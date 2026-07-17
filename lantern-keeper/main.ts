import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { MenuScene } from './scenes/MenuScene'
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
  scene: [BootScene, MenuScene, PlayScene],
})

window.addEventListener('resize', () => game.scale.setZoom(integerZoom()))

declare global {
  interface Window {
    __game?: Phaser.Game
  }
}
window.__game = game

const dispatchSimulatedKey = (type: 'keydown' | 'keyup', key: string) => {
  const KEY_CODES: Record<string, number> = {
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    KeyX: 88,
    Enter: 13,
    Shift: 16,
  }
  const event = new KeyboardEvent(type, {
    code: key,
    key: key,
    bubbles: true,
  })
  Object.defineProperty(event, 'keyCode', { get: () => KEY_CODES[key] })
  window.dispatchEvent(event)
}

// Set up mobile on-screen controls
document.querySelectorAll('.d-btn, .a-btn').forEach((btn) => {
  const key = btn.getAttribute('data-key')
  if (!key) return

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    dispatchSimulatedKey('keydown', key)
  })

  const release = (e: Event) => {
    e.preventDefault()
    dispatchSimulatedKey('keyup', key)
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
  if (game.scene.isActive('menu')) return
  if (overlayMode === mode) {
    game.scene.resume('play')
    overlay.classList.add('hidden')
    overlayMode = null
  } else {
    game.scene.pause('play')
    overlay.classList.remove('hidden')
    overlayMode = mode
    
    if (mode === 'pause') {
      overlayText.innerHTML = `
        <h2>PAUSED</h2>
        <div style="display:flex; flex-direction:column; gap:12px; margin-top:20px; align-items:center;">
          <button id="btn-pause-resume" class="overlay-btn">Resume</button>
          <button id="btn-pause-controls" class="overlay-btn">Controls</button>
          <button id="btn-pause-exit" class="overlay-btn">Exit Game</button>
        </div>
      `
      
      document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
        toggleOverlay('pause')
      })
      
      document.getElementById('btn-pause-controls')?.addEventListener('click', () => {
        toggleOverlay('info')
      })
      
      document.getElementById('btn-pause-exit')?.addEventListener('click', () => {
        toggleOverlay('pause') // close overlay
        game.scene.stop('play')
        game.scene.start('menu')
      })
    } else {
      overlayText.innerHTML = `
        <h2>LANTERN KEEPER</h2>
        <p style="font-size:10px; font-family:'Courier New', Courier, monospace; color:#86b06a;">Light lanterns to unlock abilities.<br/><br/>
        <b>Controls</b><br/>
        Arrows / D-Pad: Move & Jump<br/>
        X / B Button: Dash<br/><br/>
        Press SELECT or Shift to resume.</p>
        <div style="margin-top:15px;">
          <button id="btn-info-back" class="overlay-btn">Back</button>
        </div>
      `
      
      document.getElementById('btn-info-back')?.addEventListener('click', () => {
        toggleOverlay('info')
      })
    }
  }
}

const setupSysBtn = (id: string, key: string) => {
  const btn = document.getElementById(id)
  if (!btn) return
  
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    dispatchSimulatedKey('keydown', key)
  })

  const release = (e: Event) => {
    e.preventDefault()
    dispatchSimulatedKey('keyup', key)
  }

  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('pointerout', release)
}

setupSysBtn('btn-start', 'Enter')
setupSysBtn('btn-select', 'Shift')

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Escape') toggleOverlay('pause')
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
