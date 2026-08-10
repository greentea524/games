// Opt-in handle on the running game, for the QA scripts (#98).
//
// Every game used to assign `window.__game` unconditionally, and Static also
// exposed its `GameState` on `window.__state`. That started as a testing
// affordance and ended up shipping to players.
//
// The handle genuinely is needed: the end-of-run screens sit minutes of play
// from the title, and Lantern Keeper's is behind the entire game — it cannot
// be reached by driving input at all. So removing it outright would mean
// giving up on testing the screens most likely to break.
//
// The gate is a query parameter rather than `import.meta.env.DEV`, which was
// the obvious alternative. DEV would keep `npm run qa:static` working, because
// that starts a dev server — but it would make it impossible to run the suite
// against a production build or the deployed site, which is the artefact
// players actually get. Trading that away to deter someone from editing their
// own single-player save is the wrong side of the deal.
//
// One rule, all builds: no `?qa=1`, no handle. Nothing here is a security
// boundary — it is discoverable by anyone who reads this file — it just keeps
// a debugging tool out of the way of ordinary play.
import type Phaser from 'phaser'

declare global {
  interface Window {
    __game?: Phaser.Game
  }
}

/** The parameter that opts a page in. */
export const QA_PARAM = 'qa'

/** True when this page was opened with the QA flag. */
export function qaRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(QA_PARAM) === '1'
  } catch {
    return false
  }
}

/**
 * Publishes `game` on `window.__game` when `?qa=1` is present, and does
 * nothing otherwise.
 *
 * Call it once, right after the game is constructed.
 */
export function exposeForQA(game: Phaser.Game): void {
  if (!qaRequested()) return
  window.__game = game
}
