# Static QA

Two automated checks that play the game in a real browser.

```
npm run qa:static
```

That starts a dev server, runs both suites, and shuts it down. To reuse a
server you already have running:

```
npm run dev                                        # terminal 1
QA_URL=http://localhost:5173/games/static/ npm run qa:static
```

Both exit non-zero on failure, and treat any page or console error as one.
Failed network requests only count when they were the game's own — the page
pulls its font from a CDN, and failing the suite because a machine is offline
would just train everyone to ignore the output.

## What they check

**`reachability.mjs`** (seconds) — loads each map in each world and flood-fills
from the player, over a collision grid read out of the live scene: tilemap
collision *plus* every static physics body, because props and NPCs stop the
player just as hard as walls do. Then it asserts:

- no walkable tile is stranded from the player's position
- every NPC has somewhere to be talked to from
- every interactable can be reached
- every door can be walked into

**`playthrough.mjs`** (a couple of minutes) — plays a fresh save through to
both endings with real input, asserting each story beat and each item
transform. Nothing is forced: every flag is set by the game in response to
input, so a blocker here is a blocker for a player.

## Why these exist

The first full pass found four defects. Three were invisible to reading the
code and only showed up when something walked the map:

| | |
| --- | --- |
| **#93** | the frozen Gus stood on a tile with all four neighbours blocked. `seen_gus_static` could never be set, so `ch3_done` never fired, so Chapters 4 and 5 were unreachable — the game could not be finished. |
| **#94** | every prop's collision box sat half its own size up-and-left of its sprite, so there was an invisible wall beside each one and no collision on the half you could see. |
| **#96** | the frozen Baker's own body plugged the single gap into the south-west of the Static town, orphaning 20 tiles and the door narration written for them. |
| **#95** | story beats were only evaluated when a map was built, so a beat whose trigger flag was set on that map was never seen. Five of them in one run. |

`reachability.mjs` catches #93, #94 and #96 directly. `playthrough.mjs`
catches #95 — `waitForBeat` fails rather than working around a beat that needs
a map re-entry.

## Notes for anyone extending this

- **Never hardcode an NPC tile.** Where they stand is exactly what #93 and #96
  changed. Look them up with `npcAt(id)`.
- **Drive dialogue with Z, not clicks.** A canvas click advances the box *and*
  is a tap-to-walk order to the world scene, so a click-driven reader sends the
  player marching off the moment the box closes.
- **Hold keys, don't press them.** Phaser polls `Key.isDown` once a frame, and
  a zero-length press falls between two frames.
- **The walker squares up on the tile centre between steps.** The body is 10px
  in a 16px tile; 2px of drift pokes it into the neighbouring row, and a
  perfectly walkable doorway then reads as blocked.
- `scene.isActive()` is `false` during `create()` — the status is `CREATING`,
  not `RUNNING`. A guard using it inside scene setup silently does nothing.

## Requirements

`playwright-core` (a devDependency) ships no browsers, which keeps `npm ci`
cheap for something only these scripts use. The harness looks for a Chromium at
`QA_BROWSER`, then a few standard paths, then falls back to an installed
Chrome. Set `QA_BROWSER` if it cannot find one.

Screenshots from failed steps land in `static/qa/shots/` (gitignored), or
`QA_SHOTS` if set.
