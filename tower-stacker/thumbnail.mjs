// How Tower Stacker wants to be photographed (#124).
//
// Its title screen is a card and a decorative tower, which says nothing about
// the verb. What the thumbnail should show is a tower part-built with visible
// ledges and the next slab still sliding — so the drop is legible as the thing
// you do. Driven through `window.__game`, which `?qa=1` publishes.
export async function pose(page) {
  await page.evaluate(async () => {
    const g = window.__game
    g.press() // title -> run

    /** Drops on the frame the block is closest to centre, within `want`. */
    const dropWithin = (want) =>
      new Promise((resolve) => {
        let last = Infinity
        const tick = () => {
          const m = g.moving()
          if (!m) return resolve()
          const top = g.stack()[g.stack().length - 1]
          const off = Math.abs(m.x - top.x) + Math.abs(m.z - top.z)
          if (off <= want || off > last + 0.4) {
            g.press()
            return resolve()
          }
          last = off
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })

    // A mix of tight and sloppy drops: the sloppy ones leave the ledges that
    // make the tower read as stacked rather than extruded.
    for (const want of [0.01, 0.16, 0.01, 0.01, 0.13, 0.01, 0.01, 0.1, 0.01, 0.01, 0.01]) {
      await dropWithin(want)
      if (g.screen() !== 'run') break
    }

    // Park the slider off to one side, so the card shows a decision pending.
    await new Promise((resolve) => {
      const tick = () => {
        const m = g.moving()
        if (!m) return resolve()
        const top = g.stack()[g.stack().length - 1]
        const off = m.x - top.x + (m.z - top.z)
        if (off > 0.55 && off < 0.75) return resolve()
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  })
}
