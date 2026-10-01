# Working in this repo

Five GameBoy-styled Phaser games sharing one shell: `static`, `windup`,
`lantern-keeper`, `pocket-dungeon`, `cart-crate`. Vite multi-entry, deployed to
GitHub Pages from `main` under `/games/`.

## Commit authorship

**Set the git identity before making any commit.** Sessions run in fresh
containers, so this is not inherited — without it, commits land authored by
`Claude <noreply@anthropic.com>`, which is not what this project wants.

```sh
git config user.name  "greentea524"
git config user.email "8950614+greentea524@users.noreply.github.com"
```

The repo owner is the **author**; Claude is credited in a trailer:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

The GitHub noreply address is deliberate — it links commits to the account
without publishing a real address in a public repo's history.

Do not rewrite the authorship of commits already on `main`. It is published,
deployed, and linked from issue comments; changing it would need a force-push
to a shared branch and break those references. Fix authorship only on commits
that have not been merged yet.

## Verifying a change

```sh
npm run build      # tsc -b && vite build — typecheck included
npm run lint       # oxlint; a handful of pre-existing warnings are expected
npm run qa:static  # Static: reachability + a full scripted playthrough
npm run qa:touch   # all five games under real multi-touch, on a phone viewport
npm run qa:contrast# DMG sprites must not be drawn in their background's tone
npm run qa:painted # the five painted hub cards still match their games (#132)
npm run qa:units   # pure-logic checks (floor modifiers, storage migration)
npm run qa:csp     # the CSP's script hashes still match the scripts (#108)
npm run qa:dist    # the site as it ships: every page loaded from dist/ (#135)
npm run qa:motion  # prefers-reduced-motion is honoured, paired runs (#138)
```

`*_test.ts` files run under `tsx` and use `process.exit`, so they are excluded
from `tsconfig.app.json` — that config targets the browser and has no node
types.

Both QA suites start their own dev server and exit non-zero on failure, and
treat any page or console error as a failure. Point `QA_URL` at a running
server to skip the spawn — `static/qa/` takes a game URL, `qa/touch/` takes the
games *base* URL.

