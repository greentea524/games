# Touch QA

Plays the games on a phone-shaped viewport with real multi-touch, to cover the
on-screen controls that a keyboard run never exercises (#97).

```
npm run qa:touch
```

That starts a dev server, runs both suites, and shuts it down. To reuse a
server you already have running, point `QA_URL` at the games *base* URL:

```
npm run dev                                   # terminal 1
QA_URL=http://localhost:5173/games/ npm run qa:touch
```

Both suites exit non-zero on failure and treat any page or console error as
one.

## What they check

**`static.mjs`** — the d-pad turning rather than walking, A opening and
advancing dialogue, **picking a dialogue choice by tapping the option on the
canvas**, SELECT opening the inventory, B closing it, and START opening the
pause overlay. The canvas tap is the only place in any of the five games where
the canvas itself is a touch target, so it is the one most likely to rot
unnoticed.

**`platformers.mjs`** — the two-handed cases, which are the whole point of a
multi-touch driver:

- a direction held while a second finger taps jump, and the direction still
  held after that finger lifts
- a thumb rolled from one arm to another without lifting (`setupDpad`'s reason
  for existing)
- Lantern Keeper's dash on B with a direction held
- Lantern Keeper's wall cling, which reads `cursors.left.isDown` every frame
  while the body is against a wall — a d-pad that dropped the key when a
  second contact landed would disable it under touch *only*

It also covers Windup's START, which was wired to nothing at all until this
suite tried to press it.

**`grid.mjs`** — the two grid movers, neither of which is driven by the d-pad
alone:

- Cart & Crate's swipe, in all four directions, plus a tap under the 15px
  threshold that must *not* move anything
- Cart & Crate's level clear: win level 1 (its solution is `RRRR`), then
  dismiss the run summary by tap and assert it advanced **exactly one** level.
  This is #66's regression, and only touch can produce it — the panel
  dismisses on `pointerdown`, and the matching `pointerup` used to run the
  advance-on-any-input path on top of the fade, clearing two levels from one
  press. A keyboard never sees it, because Z produces no `pointerup`. Verified
  by reintroducing the bug: the check fails, reporting a level 3 board.
- Pocket Dungeon's d-pad, and its tap-an-adjacent-tile-to-move — which it
  genuinely has, unlike Static
- Pocket Dungeon's game-over panel dismissing on a canvas tap

The hover-dependent prompt strings are checked where a summary is already
open: `shared/runSummary.ts` picks "Tap to continue" over "Z: continue" off
`(hover: hover) and (pointer: fine)`, and Static's interact prompt is labelled
`A` rather than `Z`. Static's is the only one drawn into the game rather than
the DOM.

## Notes for anyone extending this

- **Use CDP, not Playwright's touch helpers.** `page.touchscreen.tap` is one
  contact and cannot drag, and PointerEvents from `evaluate()` are untrusted
  so `setPointerCapture` rejects them — which is exactly the mechanism
  `shared/dpad.ts` is built on.
- **`touchEnd` carries the contacts being *released*,** not the ones that
  remain. Sending the remainder lifts the wrong finger, and the symptom is
  indistinguishable from the game dropping a held direction.
- **Sample during a burst, not after it.** Lantern Keeper's dash lasts 100ms.
  Tapping B, waiting for the tap to finish and then reading velocity sees the
  ordinary run speed and looks like the dash never fired.
- **Make "nothing happened" fail.** The first wall-cling check asserted the
  fall speed was capped, and passed against a player standing on the ground at
  vy 0. It now requires samples taken while genuinely airborne *and* against
  the wall.
- **Hold buttons, don't press them.** Phaser polls `Key.isDown` once a frame,
  so a zero-length press falls between two frames. `hand.tap` holds for 120ms.
- **Don't press A to check a screen you just dismissed.** Dismissing Pocket
  Dungeon's game over returns to the title, where A immediately confirms START
  RUN — so the assertion saw a dungeon and reported the panel had not
  dismissed.
- **Prove a check can fail.** Two of these passed for the wrong reason on
  first write. Where a defect is known — the #66 double-advance — put it back
  temporarily and watch the check go red before trusting it.

## Requirements

Same as `static/qa`: `playwright-core` ships no browsers, so the driver looks
for a Chromium at `QA_BROWSER`, then a few standard paths, then falls back to
an installed Chrome.
