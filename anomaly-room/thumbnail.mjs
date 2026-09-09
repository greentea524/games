// How the Anomaly Room wants to be photographed (#124).
//
// Turned toward the corner where most of the furniture is, and pitched down a
// little, because a card showing a blank wall says nothing at all. The head is
// set through `turn` rather than by reaching into the camera, so the shot is a
// view the player can actually get to.
export const viewport = { width: 900, height: 690 }

export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    // Face the crate, chair and table in the north-west of the room.
    g.turn(-0.45, 0.12)
    // Two frames, so the render and the shadow map both catch up.
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
  })
}
