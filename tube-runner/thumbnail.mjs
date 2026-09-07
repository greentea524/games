// How Tube Runner wants to be photographed (#124).
//
// The card should show the runner on the wall with rings receding ahead — the
// depth is the game, and a title screen has none of it. Flown cleanly for a
// few seconds so the tube has rings at several distances, then left mid-stride
// rather than lined up, because a gap already solved is not a game.
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
    const started = performance.now()
    while (g.screen() === 'run' && performance.now() - started < 5000) {
      await new Promise((r) => requestAnimationFrame(r))
      const gap = g.nextGapAngle()
      if (gap === null) continue
      const d = delta(g.angle(), gap)
      g.steer(Math.abs(d) < 0.06 ? 0 : d > 0 ? 1 : -1)
    }
    g.steer(0)
  })
}
