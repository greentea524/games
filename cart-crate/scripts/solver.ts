import fs from 'fs';
import path from 'path';
import { CAMPAIGN_LEVELS, LevelConfig } from '../levels';

type Coord = { x: number; y: number };

function encodeState(px: number, py: number, crates: Coord[], holes: Coord[], cracked: Coord[]): string {
  const cStr = crates.map(c => `${c.x},${c.y}`).sort().join(';');
  const hStr = holes.map(c => `${c.x},${c.y}`).sort().join(';');
  const xStr = cracked.map(c => `${c.x},${c.y}`).sort().join(';');
  return `${px},${py}|c:${cStr}|h:${hStr}|x:${xStr}`;
}

function solveLevel(level: LevelConfig): string | null {
  const grid = level.grid;
  const height = grid.length;
  const width = grid[0].length;

  let startPX = 0;
  let startPY = 0;
  const startCrates: Coord[] = [];
  const startHoles: Coord[] = [];
  const startCracked: Coord[] = [];
  const walls: Set<string> = new Set();
  const targets: Set<string> = new Set();
  const ice: Set<string> = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const char = grid[y][x];
      if (char === '#') walls.add(`${x},${y}`);
      if (char === 'T' || char === '*' || char === '+') targets.add(`${x},${y}`);
      if (char === 'I') ice.add(`${x},${y}`);
      if (char === 'O') startHoles.push({ x, y });
      if (char === 'X') startCracked.push({ x, y });
      if (char === 'P' || char === '+') {
        startPX = x;
        startPY = y;
      }
      if (char === 'C' || char === '*') {
        startCrates.push({ x, y });
      }
    }
  }

  const numTargets = targets.size;
  const initialKey = encodeState(startPX, startPY, startCrates, startHoles, startCracked);

  const queue: { px: number; py: number; crates: Coord[]; holes: Coord[]; cracked: Coord[]; moves: string }[] = [];
  queue.push({
    px: startPX,
    py: startPY,
    crates: startCrates,
    holes: startHoles,
    cracked: startCracked,
    moves: ''
  });

  const visited = new Set<string>();
  visited.add(initialKey);

  const dirs = [
    { dx: 0, dy: -1, m: 'U' },
    { dx: 0, dy: 1, m: 'D' },
    { dx: -1, dy: 0, m: 'L' },
    { dx: 1, dy: 0, m: 'R' }
  ];

  let iterations = 0;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    iterations++;

    if (iterations > 1000000) {
      console.log(`  Level ${level.id} - BFS aborted (too many iterations)`);
      return null;
    }
    
    if (iterations % 50000 === 0) {
      console.log(`  Level ${level.id} - BFS iterations: ${iterations}, Queue length: ${queue.length}`);
    }

    // Check win
    let docked = 0;
    for (const c of curr.crates) {
      if (targets.has(`${c.x},${c.y}`)) docked++;
    }
    if (docked === numTargets) {
      console.log(`  Level ${level.id} solved in ${curr.moves.length} moves!`);
      return curr.moves;
    }

    for (const { dx, dy, m } of dirs) {
      let nextPX = curr.px + dx;
      let nextPY = curr.py + dy;

      if (nextPX < 0 || nextPX >= width || nextPY < 0 || nextPY >= height) continue;
      
      const nextTileWall = walls.has(`${nextPX},${nextPY}`);
      const nextTileHole = curr.holes.find(h => h.x === nextPX && h.y === nextPY);
      if (nextTileWall || nextTileHole) continue;

      let crateIdx = curr.crates.findIndex(c => c.x === nextPX && c.y === nextPY);
      let crateFell = false;
      let pushTX = -1;
      let pushTY = -1;
      let newCrates = [...curr.crates];
      let newHoles = [...curr.holes];
      let newCracked = [...curr.cracked];

      if (crateIdx !== -1) {
        pushTX = nextPX + dx;
        pushTY = nextPY + dy;

        if (pushTX < 0 || pushTX >= width || pushTY < 0 || pushTY >= height) continue;
        if (walls.has(`${pushTX},${pushTY}`)) continue;

        let pushTileIsIce = ice.has(`${pushTX},${pushTY}`);
        
        while (pushTileIsIce) {
          const slideTX = pushTX + dx;
          const slideTY = pushTY + dy;
          if (slideTX < 0 || slideTX >= width || slideTY < 0 || slideTY >= height) break;
          
          const isWall = walls.has(`${slideTX},${slideTY}`);
          const isCrate = curr.crates.some((c, i) => i !== crateIdx && c.x === slideTX && c.y === slideTY);
          if (isWall || isCrate) break;

          pushTX = slideTX;
          pushTY = slideTY;
          const isHole = curr.holes.find(h => h.x === slideTX && h.y === slideTY);
          if (isHole) break;
          pushTileIsIce = ice.has(`${pushTX},${pushTY}`);
        }

        const crateAtPush = curr.crates.find((c, i) => i !== crateIdx && c.x === pushTX && c.y === pushTY);
        if (crateAtPush) continue;

        const holeIdx = curr.holes.findIndex(h => h.x === pushTX && h.y === pushTY);
        if (holeIdx !== -1) {
          crateFell = true;
          newHoles.splice(holeIdx, 1);
          newCrates.splice(crateIdx, 1);
        } else {
          newCrates[crateIdx] = { x: pushTX, y: pushTY };
        }
      }

      if (newCrates.length < numTargets) {
        // Unwinnable state
        continue;
      }

      let isIce = ice.has(`${nextPX},${nextPY}`);
      while (isIce) {
        const slideTX = nextPX + dx;
        const slideTY = nextPY + dy;
        if (slideTX < 0 || slideTX >= width || slideTY < 0 || slideTY >= height) break;
        
        // Stop if we hit crate we just pushed (unless it fell into a hole)
        if (crateIdx !== -1 && slideTX === pushTX && slideTY === pushTY && !crateFell) break;
        
        const isWall = walls.has(`${slideTX},${slideTY}`);
        const isHole = newHoles.find(h => h.x === slideTX && h.y === slideTY);
        const isCrate = newCrates.some(c => c.x === slideTX && c.y === slideTY);
        
        if (isWall || isHole || isCrate) break;
        
        nextPX = slideTX;
        nextPY = slideTY;
        isIce = ice.has(`${nextPX},${nextPY}`);
      }

      const playerStartCracked = newCracked.findIndex(c => c.x === curr.px && c.y === curr.py);
      if (playerStartCracked !== -1) {
        newCracked.splice(playerStartCracked, 1);
        newHoles.push({ x: curr.px, y: curr.py });
      }

      if (crateIdx !== -1) {
        const originalCrateX = curr.crates[crateIdx].x;
        const originalCrateY = curr.crates[crateIdx].y;
        const crateStartCracked = newCracked.findIndex(c => c.x === originalCrateX && c.y === originalCrateY);
        if (crateStartCracked !== -1) {
          newCracked.splice(crateStartCracked, 1);
          newHoles.push({ x: originalCrateX, y: originalCrateY });
        }
      }

      const nextKey = encodeState(nextPX, nextPY, newCrates, newHoles, newCracked);
      if (!visited.has(nextKey)) {
        visited.add(nextKey);
        queue.push({
          px: nextPX,
          py: nextPY,
          crates: newCrates,
          holes: newHoles,
          cracked: newCracked,
          moves: curr.moves + m
        });
      }
    }
  }

  console.log(`  Level ${level.id} failed to find solution after ${iterations} iterations.`);
  return null;
}

function updateLevels() {
  const levelsFilePath = path.resolve(process.cwd(), 'levels.ts');
  let content = fs.readFileSync(levelsFilePath, 'utf8');

  for (let i = 0; i < CAMPAIGN_LEVELS.length; i++) {
    const level = CAMPAIGN_LEVELS[i];
    console.log(`Solving Level ${level.id}: ${level.title}...`);
    const sol = solveLevel(level);
    
    if (sol) {
      const regex = new RegExp(`("id":\\s*${level.id},[\\s\\S]*?)("grid":\\s*\\[)`, 'm');
      content = content.replace(regex, (match, p1, p2) => {
        if (p1.includes('"solution":')) {
          const stripped = p1.replace(/"solution":\\s*"[^"]*",\\s*/, '');
          return `${stripped}"solution": "${sol}",\n    ${p2}`;
        }
        return `${p1}"solution": "${sol}",\n    ${p2}`;
      });
      // Progressive save
      fs.writeFileSync(levelsFilePath, content, 'utf8');
      console.log(`Saved solution for Level ${level.id}`);
    }
  }

  console.log('All done!');
}

updateLevels();
