// Tilt Maze's HUD, as DOM (#112, #118).
//
// Real elements rather than pixels drawn into the frame, which is the freedom
// the standalone stage buys: with no fixed-resolution upscale to stay in step
// with, text is crisp at any size, a button is a real button, and a screen
// reader can find both. The GameBoy games have to paint their HUD into the
// render target; this one does not.
import { LEVELS } from './levels'
import type { TiltGame } from './game'

export interface Hud {
  refresh(): void
}

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

export function createHud(game: TiltGame, onNext: () => void): Hud {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const status = el('div', 'tm-status')
  const levelLabel = el('span', 'tm-level')
  const dropLabel = el('span', 'tm-drops')
  const restart = el('button', 'tm-btn', 'Restart')
  restart.type = 'button'
  restart.addEventListener('click', () => game.restart())
  status.append(levelLabel, dropLabel, restart)
  overlay.append(status)

  const hint = el(
    'p',
    'tm-hint',
    'Drag to tilt the board — or use the arrow keys. Bring the marble to rest on the green tile.',
  )
  overlay.append(hint)

  const panel = el('div', 'tm-panel')
  const panelTitle = el('h2', 'tm-panel-title')
  const panelBody = el('p', 'tm-panel-body')
  const panelBtn = el('button', 'tm-btn tm-btn-primary')
  panelBtn.type = 'button'
  panel.append(panelTitle, panelBody, panelBtn)
  overlay.append(panel)

  function refresh() {
    const level = game.level()
    levelLabel.textContent = `${level + 1} / ${LEVELS.length}  ${game.levelName()}`
    const drops = game.drops()
    dropLabel.textContent = drops ? `${drops} drop${drops === 1 ? '' : 's'}` : ''
    // The hint earns its place on the first level and stops earning it after,
    // so it goes rather than lingering as furniture.
    hint.hidden = level > 0

    const phase = game.phase()
    panel.hidden = phase === 'playing'
    if (phase === 'won') {
      panelTitle.textContent = 'Cleared'
      panelBody.textContent = drops
        ? `${LEVELS[level].name} — ${drops} drop${drops === 1 ? '' : 's'}`
        : `${LEVELS[level].name} — clean run`
      panelBtn.textContent = 'Next level'
      panelBtn.onclick = onNext
    } else if (phase === 'complete') {
      panelTitle.textContent = 'All clear'
      panelBody.textContent = `Every one of the ${LEVELS.length} boards, done.`
      panelBtn.textContent = 'Play again'
      panelBtn.onclick = () => game.goTo(0)
    }
  }

  game.onChange(refresh)
  refresh()
  return { refresh }
}
