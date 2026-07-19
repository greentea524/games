const fs = require('fs')
const path = require('path')

const W = 10
const H = 9

function padGrid(gridStr) {
  const lines = gridStr.trim().split('\n').map(l => l.trim())
  while (lines.length < H) {
    lines.push('##########')
  }
  return lines.map(l => {
    let padded = l
    while (padded.length < W) {
      padded += '#'
    }
    return padded.substring(0, W)
  })
}

const levels = []

// WORLD 1: The Warehouse (1-10)
const w1 = [
  { t: "First Delivery", g: `
##########
#........#
#.P.C..T.#
#........#
##########`},
  { t: "Double Crate", g: `
##########
#........#
#.P......#
#...C..T.#
#...C..T.#
##########`},
  { t: "Slippery Ice", g: `
##########
#........#
#.P.I.C.T#
#........#
##########`},
  { t: "Cracked Floor", g: `
##########
#........#
#.P.X.C.T#
#........#
##########`},
  { t: "Warehouse Master", g: `
##########
#..#.....#
#.P.C.I.T#
#...C...T#
#..#.....#
##########`},
  { t: "Tight Corner", g: `
##########
###.T.####
###.C.####
#.P......#
##########`},
  { t: "Backtrack", g: `
##########
#.T.C..P.#
###...####
#...C.T..#
##########`},
  { t: "Blocker", g: `
##########
#T.C.C.T.#
#...P....#
##########`},
  { t: "Hallway", g: `
##########
#...T....#
#P.C.C.T.#
#........#
##########`},
  { t: "Storage Room", g: `
##########
#..#T#...#
#.P..C.C.#
#..#T#...#
##########`}
]

// WORLD 2: Frozen Depths (11-20)
const w2 = [
  { t: "Ice Slide", g: `
##########
#.P.IIICT#
#........#
##########`},
  { t: "Ricochet", g: `
##########
#.P.I.C..#
#.III....#
#.I.#.T..#
##########`},
  { t: "Ice Corner", g: `
##########
#.P.I..T.#
#.#.I..C.#
#.#.I....#
##########`},
  { t: "Stop And Go", g: `
##########
#.P.IC...#
###.I#...#
#T..I....#
##########`},
  { t: "Slip And Slide", g: `
##########
#P.C.I.T.#
#.I..I...#
#.I..I.T.#
#...C....#
##########`},
  { t: "Ice Blocks", g: `
##########
#.P..I.T.#
#.C.II...#
#...I..C.#
#...#..T.#
##########`},
  { t: "Chilly Push", g: `
##########
#P.I.C.I.#
#..#...#T#
##########`},
  { t: "Glacier", g: `
##########
#.PIII.C.#
#......T.#
#......T.#
##########`},
  { t: "Frozen Lake", g: `
##########
#.P.II.C.#
#.T.II.T.#
#.#.II.#.#
#...C....#
##########`},
  { t: "Deep Freeze", g: `
##########
#.P..I.T.#
#.C.II.T.#
#.C.II...#
#........#
##########`}
]

// WORLD 3: Crumbling Ruins (21-30)
const w3 = [
  { t: "Watch Your Step", g: `
##########
#.P.X.C.T#
#........#
##########`},
  { t: "Pitfall", g: `
##########
#.P.O.C.T#
#........#
##########`},
  { t: "Fragile Bridge", g: `
##########
#.P..X.T.#
#..C.X...#
#....#...#
##########`},
  { t: "Crumble", g: `
##########
#.P..XX..#
#.C..X.T.#
#........#
##########`},
  { t: "Hole In One", g: `
##########
#.P..O.T.#
#.C..O.T.#
#.C......#
##########`},
  { t: "Ruin Maze", g: `
##########
#.P.X.C.T#
###.X.####
#T.C.X...#
##########`},
  { t: "Shatter", g: `
##########
#.P.XX.C.#
#.#.XX.#T#
##########`},
  { t: "Abyss", g: `
##########
#.P.O.O.C#
#.#.O.O.T#
##########`},
  { t: "Leap Of Faith", g: `
##########
#.P..XX..#
#.C..OO.T#
#........#
##########`},
  { t: "Temple of Cracks", g: `
##########
#.P.XXX.T#
#.C.XXX.C#
#...#T#..#
##########`}
]

