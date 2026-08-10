// Stops the browser's zoom gestures from firing over the game shell.
//
// The shells already ask for this declaratively — every index.html carries
// `user-scalable=no, maximum-scale=1.0` and sets `touch-action: none` on
// html/body — and on Android Chrome that is enough. iOS Safari ignores
// `user-scalable` entirely (it has since iOS 10, deliberately, so that pages
// cannot trap a reader who needs to zoom), and its double-tap-to-zoom fires
// before the touch-action on the hit element is consulted.
//
// What that looks like in a game: a double tap in the dead space around the
// d-pad zooms the shell in, and because the page is `overflow: hidden` with no
// scrollable area, there is nothing to double-tap on to zoom back out. The
// player is stuck at 2x with half the controls off-screen and no way back but
// a reload.
//
// Static and Lantern Keeper each grew their own copy of this. Windup, Pocket
// Dungeon and Cart & Crate never got one, which is exactly the set of games
// the bug was reported in.
//
// The `touchend` guard is the part that does the real work. Cancelling
// `dblclick` is not enough on its own: Safari decides to zoom off the raw
// touch sequence, well before it would synthesise a dblclick, so by the time
// that event exists the zoom has already happened.

let installed = false

/**
 * Cancels double-tap and pinch zoom for the whole document.
 *
 * Call once, at startup. Repeat calls are ignored, so a game that also has an
 * older inline copy will not end up with two sets of listeners.
 */
export function preventZoomGestures(): void {
  if (installed) return
  installed = true

  // Belt and braces — this alone does not stop Safari, but it does stop the
  // synthesised click that would otherwise reach a button underneath.
  document.addEventListener(
    'dblclick',
    (event) => {
      event.preventDefault()
    },
    { passive: false },
  )

  // Pinch. A second finger is never meaningful to any of these games: the
  // d-pad claims only the first pointer to land on it, and the action buttons
  // are separate elements with their own.
  document.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length > 1) event.preventDefault()
    },
    { passive: false },
  )

  // Double tap. Cancelling the second `touchend` inside the double-tap window
  // is what actually suppresses the zoom.
  //
  // This does not cost the games anything: cancelling `touchend` suppresses
  // the *compatibility mouse events* (mousedown/mouseup/click), not touch or
  // pointer events. Every control here is driven from touchstart/pointerdown,
  // and Phaser reads the touch stream directly, so a fast double tap still
  // registers as two presses.
  let lastTouchEnd = 0
  document.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) event.preventDefault()
      lastTouchEnd = now
    },
    { passive: false },
  )
}
