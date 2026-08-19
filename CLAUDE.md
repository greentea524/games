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
npm run qa:units   # pure-logic checks (floor modifiers, storage migration)
```

`*_test.ts` files run under `tsx` and use `process.exit`, so they are excluded
from `tsconfig.app.json` — that config targets the browser and has no node
types.

Both QA suites start their own dev server and exit non-zero on failure, and
treat any page or console error as a failure. Point `QA_URL` at a running
server to skip the spawn — `static/qa/` takes a game URL, `qa/touch/` takes the
games *base* URL.

**DMG art is the repo's most repeated defect.** Four sprites have shipped
invisible — #52, #58, #83, #62 — always the same way: the DMG ramp has four
tones, three games draw their background in `PAL.lightest`, and a sprite that
also reaches for `PAL.lightest` or `PAL.light` lands on ground of its own
colour. Every one passed every functional check and was caught only by
screenshot. `npm run qa:contrast` now guards this; run it after any sprite
work, and read `qa/contrast/README.md` before adding art.

See `static/qa/README.md` and `qa/touch/README.md` before extending either.
Both carry hard-won notes: `scene.isActive()` is false during `create()`,
Phaser polls `Key.isDown` once a frame so zero-length presses fall between
frames, and CDP's `touchEnd` carries the contacts being *released* rather than
those remaining.

**Make a check prove it can fail.** Several checks in this repo passed for the
wrong reason when first written — asserting a fall speed was capped, against a
player standing still on the ground. Where the defect is known, reintroduce it
and watch the check go red before trusting it.
