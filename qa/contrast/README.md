# DMG contrast checks

```sh
npm run qa:contrast          # spawns its own dev server
QA_URL=http://localhost:5173/games/ node qa/contrast/run.mjs
```

## Why this exists

Six sprites have shipped invisible in this repo:

| Issue | Sprite | What went wrong |
| --- | --- | --- |
| #52 | Windup's backdrop | painted in the brick tone, so scenery read as standable |
| #58 | Pocket Dungeon's cobwebs | thread in `PAL.light`, the floor's own detail tone |
| #83 | chest lid bands and lock plates | `PAL.light` body on a `PAL.lightest` floor |
| #62 | Cart & Crate's lit target pad | two of its three tones *were* the floor |
| #85 | Pocket Dungeon's Cellar Brute | horns in `PAL.lightest`, past a green run of this suite |
| #84 | the relic pips | drawn dark on the *black status bar* rather than the floor |

Every one passed every functional check — right texture key, right tile,
right depth, right alpha — and was found only by generating a screenshot and
looking at it. That is not a reliable way to catch a mechanical mistake.

The mistake is always the same. The DMG ramp has four tones, and three of the
four games draw their background in `PAL.lightest`, the brightest one. A
sprite that also reaches for `PAL.lightest` or `PAL.light` lands on ground of
its own colour.

## What it measures

Nothing here hardcodes a colour. Surfaces are sampled from the running game —
from the generated textures, from a scene's camera background, or from a live
overlay object — so a palette change cannot silently invalidate the suite.
Sprites are compared against the surface they are actually drawn on, named per
game in `manifest.mjs` and listed under it in `on`.

Four rules:

- **Legibility.** A sprite needs at least `MIN_STRONG_PIXELS` pixels a whole
  tonal step away from its surface.
- **Silhouette.** No sprite may lose more than `MAX_DISSOLVED_PIXELS` off its
  outline — see below.
- **Floor variants.** Ice, cracked ground and rugs are mostly the floor tone
  on purpose. They answer to a looser rule: carry *some* mark, don't be blank.
- **Separation.** Windup's backdrop must *not* resemble the brick tile. Here a
  high similarity score is the failure — that is #52.

## A whole-sprite score misses limbs

Legibility is a *total*, and that is not enough. #85 shipped a boss whose
horns were painted in the floor tone; its dark body scored well over a hundred
strong pixels, so the suite passed while the horns were eaten off the outline
and the thing on screen was a hornless block. #84 did it again with the relic
pips. Both were found by screenshot, which is what this suite exists to
replace.

So the silhouette rule floods inward from the texture's edge, passing through
anything indistinguishable from the surface — transparent pixels *and* opaque
pixels within `DISSOLVE_TONE` of it — and counts the opaque pixels it
swallows. A region merged with the background *and* connected to it has left
the silhouette. An eye or a buckle in the floor tone is untouched: it is
enclosed by contrasting pixels, so the flood never reaches it.

`DISSOLVE_TONE` is `SAME_TONE`, not `STRONG_TONE`, and that was measured
rather than assumed. Widening it to a full tonal step reports Windup's
characters as having dissolved 100 pixels — because Windup draws a deliberate
`PAL.darkest` outline against a near-black sky, which is 48 away. That is an
outline doing its job, not a lost limb. This rule can only ask "is this region
literally the background"; "is it *weakly* separated" is `MIN_STRONG_PIXELS`'s
question.

## Outlines are the fix

Every defect this rule found in #107 was the same shape: a light feature —
skin, bone, a snout, a bloom, a lid band — on a `PAL.lightest` floor. Retoning
them does not work, because there are only four tones and the dark two are
already spoken for; a face dark enough to survive the grass stops reading as a
face.

The fix is what the hardware's own artists did: a one-pixel `PAL.darkest`
outline. It costs one pixel of silhouette and lets everything inside stay
light. `drawCharacter` in Static and `buildItem` in Pocket Dungeon both take
one, DMG-only — GBC's floors are dark, nothing dissolves into them, and
outlining art that already reads would be changing it for a check rather than
a player.

## Counting pixels is not enough

The first version of this failed on its own calibration data. Pocket
Dungeon's archer scores 29% of its pixels differing from the floor and reads
perfectly well; Cart & Crate's known-broken lit pad scored 38% and was
invisible. Counting differing pixels ranked the good sprite *below* the bad
one.

What separates them is magnitude. The archer's marks are two whole tones from
the floor; the pad's were one notch along the ramp. So the rule counts only
pixels more than `STRONG_TONE` away, and `contrast.mjs` carries the
measurements that put the threshold where it is — worst real failure 4px,
weakest sprite that actually reads 14px, threshold 12.

## Lantern Keeper is not here

It has no DMG mode at all: one GBC-inspired ramp in `constants.ts`, no palette
toggle in its shell, and zero textures with `dmg` in the key. The issue this
came from said "all five games"; it is four.

## Adding a sprite

Add it to the game's `onFloor` / `onSky` list, or to `exclude` with a reason.
The suite fails on any DMG texture that is in neither — without that, a sprite
added later is silently never checked and the suite passes because it is
testing less than it used to.

`exclude` is for sprites that are not drawn on a measured surface at all, not
for sprites that fail, and **not for a sprite whose surface has no name yet**
— that is what `surfaces` is for. Naming a new one is the cheap half of the
job; the expensive half is being honest about which surface it really is.

For four issues the relic pips sat in `exclude` reading "a HUD pip on the
status bar, not on the floor", which was true and was the wrong conclusion:
the bar is a surface, so #131 named it. The tell for the next one is an
exclusion whose stated reason is a *place* rather than a *duplicate*.

