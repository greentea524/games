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

**`tower-stacker.mjs`** — the first three.js game (#110), moved off the
GameBoy shell onto the standalone stage by #119. That rework deleted most of
what this suite used to check: there is no d-pad, no A button, no 160x144
backing store, and no palette toggle, so the checks for them went with it. The
overlap arithmetic and the frustum derivation are in
`tower-stacker/stack_test.ts` under `npm run qa:units`, because a CDP tap
cannot hit a 0.04-unit perfect window and a check pretending otherwise would
be flaky rather than strict.

What is left for touch:

- the whole canvas is the button — a tap in a corner drops the block, and one
  tap is exactly one drop
- the end screen's input lock absorbs a bounced press, and the best height
  survives a reload through `shared/storage`
- the stage's own contract: the canvas fills the viewport and its buffer is
  scaled by the device pixel ratio, capped at 2

It also carries **the contrast guard for this game**, because
`npm run qa:contrast` cannot help here: that suite measures Phaser textures,
and this game has none. The four-tone version of that guard asked whether the
tower was shaded across three DMG tones and none of them was the sky's. The
question survives the palette even though the tones do not, so it is now asked
in luminance: the dimmest part of the tower sits clear of the sky, the median
is where the lighting rig was designed to put it, the faces spread across a
real range rather than one flat value, and a scanline across the tower's waist
is solid rather than punched through.

The median is the one that catches the 1/PI Lambert bug, and it catches it
loudly — 0.77 with the factor, 0.46 without. The spread catches it too but by
a narrower margin, which is why both are there.

**`tube-runner.mjs`** — the second three.js game (#111), moved onto the
standalone stage by #120. The d-pad is gone; the control is hold zones on the
left and right halves of the canvas, and the checks that drove
`shared/dpad.ts` drive those instead. The claims are the same, and they are
what makes a *held* control different from a button:

- holding a side turns the player, and letting go stops dead
- rolling a thumb across the middle without lifting reverses the turn — the
  case the d-pad module existed for, and fatal in a game where letting go is
  how you stop
- a second thumb on the other side takes over rather than cancelling to zero,
  which would strand a player at the moment they are changing their mind
- the end screen's input lock, and the save through `shared/storage`

One check is new, and it guards #120's own note that rotation must stay a
direct angular velocity: the fairness bound in `track.ts` is derived from
`ROTATE_SPEED` being a rate the player actually achieves, so easing into it
would make every generated track harder than the bound promises. The suite
measures the rate at the start of a hold and again later, and requires both to
match `ROTATE_SPEED`.

**Measure that rate against the game's clock, not the wall's.** The loop
integrates in simulated seconds and clamps a long frame, so under a headless
renderer that drops frames the angle advances less than wall time says it
should — through no fault of the control. Against `performance.now()` it read
as a rate falling from 3.2 to 2.6, which is indistinguishable from the easing
the check exists to rule out. Against `clock()` it is 3.60 every sample.

The rules — the reachability bound that keeps a generated track fair — are in
`tube-runner/track_test.ts` under `npm run qa:units`, not here.

Its tone checks are the `qa:contrast` stand-in for this game. In four tones
the claim was "obstacle rings hold `lightest` and nothing else does". In full
colour it is the same claim in luminance: the brightest surface on screen
reaches the value the lighting table gives a ring, and the wall sits far below
it. The lighting rig separates surfaces by orientation — a ring is the only
thing facing the light — so losing that is the #62-shaped defect, the one
thing you must react to drawn at its background's value. Removing
`DIRECTIONAL` takes the brightest thing from 0.92 to 0.76, because the ribs
become the brightest surface instead.

**What it does not check: the ribs.** The bands on the tube wall are what give
the run its sense of speed, and no check guards them. Collapsing `RIB_LUMA`
into `WALL_LUMA` — deleting them as a distinct surface outright — leaves the
whole suite green, because the rings still reach the top of the range and the
wall still sits at the bottom. That was true of the four-tone version for the
same reason. It is the same shape of gap `qa/contrast/README.md` records for
the HUD relic pips, and it is written down for the same reason: an unguarded
surface that nobody knows is unguarded is how #84 shipped.

**`minigolf.mjs`** — the third three.js game (#113), on the standalone stage
(#118). The course itself is checked headless in `minigolf/course_test.ts` and
`minigolf/rest_test.ts`; what is here is the slingshot drag, because that
control is the part #113 had to be redesigned around. The original issue
specified a charging meter on a d-pad — a reasonable design for a 160x144
shell, and meaningless once the game got its own canvas — so the gesture is
new code with nothing else covering it.

The checks worth knowing about are the two that assert a stroke did *not*
happen: a pull that ends back at the ball plays nothing, and a tap with a
two-pixel wobble plays nothing. A mis-started drag that gets played costs a
stroke the player never took, which is unrecoverable in a game scored by
counting them.

**`anomaly-room.mjs`** — the third standalone game (#114). The rules it plays
by — that nothing is ever changed while it is on screen, and that every change
is visible from where the player stands — are in
`anomaly-room/anomaly_test.ts` under `npm run qa:units`, against real frustum
and raycast maths.

What is here is the seam, and for this game the seam carries unusual weight: a
drag and a tap arrive through exactly the same events, and the game tells them
apart only by how far the pointer moved. So the suite drives both, and checks
the two negatives as carefully as the positives — that six full drags around
the room cost no guesses, and that tapping a wall is neither right nor wrong.

Objects are located through the game's own `probe`, which resolves a screen
point exactly the way `flag` does. A suite that worked out where things were
with its own copy of the projection would be checking its own arithmetic, and
could pass while tapping flagged something else entirely.

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
- **A tap that follows other touches too closely does nothing.**
  `shared/noZoom.ts` cancels a `touchend` within 300ms of the previous one, and
  a cancelled `touchend` takes the synthesised `click` with it — so a tap on a
  DOM button wired to `click`, sent straight after d-pad work, reaches the page
  and has no effect. Lift every contact and let the window lapse first. The
  palette toggle failed exactly this way and looked like a broken button.
- **Wait on the thing you are claiming, not on a proxy for it.** Tube Runner's
  ring-clearing helper first returned as soon as the player was lined up with
  the gap — but a run opens with the gap already dead ahead, so it returned
  instantly, ten times over, and reported nothing cleared. Waiting on the ring
  count says what the check means.
- **Do not assume one run survives the whole suite.** Proving that holding an
  arm rotates the player also steers them off the gap, and the next ring
  arrives regardless. Start a fresh run per phase rather than writing checks
  that silently measure an end screen.
- **Prove a check can fail.** Several of these passed for the wrong reason on
  first write. Where a defect is known — the #66 double-advance, or Tower
  Stacker's `LAMBERT_PI` — put it back temporarily and watch the check go red
  before trusting it.
- **An exploratory gesture is still a gesture.** The aim checks pull the
  contact around to prove direction and power track the drag — and the release
  at the end of that was a real stroke, which on the short hole banked in and
  advanced to the next one. Every check after it was reading a different hole,
  and the stroke-count assertion failed by comparing across two of them. Land
  the contact back where it started, or reset the game, before checking
  anything that counts.
- **Do not run two browser suites against one dev server.** Two Chromium
  instances holding WebGL contexts on the same page lost one of them mid-run,
  and the symptom was `window.__game` going undefined in a suite that had been
  passing for a fortnight — which reads exactly like the game failing to
  initialise.
- **A CDP tap is not a fast tap.** `hand.tap` holds for 120ms, but the round
  trips around it put roughly half a second between `pointerdown` and
  `pointerup`. A game that classified a press as a tap only if it was released
  inside 350ms ignored every tap the suite sent, and the symptom — input
  apparently doing nothing — looked nothing like a timing threshold. The
  threshold was wrong for people too, which is the real lesson: a press that
  never moves is a tap however long it is held.

## Requirements

Same as `static/qa`: `playwright-core` ships no browsers, so the driver looks
for a Chromium at `QA_BROWSER`, then a few standard paths, then falls back to
an installed Chrome.
