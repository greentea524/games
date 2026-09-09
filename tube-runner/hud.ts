// Tube Runner's HUD (#111, #120), as DOM over the canvas.
//
// It used to be 8px glyphs drawn into a 160x144 2D canvas and composited into
// the same framebuffer as the game. On `shared/stage3d.ts` the overlay is real
// DOM, so the text is real text.
//
// #120 asks what happens to the player marker. The answer is that it went
// before this rework did, and for a better reason than the palette: the marker
// existed because the camera sat on the tube's axis and the player had no
// body, so nothing on screen said where "you" were. #126 gave the player a
// body at the radius the collision test actually uses, and the camera now
// trails it. The runner *is* the marker, and a HUD stand-in would be a second,
// less accurate answer to the same question.
import { prefersReducedMotion } from '../shared/motion'
import type { TubeGame } from './game'

export type Screen = 'title' | 'run' | 'over'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export interface HudHooks {
  muted(): boolean
  setMuted(muted: boolean): void
}

export function createHud(game: TubeGame, hooks: HudHooks): void {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const sound = el('button', 'tr-btn tr-sound')
  sound.type = 'button'
  sound.onclick = () => {
    hooks.setMuted(!hooks.muted())
    refresh()
  }
  overlay.append(sound)

  const score = el('div', 'tr-score')
  const ringLabel = el('span', 'tr-rings')
  const bestLabel = el('span', 'tr-best')
  score.append(ringLabel, bestLabel)
  overlay.append(score)

  const panel = el('div', 'tr-panel')
  const panelTitle = el('h1', 'tr-panel-title')
  const panelBody = el('p', 'tr-panel-body')
  const panelBtn = el('button', 'tr-btn tr-btn-primary')
  panelBtn.type = 'button'
  panelBtn.onclick = () => game.press()
  panel.append(panelTitle, panelBody, panelBtn)
  overlay.append(panel)

  const hint = el('p', 'tr-hint', 'Hold the left or right side of the screen to turn.')
  overlay.append(hint)

  function refresh() {
    const screen = game.screen()
    sound.textContent = hooks.muted() ? '♪ off' : '♪ on'
    sound.setAttribute('aria-pressed', String(hooks.muted()))

    score.hidden = screen !== 'run'
    ringLabel.textContent = String(game.rings())
    bestLabel.textContent = `best ${game.best()}`
    // Pulses as a ring is cleared, which is the only feedback that a ring
    // counted — the ring itself is behind the player by then.
    score.classList.toggle(
      'tr-pulse',
      screen === 'run' && game.clearFlash() > 0.4 && !prefersReducedMotion(),
    )

    hint.hidden = screen !== 'run' || game.rings() > 0

    panel.hidden = screen === 'run'
    if (screen === 'title') {
      panelTitle.textContent = 'Tube Runner'
      panelBody.textContent =
        game.best() > 0 ? `Best ${game.best()} rings. Turn to line yourself up with the gap.` : 'Turn to line yourself up with the gap.'
      panelBtn.textContent = 'Run'
    } else if (screen === 'over') {
      panelTitle.textContent = game.isRecord() ? 'New best' : 'Crashed'
      panelBody.textContent = `${game.rings()} rings · best ${game.best()}`
      panelBtn.textContent = 'Again'
    }
  }

  game.onChange(refresh)
  // The clear flash decays continuously and nothing announces it.
  window.setInterval(refresh, 60)
  refresh()
}