**Hub thumbnails have one rule, and it is written down (#123).** A card's
picture is a capture of the running game, produced by `npm run thumbnail` at
the size `src/App.tsx` declares. There are exactly two sets of exceptions and
both are *closed lists* in `qa/thumbnails.mjs`: five GameBoy games carry
commissioned painted art, and three games are hosted elsewhere with nothing
here to photograph. A new game is a capture — `src/thumbnails_test.ts` fails if
one is neither on a list nor has a `thumbnail.mjs` exporting `pose(page)`.

The rule exists because there never was one, so each card was decided on its
own and the answers drifted into three styles. Keep the lists closed; adding to
them is the drift.

The painted five are the ones nothing regenerates, so `npm run qa:painted`
records an approval instead: a hash of each card plus a digest of the textures
its game builds, red when the game moves on and nobody has looked at the
picture since. Comparing the painting to the game directly was tried first and
measured — four of the five paintings resemble some *other* game more than
their own — so do not reach for it again; `qa/painted/README.md` has the
matrix.

The tool photographs the page, not the canvas. Reading a canvas back with
`drawImage` only works if the renderer asked for `preserveDrawingBuffer`, and
Phaser does not — every GameBoy game captured as a rectangle of solid black,
written to disk and reported as a success. A screenshot composites what the
player sees whatever the renderer did, and the tool now refuses a capture with
no variation in it.

**DMG art is the repo's most repeated defect.** Six sprites have shipped
invisible — #52, #58, #83, #62, #85, #84 — always the same way: the DMG ramp
has four tones, three games draw their background in `PAL.lightest`, and a
sprite that also reaches for `PAL.lightest` or `PAL.light` lands on ground of
its own colour. Every one passed every functional check and was caught only by
screenshot. `npm run qa:contrast` guards this; run it after any sprite work,
and read `qa/contrast/README.md` before adding art.

Two of the six got past a *green* run of that suite, which is worth knowing
before trusting it. Legibility is a whole-sprite score, so a dark body carries
a sprite whose horns or lid band are painted in the floor tone; #107 added a
silhouette rule for that. #131 closed the other gap: a sprite is listed against
a *named* surface, so the HUD bar is measured like anything else — an exclusion
whose reason is a place rather than a duplicate is the next one of these.

**A palette that nothing can switch to is art nobody sees (#134).** Pocket
Dungeon shipped a full DMG set it could never display: `setPaletteMode` and
`reloadPalette()` both existed with no callers, because its shell had no
palette control. Every `_dmg` check in the repo reads the texture manager, and
textures exist whether or not anything draws them, so four issues passed over
it. `qa:contrast` now uses each game's real toggle and requires **no GBC art
left on screen** afterwards — `dmg > 0` was the first bar and three relic pips
satisfied it with the whole dungeon still in colour. That check immediately
found two more: both `reloadPalette` implementations are a list of sprite kinds,
and Cart & Crate's decor and Windup's whole backdrop were missing from theirs.
Prefer rewriting the key's palette suffix over naming each sprite.

That walk read `texture.key`, which a tilemap layer does not have — so Static's
whole ground went unexamined and the check called a six-sprite overworld clean
(#137). It reads `tileset[].image.key` too now. Enumerate what is actually on a
display list before trusting a walk over it; assuming was the error both times.

**When a light feature lands on the light floor, outline it — do not retone
it.** There are four tones and the dark two are usually already in use, so a
face or a bone drawn dark enough to survive the grass stops reading as a face
or a bone. A one-pixel `PAL.darkest` edge costs one pixel of silhouette and
lets everything inside stay light. DMG only; GBC's floors are dark.

See `static/qa/README.md` and `qa/touch/README.md` before extending either.
Both carry hard-won notes: `scene.isActive()` is false during `create()`,
Phaser polls `Key.isDown` once a frame so zero-length presses fall between
frames, and CDP's `touchEnd` carries the contacts being *released* rather than
those remaining.

**three's Lambert BRDF carries a 1/PI factor, and it has cost four games.**
three applies it to the ambient term as well as the direct one, so a rig
written from the brightness you actually want renders at a third of it —
Tower Stacker, Tube Runner, Tilt Maze and Minigolf each met it separately and
each time it looked like a lighting choice rather than a bug. `lambertIntensity`
in `shared/stage3d.ts` is the fix and it was opt-in, which is why it kept
happening; #133 made it enforced, so every light built by a file on that stage
must take its intensity from the helper or `npm run qa:units` fails (the check
is `shared/stage3d_test.ts` — it was called `lighting_test.ts` until #139, which
falsely implied the unrelated `shared/lighting.ts` was covered). The factor is
right for the diffuse response of every lit material three ships.

**Every other suite runs against `npm run dev`, which cannot 404 (#135).** Vite
and `vite preview` both fall back to serving index.html for an unmatched path,
so a missing asset, a wrong `base` or a filename whose case is only right on
this filesystem all answer 200 in dev and 404 on Pages — the one defect class
that reaches production, since `main` deploys straight there. `npm run qa:dist`
builds, serves `dist/` from a server that returns real 404s, and loads all
twelve pages. Measured: a literal `/games/src/...` asset path fails against
`dist/` and is completely green in dev, where the path itself answers 200.

**Sound was checked as a label for three games and as sound for none (#136).**
The suites asserted the button's text changed, which is also what a toggle that
flips the label and not the gain does. `driver.mjs` now installs an
`AnalyserNode` in front of `destination` before any page script and holds the
peak RMS, and `checkSound` mutes, replays and unmutes. Two traps are written
down there: measure the instant the button is clicked and you catch Anomaly
Room's mute *ramp* rather than its silence, and a brand-new `AudioContext` is
`running` in this headless browser, so a suspended-context defect cannot be
staged under the driver at all. The Phaser five are checked too since #142, by
`qa/touch/sound.mjs` — and only Static's mute is reachable by touch; the other
four have the M key and nothing else, which is its own issue.

**Listening found two games whose sound was broken in ways no other check
could see (#142).** Windup's M toggled twice per press and did nothing on its
title menu. Cart & Crate's effects had never made a sound: its ZzFX port built
a one-sample NaN buffer, and under that sat a missing envelope, a
phase-scaled amplitude and a route past the mute. #144 replaced it with the
synth the other four use, and the suite now hears each game's effect *alone*,
music stopped through `exposeSoundForQA`'s `silence` — every listen that
included music had passed the silent effects. Three traps from that work: a
first effect call can release music queued at load, so "before any input" is
not silence; a page-side `import()` of a game's module can
return a *second copy* of it under Vite (`?t=`), so a game hands the check its
own `effect` via `exposeSoundForQA`; and a short listen can land in a tune's
rest, so the window is a whole musical cycle.

**Reduced motion is honoured in four games, and the check is a *pair* (#138).**
`shared/motion.ts` is read at six sites and nothing measured any of them until
`qa:motion`, which loads each game twice — once plain, once with the preference
emulated — and asserts the motion is there by default and gone under it, plus a
denominator saying the run was equally busy both ways. "Nothing moved" alone is
satisfied by a game that never moved. Emulate on the context, not after load:
two of the four read the preference during `create()`.

The other four stage3d games never call it and that is correct — none has
decorative motion. Anomaly Room looks like the exception and is the clearest
case: its renderer contains no time-varying transform at all, because the room
is still by design.

**A source-scanning check must not read comments, and must not confuse a
mention with an import (#139).** `shared/stage3d_test.ts` scans for lights that
skip `lambertIntensity`. Renaming it put its own name into `shared/stage3d.ts`'s
docstring, which made that file match a filter written as
`includes('shared/stage3d')` — and the docstring *illustrates the defect* with
`new THREE.AmbientLight(0xffffff, 0.55)` in prose. The check reported the
documentation of the bug as the bug, and the tempting fix was to delete the
explanation. It strips comments and matches a real `from '...'` import now; the
file count went from a misleading 18 to the 6 that actually import it.

**A test file named for a module is a claim that the module is covered (#139).**
`shared/lighting_test.ts` checked three.js light *intensities* while
`shared/lighting.ts` is a Phaser darkness overlay with no check at all — so the
name asserted coverage that did not exist. The three.js one is
`shared/stage3d_test.ts` now, and the overlay's two pieces of pure arithmetic
moved to `shared/darkness.ts` where `darkness_test.ts` can reach them: Phaser
touches `window` on import, so nothing importing it runs under `tsx` (the reason
`tower-stacker/framing.ts` exists apart from its game). Both checked pieces fail
*invisibly* — a dropped radius in the screen cull leaves a room dark where a
torch should light it, and dropped rounding mints a brush texture every frame.

**A standalone 3D game's hint names its keys, and a check holds it to them
(#140).** All six have full keyboard schemes; five hints said only "tap" or
"drag". `qa/touch/hints.mjs` reads each hint on screen, requires it to name a
key, and presses every key it names to confirm the game consumes it — a hint
naming a dead key is worse than none. The hints are unconditional by decision,
not by omission. Screenshot a hint you lengthen, at phone *and* desktop width:
these boxes sit at `left: 50%`, so they shrink to half the screen unless
`width: max-content` lets their `max-width` apply, and Minigolf's lands on its
pale front rail on a wide screen.

**Minigolf's solver measures how far the ball still has to *walk* (#141).**
`course_test.ts` plays every hole greedily, and it used to score a resting ball
by straight-line distance to the cup. That only works for a route that closes
on the cup the whole way; #141's Shelf and Summit parked the solver under the
cup's shelf and against the wall between a U's legs for six strokes each. It
scores by a walking-distance field now: walls block, and a change of level
connects only along a ramp. The field only guides — where it finds no route
the solver falls back to the old measure and plays on, so a sealed hole still
fails through the physics and not through the map. Every hole #141 added has a
sealed copy in that file that must fail. `mirrorZ` in `holes.ts` is how a ramp
climbs toward the camera; do not write a second ramp builder.

**A score is only a best on the course it was set on (#141).** Minigolf's save
keeps the round total, and growing the course from par 8 to par 26 would have
left an old best of 8 unbeatable on the game's screen and the hub's badge.
Both readers compare `COURSE_KEY` (names and pars) and ignore a best from
another course. Any game whose levels are counted into one score has this
shape.

**The CSP hashes an inline script, and a stale hash fails silently.** Editing
the pre-init sizing script in any `index.html` changes its hash; the browser
then declines to run it, nothing throws, and every functional check goes on
passing. `npm run qa:csp` recomputes it. If you touch that script, run it.

**Make a check prove it can fail.** Several checks in this repo passed for the
wrong reason when first written — asserting a fall speed was capped, against a
player standing still on the ground. Where the defect is known, reintroduce it
and watch the check go red before trusting it.
