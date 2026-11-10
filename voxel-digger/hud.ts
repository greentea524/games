// Voxel Digger's HUD (#115, #118), as DOM over the canvas.
//
// The four candidates are on screen the whole time, each with a picture of
// what it looks like from the side the block is being viewed from (#152) —
// a name alone gave a player nothing to compare the find with. Which of them
// are still *possible* deliberately is not shown. The game knows — `dig.ts` can work it
// out exactly — and showing it would play the game for you: the round would
// end the moment the count reached one, and the decision the score is about
// ("have I seen enough?") would be gone.
import { SHAPES, type VoxelGame } from './game'
import { SHAPE_SIZE, type Shape } from './block'
import { shapePolygons, type Face, type Facing } from './preview'
import { loadDiggerSave, recordFind } from './save'

/** A picture's edge in CSS pixels, and the cube edges it has to hold. */
const PICTURE = 72
const PICTURE_SPAN = 2 * SHAPE_SIZE + 0.6

const FACE_FILL: Record<Face, string> = { cap: '#f6c666', left: '#d48f2a', right: '#96601a' }

/** Draws a candidate into its button's canvas, as seen from `facing`. */
function drawPicture(canvas: HTMLCanvasElement, shape: Shape, facing: Facing) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = canvas.height = Math.round(PICTURE * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const scale = canvas.width / PICTURE_SPAN
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // The picture spans the shape's size either side of centre across, and from
  // that far up to that far down — or twice that up, seen from below.
  const midY = facing.below ? -SHAPE_SIZE : 0
  ctx.lineWidth = Math.max(0.5, ratio * 0.35)
  ctx.strokeStyle = 'rgba(40, 24, 4, 0.32)'
  ctx.lineJoin = 'round'
  for (const poly of shapePolygons(shape, facing)) {
    ctx.beginPath()
    poly.points.forEach(([x, y], i) => {
      const px = canvas.width / 2 + x * scale
      const py = canvas.height / 2 + (y - midY) * scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.fillStyle = FACE_FILL[poly.face]
    ctx.fill()
    ctx.stroke()
  }
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
  const pictures: { canvas: HTMLCanvasElement; shape: Shape }[] = []
  for (const shape of SHAPES) {
    const button = el('button', 'vd-btn vd-guess')
    const canvas = el('canvas', 'vd-picture')
    canvas.setAttribute('aria-hidden', 'true')
    button.append(canvas, el('span', 'vd-guess-name', shape.name))
    pictures.push({ canvas, shape })
    button.type = 'button'
    button.onclick = () => {
      const right = game.guess(shape.id)
      if (right) recordFind(game.digs())
      refresh()
    }
    row.append(button)
  }
  // In the same column as the guesses, above them, so it can never land on
  // top of them however the row wraps.
  const hint = el(
    'p',
    'vd-hint',
    'Tap the block to drill into it — the drill stops at what is buried. Drag, or use the arrow keys, to turn it.',
  )
  guesses.append(hint, guessLabel, row)
  overlay.append(guesses)

  const panel = el('div', 'vd-panel')
  const panelTitle = el('h2', 'vd-panel-title')
  const panelBody = el('p', 'vd-panel-body')
  const panelBtn = el('button', 'vd-btn vd-btn-primary', 'Dig another')
  panelBtn.type = 'button'
  panelBtn.onclick = () => game.restart()
  panel.append(panelTitle, panelBody, panelBtn)
  overlay.append(panel)

  let drawnFor = ''

  function refresh() {
    const digs = game.digs()
    const phase = game.phase()
    // No limit (#152): the score is the count, and a cap on top of it only
    // ever ended a round before the find had been seen.
    const best = loadDiggerSave().best
    digLabel.textContent = `${digs === 1 ? '1 dig' : `${digs} digs`}${best > 0 ? ` · best ${best}` : ''}`

    const facing = game.facing()
    const key = `${facing.quarter}${facing.below}`
    if (key !== drawnFor) {
      drawnFor = key
      for (const { canvas, shape } of pictures) drawPicture(canvas, shape, facing)
    }
    const exposed = game.exposed()
    exposedLabel.textContent = exposed === 1 ? '1 cube showing' : `${exposed} cubes showing`
    undo.disabled = digs === 0 || phase !== 'digging'
    hint.hidden = digs > 0

    guessLabel.textContent = 'What is it? Fewer digs is a better score.'
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
