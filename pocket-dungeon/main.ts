import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { GameState } from './state'
import { BootScene } from './scenes/BootScene'
import { TitleScene } from './scenes/TitleScene'
import { ShopScene } from './scenes/ShopScene'
import { DungeonScene } from './scenes/DungeonScene'
import { UIScene } from './scenes/UIScene'
import { GameOverScene } from './scenes/GameOverScene'

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
  scene: [BootScene, TitleScene, ShopScene, DungeonScene, UIScene, GameOverScene],
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
    KeyR: 'r',
    KeyE: 'e',
    Enter: 'Enter',
    Escape: 'Escape',
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
