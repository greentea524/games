const fs = require('fs')

// We need to parse levels.ts. A simple regex can extract the levels.
const levelsFile = fs.readFileSync('levels.ts', 'utf8')
const startMarker = 'export const CAMPAIGN_LEVELS: LevelConfig[] = '
const startIndex = levelsFile.indexOf(startMarker) + startMarker.length
const levelsStr = levelsFile.substring(startIndex)
const CAMPAIGN_LEVELS = JSON.parse(levelsStr)

function solveLevel(levelConfig) {
  const grid = levelConfig.grid.map(row => row.split(''))
  const W = grid[0].length
  const H = grid.length

  let startPx, startPy
  let startCrates = []
  let targets = []

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = grid[y][x]
      if (ch === 'P') { startPx = x; startPy = y; grid[y][x] = '.' }
      if (ch === 'C') { startCrates.push({x, y}); grid[y][x] = '.' }
      if (ch === 'T') { targets.push({x, y}); grid[y][x] = '.' }
    }
  }

  // State: px,py,cx1,cy1,cx2,cy2... sorted crate coords
  function getState(px, py, crates) {
    const cStr = crates.map(c => c.x + "," + c.y).sort().join('|')
    return px + "," + py + "|" + cStr
  }

  const startState = getState(startPx, startPy, startCrates)
  const visited = new Set([startState])
  const queue = [{ px: startPx, py: startPy, crates: startCrates, moves: 0 }]

  const MAX_MOVES = 200
  const DIRS = [
    {dx: 0, dy: -1},
    {dx: 0, dy: 1},
    {dx: -1, dy: 0},
    {dx: 1, dy: 0}
  ]

  let iters = 0
  while (queue.length > 0) {
    iters++
    if (iters > 100000) return 'timeout' // Limit state exploration

    const { px, py, crates, moves } = queue.shift()

    // Check win
    let allOnTarget = true
    for (const target of targets) {
      if (!crates.find(c => c.x === target.x && c.y === target.y)) {
        allOnTarget = false
        break
      }
    }
    if (allOnTarget) return moves

    if (moves >= MAX_MOVES) continue

    for (const {dx, dy} of DIRS) {
      let nx = px + dx
      let ny = py + dy

      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
      
      const char = grid[ny][nx]
      if (char === '#' || char === 'O') continue

      const crateIdx = crates.findIndex(c => c.x === nx && c.y === ny)
      if (crateIdx !== -1) {
        // Push crate
        let pushX = nx + dx
        let pushY = ny + dy
        if (pushX < 0 || pushX >= W || pushY < 0 || pushY >= H) continue
        
        let pushChar = grid[pushY][pushX]
        if (pushChar === '#' || pushChar === 'O') continue

        // Ice sliding for crate
        let finalCrateX = pushX
        let finalCrateY = pushY
        let hitObstacle = false
        while (pushChar === 'I') {
          const nnx = finalCrateX + dx
          const nny = finalCrateY + dy
          if (nnx < 0 || nnx >= W || nny < 0 || nny >= H) { hitObstacle = true; break }
          const nnChar = grid[nny][nnx]
          if (nnChar === '#' || nnChar === 'O' || crates.find(c => c.x === nnx && c.y === nny)) {
            hitObstacle = true; break
          }
          finalCrateX = nnx
          finalCrateY = nny
          pushChar = nnChar
        }

        if (crates.find(c => c.x === pushX && c.y === pushY)) continue // cannot push into another crate immediately

        // Apply slide for player (if sliding was triggered, player slides too up to the original crate push start, wait no, player doesn't slide if pushing crate. In BoardScene, player slides AFTER if standing on ice!)
        // Wait, the logic in BoardScene:
        let finalPx = nx
        let finalPy = ny
        while (grid[finalPy][finalPx] === 'I') {
          const nnx = finalPx + dx
          const nny = finalPy + dy
          if (nnx < 0 || nnx >= W || nny < 0 || nny >= H) break
          if (nnx === finalCrateX && nny === finalCrateY) break
          const nnChar = grid[nny][nnx]
          if (nnChar === '#' || nnChar === 'O') break
          finalPx = nnx
          finalPy = nny
        }

        const newCrates = crates.map((c, i) => i === crateIdx ? {x: finalCrateX, y: finalCrateY} : {x: c.x, y: c.y})
        const state = getState(finalPx, finalPy, newCrates)
        if (!visited.has(state)) {
          visited.add(state)
          queue.push({ px: finalPx, py: finalPy, crates: newCrates, moves: moves + 1 })
        }
      } else {
        // Move player
        let finalPx = nx
        let finalPy = ny
        while (grid[finalPy][finalPx] === 'I') {
          const nnx = finalPx + dx
          const nny = finalPy + dy
          if (nnx < 0 || nnx >= W || nny < 0 || nny >= H) break
          const nnChar = grid[nny][nnx]
          if (nnChar === '#' || nnChar === 'O' || crates.find(c => c.x === nnx && c.y === nny)) break
          finalPx = nnx
          finalPy = nny
        }

        const state = getState(finalPx, finalPy, crates)
        if (!visited.has(state)) {
          visited.add(state)
          queue.push({ px: finalPx, py: finalPy, crates: [...crates], moves: moves + 1 })
        }
      }
    }
  }
  return 'unsolvable'
}

for (let i = 9; i < CAMPAIGN_LEVELS.length; i++) {
  const lvl = CAMPAIGN_LEVELS[i]
  const res = solveLevel(lvl)
  console.log("Level " + lvl.id + " (" + lvl.title + "): " + res)
}
