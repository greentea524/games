// Pixel sampling shared by the contrast suite (#106).
//
// Everything here runs inside the page, because these textures are generated
// at run time through canvas — there is no file on disk to inspect.

/** Manhattan distance in RGB below which two tones read as the same shade. */
export const SAME_TONE = 24

/**
 * A tone this far from the surface in RGB manhattan distance is a real tonal
 * step rather than one notch along the ramp. PAL.light against PAL.lightest is
 * 32 apart — visible on paper, and not enough to carry a sprite's shape.
 */
export const STRONG_TONE = 120

/**
 * How many strongly-contrasting pixels a sprite needs to be findable.
 *
 * Counting *any* differing pixel does not work, and the first version of this
 * check made that mistake: Pocket Dungeon's archer scored 29% and reads fine,
 * while Cart & Crate's known-broken lit pad scored 38% and was invisible. The
 * archer's differing pixels are two whole tones away; the pad's were one notch.
 * Magnitude is what separates them, not count.
 *
 * Calibrated against every DMG sprite in the four games. Known bad, all
 * confirmed invisible by eye:
 *
 *   static  prop_flower_dmg      0px   (drawn entirely in the grass tone)
 *   static  item_dmg_ren_key     4px
 *   pd      item_scroll_dmg      4px   (only its 2x2 shine showed)
 *   pd      item_rewind_dmg      4px
 *   cc      target_lit_dmg       0px   as shipped before #62
 *
 * Known good, all confirmed readable by eye:
 *
 *   static  npc_dmg_baker_down  14px
 *   pd      item_accessory_dmg  18px
 *   pd      archer_dmg          23px
 *   cc      ice_dmg             25px
 *   pd      hero_dmg_down      124px
 *
 * 12 sits in the gap, three times the worst failure and comfortably under the
 * weakest sprite that actually reads.
 */
export const MIN_STRONG_PIXELS = 12

/**
 * Upper bound on how much a *backdrop* sprite may resemble the platform tile
 * (#52). Background scenery that reads like a solid platform is the defect,
 * so here a high score fails.
 */
export const MAX_BACKDROP_MATCH = 0.6

/**
 * Floor *variants* — ice, cracked ground, a rug — are mostly the floor tone on
 * purpose. Demanding they differ from it would be demanding they stop being
 * floor. What they must do instead is carry enough distinct pixels to be told
 * apart from the plain tile at a glance.
 *
 * Measured: cart-crate's ice sits at 10% of its pixels and cracked at 12%,
 * both clearly readable; a tile with no mark at all scores 0.
 */
export const MIN_VARIANT_MARK = 0.05
/** …and enough of them in absolute terms that a stray pixel does not pass. */
export const MIN_VARIANT_PIXELS = 12

/** Injected into the page; returns {differs, lit} for one sprite/surface pair. */
export const PAGE_HELPERS = `
  window.__contrast = {
    pixels(key, frame, rect) {
      const tex = window.__game.textures.get(key)
      const src = tex.getSourceImage()
      // Tilesets fed to a Phaser tilemap register no frames — the map indexes
      // the image directly — so a rect is the only way to reach one tile of
      // Static's strip. Sampling the whole strip instead gives the dominant
      // tone across every tile, which is not the ground anything stands on.
      const f = frame == null ? null : tex.frames[String(frame)]
      const sx = rect ? rect[0] : f ? f.cutX : 0
      const sy = rect ? rect[1] : f ? f.cutY : 0
      const w = rect ? rect[2] : f ? f.cutWidth : src.width
      const h = rect ? rect[3] : f ? f.cutHeight : src.height
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      ctx.drawImage(src, sx, sy, w, h, 0, 0, w, h)
      return ctx.getImageData(0, 0, w, h).data
    },
    /** The dominant opaque tone of a surface — its most common pixel. */
    surfaceTone(key, frame, rect) {
      const d = window.__contrast.pixels(key, frame, rect)
      const counts = new Map()
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue
        const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      let best = 0, bestN = -1
      for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n }
      return [(best >> 16) & 255, (best >> 8) & 255, best & 255]
    },
    /**
     * How a sprite stands out from \`tone\`.
     *
     * \`differs\` counts pixels that are any different at all; \`strong\` counts
     * pixels a whole tonal step away. The second is what matters — see the
     * calibration note in this file.
     */
    share(key, tone, threshold, strongThreshold) {
      const d = window.__contrast.pixels(key, null, null)
      let lit = 0, differs = 0, strong = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue
        lit++
        const dist = Math.abs(d[i] - tone[0]) + Math.abs(d[i + 1] - tone[1]) + Math.abs(d[i + 2] - tone[2])
        if (dist > threshold) differs++
        if (dist > strongThreshold) strong++
      }
      return { lit, differs, strong, share: lit ? differs / lit : 0 }
    },
  }
`
