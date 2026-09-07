# Touch QA

Plays the games on a phone-shaped viewport with real multi-touch, to cover the
on-screen controls that a keyboard run never exercises (#97).

```
npm run qa:touch
```

That starts a dev server, runs every suite, and shuts it down. To reuse a
server you already have running, point `QA_URL` at the games *base* URL:

```
npm run dev                                   # terminal 1
QA_URL=http://localhost:5173/games/ npm run qa:touch
```

The suites exit non-zero on failure and treat any page or console error as
one, plus any request that fails outright — whatever its origin — and any
same-origin request that returns an error status.

Third-party requests used to be ignored entirely, because the analytics tag
was the one external thing these pages loaded and an offline or proxied
machine fails it every run. #102 removed the tag, so nothing is requested from
a host the repo does not control and the exemption went with it.

Note that a missing asset only shows up against a **built** site. Both the
Vite dev server and `vite preview` fall back to serving index.html for an
unmatched path, so everything answers 200 there; GitHub Pages returns a real
404. Point `QA_URL` at a static server over `dist/` to exercise that path.

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

**`tower-stacker.mjs`** — the three.js game (#109), where what is under test
is the *seam* rather than the rules. The overlap arithmetic lives in
`tower-stacker/stack_test.ts` under `npm run qa:units`, because a CDP tap
cannot hit a 0.04-unit perfect window and a check pretending otherwise would
be flaky rather than strict. What only touch can prove is that the shell still
works across a change of renderer:

- A, the d-pad's down arm and START each drop a block — that is
  `shared/dpad.ts` and `shared/buttons.ts` reaching a game with no Phaser in
  it, through synthetic key events on `window`
- the canvas is still a 160x144 backing store at an integer zoom, which is
  what lets `canvasSpace` here match the helper in `grid.mjs`
- the palette toggle still means something in 3D: MONO puts nothing but the
  four DMG tones in the framebuffer, COLOR puts colours in it that MONO cannot
  make, and both stay quantised to four levels per channel
- the end screen's input lock absorbs a bounced press, and the best height
  survives a reload through `shared/storage`
- the 340px branch, where `shell.css` shrinks the d-pad — a different path
  through the pre-init sizing script than the one 390px takes

It also carries **the DMG contrast guard for this game**, because
`npm run qa:contrast` cannot help here: that suite measures Phaser textures,
and this game has none. The checks read the framebuffer instead and assert
that the three visible face orientations each cover a real area in a different
tone, and that a scanline across the tower's waist is solid rather than
punched through with the sky tone.

**`zoom.mjs`** — the double-tap zoom guard (`shared/noZoom.ts`), in all five
games. The zoom itself cannot be reproduced here, because Chromium honours
`user-scalable=no` and never zooms; it is iOS Safari, which ignores that meta,
where players hit it. What is testable is the mechanism: the second `touchend`
of a double tap is cancelled, the first is not, and — the half that could
regress silently — a rapid double tap still registers as two button presses,
since cancelling `touchend` suppresses the synthesised `click`.

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
- **Bound a polling loop by the clock, not by iterations.** One poll of the
  page is a round trip of roughly ten milliseconds, while a Tower Stacker
  block takes over three seconds to cross its travel. A forty-iteration cap
  looked generous and covered less than half a second, so the loop meant to
  wait for a miss gave up long before one could happen — and every check
  after it measured a run that was still going.
- **A tolerance that is a constant will stop being one.** The same suite
  tapped when the block was within a fixed 0.3 units of centre, which lands
  every time at full width and misses outright once the tower narrows past
  0.6. Scale it to whatever the thing being aimed at currently measures.
- **Test a lock with the press it exists for, not by racing it.** Checking
  Tower Stacker's end-screen lock by detecting the end and *then* tapping
  cannot work: the detection is a round trip, and the half-second lock has
  usually expired by the time it lands. Send the bounce — two taps back to
  back at the moment of the miss — which is the thing the lock is there to
  absorb anyway.
- **Know which way up the framebuffer is.** `readPixels` hands back rows
  bottom-up, so a HUD line drawn across the top of the screen is in the
  *high* rows. Measuring the wrong end of the frame found a 160px-wide
  "tower" that was really the footer bar.
- **Prove a check can fail.** Several of these passed for the wrong reason on
  first write. Where a defect is known — the #66 double-advance, or Tower
  Stacker's `LAMBERT_PI` — put it back temporarily and watch the check go red
  before trusting it.

## Requirements

Same as `static/qa`: `playwright-core` ships no browsers, so the driver looks
for a Chromium at `QA_BROWSER`, then a few standard paths, then falls back to
an installed Chrome.
