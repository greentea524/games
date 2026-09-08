// How Minigolf wants to be photographed (#124).
//
// The third hole, because it is the one with a ramp and the slope is what the
// game is about. Aim is set and held at most of full power so the shaft is in
// frame — a card showing a ball sitting on a green says nothing about the verb.
export const viewport = { width: 900, height: 690 }

export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    g.goTo(2) // Rise
    await new Promise((r) => setTimeout(r, 200))
    // Wait for the ball to settle on the tee before aiming, or the aim
    // indicator is suppressed because a stroke is not yet available.
    const start = performance.now()
    while (!g.canPutt() && performance.now() - start < 4000) {
      await new Promise((r) => requestAnimationFrame(r))
    }
    g.setAim(0.12, -1, 0.72)
    await new Promise((r) => requestAnimationFrame(r))
  })
}
