// The on-screen action and system buttons, as one control set (#100).
//
// All five games turn a DOM button press into a synthetic KeyboardEvent so
// Phaser sees a keypress. They did it two ways: Static and Lantern Keeper had
// a local `setupSysBtn` on pointer events plus a separate `.a-btn` loop, while
// Windup, Pocket Dungeon and Cart & Crate had a `[data-key]` loop on
// touch/mouse events. Each carried its own copy of the legacy keyCode table
// Phaser actually reads.
//
// Both behaved correctly — a tap sends one keydown and one keyup in either,
// and sliding a finger off a button still releases it, because touch events
// are delivered to the element the touch began on. This is not a bug fix.
//
// What it fixes is that there was nowhere to look. Windup's START button was
// wired to nothing at all and shipped that way (#97); it survived because
// "which buttons are wired" was a question you had to answer five times, by
// reading five files. Now the markup declares the key and one function claims
// every button that has one.
//
// Buttons that invoke a *function* rather than a key stay per-game and keep
// their own handlers — Windup's SELECT toggles the palette, Cart & Crate's
// two drive reset and start. Those are behaviour, not duplication.

export interface ButtonOptions {
  /**
   * Sends the synthetic key event. Each game keeps its own dispatcher, for
   * the same reason `shared/dpad.ts` does: they disagree on which legacy
   * properties to define and whether the event is cancelable, and Phaser
   * reads those.
   */
  dispatch: (type: 'keydown' | 'keyup', code: string) => void
  /** Class toggled while held. Defaults to the `active-kb` the shells style. */
  activeClass?: string
  /** Called before each keydown. Pocket Dungeon unlocks its AudioContext here. */
  onPress?: () => void
  /**
   * What counts as a button. The default excludes `.d-btn`, which
   * `setupDpad` owns as a single sliding control rather than four buttons.
   */
  selector?: string
}

/**
 * Wires every `[data-key]` element that is not a d-pad arm.
 *
 * The event set is the union of what the two previous implementations used.
 * Pointer events carry mouse and touch alike, so `mousedown`/`mouseup` are not
 * needed alongside them; `touchend`/`touchcancel` stay as a backstop for the
 * case where a pointer sequence is torn down without its `pointerup`.
 */
export function setupButtons(options: ButtonOptions): void {
  const activeClass = options.activeClass ?? 'active-kb'
  const selector = options.selector ?? '[data-key]:not(.d-btn)'

  document.querySelectorAll<HTMLElement>(selector).forEach((btn) => {
    const code = btn.getAttribute('data-key')
    if (!code) return

    // Guards against a press being counted twice when more than one of the
    // listeners below fires for the same physical press. Phaser treats a
    // second keydown with no keyup between as a fresh press.
    let isDown = false

    const press = (e: Event) => {
      e.preventDefault()
      if (isDown) return
      isDown = true
      btn.classList.add(activeClass)
      options.onPress?.()
      options.dispatch('keydown', code)
    }

    const release = (e: Event) => {
      e.preventDefault()
      if (!isDown) return
      isDown = false
      btn.classList.remove(activeClass)
      options.dispatch('keyup', code)
    }

    btn.addEventListener('pointerdown', press)
    btn.addEventListener('pointerup', release)
    btn.addEventListener('pointercancel', release)
    btn.addEventListener('pointerout', release)
    btn.addEventListener('pointerleave', release)
    // Not passive: these call preventDefault, and a passive listener that does
    // so is ignored with a console warning.
    btn.addEventListener('touchend', release, { passive: false })
    btn.addEventListener('touchcancel', release, { passive: false })
  })
}
