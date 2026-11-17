// The HUD's bars hold what the game counts, clear of each other and of the
// forest, at the longest values it reaches (#174).
//
//   npx tsx lantern-keeper/hud_test.ts
import { GBC_HEIGHT as H, GBC_WIDTH as W, LEGACY_HEIGHT, LEGACY_WIDTH, PLAY_HEIGHT, PLAY_TOP, VIEW_HEIGHT, VIEW_ZOOM } from './constants'
import { BAR, CHAR, HUD_COLOURS, collision, contrast, lanternText, layout, stageText, type HudValues } from './hud'
import { STAGES } from './stages'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const longest: HudValues = { lit: 99, lanterns: 99, stage: STAGES.length, stages: STAGES.length }
const cases: [string, HudValues][] = [
  ['the longest values', longest],
  ['a first stage', { lit: 0, lanterns: 5, stage: 1, stages: STAGES.length }],
  ['a stage with no lanterns to light', { lit: 0, lanterns: 0, stage: STAGES.length, stages: STAGES.length }],
]
for (const [name, v] of cases) {
  const hit = collision(layout(v, W, H), W, H)
  check(`nothing overlaps or leaves its bar at ${name}`, hit === null, hit ?? 'clean')
}
// The control: the same HUD does not fit the screen it replaced.
const old = collision(layout(longest, LEGACY_WIDTH, LEGACY_HEIGHT), LEGACY_WIDTH, LEGACY_HEIGHT)
check('and the check can fail: it does not fit 160×144', old !== null, old ?? 'it fitted')

const l = layout(longest, W, H)
check('every line of text sits on a whole pixel', [l.lanterns, l.stage, l.oilLabel].every((b) => Number.isInteger(b.x) && Number.isInteger(b.y)))
check('and in the middle of its bar', l.lanterns.y * 2 + CHAR === BAR && (l.oilLabel.y - (H - BAR)) * 2 + CHAR === BAR)
check('the count is on the left and the stage on the right, as the card has them', l.lanterns.x < W / 2 && l.stage.x + l.stage.width > W / 2)
check('the stage reads as the card\'s does', stageText(longest) === `STAGE ${STAGES.length}/${STAGES.length}`)
check('a stage with no lanterns shows no count, not 0/0', lanternText({ lit: 0, lanterns: 0, stage: 1, stages: 7 }) === '')

// --- the forest between the bars
check('the forest is drawn between the bars, not under them', PLAY_TOP === BAR && PLAY_TOP + PLAY_HEIGHT === H - BAR)
check('and the camera sees exactly that much', VIEW_HEIGHT * VIEW_ZOOM === PLAY_HEIGHT, `${VIEW_HEIGHT} units`)
// The keeper's light reaches three tiles each way, and the view is still
// taller than that both ways from the keeper.
check('the view is still more than a light across', VIEW_HEIGHT > 6 * 8, `${VIEW_HEIGHT / 8} tiles`)

// --- read on a phone
const c = HUD_COLOURS
check('the text is readable on the strip', contrast(c.text, c.strip) >= 7, `${contrast(c.text, c.strip).toFixed(1)}:1`)
check('the gauge is told from its empty part, full or low', contrast(c.fill, c.empty) >= 4.5 && contrast(c.low, c.empty) >= 4.5)
check('the strip\'s edge can be seen against it', contrast(c.edge, c.strip) >= 1.8, `${contrast(c.edge, c.strip).toFixed(1)}:1`)
check('and the check can fail: dark green on black is not readable', contrast(0x2d4a33, c.strip) < 4.5)

console.log(failed ? `\n${failed} FAILED` : '\nALL HUD CHECKS PASS')
process.exit(failed ? 1 : 0)
