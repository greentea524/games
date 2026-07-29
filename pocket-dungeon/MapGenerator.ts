import { RNG } from './rng'
import { ROOM_TEMPLATES, RoomTemplate } from './templates'

interface Room {
  x: number
  y: number
  w: number
  h: number
  cx: number
  cy: number
}

export class MapGenerator {
  public width: number
  public height: number
  public grid: string[][]
  private rng: RNG

  constructor(width: number, height: number, seed: number) {
    this.width = width
    this.height = height
    this.rng = new RNG(seed)
    this.grid = Array.from({ length: height }, () => Array(width).fill('#'))
  }

  generate(depth: number): { grid: string[]; startX: number; startY: number } {
    const numRooms = this.rng.nextInt(6, 9)
    const rooms: Room[] = []

    // 1. Place Rooms
    for (let i = 0; i < numRooms * 3; i++) { // Max attempts
      if (rooms.length >= numRooms) break

      const template = this.rng.pick(ROOM_TEMPLATES)
      const x = this.rng.nextInt(1, this.width - template.width - 1)
      const y = this.rng.nextInt(1, this.height - template.height - 1)

      // Check overlap
      let overlap = false
      for (const r of rooms) {
        if (x < r.x + r.w + 1 && x + template.width + 1 > r.x &&
            y < r.y + r.h + 1 && y + template.height + 1 > r.y) {
          overlap = true
          break
        }
      }

      if (!overlap) {
        // Carve room
        for (let ry = 0; ry < template.height; ry++) {
          for (let rx = 0; rx < template.width; rx++) {
            if (template.grid[ry][rx] === '.') {
              this.grid[y + ry][x + rx] = '.'
            }
          }
        }
        rooms.push({
          x, y, w: template.width, h: template.height,
          cx: Math.floor(x + template.width / 2),
          cy: Math.floor(y + template.height / 2)
        })
      }
    }

    // 2. Connect Corridors with distinct 'c' path tiles
    for (let i = 1; i < rooms.length; i++) {
      const prev = rooms[i - 1]
      const curr = rooms[i]
      this.carveCorridor(prev.cx, prev.cy, curr.cx, curr.cy)
    }

    // 3. Add Decorations to Rooms (rugs in center, cracked tiles, bones)
    for (const r of rooms) {
      // Rug at room center
      if (r.w >= 5 && r.h >= 5) {
        for (let ry = -1; ry <= 1; ry++) {
          for (let rx = -1; rx <= 1; rx++) {
            if (this.grid[r.cy + ry]?.[r.cx + rx] === '.') {
              this.grid[r.cy + ry][r.cx + rx] = 'r'
            }
          }
        }
      }

      // Random cracked tiles & bone debris in room
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (this.grid[y][x] === '.') {
            const roll = this.rng.nextFloat(0, 1)
            if (roll < 0.08) {
              this.grid[y][x] = 'k' // cracked floor
            } else if (roll < 0.12) {
              this.grid[y][x] = 'b' // bones / debris
            }
          }
        }
      }
    }

    // 4. Place Wall Torches along room top/side walls
    let torchCounter = 0
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x] === '#') {
          // Check if adjacent to floor below or beside
          const hasFloorNeighbor = (this.grid[y + 1]?.[x] !== '#' && this.grid[y + 1]?.[x] !== undefined)
          if (hasFloorNeighbor) {
            torchCounter++
            if (torchCounter % 5 === 0) {
              this.grid[y][x] = 'T'
            }
          }
        }
      }
    }

    // 5. Place Player and Stairs
    const startRoom = rooms[0]
    const endRoom = rooms[rooms.length - 1]

    this.grid[startRoom.cy][startRoom.cx] = 'P'
    this.grid[endRoom.cy][endRoom.cx] = 'S'

    // 6. Place Enemies (Depth + 2)
    const enemyCount = depth + 2
    let enemiesPlaced = 0
    let attempts = 0
    while (enemiesPlaced < enemyCount && attempts < 1000) {
      attempts++
      const r = this.rng.pick(rooms)
      const ex = this.rng.nextInt(r.x, r.x + r.w - 1)
      const ey = this.rng.nextInt(r.y, r.y + r.h - 1)
      if (this.grid[ey][ex] === '.' || this.grid[ey][ex] === 'k' || this.grid[ey][ex] === 'b') {
        this.grid[ey][ex] = 'E'
        enemiesPlaced++
      }
    }

    // 7. Cull unnecessary walls into void (' ')
    // A wall is unnecessary if it has NO adjacent floor/path/room tiles in its 8-neighborhood.
    const newGrid = this.grid.map(row => [...row])
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === '#') {
          let hasFloorNeighbor = false
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ny = y + dy
              const nx = x + dx
              if (ny >= 0 && ny < this.height && nx >= 0 && nx < this.width) {
                const neighbor = this.grid[ny][nx]
                if (neighbor !== '#' && neighbor !== ' ' && neighbor !== 'T' && neighbor !== 'B') {
                  hasFloorNeighbor = true
                }
              }
            }
          }
          if (!hasFloorNeighbor) {
            newGrid[y][x] = ' '
          }
        }
      }
    }
    this.grid = newGrid

    // Convert back to string array
    const resultGrid = this.grid.map(row => row.join(''))

    return {
      grid: resultGrid,
      startX: startRoom.cx,
      startY: startRoom.cy
    }
  }

  private carveCorridor(x1: number, y1: number, x2: number, y2: number) {
    let x = x1
    let y = y1

    const setCorridorTile = (cx: number, cy: number) => {
      // Only set to corridor 'c' if it's currently a wall '#'
      if (this.grid[cy][cx] === '#') {
        this.grid[cy][cx] = 'c'
      }
    }

    // 50% chance to go horizontal first
    if (this.rng.nextFloat(0, 1) > 0.5) {
      while (x !== x2) {
        setCorridorTile(x, y)
        x += x < x2 ? 1 : -1
      }
      while (y !== y2) {
        setCorridorTile(x, y)
        y += y < y2 ? 1 : -1
      }
    } else {
      while (y !== y2) {
        setCorridorTile(x, y)
        y += y < y2 ? 1 : -1
      }
      while (x !== x2) {
        setCorridorTile(x, y)
        x += x < x2 ? 1 : -1
      }
    }
    setCorridorTile(x2, y2)
  }
}
