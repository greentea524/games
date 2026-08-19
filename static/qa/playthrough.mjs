// Plays Static from a fresh save to the ending, asserting each story beat.
//
// This is the slow half of the QA (a couple of minutes). It exists because the
// flag graph is the part of this game most likely to break quietly: a beat can
// stop firing, or an item can stop transforming, without anything throwing.
//
// Two rules it enforces that are easy to regress:
//
//   - a beat must fire where the player is standing, not on the next map entry
//     (#95). `waitForBeat` fails rather than working around it.
//   - nothing is forced. Every flag below is set by the game, in response to
//     real input, so a blocker here is a blocker for a player.
import { Driver } from './harness.mjs'

const d = await Driver.launch()
const results = []
const blockers = []
let halted = false

const step = async (label, fn, { fatal = true } = {}) => {
  if (halted) {
    results.push(['skip', label, 'an earlier step blocked'])
    return
  }
  try {
    const note = await fn()
    results.push(['ok', label, note ?? ''])
    console.log(`  ok    ${label}${note ? ' — ' + note : ''}`)
  } catch (e) {
    const scene = await d.scene().catch(() => ({}))
    const save = await d.save().catch(() => ({}))
    results.push(['FAIL', label, e.message])
    blockers.push({ label, error: e.message, scene, save })
    console.log(`  FAIL  ${label}\n          ${e.message}`)
    console.log(`          at ${JSON.stringify(scene)}`)
    console.log(`          save ${JSON.stringify(save)}`)
    await d.shot(`fail-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch(() => {})
    if (fatal) halted = true
  }
}

const need = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const flag = async (f) => (await d.save())?.flags?.[f] === true
const items = async () => (await d.save())?.inventory ?? []
const here = async () => (await d.scene()).mapKey

const goThroughDoor = async (tx, ty, expect) => {
  await d.walkTo(tx, ty)
  await d.page.waitForTimeout(1400)
  need(
    (await here()) === expect,
    `door at (${tx},${ty}) did not lead to ${expect}, got ${await here()}`,
  )
}

const talkTo = async (tx, ty, { choice = 0 } = {}) => {
  if ((await d.scene()).dialogue) await d.readDialogue() // clear a pending narration
  const speaker = await d.interactWith(tx, ty)
  need(speaker, `nothing to talk to at (${tx},${ty})`)
  const lines = await d.readDialogue({ choice })
  return { speaker, lines }
}

/** NPC positions are load-bearing and have moved before — never hardcode them. */
const npcAt = async (id) => {
  const n = (await d.scene()).npcs.find((x) => x.id === id)
  need(n, `npc '${id}' is not on the map`)
  return n
}

/**
 * A story beat must land where the player is standing.
 *
 * Beats used to be evaluated only when a map was built, so one whose trigger
 * flag was set on the map it belongs to was never seen until the player
 * happened to walk through a door — five of them in one playthrough (#95).
 * Waiting here and failing is the regression test for that.
 */
const waitForBeat = async (flagName) => {
  need(
    await d.waitForFlag(flagName, 6000),
    `'${flagName}' never fired where the player was standing (#95 regression?)`,
  )
  await d.readNarration()
  return 'fired in place'
}

const crossAtTV = async (expectWorld) => {
  await goThroughDoor(6, 8, 'house')
  await d.interactWith(7, 1)
  await d.page.waitForTimeout(1700)
  const sv = await d.save()
  need(sv.world === expectWorld, `world is ${sv.world}, expected ${expectWorld}`)
  return sv
}

console.log('\n=== CHAPTER 1: the hook ===')
await step('a fresh save wakes up at home', async () => {
  await d.boot(null)
  need((await here()) === 'house', 'expected to wake at home')
  return 'chapter 1'
})
await step('the front door leads to town', () => goThroughDoor(5, 8, 'town'))
await step('Mom hands over the flashlight', async () => {
  const { speaker } = await talkTo(9, 8)
  need(speaker === 'MOM', `expected MOM, got ${speaker}`)
  need(await flag('got_flashlight'), 'got_flashlight never set')
  need((await items()).includes('flashlight'), 'flashlight not in inventory')
  return 'got_flashlight'
})
await step("the Baker's house vanishes", () => waitForBeat('baker_vanished'))
await step('Ren reacts to the vanishing', async () => {
  const { speaker } = await talkTo(10, 13)
  need(speaker === 'REN', `expected REN, got ${speaker}`)
  need(await flag('heard_about_house'), 'heard_about_house never set')
  return 'heard_about_house'
})

console.log('\n=== CHAPTER 2: discovery, and the crossover puzzle ===')
await step('Gus hands over the flower', async () => {
  const { speaker } = await talkTo(15, 8)
  need(speaker === 'GUS', `expected GUS, got ${speaker}`)
  need((await items()).includes('flower'), 'flower not in inventory')
  return 'flower + the belief choice'
})
await step('the TV crosses over, and the flower blooms', async () => {
  const sv = await crossAtTV('static')
  need(sv.inventory.includes('flower_fresh'), `flower did not bloom: ${sv.inventory}`)
  need(sv.inventory.includes('flashlight_dead'), `flashlight did not die: ${sv.inventory}`)
  return sv.inventory.join(', ')
})
await step('the Static town is reachable from the house', () => goThroughDoor(5, 8, 'town'))
await step('the frozen Baker takes the flower', async () => {
  const b = await npcAt('baker')
  const { speaker } = await talkTo(b.tx, b.ty)
  need(speaker === 'THE BAKER', `expected THE BAKER, got ${speaker}`)
  need(await flag('flower_delivered'), 'flower_delivered never set')
  need(await flag('seen_baker_static'), 'seen_baker_static never set')
  return `at (${b.tx},${b.ty})`
})
await step('crossing back spawns the photo, ending Chapter 2', async () => {
  const sv = await crossAtTV('normal')
  need(sv.inventory.includes('flashlight'), `flashlight did not recover: ${sv.inventory}`)
  await goThroughDoor(5, 8, 'town')
  await d.walkTo(5, 19)
  need(await d.waitForFlag('thread_flower_done', 4000), 'the photo pickup never fired at (5,19)')
  need(await flag('chapter2_done'), 'chapter2_done never set')
  return 'photo collected'
})

console.log('\n=== CHAPTER 3: the pattern ===')
await step('the Chapter 3 hook fires', () => waitForBeat('ch3_hint_shown'))
await step("Gus's hut vanishes", () => waitForBeat('gus_hut_vanished'))
await step('the frozen Baker is examinable on the Static side', async () => {
  await crossAtTV('static')
  await goThroughDoor(5, 8, 'town')
  const b = await npcAt('baker')
  const { speaker } = await talkTo(b.tx, b.ty)
  need(await flag('seen_baker_static'), 'seen_baker_static never set')
  return `${speaker} at (${b.tx},${b.ty})`
})
await step('the frozen Gus is examinable on the Static side', async () => {
  const gus = await npcAt('gus_static')
  const grid = await d.grid()
  const spots = Driver.approaches(grid, gus.tx, gus.ty)
  need(
    spots.length > 0,
    `every tile beside the frozen Gus at (${gus.tx},${gus.ty}) is blocked — ` +
      'seen_gus_static can never be set, which makes the game unfinishable (#93 regression?)',
  )
  const { speaker } = await talkTo(gus.tx, gus.ty)
  need(await flag('seen_gus_static'), 'seen_gus_static never set')
  return `${speaker} at (${gus.tx},${gus.ty}), ${spots.length} approach(es)`
})
await step('the pattern clicks', () => waitForBeat('ch3_done'))
await step('the beacon appears without leaving the map', async () => {
  const scene = await d.scene()
  need(
    scene.interactables.some((i) => i.tx === 19 && i.ty === 18),
    'the beacon is not on the map — it waits for a rebuild the player is never told to trigger',
  )
  return 'placed in place'
})

console.log('\n=== CHAPTER 4: the race ===')
await step('Ren hands over the key', async () => {
  await crossAtTV('normal')
  await goThroughDoor(5, 8, 'town')
  const { speaker } = await talkTo(10, 13)
  need(speaker === 'REN', `expected REN, got ${speaker}`)
  need((await items()).includes('ren_key'), 'ren_key not in inventory')
  return 'ren_key'
})
await step('the race narration fires on returning to town', () => waitForBeat('race_started'))
await step('the beacon is examinable on the Static side', async () => {
  await crossAtTV('static')
  await goThroughDoor(5, 8, 'town')
  const { speaker } = await talkTo(19, 18)
  need(speaker === 'STATIC BEACON', `expected STATIC BEACON, got ${speaker}`)
  need(await flag('beacon_found'), 'beacon_found never set')
  return 'beacon_found'
})
await step("anchoring Ren's door ends Chapter 4", async () => {
  await crossAtTV('normal')
  await goThroughDoor(5, 8, 'town')
  const { speaker } = await talkTo(19, 18)
  need(speaker === "REN'S DOOR", `expected REN'S DOOR, got ${speaker}`)
  need(await flag('ch4_done'), 'ch4_done never set')
  need(!(await items()).includes('ren_key'), 'ren_key should be spent by the anchoring')
  return 'ch4_done'
})

console.log('\n=== CHAPTER 5: the finale ===')
await step('the calling points home', () => waitForBeat('ch5_started'))
await step('the TV opens the core', async () => {
  await goThroughDoor(6, 8, 'house')
  await d.interactWith(7, 1)
  await d.page.waitForTimeout(1900)
  need((await here()) === 'core', `expected core, got ${await here()}`)
  return 'core'
})
await step('the entity offers a choice, and the ending plays', async () => {
  const speaker = await d.interactWith(5, 2)
  need(speaker === 'THE STATIC', `expected THE STATIC, got ${speaker}`)
  await d.readDialogue({ choice: 0 }) // Stay with it
  need(await flag('ending_empathy'), 'ending_empathy never set')
  need(await d.waitForFlag('game_ended', 5000), 'the ending never played')
  return 'empathy ending'
})

// The Signal Shard's alternate anchoring (#75), checked from a save rather
// than by replaying four chapters. The scripted run above never crosses to
// fetch the shard, which is the point: the plain branch has to stay the
// critical path, and this asserts the optional one without displacing it.
console.log('\n=== the Signal Shard anchoring ===')
await step('carrying the shard changes how Ren\'s door is anchored', async () => {
  const sv = await d.save()
  // The save this borrows from is a finished run, so the later flags have to
  // come off too or the Chapter 5 beats fire the moment ch4_done is re-set.
  for (const f of ['ch4_done', 'prevented_vanishing', 'ch5_started', 'ending_empathy',
                   'ending_severance', 'game_ended']) {
    delete sv.flags[f]
  }
  sv.flags.beacon_found = true
  sv.inventory = ['ren_key', 'signal_shard']
  await d.boot({ ...sv, mapKey: 'town', tx: 19, ty: 19, world: 'normal' })
  const { speaker, lines } = await talkTo(19, 18)
  need(speaker === "REN'S DOOR", `expected REN'S DOOR, got ${speaker}`)
  need(
    lines.some((l) => /shard/i.test(l)),
    `the shard branch never fired: ${JSON.stringify(lines).slice(0, 120)}`,
  )
  need(await flag('ch4_done'), 'ch4_done never set by the shard branch')
  const left = await items()
  need(!left.includes('ren_key'), 'ren_key should still be spent')
  need(!left.includes('signal_shard'), 'the shard should be spent too')
  return 'ch4_done, both items spent'
})

// The other ending is a branch of one line, so it is checked from a save at
// the entity rather than by replaying five chapters.
console.log('\n=== the other ending ===')
await step('the severance ending is also reachable', async () => {
  const sv = await d.save()
  delete sv.flags.game_ended
  delete sv.flags.ending_empathy
  await d.boot({ ...sv, mapKey: 'core', tx: 5, ty: 8, world: 'static' })
  need(await d.interactWith(5, 2), 'the entity is not there')
  await d.readDialogue({ choice: 1 }) // End the signal
  need(await flag('ending_severance'), 'ending_severance never set')
  need(await d.waitForFlag('game_ended', 5000), 'the ending never played')
  return 'severance ending'
})

console.log('\n=== RESULT ===')
for (const [status, label, note] of results) {
  console.log(`${status.padEnd(5)} ${label}${note ? ' — ' + note : ''}`)
}

const errors = d.log
if (errors.length) console.log('\npage errors:', JSON.stringify(errors, null, 1))
await d.close()

console.log(
  blockers.length ? `\n${blockers.length} blocker(s)` : '\nno blockers — the game is finishable',
)
process.exit(blockers.length || errors.length ? 1 : 0)
