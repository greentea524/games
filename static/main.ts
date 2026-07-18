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
const SIMULATED_KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  KeyX: { key: 'x', code: 'KeyX', keyCode: 88 },
  KeyZ: { key: 'z', code: 'KeyZ', keyCode: 90 },
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Shift: { key: 'Shift', code: 'Shift', keyCode: 16 },
}

const dispatchSimulatedKey = (type: 'keydown' | 'keyup', keyName: string) => {
  const info = SIMULATED_KEYS[keyName] ?? { key: keyName, code: keyName, keyCode: 0 }
  const event = new KeyboardEvent(type, { code: info.code, key: info.key, bubbles: true })
  Object.defineProperty(event, 'keyCode', { get: () => info.keyCode })
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

// ---- System buttons (START and SELECT) ----
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

// ---- Pause menu (Esc / Enter / Shift / START / SELECT) ----
const overlay = document.getElementById('overlay')
const overlayText = document.getElementById('overlay-text')
const isDesktop = () =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches

let paused = false
let view: 'pause' | 'controls' | 'about' = 'pause'
let controlsMode: 'keyboard' | 'touch' = 'keyboard'
const pauseItems = ['Resume', 'About', 'Inventory', 'Controls']
let selected = 0

function pauseButtonsMarkup(): string {
  return `
    <h2>PAUSED</h2>
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px; align-items:center;">
      ${pauseItems
        .map(
          (label, i) =>
            `<button id="pause-item-${i}" class="overlay-btn">${label}</button>`,
        )
        .join('')}
    </div>`
}

function renderPause() {
  if (!overlayText) return
  view = 'pause'
  overlayText.innerHTML = pauseButtonsMarkup()
  pauseItems.forEach((_, i) => {
    document.getElementById(`pause-item-${i}`)?.addEventListener('click', () => {
      selected = i
      activateSelected()
    })
  })
  updateSelection()
}

function updateSelection() {
  pauseItems.forEach((label, i) => {
    const btn = document.getElementById(`pause-item-${i}`)
    if (!btn) return
    btn.style.color = i === selected ? '#e0f8cf' : '#86b06a'
    btn.innerText = (i === selected ? '> ' : '') + label
  })
}

function renderAbout() {
  if (!overlayText) return
  view = 'about'
  overlayText.innerHTML = `
    <h2>ABOUT STATIC</h2>
    <p style="font-size:8px; color:#8bac0f; text-align:center; line-height:1.7; margin-top:8px;">
      A GBC top-down mystery.<br/><br/>
      Houses are vanishing from town, but nobody else remembers.<br/><br/>
      Explore the Static-side world through retro TV portals to uncover clues.
    </p>
    <div style="margin-top:12px;">
      <button id="about-back" class="overlay-btn">Back</button>
    </div>`
  document.getElementById('about-back')?.addEventListener('click', () => {
    renderPause()
  })
}

function renderControls() {
  if (!overlayText) return
  view = 'controls'
  const kb = `
    <h2>KEYBOARD</h2>
    <p style="font-size:8px; color:#9bbc0f; text-align:left; line-height:2;">
      Arrows / WASD&nbsp;&nbsp;Move<br/>
      Z&nbsp;&nbsp;Talk / Confirm<br/>
      Shift&nbsp;&nbsp;Inventory / Pause<br/>
      Esc / Enter&nbsp;&nbsp;Pause Menu
    </p>`
  const touch = `
    <h2>TOUCH</h2>
    <p style="font-size:8px; color:#9bbc0f; text-align:left; line-height:2;">
      D-Pad&nbsp;&nbsp;Move<br/>
      A Button&nbsp;&nbsp;Talk / Confirm<br/>
      SELECT / START&nbsp;&nbsp;Pause Menu
    </p>`
  overlayText.innerHTML =
    (controlsMode === 'keyboard' ? kb : touch) +
    `<div style="display:flex; flex-direction:column; gap:10px; margin-top:14px; align-items:center;">
      <button id="ctrl-toggle" class="overlay-btn">${
        controlsMode === 'keyboard' ? 'Show Touch' : 'Show Keyboard'
      }</button>
      <button id="ctrl-back" class="overlay-btn">Back</button>
    </div>`
  document.getElementById('ctrl-toggle')?.addEventListener('click', () => {
    controlsMode = controlsMode === 'keyboard' ? 'touch' : 'keyboard'
    renderControls()
  })
  document.getElementById('ctrl-back')?.addEventListener('click', () => {
    renderPause()
  })
}

function activateSelected() {
  if (pauseItems[selected] === 'Resume') {
    closePause()
  } else if (pauseItems[selected] === 'About') {
    renderAbout()
  } else if (pauseItems[selected] === 'Inventory') {
    closePause()
    const uiScene = game?.scene?.getScene('ui') as UIScene
    if (uiScene) uiScene.toggleInventory()
  } else if (pauseItems[selected] === 'Controls') {
    renderControls()
  }
}

function openPause() {
  if (!overlay || !game || !game.scene.isActive('world')) return
  paused = true
  selected = 0
  controlsMode = isDesktop() ? 'keyboard' : 'touch'
  game.scene.pause('world')
  game.scene.pause('ui')
  overlay.classList.remove('hidden')
  renderPause()
}

function closePause() {
  if (!overlay) return
  paused = false
  overlay.classList.add('hidden')
  game.scene.resume('world')
  game.scene.resume('ui')
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return
  if (!paused) {
    if (
      ['Escape', 'Enter'].includes(e.key) ||
      ['Escape', 'Enter'].includes(e.code)
    ) {
      e.preventDefault()
      openPause()
    } else if (
      ['Shift'].includes(e.key) ||
      ['ShiftLeft', 'ShiftRight'].includes(e.code)
    ) {
      e.preventDefault()
      const uiScene = game?.scene?.getScene('ui') as UIScene
      if (uiScene) uiScene.toggleInventory()
    }
    return
  }
  e.preventDefault()
  if (view === 'controls' || view === 'about') {
    if (
      ['Escape', 'Enter', 'z', 'Z', 'x', 'X', 'KeyZ', 'KeyX'].includes(e.key) ||
      ['Escape', 'Enter', 'KeyZ', 'KeyX'].includes(e.code)
    ) {
      renderPause()
    }
    return
  }
  if (e.key === 'ArrowUp' || e.code === 'ArrowUp') {
    selected = (selected - 1 + pauseItems.length) % pauseItems.length
    updateSelection()
  } else if (e.key === 'ArrowDown' || e.code === 'ArrowDown') {
    selected = (selected + 1) % pauseItems.length
    updateSelection()
  } else if (
    ['Enter', 'z', 'Z', 'KeyZ'].includes(e.key) ||
    ['Enter', 'KeyZ'].includes(e.code)
  ) {
    activateSelected()
  } else if (
    ['Escape', 'Shift', 'x', 'X', 'KeyX'].includes(e.key) ||
    ['Escape', 'ShiftLeft', 'ShiftRight', 'KeyX'].includes(e.code)
  ) {
    closePause()
  }
})

// Prevent double-tap zoom and multi-touch pinch zoom on mobile
document.addEventListener(
  'dblclick',
  (event) => {
    event.preventDefault()
  },
  { passive: false },
)

document.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length > 1) {
      event.preventDefault()
    }
  },
  { passive: false },
)

let lastTouchEnd = 0
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 300) {
      event.preventDefault()
    }
    lastTouchEnd = now
  },
  { passive: false },
)
