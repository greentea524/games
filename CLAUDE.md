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
must take its intensity from the helper or `npm run qa:units` fails. The factor
is right for the diffuse response of every lit material three ships.

**The CSP hashes an inline script, and a stale hash fails silently.** Editing
the pre-init sizing script in any `index.html` changes its hash; the browser
then declines to run it, nothing throws, and every functional check goes on
passing. `npm run qa:csp` recomputes it. If you touch that script, run it.

**Make a check prove it can fail.** Several checks in this repo passed for the
wrong reason when first written — asserting a fall speed was capped, against a
player standing still on the ground. Where the defect is known, reintroduce it
and watch the check go red before trusting it.