## The HUD bar, and the surface that never existed (#131)

Two exclusions were audited out in #131, and they failed in opposite
directions.

**Pocket Dungeon's relic pips are drawn on the bottom status bar**, which is
not a texture: `UIScene` draws a black rectangle at 80% opacity over the
dungeon, so the pips' background is a composite. The manifest declares it as
an `overlay` — a scene, a point in game space, and the surface underneath —
and the runner reads the fill and the alpha off the live rectangle and blends
them over the floor tone. Both halves come from the running game, so this
hardcodes no more than the rest of the suite does. Measured: `rgb(31,38,3)`.

The point is load-bearing and deliberately so. Shrink the bar and nothing
covers `[80, 136]` any more; the surface fails to resolve, the sprites listed
against it fail for want of one, and the suite says so — rather than quietly
measuring the wrong rectangle.

**Windup's HUD portrait was excluded as "drawn on the HUD panel rather than in
the world", and there is no HUD panel.** `UIScene` holds a portrait, a
graphics energy bar and two text labels, and nothing behind any of them — the
portrait sits on the camera background like every other sprite in that game's
list. The exclusion named a surface that does not exist, and the sprite went
unchecked for it. It is now in `on.sky` and scores 26 strong pixels.

### The tightest margin in the suite

The *empty* pip is worth knowing about. It is `PAL.dark` on that composite,
its whole art is a 12-pixel outline, and all 12 pixels clear
`MIN_STRONG_PIXELS` — by a tone distance of 122 against a threshold of 120.
Nothing else in the suite passes this narrowly, and #84's own note in
`BootScene` says this tone "vanished into the bar" by eye, which the measure
disagrees with only just. If the bar's alpha or the pip's tone moves at all,
this is the first thing that will go red, and that will be a real finding
rather than a flaky one.

The held pip, which is the one carrying the information, scores 24 of 24.

## Reaching the game first

`manifest.mjs` has always declared a `scene` per game, and until #131 nothing
read it. Every rule here samples textures, and `BootScene` builds those up
front, so the suite passed just as happily against a title screen — the
comment claiming that walking in "proves the keys the manifest names are the
ones actually in use" was enforced by nothing.

It is checked now, because an overlay surface can only be read off a live
scene. Setting a game's `advance` to 0 reports `still on title` and takes the
overlay surface down with it.

## Can the DMG art be reached at all? (#134)

Every rule above reads textures out of the texture manager, and those exist
whether or not anything ever draws them. **Pocket Dungeon shipped a complete
DMG art set it could not display.** `GameState.setPaletteMode` and
`DungeonScene.reloadPalette()` both existed with no callers anywhere, because
its shell had no palette control — so `paletteMode` was `'gbc'` from load to
unload, and all 32 of its sprites scored here were art no player could reach.
Four issues passed over it.

So the manifest names each game's `paletteToggle`, and the suite uses it and
then requires the running game to be drawing DMG art. The control is real, in
the DOM, and clicked — not simulated.

### `dmg > 0` is not the bar, and finding that out was the point

The first version asked only that *some* DMG sprite be on screen. Reverting
Pocket Dungeon's scene reload — leaving the toggle wired but nothing
redrawing — **passed it**, on three relic pips: `UIScene` re-textures those
from `paletteMode` every frame. A game whose HUD follows the mode and whose
world does not would have read as fine.

The bar is that **nothing on screen is still GBC art**, which is what the mode
means. At that bar the same revert reports 3 DMG against 1041 GBC.

### It immediately found two more of the same defect

Both `reloadPalette` implementations are a list of sprite kinds, so a kind
added later and not added there keeps its old palette in silence — and nothing
looks broken, because the floor and the player *do* switch.

- **Cart & Crate** left 34 `*_gbc_w1` decor sprites on screen in DMG mode:
  `shelf_`, `pegboard_` and `barrel_` were missing from the chain, so the DMG
  shelf, pegboard and barrel art this suite scores could not be seen.
- **Windup** left 25 `*_gbc` objects — *more than the 14 that had switched* —
  the five `bg_*` backdrop sprites and the steam puffs. Those five backdrop
  sprites are what `backdropVsPlatform` exists for. #52's guard was protecting
  art the player never saw in that mode.

Both are fixed. Windup's swap rewrites the key's suffix rather than naming each
sprite, because the list is what produced the bug.

## The three.js games are not here

Tower Stacker (#110) and Tube Runner (#111) have no textures at all — their
DMG tones are produced by a post pass that quantises the rendered image, so
there is nothing for this suite's `textures.get(key)` to sample. That does not
mean they go unchecked. Each has tone checks in its own touch suite, reading
the framebuffer directly:

- `qa/touch/tower-stacker.mjs` asserts that MONO puts nothing but the four DMG
  tones on screen, that the three visible face orientations each land in a
  *different* tone covering a real area, and that a scanline across the tower
  is solid rather than punched through with the sky tone.
- `qa/touch/tube-runner.mjs` asserts that obstacle rings hold `lightest` and
  the wall does not, which is what stops the one thing that can end a run from
  being drawn in its background's tone. The tube's ribs are covered too, but
  not by a tone check — a surface in the middle of the range is invisible to a
  frame-wide percentile, so #130 checks instead that the ribs *arrive at the
  rate the run's speed implies*. See that suite's own note.

The equivalent of this suite's job is done there because the failure mode is
the same one — a feature the player cannot see against its background — even
though the mechanism producing it is not.
