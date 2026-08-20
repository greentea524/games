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

Nothing here hardcodes a colour. Surfaces are sampled from the generated
textures at run time, so a palette change cannot silently invalidate the
suite. Sprites are compared against the surface they are actually drawn on,
named per game in `manifest.mjs`.

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

`exclude` is for sprites that are not drawn on the surface at all, not for
sprites that fail. The relic pips are excluded because they live on the HUD
bar; that also means **nothing here checks them**, which is how #84's pips
shipped dark-on-black. A sprite drawn against something other than a floor or
a sky needs that surface named in `surfaces`, not an exclusion.
