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
`qa/touch/sound.mjs`, and since #143 every one has a Sound item a phone can
reach — the suite taps it, and holds its label to the real mute state. Pocket
Dungeon's is on its title, because it has no pause menu.

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

**Reduced motion is honoured in five games, and the check is a *pair* (#138).**
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

**Minigolf's grass slows the ball through rolling resistance, and only on
level greens (#146).** Contact friction in cannon-es acts on *sliding*, and a
putt rolls, so raising the grass's friction does nothing. Damping is
proportional, so it leaves a long tail of creep at low speed. `ROLLING_DECEL`
is a constant deceleration. It cut the time from 1 u/s to rest from 3.56 s to
1.75 s. It is applied only
on level greens. Applying it everywhere, as the ticket proposed, slows a ball
on the gentlest ramp enough that the at-rest detector calls it stopped while it
is still on the slope. The ticket's 0.083 s figure came from *dropping* the
ball onto the slope rather than settling it and letting go. `rest_test.ts`
stages exactly that case through `rollingOnRamps` and must catch it. The same
work found that `REST_TIME`'s derivation used a sliding block's acceleration
and the wrong threshold, so its "2.2× margin" was 1.6×. It now uses a rolling
sphere's 5/7 g·sinθ, against `STILL_SPEED`.

**Minigolf's keyboard turns the game's own aim, and shows it (#184).** The
arrow keys used to turn an aim that was drawn only once Space gave it power,
so a keyboard player aimed blind. The angle was also kept in `main.ts` apart
from the game's aim, so it drifted from what was drawn. It is read from
`game.aim()` now, and `previewAim` shows the direction as a short pale shaft
before any power. The game points the aim at the cup on a new hole, a re-tee
and a ball come to rest; after a stroke it used to keep the old stroke's
direction while the camera turned to face the cup. Held arrows turn smoothly
in the frame loop, and a first press also steps a little, so a tap shorter
than a frame still turns. The touch suite counts the preview's cream pixels
on screen, and all three of its keyboard checks fail on the old code.

**Anomaly Room's models live inside their boxes, and a tap hits only what is
drawn (#147).** The round picker decides what is out of view, shadow included,
from each candidate's box in `room.ts`. So the models in `models.ts` are
built from parts *inside* that box, and `anomaly_test.ts` holds every one to it.
A model that poked out could change on screen while the picker believed it
was hidden. three's raycaster does not skip hidden meshes. The game used to take the
first thing a ray touched, so every hidden twin under the player's feet, and
every object vanished in an earlier round, went on catching taps and spending
guesses. `resolveHit` passes hidden meshes over, except where *this* round's
object vanished. Every QA check here finds the answer through `anomaly()`, so
none of them ever played the game as a player does, and none could see this.

**Anomaly Room changes only what the player has seen (#148).** "Out of view"
was the only rule, and at load everything out of view had never been seen. So
round 1 was a blind guess on 2,000 of 2,000 seeds. Every run now opens on a
study phase that ends with Ready. The game counts each object's time on
screen, and `pickRound`'s `seen` option limits a round to objects with at least
`SEEN_TIME` of it. Being out of view is necessary for a fair change; being seen
before is necessary too, and only the first was ever checked.

**Anomaly Room outlines what can be chosen (#176).** Nothing said which
things in the room could be flagged. Pressing or hovering now outlines the one
object under the pointer and names it, and "Show objects" outlines all twelve
for a couple of seconds. The outline is the candidate's box as a wire frame,
parented to its model. It is taken out of raycasting: a line has a wide hit
area, and an outline left in would be chosen in place of the wall behind it.
`anomaly_test.ts` keeps a frame with raycasting left on as its control.

**Voxel Digger's tap drills, and a check must play from the angle a player
does (#151, #152).** #151 widened the dig to a 3×3 patch and was verified by a
player who looked straight down every shaft. From the angle the game opens at,
that fix did nothing. The second tap at one spot lands on the hole's wall and
digs sideways, and six taps found nothing. A tap now drills: `drillCells`
carries the 3×3 straight in from the tapped face until each column meets the
find or leaves the block. Every cube it takes is one a single dig could have
taken, in that order, and `dig_test.ts` replays random drills to hold it to
that.

Three things had to come with it, and each was invisible to the old checks:

- **Glow.** Uncovered find cubes are drawn again with `GreaterDepth`, so they
  show through the rock from any side. The touch suite counts orange pixels
  with the glow on and off.
- **Pictures.** The guesses were four words with nothing to compare the find
  against. Each now has a picture from `preview.ts`, drawn for the side the
  block is seen from.
- **Fit.** The block did not fit a phone screen. The camera distance now
  follows the screen's shape.

There is no dig limit; `PROOF_BUDGET` is only the bound the solvability proof
works within. A best is stored with `SCORE_UNIT`, so a best from an earlier
brush drops out of the game and off the hub badge, as Minigolf's does when its
course changes. The overlay holds canvases too now, so select the game's own
with `#stage > canvas`.

**Voxel Digger's shapes are seven cubes a side and share nothing (#153).** At
five they were blobs under a common two-layer cap, and none looked like its
name. They are redrawn to be recognised: a skull with open sockets, a side-on
fish, a coil that winds, a key. Two things follow. The coil is hollow, so a
drill down its middle finds nothing; any check that taps must not assume the
first tap hits. And which shape is buried is random, so the touch suite deals
each of the four in turn and the hub card always deals the skull. A check that
passes on three shapes in four is a flake waiting to happen.

**Pocket Dungeon is 240×216 with 24-pixel tiles, reworked to match its card
(#155 to #159).** Every screen is laid out at that size now. `sx()` remains
for the dungeon's offsets, which were written as lengths on a 16-pixel tile.
#156 drew the floors and walls at 24 in `tiles.ts`: flagstones, a brick face
where a room is below a wall, a darker capstone rim where it is beside or
above, and nothing where there is no room within a cell. The rim was first
drawn lighter than the floor and read as more floor; `tiles_test.ts` holds
every biome's rim below its floor, and the green screen to its four tones.
Two checks had the old screen written into them, a tile of 16 and a width of
160, and failed by tapping the wrong tile while the game was right. A check
should read sizes from the game. `qa/touch/sound.mjs` and `static.mjs` still
carry a literal 160: correct for the games they drive today, and the next
thing to break when one of those is resized.

**Pocket Dungeon's sprites are pictures in `sprites.ts`, and the outline is
added for them (#157).** Each is 24 rows of letters, one letter an ink with a
colour and a green-screen tone. `pixels()` puts a one-pixel dark edge round
the silhouette, so a pale bone or scroll needs no retoning to survive the pale
floor. Two things went wrong on the way. Art drawn up to the tile's edge has
no room for that edge, and `qa:contrast` failed the boss, brute and choir on
it: keep a picture one pixel inside the tile. And on the green screen a sprite
whose inks all map to the lightest tone is an outline round nothing;
`DMG_SWAP` gives those sprites a second tone inside. `sprites_test.ts` holds
both, with a crown staged on the top edge as its control.

**Pocket Dungeon's HUD is placed by `hud.ts`, and the test checks the same
boxes the scene draws (#158).** The font is Press Start 2P at its native 8
pixels, so a string is eight pixels a character and the layout is arithmetic.
`layout()` returns every box; `UIScene` draws from it and `hud_test.ts` holds
it clear of overlaps at three-digit HP, four-digit gold and the best gear in
the item table. The same layout on 160×144 must fail, as the control. The
shell rounds the screen's corners, which no layout check sees: with a 6-pixel
margin the bottom line lost the foot of its last digit to the curve.
Screenshot the corners. `qa:contrast` read the bar's tone before switching
palette, so the green screen's pips were scored against the colour mode's
bar; it reads the bar in DMG now, and at once failed the empty pip, drawn in
`PAL.dark` on a `PAL.darkest` bar. The game has no level, so the card's LEVEL is not on
the bar, and the turn counter is gone because nothing in play shows the
player a use for it.

**Pocket Dungeon's other screens use the HUD's font and colours, from
`theme.ts` (#159).** Title, shop and game-over are laid out at 240×216 with
text at 8 pixels or twice it, and `legacyCamera` is gone. `THEME` has a set
for each palette, and the toggle recolours the title and shop in place.
`screens_test.ts` wraps every description the way the screen does: the shop
was first given two lines for it, and a recovered regeneration ring takes
three. `showRunSummary` takes a `screen` size for a game that is not 160×144.
The dungeon's floating text was 12 pixels, which this font cannot draw
cleanly; it is 8 with a shadow now.

**Cart & Crate is 240×216 with 24-pixel tiles, part-way through the same
rework (#160 to #165).** #160 changed the canvas and left the art alone, as
#155 did for Pocket Dungeon. The art has since been redrawn at 24 (#161,
#162) and `BootScene.enlarge` is gone, and since #165 every screen is laid
out at 240×216 and `legacyCamera` is gone too. The screen is still ten tiles
by nine, so the six levels larger than that scroll exactly as they did. A check that taps an
object in a scene behind that camera must multiply by the camera's zoom:
`tapObject` in `qa/touch/sound.mjs` takes it from the game. And a key sent
with no hold falls between frames on the menu, which polls `JustDown`; hold
it for a frame or the screenshot script sits on the title for ever.

**Cart & Crate's floor, walls and targets are drawn by `tiles.ts`, and a
level is framed by what is drawn (#161).** A grey-blue checker, walls with a
top and a brick face where floor is below them, and a bright ✕ in a lit
square. A wall cell takes one of 16 pieces from which sides face floor;
`wallcorner` notches the inside corners. A wall with no floor within a cell is
not drawn at all: levels are padded to ten by nine with rows of it, which as
wall-top were a slab the size of the room. The camera then frames the drawn
box, so a small room sits between the HUD bars with its upper wall in view.
Counting the bars against every level was tried and would have made eleven
more scroll; a level that fits the screen but not the gap is centred on the
screen as before. A filled target is drawn 32 pixels square, so its glow
shows round the crate that covers its tile. `reloadPalette` reads the
kind off the texture key and keeps the frame, instead of naming each kind.

**Cart & Crate's fox and crates are pictures in `sprites.ts` (#162).** The
same letter-per-pixel pictures and automatic outline as Pocket Dungeon's. The
fox has a picture for each facing, and a step and a push for each: the game
shows the push while a crate is moving and the step otherwise, and
`finishMove` stands it up again. A crate on its target is its own picture,
`crate_on`, with a brass frame, green slats and a tick; it was the same crate
under a tint, which changed its colour and nothing else. `showCrateHome` is
the one place that picks between the two, and undo calls it. On the green
screen the uniform is pale: dark like the cap and trousers, the fox was one
dark shape from the neck down.

**Cart & Crate's warehouse is drawn only outside the level, by `decor.ts`
(#163).** "Outside" is a cell beyond the grid, or a wall with no floor within
a cell of it: the cells `tiles.ts` leaves undrawn. Each gets a dim floor, and
some get a shelf, a tool rack, a barrel or stacked boxes, chosen from the
level's number so a level always looks the same. Shelves and racks go in the
row behind the room's back wall. It is all pulled toward grey and darkened,
and `decor_test.ts` holds it darker than the play floor and never as bright
as a crate, so the stacked boxes cannot be taken for one to push. Dimming
wood and floor alike made them the same grey in two worlds, where a barrel
was only its hoops; the wood is lifted clear of the floor. On the green
screen the surround is the darkest tone with pale edges on things. Two levels
fill the screen and get nothing. `levelView` is the one place a level's
framing is worked out; the camera and the surround both read it.

**Cart & Crate's HUD is placed by `hud.ts`, and its bottom line is written
for the controls in the player's hands (#164).** Solid bars in the warehouse's
dark, text at 8 pixels, the stage on the left, moves against par on the right
and the level's best between them when there is one. `hud_test.ts` holds it
clear at a three-digit stage and four-digit moves, with the old screen as its
control. The bottom line named Z, H and R, which a phone does not have. It
reads `B:UNDO SEL:RESET START:MENU` there and names the keys on a desktop.
Writing it found that the hint had no phone control at all: it was the H key
and nothing else. It is the pause panel's seventh row now, and
`BoardScene.toggleHint` is the one path both use. The pause and help panels
are in the same scene and take the same colours, on both palettes.

**Cart & Crate's five worlds are five places, and floor nobody can reach is
the outside (#165).** The worlds after the first were the warehouse tinted
toward their old ground colour. `WORLDS` in `tiles.ts` gives each a floor, a
wall and what the floor is made of: the warehouse's flagstones, an ice
depot's frosted blue stone, ruins of pale sandstone and mossy walls, a
labyrinth of hedges on purple gravel, and a master's hall of marble and
crimson. The rest of each palette is worked out from those. `tiles_test.ts`
holds the five apart by floor colour, wall colour and floor marks, and a
crate's wood clear of every floor. Two of the first choices failed the
existing rule that a wall's rim is darker than its floor; the hedge and the
master's floor were changed, not the rule.

37 of the 50 levels mark cells outside their walls as floor, and the board
drew them as floor, so a room sat among patches nobody could stand on.
`sealUnreachable` walks from the player's start and makes the rest wall, so
they are drawn as the warehouse round the room. Every such cell is plain
floor, and it throws on anything else, so it changes no puzzle;
`tiles_test.ts` runs it on all 50, with a level whose target is outside the
walls as the control. A pale world's surround, dimmed, was bright enough
that its lifted wood matched a crate's: `decorPalette` holds the outside's
floor at the warehouse's brightness at most.

The title and level select are at 240×216 in the HUD's colours, from
`screens.ts`, where they had a navy that is none of the green screen's four
tones. The level select has a page per world, where pages of twelve cut
across them. The palette switch only reloaded the board, so the menus kept
the old palette until the next screen; they restart now.

**Static is 240×216 with 24-pixel tiles, at the start of the same rework
(#177 to #181).** #177 changed the canvas and left the art alone. Three things
are specific to this game.

- **The maps are scaled as they load.** The seven Tiled files still declare
  16-pixel tiles, and open in Tiled as they always did. `maps.ts` multiplies
  the tile size and every object's position on the way in, and `maps_test.ts`
  holds each object to the cell it was in.
- **Every length goes through `scaled`.** The kid moves by velocity, so the
  speed, collision boxes, reach and light radii are all lengths. Nothing was
  retuned by feel, and `qa:static`'s playthrough passes untouched but for its
  own literal 16, which it reads from the game now.
- **Enlarging a texture destroys the old one.** `enlargeTextures` runs once at
  boot, before anything holds a texture. The walk animations were made first
  and lost their frames, which stopped the game at boot. Called again from the
  world scene, it took the darkness overlay's canvas out from under it in the
  middle of the playthrough. A texture made later is enlarged by name.

Every screen is on the real one now: the dialogue, inventory and toasts since
#180, the title and endings since #181.

**Static's village is drawn over its maps, not in them (#178).** The maps
still hold twelve tile kinds, and that layer still collides and is still what
the story rewrites, but it is hidden. `tiles.ts` chooses a picture for each
cell from its kind and its neighbours: which sides of a path meet a lawn,
where a roof's edge is, whether a wall is a cottage's front or a room's. So
nothing that blocks the kid changed, and `qa:static` passes untouched. Two
layers are drawn: one under everything, and one over the kid for the top of a
tree and a chimney. A cell something stands in gets nothing drawn over it, so
a sign is never under leaves, and a door never is either.

Three things to know before touching it. `map.addTilesetImage` returns null
for a tileset a Tiled map does not declare, so the village's is made by hand.
The ground's `putTileAt` is wrapped, so a house the story rebuilds is redrawn
on the next frame without each beat having to ask. And the layer is painted
twice at start: once at once, and again when the scene has finished building
and the cells that signs and people stand in are known.

The street furniture and the furniture are in `props.ts`, drawn through the
same painter in the village's own colours: a barrel's wood is a door's wood.
Each replaces the enlarged drawing `buildProps` made under the same key, at
boot, before anything holds the old one. The items, the tear, the entity and
the kid are still the old art: that is #179.

**Static's people are built, not typed, and its static crackles (#179).**
`sprites.ts` holds the kid, the four townsfolk, the patches, the television,
the entity, the beacon and the ten items, with the same inks and automatic
outline as the other two games. A person is made by `person()` from a
description: hat, hair, beard, apron, pack, build. That gives six people four
facings each without twenty-four drawings that have to agree. Everyone used to
be one body in a different shirt; `sprites_test.ts` holds every pair of
outlines apart, and the first run found Gus and the baker two pixels apart.

Three things to know. The outline is drawn only from the outside in: an open
patch is a ring with ground showing through, and outlining every clear pixel
put a dark cross round each spark and filled it in. Each thing that shows
static has a second picture under `<key>_b`, and one timer in the world scene
swaps them all. And the television, entity and beacon take the palette in
their key now, as `tv_gbc`; they were single textures drawn in one palette.

Static reads `shared/motion.ts` now. Under reduced motion the full-screen
noise at a crossing is not shown, and the patches change every 640 ms instead
of every 110. `qa:motion` holds both, each as a pair.

**Static's text and minimap are placed by `hud.ts`, on the real screen
(#180).** The UI was 160×144 through a zoomed camera, so 8-pixel text came out
at 12, eighteen characters to a line. It is native now: twenty-six to a line,
and `hud_test.ts` wraps every line in `dialogue.ts` and holds each to three
rows. The scenes draw the lines `wrap()` returns with Phaser's wrapping off,
so the test measures what is drawn. `dialogue.ts` reaches `localStorage` as it
loads; the test stubs it and imports the file dynamically.

- **The dialogue box goes to the top** when the kid, or who they face, would
  be under it. The camera centres the kid in the town, but a room does not
  scroll and its door is the bottom row.
- **The minimap is two pixels a tile and changes corner.** It first only hid
  when over something to walk up to. Every lamp post and signpost can be
  looked at, so it was hidden for most of a walk. It keeps its corner while
  that is clear, and moves to the next when not. The bottom right is its last
  choice and is inset: the shell's rounded corner cut it, which a screenshot
  showed and no layout check could. On the green screen it is four tones; it
  was terracotta and blue there.
- **The prompt says what the button does**: `A TALK`, `A LOOK`, `A USE`, with
  Z on a desktop. It goes under its target when the kid stands above it.

There is no status line. The ticket allowed one only for something true, and
the objective and items are one press away in the bag.

The touch check of the prompt used to read every text object in the scene. It
passed on a prompt that was never shown. It now stands the kid in front of
someone and reads the prompt that appears.

**Static's title, endings and Static side follow the palette (#181).** The
last of the five tickets was mostly a walk through every map in both worlds
and both palettes, and it found four things.

- **The palette switch threw on the title.** It reloaded the world scene
  whether or not that had started. It restarts whichever scene is showing
  now. Nothing caught it because `qa:contrast` only uses the switch in play.
- **The title drew colour sprites on the green screen**, over its own text.
  `screens.ts` lays it out and gives it a set of colours for each palette, and
  `screens_test.ts` holds the green set to the four tones. The two figures
  stand on a patch of lawn: the entity is dark and so is the screen.
- **The Static side was slate blue on the green screen.** `StaticWorldFX`
  is a duotone over the whole camera, so every pixel was a colour that mode
  does not have, and no texture check could see it: the textures were right.
  There it snaps the picture to the four tones and its grain is a speckle
  of pixels moved a tone. Shifting every tone darker too was tried, and with
  the darkness over it the town was one tone.
- **The endings told a phone to press Z**, were wrapped by hand for the old
  screen, and their tally was green in colour mode over the ending's words.

The Static side's grain and glitch hold still under reduced motion. That one
is not measured: it is a shader, and `qa:motion` reads game objects.

**Lantern Keeper is 240×216 by its camera, and its world is untouched
(#171).** A platformer's jumps are tuned in pixels, so the rule was that every
speed and distance scale by one factor and none be missed. Here none was
changed. `VIEW_ZOOM` is 2 and is applied in one place, the play camera; a tile
is still 8 units and the keeper still runs at 60. On screen everything is
exactly twice what it was, and the reachability checks pass untouched.

Two, not the 1.5 the screen grew by. The keeper is six units tall. At 1.5
that is 9 pixels of 216, the same twenty-fourth of the screen as before. At 2
it is 12, an eighteenth, and the existing art is a clean two by two. A keeper
drawn taller than its hitbox is for the art ticket. The cost is the view: fifteen tiles by thirteen and a half,
down from twenty by eighteen. The keeper's light reaches three tiles and a
dash five, so what is given up is dark.

Three things a magnifying camera does that are easy to miss:

- **It magnifies what is fixed to it, about the middle of the screen.** The
  HUD is a scene of its own, `HudScene`, at the screen's real size. A launch
  does not happen until the next frame, so it keeps what it is asked for
  before then; and `prepare()` stops a new level drawing on the last level's
  HUD, which is still up for one frame.
- **The darkness overlay must be the size of the view, and inset.**
  `zoomInset` in `shared/darkness.ts` is where to put it and how far a
  light's place on it is from the camera's scroll. At zoom 1 both are 0, so
  Static is unchanged.
- **A level one screen tall now scrolls.** The keeper is dropped in above
  the ground, so where they will stand is not known as the stage is built:
  the stage's name goes at the top, and later messages go wherever the
  keeper is not.

Every screen is on the real one since #175. The inner green frame the ticket
asked about was the shell's padding, already removed in #177.

**Lantern Keeper's forest is drawn by `forest.ts`, at the screen's
resolution (#172).** The world is 8 units to a tile and the camera magnifies
by two, so a picture drawn at 16 pixels a tile and shown at half size is one
drawn pixel to one screen pixel. Everything new is made that way.

- **Stone.** The map's own layer still collides and is hidden. A second map
  with 16-pixel tiles is laid over it at half scale, each piece chosen from
  which neighbours are stone: a moss cap where the sky is above, a dark lip
  underneath, and a darker mass with faint joints where a block is buried.
- **Backdrop.** Three pictures that repeat both ways, fixed to the camera and
  slid under it by different amounts. They are the size of the view and
  inset, like the darkness, because the camera magnifies what is fixed to it.
- **Light.** The darkness is the forest's own dark at 0.5 to 0.62, where it
  was black at 0.76 to 0.82; `forest_test.ts` holds every stage lighter and
  none out of its old order. A light is three rings, each lifting more
  (`rings` on `shared/lighting.ts`), and a lit lantern and the keeper each
  throw a warm glow, added over the darkness.
- **Vines** sway from where they are rooted, and not under reduced motion.
  `qa:motion` holds that as a pair, beside the fireflies.

`forest_test.ts` holds the order of brightness: the forest behind is darker
than any stone, the near leaves darker than the far trunks, moss brighter
than stone and the light brighter than moss.

**Lantern Keeper's keeper is drawn larger than its box (#173).** `sprites.ts`
holds the keeper, the lanterns and the props as pictures in letters with an
automatic outline, at two pixels to a world unit like the forest. The keeper
is 16 by 20 pixels, 8 by 10 units: a hooded figure with a pack and a lantern
held out in front. Its hitbox is still the 6 units square it always was, at
the picture's foot, and the sprite's origin is the middle of that box, so
every spawn and respawn point means what it meant. The touch suite holds the
box to 6 by 6 and the keeper's place to its middle.

Three things from the work. The sign has the word DANGER on it now and is no
longer flipped to face the drop, since a mirrored word is no warning. A
picture that joins end to end, a vine or a plank, gets no outline, or there
is a dark line at every join. And `sprites_test.ts` first failed seven
pictures for being drawn up to the edge, where there is no room for the
outline: the keeper's pack was in the first column.

This game has one palette and no entry in `qa:contrast`. `sprites_test.ts`
does that job here: the outline darker than anything in any stage's forest,
and every sprite carrying something brighter than the brightest stone. The
unlit lantern is dark on purpose and is found by its iron.

The plank art is for crumbling platforms, which only `world.json` has, and no
stage loads that map.

**Lantern Keeper's HUD is two solid bars, and the forest is drawn between
them (#174).** `hud.ts` lays out the card's arrangement: lanterns lit on the
left of the top bar and the stage on its right, in amber, and the oil gauge
along the bottom. The play camera's viewport is the screen less a bar at each
end, so nothing is laid over the forest; `VIEW_HEIGHT` follows from
`PLAY_HEIGHT`, and the darkness and backdrop are sized from it. The touch
suite holds the viewport to the space between the bars and the darkness to
the viewport's four edges.

Only what the game counts is shown. The card's score, lives and health are
not, and the run's total of lanterns moved to the end-of-run summary: two
lantern counts on one bar was one too many. The gauge is labelled OIL, the
game's own word for what a flask fills. `hud_test.ts` holds the bars clear
at two-digit counts and the text to 7:1 against its strip.

This game has one palette, so `qa:contrast` has no entry to measure the HUD
against; `hud_test.ts`'s contrast ratios do that here.

**Lantern Keeper's other screens stand in the forest, and its four kinds of
place differ in shape (#175).** `screens.ts` lays out the boot screen, the
title, the controls, the story and the forest path at 240×216, and
`screenForest()` puts the backdrop and a strip of mossy stone behind each.
The boot screen said RETRO PAD over the game's name; it lights a lantern now.
The controls page names the pad and buttons on a phone and the keys on a
desktop. The path's marker is the keeper walking, over the forest of the
stage about to start. The map's touch check had the old screen's 156 and 112
written into it; it reads the layout from the game.

The four kinds of place were one forest in four colours. The canopy has
shafts of light, the marsh mist and hanging moss, and the hollow roots where
the others have trees. `forest_test.ts` holds every pair of backdrops apart
by shape, and a backdrop's seam to no bigger a step than any two rows inside
it: a root leans and a shaft slants, so exact equality was the wrong test.
A shaft of light slopes one in four and the four are a quarter apart, so each
reaches the next one's start at the foot of the picture.

The game has one palette, so the ticket's green-screen pass does not apply.

**Windup is 240×216 by its camera, like Lantern Keeper (#166).** The world
is untouched: a tile is 16 units, a level is 160 by 144 of them, and the toy
runs at 80. `VIEW_ZOOM` is 1.5, the tile ratio and also what the screen grew
by, so the view is the same ten tiles by nine and a tile is 24 pixels on the
screen (`DRAWN_TILE`, what the art tickets draw to). Every camera, the menu's,
the HUD's and the pause panel's too, is zoomed from the top left, so anything
still laid out at 160×144 lands where it did; the later tickets lay those out
natively. The play camera has no bounds: Phaser clamps a bounded camera's
scroll as if its origin were the middle, and with the origin at the top left
the clamp moved the level a quarter of the screen down and right, with every
functional check still green. The camera never scrolls, so a bound had nothing
to do. Phaser's `worldView` ignores the origin as well, and reports 40,36 for
the right picture; the touch check reads where the camera's matrix puts the
level's corners, and goes red with the bound put back.

**Windup's factory is drawn by `factory.ts`, over bodies that did not move
(#167).** Mossy stone with a grass cap that runs across a ledge's joints,
steel spikes, a rolling lava pool, belts with an arrow that points the way they
carry, springs, striped moving plates, an insulator at each end of an arc, and
three backdrop layers with two gears. All of it is drawn at 24 pixels a tile
and shown at two thirds. Every sprite is still created from its 16-unit frame
of `tiles_<mode>` and only then given its picture: a static body ignores its
sprite's scale, so no hitbox changed; a moving platform's body follows its
sprite's scale and is given the new frame's size instead.

- **The rules are colours.** `factory_test.ts` holds the backdrop below a
  stone face's brightness, gives every hazard a colour brighter than anything
  that is not one, and on the green screen keeps the backdrop to the two dark
  tones. Each rule has a control that must fail.
- **The gears step through drawn frames.** Rotating a sprite smears pixel art
  at this size. A loop is as long as the gear's symmetry, which is set by its
  holes as well as its teeth. Looping on the tooth pitch alone jumps the holes.
  The gears turned under reduced motion from #52 until now. Only the steam was
  measured, and `qa:motion` has a gear pair now.
- **The palette swap walks the display list.** It was a list of groups, and
  the spikes, lava and belts had been missing from it since they were added.
- **The DMG sky is still not one of the four tones.** It is the near-black it
  always was. On `darkest`, every sprite's dark edge vanished, and
  `qa:contrast` failed eleven of fourteen. That check reads the sky in DMG now
  (`inDmg`), because each palette has its own camera colour.

**Windup's toy, key, orb, station and goal are pictures in `sprites.ts`
(#168).** They use the same inks and automatic outline as the other three
games, drawn at 24 and shown at two thirds. The toy has six poses: idle, two
run frames, jump, fall and wall-slide. It faces left by flipping.

- **The key is a sprite of its own.** It turns at `keyRate(charge)`: brisk
  when full, slowing as the toy runs down, and still when it is empty. That
  is how much energy is left, so it turns under reduced motion too.
- **The toy's body follows its sprite's scale,** unlike a static body. So
  `ROBOT_BODY` gives the old 10 by 12 at 3, 4 in the picture's pixels, times
  1.5. The touch suite holds the box to 10 by 12, five left of the middle and
  four above. Sized the old way, after the scale, it came out 6.7 by 8, and
  that check fails it.
- **The pickups, station and goal are made from their new pictures and
  refreshed after the scale.** A static body takes its size only then.
- **`sprites_test.ts` checks colours and shape.** The toy must stand out on
  every backdrop and stone colour in both palettes; a toy in the gear's green
  is the control. Its feet must meet the floor in every grounded pose, and
  the key's bow must narrow to edge-on and open again. On the green screen
  the toy is three tones, head to legs. The body's shadow is the body's own
  tone there: one tone darker, it was too close to the backdrop's line art.

**Windup's HUD is two panels laid where the level is empty, and they step
aside for the toy (#169).** A level is the whole screen, ten tiles by nine at
24, and level 2 has walls, its goal and its spawn in the top row. A bar would
have meant shrinking the view to a tile the art is not drawn at. So `hud.ts`
places a framed ENERGY panel and a clock panel, with the level number under
the time. Each is four tiles by one, in the top three rows, anywhere along a
row to the pixel. Per level they go to the places nearest their homes, top
left and top right, that cover no tile the level uses, including a bolt's
path and a moving platform's sweep. Every frame, a panel the toy comes under
moves to the next clear place, as Static's minimap does.

- **Placement is to the pixel because level 2 needs it.** Whole tiles, then
  steps of three, left its clock nowhere at the start: the one gap is 93
  pixels for a panel of 92.
- **`hud_test.ts` holds all 32 levels.** Both panels must be placed at every
  start, and none may be over the level, the toy or the other panel at any
  of 36,224 places the toy can be. The energy panel has nowhere at 33 of them,
  all brief. The old LVL text, which was over the floor in all 32 levels, is
  the control.
- **Low is a colour and an alarm, not a number.** The bar runs yellow, orange,
  red, and at low the label turns to the alarm colour. On the green screen the
  label inverts.
- **The portrait has no outline now.** It sits on the panel, which on the
  green screen is the outline's own tone. `qa:contrast` scores the HUD as a
  named surface and counted 37 pixels of the head lost into it.

**Windup's title, info pages, pause panel and run summary are on the real
screen (#170).** `screens.ts` lays them out at 240×216 in the HUD's panels
and colours, and `screens_test.ts` holds the same boxes. The title stands in
the factory: its backdrop behind, a ledge of mossy stone, and the toy beside
a station at twice play size. The run summary is drawn on the HUD's scene,
because the play camera magnified it by 1.5. The HUD's panels step out while
the summary is up.

- **The palette switch reaches every screen.** It reached only a running
  level, so the title kept its colours until play began, and a paused level
  stayed in the old palette behind the pause panel. The title and pause
  restart now, and a paused level is recoloured in place. A touch check
  holds the title to no colour art after the switch, and fails without the
  restart.
- **`screens_test.ts` found the desktop's controls page running 14 pixels
  into the ledge.** Its sound line wrapped to a tenth line; it is 26
  characters now. The pages wrapped for the old screen are the control.
- **The key follows the toy between levels.** `update` returns early while
  a level ends, and the key stayed where the toy had last walked.

All 32 levels were looked at in both palettes for this ticket, and nothing
in the art left a platform edge or a hazard unclear.

**The band between the bezel and the picture is gone (#177).** `#game` had 15
pixels of dark green padding. Three games' canvases used to overflow and cover
it, so it showed only in Static and Lantern Keeper, as an inner frame. #183
made every canvas the right size and gave all five the band. The padding is
removed in `shared/shell.css`; the picture goes up to the bezel in every game.

**Tube Runner's steering moves the runner, not the tube (#145).** The camera
used to sit at the runner's angle every frame, which pinned them to the middle
of the screen, so steering showed only as the tube turning. It trails now: the
runner swings up to 0.44 of the half-width toward the side held, and the
camera eases round after them. That exposed a second, older fault the locked
camera had hidden — the left of the screen steered the runner *right* — so the
input uses `STEER_LEFT` / `STEER_RIGHT` from `game.ts`, which record the
handedness once. The touch suite reads the runner's position on the screen
through `runnerScreen()`: every angle check passed against the original
complaint, and only a check on what the player sees could tell. Under reduced
motion the camera stays locked, and `qa:motion` holds it to that as a pair.

**Tube Runner's camera follows on a spring, and its speed must not jump
(#154).** #145's trailing camera was an exponential catch-up with a hard cap.
The cap engaged 0.1 s into every turn and jumped the camera's speed by 2.35
rad/s, which is the speed the whole tube turns at on screen. `follow.ts` is a
critically damped spring whose stiffness is derived from `ROTATE_SPEED` and
the lag wanted, so there is no cap to hit. Smooth the camera, never the
runner: the track's fairness bound assumes the runner turns at full rate from
the moment they ask. The first spring solved each frame as if the runner stood
still, and settled at less than half the lag at 12 frames a second;
`follow_test.ts` steps it from 240 down to 12 and keeps that version as a
control.

**The CSP hashes an inline script, and a stale hash fails silently.** Editing
the pre-init sizing script in any `index.html` changes its hash; the browser
then declines to run it, nothing throws, and every functional check goes on
passing. `npm run qa:csp` recomputes it. If you touch that script, run it.

**A check must not assume 60 frames a second.** A container with no GPU
renders WebGL on the CPU (SwiftShader): Tube Runner and Tilt Maze measured
10–14 frames a second on an idle machine, Static 60. Three checks failed
there and passed elsewhere — a retry lock timed on a clamped game clock, a
thumb-steering loop tuned for a fast round trip, and the audio probe, which
read one 45 ms window per frame and so missed short sounds between frames.
All three are fixed and `qa/touch/README.md` has the measurements. Before
trusting anything timed, run it with two shell busy-loops alongside; that is
how the probe's gap was found, after the other two fixes had gone green.

**A touch move arrives with the next frame, so settle before reading (#182).**
Eight checks sent a move and read the game on the next line. On a slow
renderer the read came first: a 120 pixel drag measured as 50, and which check
failed changed from run to run. `hand.settle()` waits two frames, one to
deliver the move and one for the game to act on it. It is a call a check
makes, not part of `move`, because the steering loops are tuned for a fast
round trip.

**The shell cropped three games' pictures on every device, and every check
looked through the crop (#183).** Windup, Pocket Dungeon and Cart & Crate use
Phaser's `Scale.FIT`, which measures `#game`'s whole box, border and padding
included. The canvas came out 60 CSS pixels wider than the space inside, and
`overflow: hidden` cut 15 off each side: 6 to 12 game pixels, half a tile on a
short phone. It was there for the life of the shell. It showed when #158 and
#164 put HUD text nine pixels from the edge and a phone lost the first and
last letters. `#game canvas` is held to `max-width: 100%` now, and
`qa/touch/fit.mjs` measures the canvas against the space a player can see.
Two habits hid it. Every touch check places its taps from the canvas's own
box. And every screenshot taken for #155 to #163 was clipped to that box, on
a desktop viewport. Screenshot the page at phone size, bezel included, before
calling a layout done.

**Make a check prove it can fail.** Several checks in this repo passed for the
wrong reason when first written — asserting a fall speed was capped, against a
player standing still on the ground. Where the defect is known, reintroduce it
and watch the check go red before trusting it.
