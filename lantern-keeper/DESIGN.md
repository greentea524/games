# Lantern Keeper — Ability Gating Spec (KAN-110)

Every lantern lit reveals more of the map and (except the first and last)
grants a movement ability. Progression is a strict linear chain — each gate
requires exactly the ability granted by the previous lantern, so no
sequence-breaks or soft-locks are possible by construction.

## Lantern dependency map

```
L1 Hearth ──> L2 Ember ──> L3 Gale ──> L4 Root ──> L5 Crown
(reveal)     (double     (dash)      (wall-      (win state)
              jump)                   cling)
   Area 1: Forest Floor | Area 2: Mossy Hollows | Area 3: Rootspire
```

| # | Lantern | Area | Grants | Gate it sits behind |
|---|---------|------|--------|---------------------|
| L1 | Hearth | Forest Floor | map reveal only (tutorial ritual) | none — lit in the opening steps |
| L2 | Ember | Forest Floor | **double jump** | baseline platforming only |
| L3 | Gale | Mossy Hollows | **dash** | 5-tile ledge (double jump required) |
| L4 | Root | Rootspire | **wall-cling** | 6-tile gap (dash required) |
| L5 | Crown | Rootspire summit | win state | 12-tile shaft (wall-cling required) |

## Movement budget (tile units, 1 tile = 8 px)

These numbers are what makes the gates enforceable. Level geometry MUST
respect the "gate minimum" column — it exceeds the reach of every ability
combination before that gate by at least a 2-tile margin.

| Capability | Max reach | Gate minimum built against it |
|------------|-----------|-------------------------------|
| Baseline jump | 3 tiles up / 3 tiles across | double-jump ledges: **5+ tiles up** |
| Double jump | 5 tiles up / 4 tiles across | dash gaps: **6+ tiles across** |
| Dash (+ jump) | 6 tiles across | wall shafts: **8+ tiles up**, no ledge spacing under 6 tiles |
| Wall-cling + wall-jump | unbounded vertical | — |

Implementation note: the scaffold's current constants (gravity 400,
jump −170) give a ~4.5-tile jump — retune in KAN-112 to hit the 3-tile
baseline (e.g. gravity 500, jump −150) before building gate geometry.

## Anti-soft-lock rules

1. **Abilities are permanent.** Nothing removes a granted ability, so the
   reachable set only ever grows.
2. **Strict chain.** Each gate requires only the previous lantern's ability;
   gates are built past the margin of every earlier ability combo.
3. **No one-way drops ahead of your abilities.** Any drop must have a return
   path traversable with the abilities held *at that point in the chain*.
4. **Glow decay can't strand you** (KAN-113): running out of glow respawns at
   the last lit lantern, which by chain order is always on the near side of
   the next gate.
5. **Lantern spacing vs glow budget:** worst-case travel time between
   consecutive lanterns must stay under ~70% of a full glow timer.

## Area sketches (for KAN-112 and beyond)

- **Area 1 — Forest Floor** (the vertical slice): flat-ish tutorial run,
  L1 lit within the first screen, L2 behind simple 2–3 tile platforming.
  A visible-but-unreachable 5-tile ledge teases Area 2.
- **Area 2 — Mossy Hollows:** vertical hop-up terrain showcasing double
  jump; ends at a wide chasm with L3 on a pedestal before it.
- **Area 3 — Rootspire:** a great hollow tree. Dash gap at the entrance,
  wall-cling shaft to the summit where L5 (Crown) ends the game.
