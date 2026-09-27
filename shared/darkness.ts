// The darkness overlay's arithmetic, apart from its Phaser (#139).
//
// `shared/lighting.ts` draws a screen-sized opaque overlay and erases a circle
// at each light. Two pieces of that are pure numbers, and they are the two where
// a mistake is *invisible* — which is why they are here, where a check can reach
// them without a browser.
//
// Phaser touches `window` when it is imported, so a module importing it cannot
// run under `tsx` at all. `tower-stacker/framing.ts` was split off from its game
// for the same reason in #119.

/**
 * The integer radius a brush is cached under.
 *
 * Rounded because sub-pixel light size means nothing at 160x144, and — the part
 * that matters — because without it a smoothly shrinking radius mints a texture
 * per frame. Floored at 1 so a positive-but-tiny radius still draws something
 * rather than a zero-size texture Phaser will not generate.
 *
 * Pure, and exported, so `darkness_test.ts` can check both properties without a
 * browser (#139).
 */
export function brushRadius(radius: number): number {
  return Math.max(1, Math.round(radius))
}

/**
 * Whether a light's circle can reach the overlay at all.
 *
 * `x`/`y` are the light's centre in *screen* space — world position less the
 * camera scroll — and `r` its integer radius. The circle spans
 * `[x - r, x + r]` by `[y - r, y + r]`, so it misses the overlay entirely when
 * that box is wholly off one side.
 *
 * Culling here is cheap and matters for a floor that lights every torch at
 * once. It is also the one place in this file where a wrong sign or a dropped
 * `r` produces the failure mode nobody notices: a light that *should* be on
 * screen gets skipped, and the room simply stays dark there. Nothing throws and
 * nothing looks obviously broken — it reads as level design.
 *
 * Pure for the same reason as `brushRadius`, and checked in `darkness_test.ts`.
 */
export function reachesScreen(
  x: number,
  y: number,
  r: number,
  width: number,
  height: number,
): boolean {
  return !(x + r < 0 || y + r < 0 || x - r > width || y - r > height)
}
