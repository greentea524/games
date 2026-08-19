# DMG contrast checks

```sh
npm run qa:contrast          # spawns its own dev server
QA_URL=http://localhost:5173/games/ node qa/contrast/run.mjs
```

## Why this exists

Four sprites have shipped invisible in this repo:

| Issue | Sprite | What went wrong |
| --- | --- | --- |
| #52 | Windup's backdrop | painted in the brick tone, so scenery read as standable |
| #58 | Pocket Dungeon's cobwebs | thread in `PAL.light`, the floor's own detail tone |
| #83 | chest lid bands and lock plates | `PAL.light` body on a `PAL.lightest` floor |
| #62 | Cart & Crate's lit target pad | two of its three tones *were* the floor |

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

Three rules:

- **Legibility.** A sprite needs at least `MIN_STRONG_PIXELS` pixels a whole
  tonal step away from its surface.
- **Floor variants.** Ice, cracked ground and rugs are mostly the floor tone
  on purpose. They answer to a looser rule: carry *some* mark, don't be blank.
- **Separation.** Windup's backdrop must *not* resemble the brick tile. Here a
  high similarity score is the failure — that is #52.

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
