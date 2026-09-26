# Reduced motion

```sh
npm run qa:motion
```

Loads each of the four games that honour `prefers-reduced-motion` twice — once
normally, once with the preference emulated — and asserts the difference.

## Why it exists

`shared/motion.ts` is read at six sites across four games, and until #138
nothing checked any of them. The call being present in the source is a data
structure; whether the motion stops is the effect, and the effect was
unmeasured. Same shape as #134's unreachable palette and #136's unheard sound.

## Paired, and why that is the whole design

"Nothing moves under the preference" is half a claim. A game that never moved
satisfies it, and so does a game broken in a way that stills it. The claim worth
making is that the motion **is there by default and gone under the
preference**, and only a pair can say that.

There is a third assertion per game for the same reason: a *denominator* saying
the run was equally busy both ways. Without it, "nothing moved" could mean the
game never got going and the pair would agree for the wrong reason.

The preference is emulated on the browser context rather than switched after
load, because two of the four read it during `create()` — a preference applied
later arrives after the decision has been made.

## What is measured, and the numbers

| game | decoration | default | under the preference |
| --- | --- | --- | --- |
| tube-runner | the score pulses as a ring is cleared | 3 pulses / 9 rings | **0** / 10 rings |
| tower-stacker | a landing shakes the camera | peak 0.0062 | **0.0000** |
| windup | the steam vents emit | 2 emitters | **0** |
| lantern-keeper | the fireflies drift | 30 of 30 moved | **0** of 30 |

Lantern Keeper's fireflies are still *there* under the preference, and must be:
its own comment says the sprites carry where the lanterns are and only the
movement is decoration.

## Tower Stacker needed an accessor, and a rejected approach

Its three reduced-motion effects are chip spin, camera shake and a HUD flash
that holds instead of blinking. The chips live on throwaway meshes; the flash
needs a *perfect* drop, which a CDP tap cannot reliably land on a 0.04-unit
window — the reason `stack_test.ts` exists at all. So `shake()` was added to the
game's QA handle, which is one read-only getter and no behaviour change.

**Measuring the frame instead was tried and does not work.** The mean
frame-to-frame difference over the half-second after a landing:

| | samples |
| --- | --- |
| default | 1.16 0.71 0.76 0.81 0.62 |
| reduce | 0.99 0.87 0.67 0.75 0.65 |

Completely overlapping, because the sliding block and the rising tower move far
more of the screen than the shake does. Recorded so the next person does not
spend the afternoon on it.

## The four games that never call it are correct (#138's open question)

#138 asked whether Minigolf, Tilt Maze, Anomaly Room and Voxel Digger were
omissions. They are not, and it is not a matter of taste: **none has any
decorative motion to suppress.** A putt rolling across a green, a ball under a
tilt, a block turning under the player's finger — each is the simulation the
player is acting on, and stilling it would still the game.

Anomaly Room is the strongest case and it reads the other way at first glance,
since its whole premise is noticing a small visual change. Grepping its renderer
for any time-varying transform — `elapsed`, `clock`, `dt`, `Math.sin`,
`Math.cos` — returns nothing whatsoever. The room is *still* by design; there is
nothing there to turn off.

So the four above are the whole population. Whether a fifth game belongs here is
a question for whoever writes it, not a gap in this suite.

## The controls

Per CLAUDE.md, each game's reduced-motion branch was removed and the pair
watched go red — the default half staying green throughout, which is what says
the control changed the right thing.

| Control | Result |
| --- | --- |
| `!prefersReducedMotion()` dropped from `tube-runner/hud.ts`'s pulse | 2 pulses under the preference |
| `reduced ? 0 :` dropped from Tower Stacker's two `shake =` lines | peak 0.0058 |
| the early `return` dropped from Windup's `renderVents` | 2 emitters |
| the `if (still) continue` dropped from Lantern Keeper's fireflies | 30 of 30 moved |
