# The built site

```sh
npm run qa:dist                    # build, serve dist/, check every page
QA_SKIP_BUILD=1 npm run qa:dist    # reuse the dist/ you already have
```

Loads the hub and all eleven locally hosted games **from `dist/`**, served the
way GitHub Pages serves them, and fails on anything the pages ask for and do
not get.

## Why this exists

Every other browser suite here runs against `npm run dev`, and
`qa/touch/README.md` has said what that costs since it was written:

> a missing asset only shows up against a **built** site. Both the Vite dev
> server and `vite preview` fall back to serving index.html for an unmatched
> path, so everything answers 200 there; GitHub Pages returns a real 404.
> Point `QA_URL` at a static server over `dist/` to exercise that path.

Nobody did. Grepping `dist/` across `qa/`, `static/qa/`, `scripts/` and
`package.json` returned exactly one hit — that sentence, describing a thing
that never happened. So the one defect class the repo had written down as
invisible was invisible on every run, and it is the class that reaches
production, because this repo deploys `main` straight to Pages.

## The gap, measured

Add an image to the hub with a literal source path — `/games/src/assets/images/static.webp`,
a file that exists on disk — and build:

| served from | result |
| --- | --- |
| `dist/` | **FAIL** — `404 /games/src/assets/images/static.webp` |
| `npm run dev` | green. No failed request, no console error, and the path itself answers `200 image/webp` |

Vite serves source files in dev and only emits *imported* assets, under hashed
names, in the build. That is the whole class in one line, and it is why a check
that never leaves the dev server cannot see it.

## What can only fail here

- an asset the build did not emit, or emitted under another name;
- a wrong `base`, so `/games/assets/...` resolves nowhere;
- a filename whose case is only correct on this filesystem;
- a game on the hub with no built page — a card that 404s;
- a hardcoded absolute path that works in dev and not under `/games/`.

## The server

`startStaticServer` in `qa/harness.mjs`. Two properties carry the whole thing:

**An unmatched path gets a 404.** No index.html fallback. That is the property
`vite` and `vite preview` do not have and the reason neither can stand in here.

**It mounts at `/games/`.** `vite.config.ts` sets `base: '/games/'`, so the
built pages reference `/games/assets/...` absolutely — a server handing `dist/`
out at the root serves pages whose every asset 404s, which would be a suite
that fails for its own reasons rather than the site's.

The 404 behaviour is asserted **first, on every run**, before anything else is
measured. If the server ever grows a fallback, every check after it passes for
the wrong reason, so it is not left to be verified by hand once.

## Three lists that have to agree

No single list is the truth about which pages the live site has:

- what `vite.config.ts` tells the build to emit;
- what `dist/` actually contains;
- what the hub links to on this origin.

So all three are compared, in both directions. A hub card with no built page is
a 404 for a visitor; a built page nothing links to is dead weight on the deploy
and the signature of a card removed without its build entry. This is #122's
shape — a value declared in one place, real in another, with nothing spanning
the two.

## Why a reachability pass, not the full suites

#135 left the choice open. This loads and listens rather than re-running
`qa:touch` against `dist/`, for two reasons: a 404 does not need a playthrough
to show itself, and this way the pass covers **all twelve pages**. No existing
suite does — `qa:touch` drives ten games, `qa:contrast` four, `qa:painted`
five, `qa:static` one, and the hub was checked by nothing at all.

Each page is given three seconds after `load` before its listeners are read. A
Phaser boot or a three.js stage fetches things after the load event, and a 404
on a lazily-fetched asset is exactly what this is for — stopping at `load`
would miss the interesting half.

## Why this directory is not ignored

`.gitignore` carried a bare `dist`, which matches a directory of that name at
any depth — so it swallowed this one too, and the first commit of this work
contained none of it. Git does not error on an ignored path; it just quietly
has nothing to add. The rule is anchored to `/dist` now, which is what it
always meant. Do not un-anchor it.

## The controls

Per CLAUDE.md, each was reintroduced and watched go red.

| Control | Result |
| --- | --- |
| A literal `/games/src/...` image path on the hub | red against `dist/`, **green against dev** — the gap itself |
| An emitted asset deleted from `dist/` | `404 /games/assets/anomaly-room-B32FtXK-.js` |
| `minigolf` dropped from the build inputs, its card left on the hub | the list cross-check names it, and `minigolf answers 200 — 404` |
| An unmatched path | asserted every run; a 200 there means this suite is measuring nothing |
