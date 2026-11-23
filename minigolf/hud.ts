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

/**
 * How to play, as headed sections: what the game asks, how to putt by touch
 * and by keyboard, the rules, and the names a score is given. The one-line
 * hint on the first hole was the only instruction the game had.
 */
export const HOW_TO_PLAY: { heading: string; lines: string[] }[] = [
  {
    heading: 'The aim',
    lines: [`Sink the ball in the cup in as few strokes as you can. Each of the ${COURSE.length} holes has a par: the strokes a good player takes.`],
  },
  {
    heading: 'By touch or mouse',
    lines: [
      'Press on the course and drag back, away from where the ball should go, like a slingshot.',
      'Pull further for more power; the line from the ball turns red near full. Let go to putt, or let go without pulling to cancel.',
    ],
  },
  {
    heading: 'By keyboard',
    lines: ['← → or A D aim. Hold Space and let go when the power is right. V shows the whole hole; H opens this.'],
  },
  {
    heading: 'Rules',
    lines: ['Putt again once the ball has stopped. Off the course costs a stroke and a return to the tee.'],
  },
  {
    heading: 'Scoring',
    lines: ['One under par is a birdie, two an eagle; one over is a bogey. Your best round is kept.'],
  },
]

export interface Hud {
  /** Whether the how-to-play panel is open, so the keyboard does not putt behind it. */
  helpOpen(): boolean
}

export function createHud(game: MinigolfGame): Hud {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const status = el('div', 'mg-status')
  const holeLabel = el('span', 'mg-hole')
  const strokeLabel = el('span', 'mg-strokes')
  const viewBtn = el('button', 'mg-view-btn', 'Overview')
  viewBtn.type = 'button'
  viewBtn.title = 'Toggle course overview (V)'
  viewBtn.onclick = () => game.toggleView()
  status.append(holeLabel, strokeLabel, viewBtn)
  overlay.append(status)

  // How to play: a button under the way back, and a panel over the course.
  // The panel takes pointer events, so a drag on it is not a putt beneath.
  const helpBtn = el('button', 'mg-help-btn', 'How to play')
  helpBtn.type = 'button'
  helpBtn.title = 'How to play (H)'
  overlay.append(helpBtn)

  const help = el('div', 'mg-help')
  help.dataset.interactive = ''
  help.setAttribute('role', 'dialog')
  help.setAttribute('aria-modal', 'true')
  help.setAttribute('aria-labelledby', 'mg-help-title')
  const helpCard = el('div', 'mg-help-card')
  const helpTitle = el('h2', 'mg-help-title', 'How to play')
  helpTitle.id = 'mg-help-title'
  helpCard.append(helpTitle)
  for (const section of HOW_TO_PLAY) {
    helpCard.append(el('h3', 'mg-help-heading', section.heading))
    for (const line of section.lines) helpCard.append(el('p', 'mg-help-line', line))
  }
  const helpClose = el('button', 'mg-btn mg-btn-primary mg-help-close', 'Got it')
  helpClose.type = 'button'
  helpCard.append(helpClose)
  help.append(helpCard)
  help.hidden = true

  let helpShown = false
  const setHelp = (open: boolean) => {
    helpShown = open
    help.hidden = !open
    helpBtn.setAttribute('aria-expanded', String(open))
    if (open) {
      game.cancelAim()
      helpClose.focus()
    } else {
      // Focus is let go, not handed back to the button: Space is the putt,
      // and on a focused button it would press it and open this again.
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
  }
  helpBtn.onclick = () => setHelp(!helpShown)
  helpClose.onclick = () => setHelp(false)
  // A click on the dimmed course round the card closes it too.
  help.addEventListener('pointerdown', (e) => {
    if (e.target === help) setHelp(false)
  })
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') {
      setHelp(!helpShown)
      e.preventDefault()
    } else if (e.code === 'Escape' && helpShown) {
      setHelp(false)
      e.preventDefault()
    }
  })

  const hint = el(
    'p',
    'mg-hint',
    'Drag back from the ball like a slingshot and let go to putt — or aim with the arrow keys and hold Space for power. H for how to play.',
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
  // Last, so it lies over the hint, the waiting line and the hole's panel.
  overlay.append(help)

  function refresh() {
    const holeNo = game.hole()
    const par = game.par()
    holeLabel.textContent = `Hole ${holeNo + 1}/${COURSE.length} · ${game.holeName()} · Par ${par}`
    const strokes = game.strokes()
    strokeLabel.textContent = strokes === 1 ? '1 stroke' : `${strokes} strokes`
    const isOverview = game.viewMode() === 'overview'
    viewBtn.textContent = isOverview ? 'Ball view' : 'Overview'
    viewBtn.setAttribute('aria-pressed', String(isOverview))
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

  return { helpOpen: () => helpShown }
}
