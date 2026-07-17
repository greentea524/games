import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { MenuScene } from './scenes/MenuScene'
import { PlayScene } from './scenes/PlayScene'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'

function integerZoom(): number {
  const availableHeight = window.innerHeight - 290
  return Math.max(
    1,
    Math.min(
      Math.floor((window.innerWidth - 40) / GBC_WIDTH),
      Math.floor(availableHeight / GBC_HEIGHT),
    ),
  )
}

declare global {
  interface Window {
    __game?: Phaser.Game
  }
}

let game: Phaser.Game

function createGame() {
  game = new Phaser.Game({
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
  window.__game = game
}

// Load the pixel font before booting so canvas text renders with it from
// the first frame; boot anyway if the font fails (offline etc.).
document.fonts
  .load('8px "Press Start 2P"')
  .catch(() => {})
  .finally(createGame)

const dispatchSimulatedKey = (type: 'keydown' | 'keyup', key: string) => {
  const KEY_CODES: Record<string, number> = {
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    KeyX: 88,
    KeyZ: 90,
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

  let isDown = false
  const press = (e: Event) => {
    e.preventDefault()
    if (!isDown) {
      isDown = true
      dispatchSimulatedKey('keydown', key)
    }
  }

  const release = (e: Event) => {
    e.preventDefault()
    if (isDown) {
      isDown = false
      dispatchSimulatedKey('keyup', key)
    }
  }

  btn.addEventListener('pointerdown', press)
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('pointerout', release)
  btn.addEventListener('pointerleave', release)
  btn.addEventListener('touchend', release)
  btn.addEventListener('touchcancel', release)
})
// Overlay logic for Pause and Info
const overlay = document.getElementById('overlay')
const overlayText = document.getElementById('overlay-text')
let overlayMode: 'pause' | 'info' | null = null

let pauseSelectedIndex = 0
const updatePauseMenuSelection = () => {
  const buttons = ['btn-pause-resume', 'btn-pause-controls', 'btn-pause-exit']
  buttons.forEach((id, index) => {
    const btn = document.getElementById(id)
    if (btn) {
      if (index === pauseSelectedIndex) {
        btn.style.color = '#e0f8cf'
        if (!btn.innerText.startsWith('> ')) btn.innerText = '> ' + btn.innerText.replace('> ', '')
      } else {
        btn.style.color = '#86b06a'
        btn.innerText = btn.innerText.replace('> ', '')
      }
    }
  })
}

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
      
      pauseSelectedIndex = 0
      updatePauseMenuSelection()
    } else {
      overlayText.innerHTML = `
        <h2>LANTERN KEEPER</h2>
        <p style="font-size:10px; font-family:'Courier New', Courier, monospace; color:#86b06a;">Light lanterns to unlock abilities.<br/><br/>
        <b>Controls</b><br/>
        Arrows / D-Pad: Move & Jump<br/>
        Z / A Button: Jump<br/>
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
(window as any).toggleOverlay = toggleOverlay;

const setupSysBtn = (id: string, key: string) => {
  const btn = document.getElementById(id)
  if (!btn) return
  
  let isDown = false
  const press = (e: Event) => {
    e.preventDefault()
    if (!isDown) {
      isDown = true
      dispatchSimulatedKey('keydown', key)
    }
  }

  const release = (e: Event) => {
    e.preventDefault()
    if (isDown) {
      isDown = false
      dispatchSimulatedKey('keyup', key)
    }
  }

  btn.addEventListener('pointerdown', press)
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('pointerout', release)
  btn.addEventListener('pointerleave', release)
  btn.addEventListener('touchend', release)
  btn.addEventListener('touchcancel', release)
}

setupSysBtn('btn-start', 'Enter')
setupSysBtn('btn-select', 'Shift')

window.addEventListener('keydown', (e) => {
  if (e.repeat) return

  if (overlayMode === 'pause') {
    if (e.key === 'ArrowUp') {
      pauseSelectedIndex = (pauseSelectedIndex - 1 + 3) % 3
      updatePauseMenuSelection()
    } else if (e.key === 'ArrowDown') {
      pauseSelectedIndex = (pauseSelectedIndex + 1) % 3
      updatePauseMenuSelection()
    } else if (e.key === 'Enter' || e.key === 'z' || e.key === 'Z' || e.key === 'KeyZ') {
       const buttons = ['btn-pause-resume', 'btn-pause-controls', 'btn-pause-exit']
       document.getElementById(buttons[pauseSelectedIndex])?.click()
    } else if (e.key === 'Escape') {
       toggleOverlay('pause')
    }
  } else if (overlayMode === 'info') {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Shift' || e.key === 'z' || e.key === 'Z' || e.key === 'KeyZ' || e.key === 'x' || e.key === 'X' || e.key === 'KeyX') {
       toggleOverlay('info')
    }
  }
})

window.addEventListener('keydown', (e) => {
  let btn: Element | null = document.querySelector(`[data-key="${e.code}"]`)
  if (e.code === 'Enter') btn = document.getElementById('btn-start')
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') btn = document.getElementById('btn-select')
  if (btn) btn.classList.add('active-kb')
})

window.addEventListener('keyup', (e) => {
  let btn: Element | null = document.querySelector(`[data-key="${e.code}"]`)
  if (e.code === 'Enter') btn = document.getElementById('btn-start')
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') btn = document.getElementById('btn-select')
  if (btn) btn.classList.remove('active-kb')
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
