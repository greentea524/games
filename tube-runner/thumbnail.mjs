// How Tube Runner wants to be photographed (#124, #120).
//
// The card should show the runner on the wall with rings receding ahead — the
// depth is the game, and a title screen has none of it.
//
// The stopping point is the part that needed redoing after the move to a
// full-resolution canvas. The old pose flew for five seconds and stopped
// wherever it happened to be, which on a 160x144 frame was usually fine and on
// a wide one is usually a single ring filling the whole card. So it now flies
// until the nearest ring is a chosen distance away, and stops with the player
// deliberately off the gap: a gap already solved is not a game.
//
// The distance is close rather than far. Further out the card is all tube and
// the runner — who is the whole reason the camera is where it is — sits below
// the frame; at about five units the nearest ring wraps the edges, the ones
// behind it recede into the fog, and the runner is on the wall between them.
export const viewport = { width: 900, height: 690 }

export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    g.press()
    const delta = (a, b) => {
      let d = (b - a) % (Math.PI * 2)
      if (d > Math.PI) d -= Math.PI * 2
      if (d <= -Math.PI) d += Math.PI * 2
      return d
    }

    // Fly cleanly, so the pool has rings at several distances behind and ahead.
    const started = performance.now()
    while (g.screen() === 'run' && performance.now() - started < 3000) {
      await new Promise((r) => requestAnimationFrame(r))
      const gap = g.nextGapAngle()
      if (gap === null) continue
      const d = delta(g.angle(), gap)
      g.steer(Math.abs(d) < 0.06 ? 0 : d > 0 ? 1 : -1)
    }

    // Then hold a turn until the nearest ring sits far enough ahead to leave
    // room for the ones behind it, and the runner is mid-correction.
    g.steer(1)
    const deadline = performance.now() + 4000
    while (g.screen() === 'run' && performance.now() < deadline) {
      await new Promise((r) => requestAnimationFrame(r))
      const distance = g.nextGapDistance()
      const gap = g.nextGapAngle()
      if (distance === null || gap === null) continue
      if (distance > 4.5 && distance < 6.5 && Math.abs(delta(g.angle(), gap)) > 0.5) break
    }
    g.steer(0)
    await new Promise((r) => requestAnimationFrame(r))
  })
}
