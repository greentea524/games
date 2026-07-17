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
    window.dispatchEvent(
      new KeyboardEvent(type, {
        code: key,
        key: key.replace('Arrow', ''),
        bubbles: true,
      }),
    )
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
