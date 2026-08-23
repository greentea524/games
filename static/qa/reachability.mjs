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
const gatedByWorld = []
const d = await Driver.launch()

/**
 * Everything captured per (map, world), so a map with two worlds can be judged
 * as one place rather than as two unrelated ones. #76 made that necessary: a
 * corruption patch is solid in the normal world and open in the static one, so
 * the ground behind it is genuinely unreachable on one side and genuinely fine.
 */
const byMap = new Map()

const flood = (grid, seeds, open = new Set()) => {
  const H = grid.length
  const W = grid[0].length
  const seen = new Set()
  const q = []
  for (const [x, y] of seeds) {
    if (grid[y]?.[x] !== 1 && !open.has(`${x},${y}`)) continue
    seen.add(`${x},${y}`)
    q.push([x, y])
  }
  while (q.length) {
    const [x, y] = q.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      const k = `${nx},${ny}`
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k)) continue
      if (grid[ny][nx] !== 1 && !open.has(k)) continue
      seen.add(k)
      q.push([nx, ny])
    }
  }
  return seen
}

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

  if (!byMap.has(mapKey)) byMap.set(mapKey, {})
  byMap.get(mapKey)[world] = { grid, seen, scene, start: [tx, ty] }

  // 1. No walkable tile may be stranded. A pocket the player cannot enter is
  //    either dead content or, if a beat lives in it, a softlock.
  //
  //    One exception, and it is deliberately narrow (#76): ground sealed by a
  //    *corruption patch* is meant to be unreachable on one side. The scene
  //    names those tiles in `worldGates`, so this asks "would the flood reach
  //    it if the patches were open?" rather than waving through every orphan.
  //
  //    Scoping it to the mechanism rather than to the map matters. A blanket
  //    "reachable in either world is fine" rule would let #96 back in: the
  //    Baker's body sealed twenty tiles of the *static* town that the normal
  //    town reaches perfectly well, and the narration written for them was
  //    dead. That still fails here, because the Baker is not a world gate.
  const gateKeys = new Set((scene.worldGates ?? []).map((g) => `${g.tx},${g.ty}`))
  const withGatesOpen = gateKeys.size ? flood(grid, [[tx, ty]], gateKeys) : seen
  const orphans = []
  const gated = []
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const k = `${x},${y}`
      if (grid[y][x] !== 1 || seen.has(k)) continue
      if (withGatesOpen.has(k)) gated.push(`(${x},${y})`)
      else orphans.push(`(${x},${y})`)
    }
  }
  if (orphans.length) {
    problems.push(`${orphans.length} walkable tile(s) cut off: ${orphans.join(' ')}`)
  }
  if (gated.length) gatedByWorld.push({ label, mapKey, world, tiles: gated })

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

// --- what the toggle is for (#76) -------------------------------------------
//
// A corruption patch is supposed to *gate* ground, not delete it. Two things
// have to hold for that, and neither is visible from one world at a time:
//
//   - every tile sealed on one side is reachable on the other, or the patch
//     has quietly walled off content nobody can ever see;
//   - every door is reachable in both worlds, because crossing over means
//     walking to the TV in the house, and a player sealed away from a door is
//     sealed away from the only way back.
//
// The second is the one that keeps a world-gated pocket from being a
// softlock, and it is worth stating even though the town passes it today.
if (gatedByWorld.length) console.log('\n--- world-gated ground ---')
for (const g of gatedByWorld) {
  const other = g.world === 'normal' ? 'static' : 'normal'
  const pair = byMap.get(g.mapKey)?.[other]
  if (!pair) {
    failures.push({
      label: g.label,
      problems: [`${g.tiles.length} tile(s) are sealed here and ${other} is never checked`],
      grid: byMap.get(g.mapKey)[g.world].grid,
      seen: byMap.get(g.mapKey)[g.world].seen,
      scene: byMap.get(g.mapKey)[g.world].scene,
    })
    console.log(`FAIL  ${g.label}  sealed ground, but '${other}' is not in MAPS`)
    continue
  }
  const missed = g.tiles.filter((t) => {
    const [x, y] = t.slice(1, -1).split(',')
    return !pair.seen.has(`${x},${y}`)
  })
  if (missed.length) {
    failures.push({
      label: g.label,
      problems: [`${missed.length} tile(s) sealed here and unreachable in ${other} too: ${missed.join(' ')}`],
      grid: pair.grid,
      seen: pair.seen,
      scene: pair.scene,
    })
    console.log(`FAIL  ${g.label}  ${missed.length} tile(s) sealed in both worlds: ${missed.join(' ')}`)
  } else {
    console.log(`ok    ${g.label}  ${g.tiles.length} tile(s) gated behind a patch, open in '${other}'`)
  }
}

for (const [mapKey, worlds] of byMap) {
  if (!worlds.normal || !worlds.static) continue
  for (const world of ['normal', 'static']) {
    const { seen, grid, scene } = worlds[world]
    const unreachable = scene.doors.filter(
      (door) =>
        !seen.has(`${door.tx},${door.ty}`) &&
        !Driver.approaches(grid, door.tx, door.ty).some(([x, y]) => seen.has(`${x},${y}`)),
    )
    if (unreachable.length) {
      failures.push({
        label: `${mapKey} / ${world}`,
        problems: [
          `door(s) ${unreachable.map((x) => x.target).join(', ')} unreachable — ` +
            'with no way out there is no way back to the TV, so the world cannot be changed',
        ],
        grid,
        seen,
        scene,
      })
      console.log(`FAIL  ${mapKey} / ${world}  no way back to a door`)
    }
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
