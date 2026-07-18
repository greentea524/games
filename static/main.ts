import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { WorldScene } from './scenes/WorldScene'
import { UIScene } from './scenes/UIScene'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'

function integerZoom(): number {
  // Must match the #game box sizing in index.html's pre-init script, or
  // the canvas is rendered larger than its container and overflow:hidden
  // crops the edges (which was clipping the top-right minimap on desktop).
  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const availableHeight = window.innerHeight - (isDesktop ? 250 : 380)
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
    backgroundColor: '#0f380f',
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 } },
    },
    scene: [BootScene, WorldScene, UIScene],
  })
  window.addEventListener('resize', () => {
    const zoom = integerZoom()
    game.scale.setZoom(zoom)
    const preStyle = document.getElementById('pre-init-game-style')
    if (preStyle) {
      preStyle.innerHTML = `#game { width: ${GBC_WIDTH * zoom}px; height: ${GBC_HEIGHT * zoom}px; }`
    }
  })
  window.__game = game
}

document.fonts
  .load('8px "Press Start 2P"')
  .catch(() => {})
  .finally(createGame)

// ---- Touch controls: on-screen d-pad dispatches arrow keys ----
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

const dispatchSimulatedKey = (type: 'keydown' | 'keyup', key: string) => {
  const event = new KeyboardEvent(type, { code: key, key, bubbles: true })
  Object.defineProperty(event, 'keyCode', { get: () => KEY_CODES[key] })
  window.dispatchEvent(event)
}

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

// Keyboard press feedback on the on-screen buttons.
window.addEventListener('keydown', (e) => {
  const btn = document.querySelector(`[data-key="${e.code}"]`)
  if (btn) btn.classList.add('active-kb')
})
window.addEventListener('keyup', (e) => {
  const btn = document.querySelector(`[data-key="${e.code}"]`)
  if (btn) btn.classList.remove('active-kb')
})
