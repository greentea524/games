// Voxel Digger's HUD (#115, #118), as DOM over the canvas.
//
// The four candidates are on screen the whole time, and which of them are
// still *possible* deliberately is not. The game knows — `dig.ts` can work it
// out exactly — and showing it would play the game for you: the round would
// end the moment the count reached one, and the decision the score is about
// ("have I seen enough?") would be gone.
import { DIG_BUDGET, SHAPES, type VoxelGame } from './game'
import { recordFind } from './save'

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

export function createHud(game: VoxelGame): void {
  const overlay = game.stage.overlay

  const back = el('a', 'stage3d-back', '← Games')
  back.href = `${import.meta.env.BASE_URL}`
  overlay.append(back)

  const status = el('div', 'vd-status')
  const digLabel = el('span', 'vd-digs')
  const exposedLabel = el('span', 'vd-exposed')
  status.append(digLabel, exposedLabel)
  overlay.append(status)

  const undo = el('button', 'vd-btn vd-undo', 'Undo')
  undo.type = 'button'
  undo.onclick = () => game.undo()
  overlay.append(undo)

  const guesses = el('div', 'vd-guesses')
  const guessLabel = el('p', 'vd-guess-label', 'What is it?')
  const row = el('div', 'vd-guess-row')
  for (const shape of SHAPES) {
    const button = el('button', 'vd-btn vd-guess', shape.name)
    button.type = 'button'
    button.onclick = () => {
      const right = game.guess(shape.id)
      if (right) recordFind(game.digs())
      refresh()
    }
    row.append(button)
  }
  guesses.append(guessLabel, row)
  overlay.append(guesses)

  const hint = el(
    'p',
    'vd-hint',
    'Drag to turn the block. Tap a cube to dig it out.',
  )
  overlay.append(hint)

  const panel = el('div', 'vd-panel')
  const panelTitle = el('h2', 'vd-panel-title')
  const panelBody = el('p', 'vd-panel-body')
  const panelBtn = el('button', 'vd-btn vd-btn-primary', 'Dig another')
  panelBtn.type = 'button'
  panelBtn.onclick = () => game.restart()
  panel.append(panelTitle, panelBody, panelBtn)
  overlay.append(panel)

  function refresh() {
    const digs = game.digs()
    const phase = game.phase()
    digLabel.textContent = `${digs}/${DIG_BUDGET} digs`
    const exposed = game.exposed()
    exposedLabel.textContent = exposed === 1 ? '1 cube showing' : `${exposed} cubes showing`
    undo.disabled = digs === 0 || phase !== 'digging'
    hint.hidden = digs > 0

    // Out of digs is not the end of the round — you still have to name it. The
    // budget bounds how much you can learn, not how long you have.
    guessLabel.textContent =
      digs >= DIG_BUDGET ? 'Out of digs. What is it?' : 'What is it?'
    guesses.hidden = phase !== 'digging'

    panel.hidden = phase === 'digging'
    const answer = game.answer()
    if (phase === 'right') {
      panelTitle.textContent = `It was the ${answer?.name.toLowerCase()}`
      panelBody.textContent = digs === 1 ? 'Named in one dig.' : `Named in ${digs} digs.`
    } else if (phase === 'wrong') {
      panelTitle.textContent = 'Not quite'
      panelBody.textContent = `It was the ${answer?.name.toLowerCase()}, after ${digs} digs.`
    }
  }

  game.onChange(refresh)
  refresh()
}
