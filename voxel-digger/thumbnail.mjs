// How Voxel Digger wants to be photographed (#124).
//
// Part-dug, because an untouched block is a brown cube and says nothing about
// the game. The digs are driven through `dig` at real screen points rather
// than by reaching into the grid, so the shot is a state a player can reach:
// one drill down from the top and one in from the side (#152), with what they
// uncovered glowing through the rock between them.
export const viewport = { width: 900, height: 690 }

export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    const look = (yaw, pitch) => {
      const v = g.view()
      g.orbit(yaw - v.yaw, pitch - v.pitch)
    }
    // Taps the middle cube of whichever face is toward the camera. Found by
    // sweeping `probe` rather than assumed to be mid-screen: the picture is
    // lifted clear of the HUD, so the block's centre is not the screen's.
    const SIZE = 13
    const MID = 6
    const tapCube = (x, y, z) => {
      const cell = (x * SIZE + y) * SIZE + z
      for (let ny = 0.05; ny < 0.95; ny += 0.005) {
        for (let nx = 0.05; nx < 0.95; nx += 0.005) {
          if (g.probe(nx, ny)?.cell === cell) return g.dig(nx, ny)
        }
      }
      return null
    }
    // Straight down, then square on to one side: a drill goes in through the
    // face that is tapped.
    look(0, 1.42)
    tapCube(MID, SIZE - 1, MID)
    look(Math.PI / 2, 0.02)
    tapCube(SIZE - 1, MID - 1, MID)
    // Then the angle the game opens at.
    look(0.7, 0.62)
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
  })
}
