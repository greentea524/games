import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT } from './constants'
import { BootScene } from './scenes/BootScene'
import { TitleScene } from './scenes/TitleScene'
import { ShopScene } from './scenes/ShopScene'
import { DungeonScene } from './scenes/DungeonScene'
import { UIScene } from './scenes/UIScene'
import { GameOverScene } from './scenes/GameOverScene'
import { GameState } from './state'
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

// The palette toggle (#134).
//
// This game shipped with a DMG art set it could never display. `GameState`
// had `setPaletteMode`, `DungeonScene` had `reloadPalette()`, `BootScene` built
// every `_dmg` texture — and nothing called any of it, because the shell had no
// control. `paletteMode` was `'gbc'` from load to unload, so all 79 DMG
// textures were dead weight and the 32 of them `npm run qa:contrast` scores
// were art no player could reach.
//
// Only the button was missing. The switch matches Static's and Cart & Crate's
// rather than Windup's plain label, which makes it three of four on one style
// instead of two and two, and it shows the current mode where a label cannot.
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
    GameState.setPaletteMode(GameState.paletteMode === 'dmg' ? 'gbc' : 'dmg')
    updatePaletteBtn()

    // Both scenes that draw sprites, not just the dungeon. The sibling games
    // each have one scene to reload; this one has a title screen with hero and
    // enemy previews on it, and a toggle pressed there would otherwise look
    // dead. `UIScene` needs nothing — it re-textures the relic pips from
    // `paletteMode` every frame already.
    const dungeon = game.scene.getScene('dungeon') as DungeonScene | null
    if (dungeon?.scene.isActive()) dungeon.reloadPalette()
    const title = game.scene.getScene('title') as TitleScene | null
    if (title?.scene.isActive()) title.reloadPalette()
  })

  updatePaletteBtn()
}
