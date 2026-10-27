// The Anomaly Room's HUD (#114, #118), as DOM over the canvas.
import { MISSES, ROUNDS, type AnomalyGame } from './game'
import type { RoomAudio } from './audio'
import { loadAnomalySave, recordRun, type AnomalySave } from './save'

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

/** A sentence's first letter up: the labels are written to sit mid-sentence. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

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
  /** The save as the run that just ended left it, for the end screens. */
  let record: AnomalySave | null = null
  /** Whether that run beat the best that stood before it — not merely tied. */
  let newBest = false

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
    hint.textContent = 'Something is different. Tap it — or look with the arrow keys and press Space when it is in the centre.'

    // Recorded before the panel is written, so an end screen can say how this
    // run compares with the best — including when this run is the best.
    if (phase === 'won' || phase === 'over') {
      if (!recorded) {
        recorded = true
        const before = loadAnomalySave().best
        record = recordRun(game.round(), phase === 'won')
        newBest = game.round() > before
      }
    } else {
      recorded = false
    }

    panel.hidden = phase === 'looking'
    panel.classList.toggle('ar-panel-study', phase === 'study')
    const anomaly = game.anomaly()
    if (phase === 'study') {
      // The run's opening (#148). Without it the first change landed on
      // something the player had never looked at, and round one was a guess.
      // The goal is said here because nothing else said it (#150): the top
      // bar's "Round 1/8" was the only hint that a run ends at all.
      const best = loadAnomalySave().best
      panelTitle.textContent = 'Study the room'
      panelBody.textContent = [
        'Look around and remember what is where. Once you are ready, something will change while you are looking the other way.',
        `Find all ${ROUNDS} changes — ${MISSES} wrong guesses end the run.${best > 0 ? ` Your best: ${best} of ${ROUNDS}.` : ''}`,
      ].join('\n')
      panelBtn.textContent = 'Ready'
      panelBtn.onclick = () => game.ready()
    } else if (phase === 'right' || phase === 'won') {
      panelTitle.textContent = phase === 'won' ? 'Room cleared' : 'Found it'
      const what = anomaly ? `${sentence(anomaly.label)} ${KIND_TEXT[anomaly.kind] ?? 'had changed'}.` : ''
      // The room keeps its changes — putting one back could happen in plain
      // sight — and a player who was not told so read it as a broken reset
      // (#150). So the panel says it.
      panelBody.textContent =
        phase === 'won'
          ? [what, `All ${ROUNDS} found.${record ? ` Rooms cleared: ${record.cleared}.` : ''}`].join('\n')
          : [what, 'It stays that way — the next change will be somewhere else.'].join('\n')
      panelBtn.textContent = phase === 'won' ? 'Again' : 'Next round'
      panelBtn.onclick = phase === 'won' ? () => game.restart() : () => game.next()
    } else if (phase === 'wrong') {
      panelTitle.textContent = 'Not that one'
      panelBody.textContent = left === 1 ? 'One guess left.' : `${left} guesses left.`
      panelBtn.textContent = 'Keep looking'
      panelBtn.onclick = () => game.next()
    } else if (phase === 'over') {
      panelTitle.textContent = 'Out of guesses'
      const found = game.round()
      panelBody.textContent = [
        anomaly ? `It was ${anomaly.label} — it ${KIND_TEXT[anomaly.kind] ?? 'had changed'}.` : '',
        `You found ${found} of ${ROUNDS}.${record ? (newBest ? ' A new best.' : ` Your best: ${record.best}.`) : ''}`,
      ].join('\n')
      panelBtn.textContent = 'Try again'
      panelBtn.onclick = () => game.restart()
    }

  }

  game.onChange(refresh)
  document.addEventListener('pointerlockchange', refresh)
  refresh()
}
