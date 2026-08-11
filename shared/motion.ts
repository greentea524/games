// Reduced-motion preference, shared by anything that animates for its own
// sake (#53, and #62/#65 ask for the same).
//
// Three issues so far have carried the caveat "respects reduced-motion if one
// is plumbed through" — and nothing was, so every one of them would have had
// to skip the criterion. This is that plumbing.
//
// The line it draws: this is for *decoration*. Ambient drift, idle pulses,
// flourishes. It must never gate motion the player reads to make a decision —
// a telegraphed hazard, a moving platform, the toy itself. Someone who asks
// for less motion is asking not to be distracted, not to be denied the
// information the game runs on.

/**
 * True when the viewer has asked for reduced motion.
 *
 * Read at the point of use rather than cached: the preference can change
 * mid-session, and these games run for a long time on one page load.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // Older browsers, or a non-DOM context in a test. Assume no preference —
    // failing closed here would silently strip animation for everyone.
    return false
  }
}
