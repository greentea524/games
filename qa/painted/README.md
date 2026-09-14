# The painted cards

```sh
npm run qa:painted              # check
npm run qa:painted -- --approve # re-record, after someone has looked
```

Five hub cards are commissioned illustrations rather than captures of the
running game — `PAINTED` in `qa/thumbnails.mjs`, closed by #123. This is the
check that notices when the game behind one of them has moved on.

## Why it exists

`qa/thumbnails.mjs` states the cost of the exception plainly: *nothing
regenerates these, so nothing keeps them honest.* The eight captured cards are
reproducible at any time, so they cannot be stale. These five can. Rework a
game, redraw its sprites, replace it outright, and its card keeps the picture
it was commissioned with and no check says a word.

The drift is not hypothetical and is already visible in the oldest of them:
Static's piece shows a village, a HUD and a score line the game does not have.
That one is known and accepted. This exists so the next one is not a surprise.

## What it does *not* do

It cannot tell a good illustration from a bad one, and it does not score how
well a painting represents a game. It answers one narrower question:

> Has the game changed since a human last looked at the card and said yes?

## Comparing the picture to the game does not work

#132 proposed that first — capture the game, reduce both the capture and the
card to a palette signature, require them to resemble each other — and set the
test it had to pass: the threshold that lets Static's known drift through must
not also let an unrelated game through.

It fails that test badly. Histogram intersection over a 512-bin RGB signature,
rows the painted art, columns the running game:

|                | static | windup | lantern-keeper | pocket-dungeon | cart-crate |
| -------------- | -----: | -----: | -------------: | -------------: | ---------: |
| static         |  0.034 |  0.151 |          0.139 |      **0.157** |      0.041 |
| windup         |  0.025 |  0.354 |          0.281 |      **0.359** |      0.084 |
| lantern-keeper |  0.101 |**0.654**|         0.635 |          0.652 |      0.052 |
| pocket-dungeon |  0.036 |  0.770 |          0.732 |      **0.791** |      0.078 |
| cart-crate     |  0.020 |  0.252 |          0.184 |      **0.259** |      0.084 |

The diagonal is the right answer, and it is the largest number in **one row of
five**. Static's own card is its *worst* match: 0.034 against its own game,
0.157 against Pocket Dungeon's. Four of the five paintings resemble some other
game more than the one they are on.

This is structural, not a matter of tuning. The paintings depict play, and the
only frame available to compare them against is a title screen — because #123
forbids a painted game from carrying a `thumbnail.mjs` pose hook, and with good
reason: a painted game with a hook gets silently recaptured by
`npm run thumbnail` and the art is overwritten. Three of these games open on a
dark title screen, so the captures resemble *each other* far more than any of
them resembles its own painting.

## What is recorded instead

`approved.json`, two hashes and a note per game:

- **`art`** — SHA-256 of the card file. Swapping the art voids the approval.
- **`textures`** — a digest of every texture the game generates, key, size and
  pixels. A sprite added, removed, resized or repainted voids it too.
- **`note`** — the only part a person writes, and the part that says what they
  saw. `--approve` carries it forward rather than overwriting it.

**Textures rather than source, deliberately.** A refactor, a balance change or
a new level moves no pixels and should not demand that anyone look at a picture
again. Redrawing the hero should. Verified both ways — see the controls below.

### Two things the digest has to work around

**Phaser gives every `Text` object its own texture**, under a UUID key, and the
HP readout and the run clock therefore sit in `getTextureKeys()` next to the
art — differing on every load, because the numbers in them do. Measured before
the filter: 7 such keys in Static, 22 in Pocket Dungeon, and every game's
digest changed between two loads of the same build. They are skipped by the
*shape* of the key, so there is no list to maintain.

**Static's `entity` paints its face from `Math.random()`**, on purpose. Rather
than naming it, `--approve` loads each game twice and records the keys that
disagree between the two as `nondeterministic`. The exception is measured, not
asserted, and a second such texture would exclude itself.

## Approving

`--approve` rewrites the hashes. It does not, and cannot, check that anybody
looked at anything — that is the point of the note field, and of committing the
record as a deliberate act. When the check goes red the right response is to
open the hub beside the game and decide whether the card still describes it.
Re-approving without looking turns this into a file of numbers that always
agrees with itself.

The current record is a **baseline**: the games as they stood when #132 landed,
not a fresh aesthetic sign-off of five cards. The notes say so per game. The
first person to hit a failure here is the first to actually compare.

## Cross-machine

The digest is exact pixels, so a different Chromium or a different platform
could in principle render a generated texture a shade differently and report a
changed game. Nothing like that has been seen — these textures are solid-rect
canvas fills — but if a failure appears with no diff behind it, check before
re-approving. A false green would be the worse failure of the two, which is why
this is exact rather than tolerant.

## The controls

Per CLAUDE.md, each was reintroduced and watched go red.

| Control | Result |
| --- | --- |
| Point Static's card at Cart & Crate's art | `the art file changed — 12687b5955b3 -> d1ad5e0233bc` |
| Take one pixel column off Cart & Crate's crate, art untouched | `74 textures now, 74 then` — caught by pixels, not by count |
| Drop `entity` from Static's `nondeterministic` list | fails on both of two runs of the *same build* |
| Add an unused exported function to `cart-crate/levels.ts` | **stays green** — the negative control, and the one that says this is not just "the repo changed" |
