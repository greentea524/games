// Tower Stacker's HUD (#110, #119), as DOM over the canvas.
//
// It used to be 8px glyphs drawn into a 160x144 2D canvas and composited into
// the same framebuffer as the game, through a shared surface that has since
// been deleted along with the shell it served — and a font that had to be
// preloaded by hand, because canvas text does not trigger a webfont fetch the
// way a DOM node does. On `shared/stage3d.ts` the overlay is real DOM, so
// the text is real text: crisp at any resolution, sized responsively, and
// reachable by a screen reader.
//
// One thing did not survive the move and should not: the star field. It used
// to be painted here and scrolled against the camera height. It is now points
// in the scene, where the camera rising through it *is* the parallax.
import { prefersReducedMotion } from '../shared/motion'
import type { TowerGame } from './game'

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

export function createHud(game: TowerGame, hooks: HudHooks): void {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const sound = el('button', 'ts-btn ts-sound')
  sound.type = 'button'
  sound.onclick = () => {
    hooks.setMuted(!hooks.muted())
    refresh()
  }
  overlay.append(sound)

  const score = el('div', 'ts-score')
  const heightLabel = el('span', 'ts-height')
  const bestLabel = el('span', 'ts-best')
  score.append(heightLabel, bestLabel)
  overlay.append(score)

  const streak = el('p', 'ts-streak')
  overlay.append(streak)

  const perfect = el('p', 'ts-perfect', 'PERFECT!')
  overlay.append(perfect)

  const panel = el('div', 'ts-panel')
  const panelTitle = el('h1', 'ts-panel-title')
  const panelBody = el('p', 'ts-panel-body')
  const panelBtn = el('button', 'ts-btn ts-btn-primary')
  panelBtn.type = 'button'
  panelBtn.onclick = () => game.press()
  panel.append(panelTitle, panelBody, panelBtn)
  overlay.append(panel)

  const hint = el('p', 'ts-hint', 'Tap anywhere to drop the block.')
  overlay.append(hint)

  function refresh() {
    const screen = game.screen()
    const reduced = prefersReducedMotion()
    sound.textContent = hooks.muted() ? '♪ off' : '♪ on'
    sound.setAttribute('aria-pressed', String(hooks.muted()))

    // The height only means anything once a run has started: the title screen
    // builds a decorative tower through the real drop rules, so `height()` is
    // non-zero there and would read as a score nobody had earned.
    score.hidden = screen !== 'run'
    heightLabel.textContent = String(game.height())
    bestLabel.textContent = `best ${game.best()}`

    streak.hidden = screen !== 'run' || game.streak() < 2
    streak.textContent = `×${game.streak()}`

    // Blinks rather than fades. A fade is a value the eye has to track; a
    // blink lands on the frames it is drawn. Under reduced motion it holds
    // steady instead — it reports the one skillful thing in the game, so it
    // gets quieter rather than disappearing.
    const flash = game.perfectFlash()
    perfect.hidden =
      screen !== 'run' || flash <= 0 || !(reduced ? flash > 0.25 : Math.floor(game.clock() * 12) % 2 === 0)

    hint.hidden = screen !== 'run' || game.height() > 0

    panel.hidden = screen === 'run'
    if (screen === 'title') {
      panelTitle.textContent = 'Tower Stacker'
      panelBody.textContent =
        game.best() > 0 ? `Best ${game.best()}. Time the drop; a clean one is worth more.` : 'Time the drop. A clean one is worth more.'
      panelBtn.textContent = 'Start'
    } else if (screen === 'over') {
      panelTitle.textContent = game.isRecord() ? 'New best' : 'Toppled'
      panelBody.textContent = `Height ${game.height()} · best ${game.best()}`
      panelBtn.textContent = 'Again'
    }
  }

  game.onChange(refresh)
  // The perfect flash decays continuously and nothing announces it, so the
  // one thing the change callback cannot cover is polled — cheaply, and only
  // fast enough to catch the blink.
  window.setInterval(refresh, 60)
  refresh()
}
