import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { BootScene } from './scenes/BootScene'
import { TitleScene } from './scenes/TitleScene'
import { ShopScene } from './scenes/ShopScene'
import { DungeonScene } from './scenes/DungeonScene'
import { UIScene } from './scenes/UIScene'
import { GameOverScene } from './scenes/GameOverScene'
import { ensureCtx } from './audio'
import { setupDpad } from '../shared/dpad'
import { setupButtons } from '../shared/buttons'
import { exposeForQA } from '../shared/devtools'
import { preventZoomGestures } from '../shared/noZoom'
import '../shared/shell.css'

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
    // Phaser's `inputWindowEvents` default adds window-level touch handlers so
    // it can track pointers that begin outside the canvas. Every game here
    // puts its d-pad and A/B buttons in the DOM beside the canvas, so that
    // default feeds every button press into the game's pointer system: one
    // pointer sticks `isDown`, and the next real tap on the game is swallowed
    // reconciling it. Touches outside the canvas are button presses here, not
    // game input (#97).
    input: { windowEvents: false },
  scene: [BootScene, TitleScene, ShopScene, DungeonScene, UIScene, GameOverScene],
}

export const game = new Phaser.Game(config)
exposeForQA(game)

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
    KeyP: 'p',
    Enter: 'Enter',
    Escape: 'Escape',
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
    KeyR: 82,
    KeyE: 69,
    KeyP: 80,
    Enter: 13,
    Escape: 27,
  }
  // A `data-key` missing from these two maps dispatches keyCode 0, which
  // Phaser matches against nothing — the button looks and feels alive, the
  // shell animates it, and the game never hears it. #81's AUTO button shipped
  // that way for an afternoon: it worked on a keyboard and was dead on touch,
  // which is the only place the button is visible at all.
  Object.defineProperty(event, 'keyCode', { get: () => keyCodeMap[code] || 0 })
  Object.defineProperty(event, 'which', { get: () => keyCodeMap[code] || 0 })

  window.dispatchEvent(event)
}

// The d-pad arms are excluded: setupDpad below drives them as one control.
setupButtons({ dispatch: (type, code) => dispatchKey(code, type), onPress: ensureCtx })

// A double tap in the dead space around the d-pad used to zoom the shell in,
// with no way to zoom back out — the page has nothing scrollable to double-tap
// on. Static and Lantern Keeper each had their own copy of the fix; this game
// never did.
preventZoomGestures()

setupDpad({
  dispatch: (type, code) => dispatchKey(code, type),
  onPress: ensureCtx,
})
