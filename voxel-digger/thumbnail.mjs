// How Voxel Digger wants to be photographed (#124).
//
// Part-dug, because an untouched block is a grey cube and says nothing about
// the game. The digs are driven through `dig` at real screen points rather
// than by reaching into the grid, so the shot is a state a player can reach —
// and the pit in it is the shape a tap actually makes.
export const viewport = { width: 900, height: 690 }

export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    // Look straight down first: a narrow shaft is only diggable from an angle
    // that can see its floor, which is the same thing a player discovers.
    g.orbit(0, 1.42 - g.view().pitch)
    await new Promise((r) => requestAnimationFrame(r))
    // One tap a layer: a tap takes the 3×3 patch around the cube (#151).
    for (let pass = 0; pass < 5; pass++) g.dig(0.5, 0.5)
    // Then only a little off vertical, and closer. Tip much further and the
    // pit's own walls hide its floor, which leaves a card showing a plain
    // brown cube — true to the game's first ten seconds and useless as a card.
    g.orbit(0.3, -0.32)
    g.zoom(0.62)
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
  })
}