// WORLD 4: The Labyrinth (31-40)
const w4 = [
  { t: "Maze Start", g: `
##########
#.P.#.C..#
#.#.#.#.T#
#...#....#
##########`},
  { t: "Corridors", g: `
##########
#P.#.T.#.#
#..#...#.C
#..C.#.T.#
#....#...#
##########`},
  { t: "Twisty", g: `
##########
#.P...#T.#
###.#.#..#
#.C.C.#.T#
##########`},
  { t: "Dead End", g: `
##########
#P..#..T.#
#.C.#..C.#
#.#.#T##.#
##########`},
  { t: "Zig Zag", g: `
##########
#.P.#.T..#
#.#.#.#..#
#.C...C.T#
##########`},
  { t: "Tight Squeeze", g: `
##########
#P..C..T.#
###.####.#
#...C..T.#
##########`},
  { t: "Four Rooms", g: `
##########
#.P.#.C..#
#.#.###.T#
#.C...#..#
#.T.#....#
##########`},
  { t: "Spiral", g: `
##########
#.P####T.#
#...#..#.#
#.C.#.C#.#
#........#
##########`},
  { t: "Hidden Target", g: `
##########
#P..#...T#
#.#.#.##.#
#.C.C..T.#
##########`},
  { t: "Labyrinth End", g: `
##########
#.P..#...#
#.C..#T#.#
###C.###.#
#T.......#
##########`}
]

// WORLD 5: Master Class (41-50)
const w5 = [
  { t: "Ice And Fire", g: `
##########
#.P.I.X.C#
#...#...T#
##########`},
  { t: "Tricky Floor", g: `
##########
#.P..X.T.#
#.C.II.T.#
#.C.X....#
##########`},
  { t: "Sliding Pit", g: `
##########
#.P.I.O.C#
#...#...T#
##########`},
  { t: "Combo 1", g: `
##########
#.P..X.I.#
#.C..O.C.#
#T...#..T#
##########`},
  { t: "Combo 2", g: `
##########
#P..I..T.#
#X.###.#.#
#.C.C..O.#
#...T....#
##########`},
  { t: "Puzzle Box", g: `
##########
#.P.X.C.T#
#.I.O.I.T#
#.C.X.C..#
##########`},
  { t: "Brain Teaser", g: `
##########
#P..I.XX.#
#C..O.I.T#
#T..#...C#
##########`},
  { t: "The Gauntlet", g: `
##########
#.P.I.X.O#
#.C.I.X.T#
#.C.I.O.T#
##########`},
  { t: "Penultimate", g: `
##########
#P..I..X.#
#.#.#O#..#
#.C.T.C.T#
##########`},
  { t: "Final Exam", g: `
##########
#P..X..O.#
#I..#..I.#
#.C.T.C.T#
#O..X..I.#
##########`}
]

let id = 1
const allWorlds = [w1, w2, w3, w4, w5]

allWorlds.forEach((world, wIdx) => {
  world.forEach(lvl => {
    levels.push({
      id: id++,
      title: lvl.t,
      world: wIdx + 1,
      parMoves: Math.floor(Math.random() * 10) + 10,
      grid: padGrid(lvl.g)
    })
  })
})

const fileContent = "export interface LevelConfig {\\n" +
  "  id: number\\n" +
  "  title: string\\n" +
  "  world: number\\n" +
  "  parMoves: number\\n" +
  "  grid: string[]\\n" +
  "}\\n\\n" +
  "export const CAMPAIGN_LEVELS: LevelConfig[] = " + JSON.stringify(levels, null, 2) + "\\n";

fs.writeFileSync(path.join(__dirname, 'levels.ts'), fileContent)
console.log('Successfully generated 50 levels!')
