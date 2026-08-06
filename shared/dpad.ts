// Sliding d-pad: one finger, all four directions.
//
// The five games each wired their own listeners onto the individual arm
// elements (`.d-btn`). That works for a tap, but not for the way people
// actually hold a d-pad — press left, then roll the thumb up to go up. Touch
// pointers get *implicitly captured* by the element they start on, so once a
// finger lands on the left arm every later `pointermove` is delivered to that
// arm no matter where the finger is. `pointerout`/`pointerleave` never fire.
// The result was that Left stayed held and Up never triggered until the finger
// was lifted and put down again.
//
// The fix is to stop treating the arms as four separate buttons and treat the
// pad as one control: capture the pointer on the container and derive the
// direction from where the finger is, re-evaluating on every move.
//
// Two things fall out of that for free:
//
//   - The corners stop being dead. They have no element behind them (the pad
//     is a 3x3 grid with only the four edge-centre cells populated), so a
//     thumb crossing a corner used to hit nothing. Direction is now taken from
//     the dominant axis, which covers the whole square.
//
//   - Drifting slightly off the edge no longer drops the input. A thumb
//     pivoting at its base does not stay inside a 150px box.
//
// Diagonals are deliberately *not* emitted. All five games read the arrows as
// four-way input, and a pad that could report Up+Right would change movement
// behaviour rather than just input handling.

/** The four arrow codes, matching the `data-key` attributes in the markup. */
export type DpadDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

export interface DpadOptions {
  /**
   * Sends the synthetic key event. Each game keeps its own dispatcher because
   * they disagree on the details (which legacy `keyCode`/`which` properties to
   * define, whether the event is cancelable), and Phaser reads those.
   */
  dispatch: (type: 'keydown' | 'keyup', code: DpadDirection) => void
  /**
   * Called once per press, before the first `keydown`. Games use this to
   * unlock the AudioContext, which browsers only allow from a user gesture.
   */
  onPress?: () => void
  /** Class toggled on the active arm. `:active` cannot be used — see below. */
  activeClass?: string
}

/**
 * Half-width of the neutral centre, as a fraction of the pad's half-size.
 *
 * The arms are thirds of the pad, so the centre cell spans one sixth of the
 * full width either side of the middle — one third of the half-size. Matching
 * it exactly means the neutral zone is the square that is actually drawn as
 * neutral, rather than an invisible region of its own.
 */
const DEAD_ZONE = 1 / 3

/**
 * How far outside the pad a finger may drift before the direction is dropped,
 * as a fraction of the pad's size.
 *
 * Zero would be unusable: a thumb rolling to the top arm often ends up past
 * the top edge while still plainly meaning "up". Too large and the pad would
 * swallow presses meant for A/B, which sit immediately to its right.
 */
const EDGE_SLOP = 0.35

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Maps a client-space point to a direction, or null for neutral.
 *
 * Exported for the direction tests, which would otherwise need a DOM.
 */
export function directionAt(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): DpadDirection | null {
  const slopX = rect.width * EDGE_SLOP
  const slopY = rect.height * EDGE_SLOP
  if (
    x < rect.left - slopX ||
    x > rect.left + rect.width + slopX ||
    y < rect.top - slopY ||
    y > rect.top + rect.height + slopY
  ) {
    return null
  }

  // Normalised to [-1, 1] across the pad. Clamping rather than rejecting is
  // what makes the slop margin behave like the nearest edge instead of like a
  // separate, differently-shaped zone.
  const nx = clamp((x - (rect.left + rect.width / 2)) / (rect.width / 2), -1, 1)
  const ny = clamp((y - (rect.top + rect.height / 2)) / (rect.height / 2), -1, 1)

  if (Math.abs(nx) < DEAD_ZONE && Math.abs(ny) < DEAD_ZONE) return null

  // Dominant axis. A corner is an exact tie; picking the vertical arm there is
  // arbitrary but has to be consistent, or a thumb resting on the diagonal
  // would chatter between two directions.
  return Math.abs(nx) > Math.abs(ny)
    ? nx > 0
      ? 'ArrowRight'
      : 'ArrowLeft'
    : ny > 0
      ? 'ArrowDown'
      : 'ArrowUp'
}

/**
 * Takes over `.d-pad` as a single sliding control.
 *
 * The caller must stop attaching its own per-button listeners to `.d-btn`
 * elements; two systems tracking the same arm would emit paired keydowns and
 * the game would see the direction as held after release.
 */
export function setupDpad(options: DpadOptions): void {
  const pad = document.querySelector<HTMLElement>('.d-pad')
  if (!pad) return

  const activeClass = options.activeClass ?? 'active-touch'
  const arms = new Map<DpadDirection, HTMLElement>()
  pad.querySelectorAll<HTMLElement>('.d-btn[data-key]').forEach((el) => {
    const key = el.getAttribute('data-key') as DpadDirection | null
    if (key) arms.set(key, el)
  })

  // Only the first pointer to land on the pad drives it. A second finger on
  // the pad while the first is still down would otherwise fight it for the
  // held direction. Fingers on A/B are unaffected: those are separate
  // elements with their own pointer ids.
  let activePointer: number | null = null
  let held: DpadDirection | null = null

  const setHeld = (next: DpadDirection | null) => {
    if (next === held) return
    if (held) {
      options.dispatch('keyup', held)
      arms.get(held)?.classList.remove(activeClass)
    }
    held = next
    if (held) {
      options.dispatch('keydown', held)
      // `:active` only styles the element the pointer is captured to, which is
      // now always the pad itself, so the arms need an explicit class.
      arms.get(held)?.classList.add(activeClass)
    }
  }

  const update = (e: PointerEvent) => {
    setHeld(directionAt(e.clientX, e.clientY, pad.getBoundingClientRect()))
  }

  pad.addEventListener('pointerdown', (e) => {
    if (activePointer !== null) return
    e.preventDefault()
    activePointer = e.pointerId
    // Redirect capture from whichever arm the browser implicitly grabbed to
    // the pad, so moves keep arriving here after the finger leaves that arm.
    try {
      pad.setPointerCapture(e.pointerId)
    } catch {
      // Safari has thrown here for pointers that ended in the same frame.
      // Losing capture degrades to tap-only, which is what we had before.
    }
    options.onPress?.()
    update(e)
  })

  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return
    e.preventDefault()
    update(e)
  })

  const end = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return
    activePointer = null
    setHeld(null)
  }
  pad.addEventListener('pointerup', end)
  pad.addEventListener('pointercancel', end)

  // A pointer can be lost without either of the above — a system gesture, or
  // the element being re-laid out mid-drag. Without this the direction would
  // stay held forever.
  pad.addEventListener('lostpointercapture', end)
}
