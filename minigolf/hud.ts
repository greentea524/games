// Minigolf's HUD and scorecard, as DOM (#113, #118).
import { COURSE } from './physics'
import type { MinigolfGame } from './game'

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

/** Golf's own vocabulary for a score, which is most of the reward. */
function scoreName(strokes: number, par: number): string {
  const diff = strokes - par
  if (strokes === 1) return 'Hole in one'
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0) return 'Par'
  if (diff === 1) return 'Bogey'
  return `${diff} over`
}

export function createHud(game: MinigolfGame): void {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const status = el('div', 'mg-status')
  const holeLabel = el('span', 'mg-hole')
  const strokeLabel = el('span', 'mg-strokes')
  status.append(holeLabel, strokeLabel)
  overlay.append(status)

  const hint = el(
    'p',
    'mg-hint',
    'Drag back from the ball to aim and set power, like a slingshot. Release to putt.',
  )
  overlay.append(hint)

  // Shown while the ball is still moving, because the commonest confusion in a
  // putting game is pulling back and nothing happening. Saying why is cheaper
  // than a player concluding the controls are broken.
  const waiting = el('p', 'mg-waiting', 'Waiting for the ball to stop…')
  overlay.append(waiting)

  const panel = el('div', 'mg-panel')
  const panelTitle = el('h2', 'mg-panel-title')
  const panelBody = el('p', 'mg-panel-body')
  const cardList = el('ul', 'mg-card')
  const panelBtn = el('button', 'mg-btn mg-btn-primary')
  panelBtn.type = 'button'
  panel.append(panelTitle, panelBody, cardList, panelBtn)
  overlay.append(panel)

  function refresh() {
    const holeNo = game.hole()
    const par = game.par()
    holeLabel.textContent = `Hole ${holeNo + 1}/${COURSE.length} · ${game.holeName()} · Par ${par}`
    const strokes = game.strokes()
    strokeLabel.textContent = strokes === 1 ? '1 stroke' : `${strokes} strokes`
    hint.hidden = holeNo > 0 || strokes > 0

    const phase = game.phase()
    // "Rolling" is not the same as "cannot putt": the ball can come to rest
    // and the phase flip to aiming on the same frame, so the prompt follows
    // the gate the stroke actually uses.
    waiting.hidden = phase !== 'rolling' || game.canPutt()

    panel.hidden = phase !== 'holed' && phase !== 'card'
    cardList.replaceChildren()

    if (phase === 'holed') {
      panelTitle.textContent = scoreName(strokes, par)
      panelBody.textContent = `${game.holeName()} in ${strokes} — par ${par}`
      panelBtn.textContent = holeNo >= COURSE.length - 1 ? 'See the card' : 'Next hole'
      panelBtn.onclick = () => game.nextHole()
    } else if (phase === 'card') {
      const card = game.card()
      const total = card.reduce((a, b) => a + b, 0)
      const parTotal = COURSE.reduce((a, h) => a + h.par, 0)
      panelTitle.textContent = 'Scorecard'
      const diff = total - parTotal
      panelBody.textContent =
        diff === 0 ? `${total} — level par` : `${total} — ${diff > 0 ? `${diff} over` : `${-diff} under`} par`
      COURSE.forEach((h, i) => {
        const row = el('li', 'mg-card-row')
        row.append(
          el('span', 'mg-card-hole', h.name),
          el('span', 'mg-card-par', `par ${h.par}`),
          el('span', 'mg-card-score', String(card[i] ?? '—')),
        )
        cardList.append(row)
      })
      panelBtn.textContent = 'Play again'
      panelBtn.onclick = () => game.restartCourse()
    }
  }

  game.onChange(refresh)
  // The waiting prompt depends on the at-rest detector, which changes without
  // any event — so it is polled rather than driven, at a rate that is cheap
  // and still feels immediate.
  window.setInterval(refresh, 100)
  refresh()
}
