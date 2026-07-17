import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { PlayScene } from './scenes/PlayScene'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'

function integerZoom(): number {
  return Math.max(
    1,
    Math.min(
      Math.floor(window.innerWidth / GBC_WIDTH),
      Math.floor(window.innerHeight / GBC_HEIGHT),
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
