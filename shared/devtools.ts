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
// The handle is typed `unknown` rather than `Phaser.Game` (#109). A three.js
// game is a second renderer under the same shell and has no `Phaser.Game` to
// publish, so a Phaser-shaped signature would have left it assigning
// `window.__game` by hand — and the whole point of the `?qa=1` gate is that
// there is exactly one path onto that property. Nothing in TypeScript reads
// the handle back; the QA suites reach it from `page.evaluate`, which is
// untyped, so a narrower type here bought nothing and cost the seam.
declare global {
  interface Window {
    __game?: unknown
    __sound?: SoundHandle
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
 * Call it once, right after the game is constructed. `game` is whatever a
 * suite needs a handle on — a `Phaser.Game` for the five Phaser games, the
 * game object for a three.js one.
 */
export function exposeForQA<T>(game: T): T {
  if (!qaRequested()) return game
  window.__game = game
  return game
}

/** What `exposeSoundForQA` publishes. */
export interface SoundHandle {
  /** The game's own mute state. */
  muted(): boolean
  /** Plays one of the game's sound effects, through its own audio module. */
  effect(): void
  /**
   * Stops the game's music, so an effect can be heard on its own (#144). A
   * listen that includes music cannot tell a silent effect from a working one,
   * which is how Cart & Crate's effects went unheard for the life of the game.
   */
  silence(): void
}

/**
 * Publishes a game's mute state, and a way to make it play an effect, when
 * `?qa=1` is present (#142).
 *
 * The Phaser five publish a `Phaser.Game` as `window.__game`, which knows
 * nothing about sound — every one of them synthesises through its own
 * `audio.ts` and keeps `muted` in a module variable. Four of the five show that
 * state nowhere on screen either, so without this the sound check could only
 * tell "the mute changed" by the silence, and could not tell a toggle that
 * fired twice from one that never fired.
 *
 * A read-only getter, the same trade #138 made for Tower Stacker's `shake()`:
 * it states what the control did, and the analyser still has to agree that
 * the sound actually stopped.
 *
 * `effect` is here rather than reached by `import()` from the page, which was
 * tried first and measured the wrong thing. Vite tags a module edited during a
 * dev server's life with `?t=`, so the game imports `audio.ts?t=...` and a
 * bare `import('/games/x/audio.ts')` gets a second, fresh copy — its own
 * context, its own master gain, its own `muted`. Whatever that copy plays, or
 * fails to, says nothing about the game. Handed over by the game itself, it is
 * the instance the player hears.
 */
export function exposeSoundForQA(sound: SoundHandle): void {
  if (!qaRequested()) return
  window.__sound = sound
}
