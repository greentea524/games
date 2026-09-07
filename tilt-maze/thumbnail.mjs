// How Tilt Maze wants to be photographed (#124).
//
// Not level one: a board with nothing to avoid says nothing about the game.
// "Sieve" is the one that reads as a maze at a glance — a field of holes with
// a lattice through it — and the ball is nudged off the start so the board is
// caught mid-lean rather than sitting flat.
/**
 * Landscape, close to the card's own shape.
 *
 * The default portrait window suits the GameBoy pages, whose console is sized
 * from the available height. This game fills whatever it is given, so a
 * portrait capture would be cropped to ribbons on the way to a 4:3 card.
 */
export const viewport = { width: 900, height: 690 }

export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    g.goTo(4) // Sieve
    await new Promise((r) => setTimeout(r, 150))
    // Lean into the board and hold, so the tilt is visible in the frame. The
    // ball travels a little way, which also puts it clear of the start cell.
    g.steer(0.75, -0.35)
    const started = performance.now()
    while (performance.now() - started < 900) {
      await new Promise((r) => requestAnimationFrame(r))
    }
  })
}
