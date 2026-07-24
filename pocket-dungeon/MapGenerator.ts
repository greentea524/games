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

    // 2. Connect Corridors
    for (let i = 1; i < rooms.length; i++) {
      const prev = rooms[i - 1]
      const curr = rooms[i]
      this.carveCorridor(prev.cx, prev.cy, curr.cx, curr.cy)
    }

    // 3. Place Player and Stairs
    const startRoom = rooms[0]
    const endRoom = rooms[rooms.length - 1]

    this.grid[startRoom.cy][startRoom.cx] = 'P'
    this.grid[endRoom.cy][endRoom.cx] = 'S'

    // 4. Place Enemies (Depth + 2)
    const enemyCount = depth + 2
    let enemiesPlaced = 0
    let attempts = 0
    while (enemiesPlaced < enemyCount && attempts < 1000) {
      attempts++
      const r = this.rng.pick(rooms)
      const ex = this.rng.nextInt(r.x, r.x + r.w - 1)
      const ey = this.rng.nextInt(r.y, r.y + r.h - 1)
      if (this.grid[ey][ex] === '.') {
        this.grid[ey][ex] = 'E'
        enemiesPlaced++
      }
    }

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

    // 50% chance to go horizontal first
    if (this.rng.nextFloat(0, 1) > 0.5) {
      while (x !== x2) {
        this.grid[y][x] = '.'
        x += x < x2 ? 1 : -1
      }
      while (y !== y2) {
        this.grid[y][x] = '.'
        y += y < y2 ? 1 : -1
      }
    } else {
      while (y !== y2) {
        this.grid[y][x] = '.'
        y += y < y2 ? 1 : -1
      }
      while (x !== x2) {
        this.grid[y][x] = '.'
        x += x < x2 ? 1 : -1
      }
    }
    // Ensure final point is carved
    this.grid[y2][x2] = '.'
  }
}
