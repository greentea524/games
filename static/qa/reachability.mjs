// Structural check: on every map, in both worlds, can the player actually get
// to everything?
//
// This is the cheap half of the QA and the half that earns its keep. Two of
// the four bugs the first full pass found were pure reachability:
//
//   #93  the frozen Gus stood on a tile with all four neighbours blocked, so
//        `seen_gus_static` could never be set and the game could not be
//        finished
//   #96  the frozen Baker's own body plugged the single gap into the
//        south-west of the Static town, orphaning 20 tiles and the narration
//        written for the door inside them
//
// Neither is visible in the source. Both fall straight out of a flood fill.
import { Driver } from './harness.mjs'

// Enough flags set to bring out the late-game content — the vanished houses,
// the frozen figures, the beacon — so those get checked too.
const LATE_GAME = {
  got_flashlight: true,
  baker_vanished: true,
  heard_about_house: true,
  gus_flower: true,
  believer: true,
  seen_baker_static: true,
  flower_delivered: true,
  thread_flower_done: true,
  chapter2_done: true,
  ch3_hint_shown: true,
  gus_hut_vanished: true,
}

const MAPS = [
  { mapKey: 'town', world: 'normal', tx: 11, ty: 18 },
  { mapKey: 'town', world: 'static', tx: 11, ty: 18 },
  { mapKey: 'house', world: 'normal', tx: 5, ty: 7 },
  { mapKey: 'house', world: 'static', tx: 5, ty: 7 },
  { mapKey: 'house2', world: 'normal', tx: 5, ty: 7 },
  { mapKey: 'ren_house', world: 'normal', tx: 5, ty: 7 },
  { mapKey: 'bakery', world: 'normal', tx: 5, ty: 7 },
  { mapKey: 'gus_hut', world: 'normal', tx: 5, ty: 7 },
  { mapKey: 'cellar', world: 'normal', tx: 5, ty: 7 },
]

const failures = []
const d = await Driver.launch()

for (const { mapKey, world, tx, ty } of MAPS) {
  const label = `${mapKey} / ${world}`
  await d.boot({
    chapter: 3,
    flags: { ...LATE_GAME },
    inventory: [world === 'static' ? 'flashlight_dead' : 'flashlight', 'photo'],
    world,
    mapKey,
    tx,
    ty,
  })

  const scene = await d.scene()
  const grid = await d.grid()
  const seen = await d.reachable(grid)
  const problems = []

  // 1. No walkable tile may be stranded. A pocket the player cannot enter is
  //    either dead content or, if a beat lives in it, a softlock.
  const orphans = []
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] === 1 && !seen.has(`${x},${y}`)) orphans.push(`(${x},${y})`)
    }
  }
  if (orphans.length) {
    problems.push(`${orphans.length} walkable tile(s) cut off: ${orphans.join(' ')}`)
  }

  // 2. Every NPC must have somewhere to be talked to from. This is #93.
  for (const npc of scene.npcs) {
    const from = Driver.approaches(grid, npc.tx, npc.ty).filter(([x, y]) => seen.has(`${x},${y}`))
    if (!from.length) {
      problems.push(`npc '${npc.id}' at (${npc.tx},${npc.ty}) cannot be stood next to`)
    }
  }

  // 3. Same for interactables — examine points, the TV, the valve, the hatch.
  //    Some sit on floor the player walks onto rather than faces, so standing
  //    on the tile counts too.
  for (const it of scene.interactables) {
    const from = Driver.approaches(grid, it.tx, it.ty).filter(([x, y]) => seen.has(`${x},${y}`))
    const standable = grid[it.ty]?.[it.tx] === 1 && seen.has(`${it.tx},${it.ty}`)
    if (!from.length && !standable) {
      problems.push(`interactable at (${it.tx},${it.ty}) cannot be reached`)
    }
  }

  // 4. Every door has to be walkable into, or the map is a trap.
  for (const door of scene.doors) {
    const ok =
      seen.has(`${door.tx},${door.ty}`) ||
      Driver.approaches(grid, door.tx, door.ty).some(([x, y]) => seen.has(`${x},${y}`))
    if (!ok) problems.push(`door to '${door.target}' at (${door.tx},${door.ty}) cannot be reached`)
  }

  if (problems.length) {
    failures.push({ label, problems, grid, seen, scene })
    console.log(`FAIL  ${label}`)
    for (const p of problems) console.log(`        ${p}`)
  } else {
    console.log(`ok    ${label}  (${seen.size} tiles reachable, ${scene.npcs.length} npc(s))`)
  }
}

if (failures.length) {
  console.log('\n--- maps with problems ---')
  console.log('  . reachable   o walkable but CUT OFF   # solid   N npc   e interactable\n')
  for (const f of failures) {
    const marks = [
      ...f.scene.npcs.map((n) => ({ tx: n.tx, ty: n.ty, char: 'N' })),
      ...f.scene.interactables.map((i) => ({ tx: i.tx, ty: i.ty, char: 'e' })),
    ]
    console.log(`${f.label}:`)
    console.log(Driver.render(f.grid, f.seen, marks))
    console.log()
  }
}

const errors = d.log
if (errors.length) console.log('\npage errors:', JSON.stringify(errors, null, 1))
await d.close()

console.log(
  failures.length
    ? `\n${failures.length} map(s) with reachability problems`
    : `\nall ${MAPS.length} maps clean`,
)
process.exit(failures.length || errors.length ? 1 : 0)
