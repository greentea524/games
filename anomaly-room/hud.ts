// The Anomaly Room's HUD (#114, #118), as DOM over the canvas.
import { MISSES, ROUNDS, type AnomalyGame } from './game'
import type { RoomAudio } from './audio'
import { recordRun } from './save'

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

/** What a round did, in the words a player would use about it. */
const KIND_TEXT: Record<string, string> = {
  move: 'had moved',
  scale: 'had changed size',
  turn: 'had turned',
  vanish: 'was gone',
  twin: 'had a second one',
}

export interface HudHooks {
  /** Asks the page for pointer lock. Desktop only in practice. */
  mouseLook(): void
  locked(): boolean
}

export function createHud(game: AnomalyGame, audio: RoomAudio, hooks: HudHooks): void {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const status = el('div', 'ar-status')
  const roundLabel = el('span', 'ar-round')
  const lives = el('span', 'ar-lives')
  status.append(roundLabel, lives)
  overlay.append(status)

  // Pointer lock behind a button rather than behind a double click on the
  // canvas. A double click on the canvas is also two flags — two guesses spent
  // — so the gesture that turns mouse look on cannot be a gesture that also
  // plays the game. The button is hidden where there is no fine pointer,
  // because a phone has nothing to lock.
  const lookBtn = el('button', 'ar-btn ar-look', 'Mouse look')
  lookBtn.type = 'button'
  lookBtn.hidden = !window.matchMedia('(pointer: fine)').matches
  lookBtn.onclick = () => hooks.mouseLook()
  overlay.append(lookBtn)

  const sound = el('button', 'ar-btn ar-sound')
  sound.type = 'button'
  sound.onclick = () => {
    audio.setMuted(!audio.muted())
    refresh()
  }
  overlay.append(sound)

  // A faint centre mark, not a targeting reticle. Flagging goes through the
  // tap point, so this is only there to give the eye something to steady on
  // while turning — and for the keyboard path, where the centre *is* the aim.
  overlay.append(el('div', 'ar-centre'))

  const hint = el('p', 'ar-hint')
  overlay.append(hint)

  const panel = el('div', 'ar-panel')
  const panelTitle = el('h2', 'ar-panel-title')
  const panelBody = el('p', 'ar-panel-body')
  const panelBtn = el('button', 'ar-btn ar-btn-primary')
  panelBtn.type = 'button'
  panel.append(panelTitle, panelBody, panelBtn)
  overlay.append(panel)

  let recorded = false

  function refresh() {
    const phase = game.phase()
    roundLabel.textContent = `Round ${Math.min(game.round() + 1, ROUNDS)}/${ROUNDS}`
    const left = MISSES - game.misses()
    lives.textContent = left === 1 ? '1 guess left' : `${left} guesses left`
    sound.textContent = audio.muted() ? '♪ off' : '♪ on'
    sound.setAttribute('aria-pressed', String(audio.muted()))
    lookBtn.textContent = hooks.locked() ? 'Esc to release' : 'Mouse look'

    // Only while the room is unchanged. Saying "something has changed" before
    // anything has would be a lie the player could act on.
    hint.hidden = phase !== 'looking' || !game.armed()
    hint.textContent = 'Something is different. Tap it.'

    panel.hidden = phase === 'looking'
    const anomaly = game.anomaly()
    if (phase === 'right' || phase === 'won') {
      panelTitle.textContent = phase === 'won' ? 'Room cleared' : 'Found it'
      panelBody.textContent = anomaly
        ? `${anomaly.label} ${KIND_TEXT[anomaly.kind] ?? 'had changed'}.`
        : ''
      panelBtn.textContent = phase === 'won' ? 'Again' : 'Next round'
      panelBtn.onclick = phase === 'won' ? () => game.restart() : () => game.next()
    } else if (phase === 'wrong') {
      panelTitle.textContent = 'Not that one'
      panelBody.textContent = left === 1 ? 'One guess left.' : `${left} guesses left.`
      panelBtn.textContent = 'Keep looking'
      panelBtn.onclick = () => game.next()
    } else if (phase === 'over') {
      panelTitle.textContent = 'Out of guesses'
      panelBody.textContent = anomaly
        ? `It was ${anomaly.label} — it ${KIND_TEXT[anomaly.kind] ?? 'had changed'}.`
        : ''
      panelBtn.textContent = 'Try again'
      panelBtn.onclick = () => game.restart()
    }

    if (phase === 'won' || phase === 'over') {
      if (!recorded) {
        recorded = true
        recordRun(game.round(), phase === 'won')
      }
    } else {
      recorded = false
    }
  }

  game.onChange(refresh)
  document.addEventListener('pointerlockchange', refresh)
  refresh()
}
