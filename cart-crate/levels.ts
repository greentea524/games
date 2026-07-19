export interface LevelConfig {
  id: number
  title: string
  world: number
  parMoves: number
  grid: string[]
}

export const CAMPAIGN_LEVELS: LevelConfig[] = [
  {
    "id": 1,
    "title": "First Delivery",
    "world": 1,
    "parMoves": 10,
    "grid": [
      "##########",
      "#........#",
      "#.P.C..T.#",
      "#........#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 2,
    "title": "Double Crate",
    "world": 1,
    "parMoves": 14,
    "grid": [
      "##########",
      "#........#",
      "#.P......#",
      "#...C..T.#",
      "#...C..T.#",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 3,
    "title": "Slippery Ice",
    "world": 1,
    "parMoves": 14,
    "grid": [
      "##########",
      "#........#",
      "#.P.I.C.T#",
      "#........#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 4,
    "title": "Cracked Floor",
    "world": 1,
    "parMoves": 10,
    "grid": [
      "##########",
      "#........#",
      "#.P.X.C.T#",
      "#........#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 5,
    "title": "Warehouse Master",
    "world": 1,
    "parMoves": 11,
    "grid": [
      "##########",
      "#..#.....#",
      "#.P.C.I.T#",
      "#...C...T#",
      "#..#.....#",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 6,
    "title": "Tight Corner",
    "world": 1,
    "parMoves": 17,
    "grid": [
      "##########",
      "###.T.####",
      "###.C.####",
      "#.P......#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 7,
    "title": "Backtrack",
    "world": 1,
    "parMoves": 15,
    "grid": [
      "##########",
      "#.T.C..P.#",
      "###...####",
      "#...C.T..#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 8,
    "title": "Blocker",
    "world": 1,
    "parMoves": 10,
    "grid": [
      "##########",
      "#T.C.C.T.#",
      "#...P....#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 9,
    "title": "Hallway",
    "world": 1,
    "parMoves": 19,
    "grid": [
      "##########",
      "#...T....#",
      "#P.C.C.T.#",
      "#........#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 10,
    "title": "Storage Room",
    "world": 1,
    "parMoves": 17,
    "grid": [
      "##########",
      "#..#T#...#",
      "#.P..C.C.#",
      "#..#T#...#",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########"
    ]
  },
  {
    "id": 11,
    "title": "Ice Slide",
    "world": 2,
    "parMoves": 20,
    "grid": [
      "\n\n####\n#.T#\n#..###\n#*P..#\n#..C.#\n#..###\n####\n\n"
    ]
  },
  {
    "id": 12,
    "title": "Ricochet",
    "world": 2,
    "parMoves": 22,
    "grid": [
      "\n\n######\n#....#\n#.#P.#\n#.C*.#\n#.T*.#\n#....#\n######\n\n"
    ]
  },
  {
    "id": 13,
    "title": "Ice Corner",
    "world": 2,
    "parMoves": 24,
    "grid": [
      "\n\n..####\n###..####\n#.....C.#\n#.#..#C.#\n#.T.T#P.#\n#########\n\n"
    ]
  },
  {
    "id": 14,
    "title": "Stop And Go",
    "world": 2,
    "parMoves": 26,
    "grid": [
      "\n\n########\n#......#\n#.T**CP#\n#......#\n#####..#\n....####\n\n"
    ]
  },
  {
    "id": 15,
    "title": "Slip And Slide",
    "world": 2,
    "parMoves": 28,
    "grid": [
      "\n\n.#######\n.#.....#\n.#.TCT.#\n##.CPC.#\n#..TCT.#\n#......#\n########\n\n"
    ]
  },
  {
    "id": 16,
    "title": "Ice Blocks",
    "world": 2,
    "parMoves": 30,
    "grid": [
      "\n\n######.#####\n#....###...#\n#.CC.....#P#\n#.C.#TTT...#\n#...########\n#####\n\n"
    ]
  },
  {
    "id": 17,
    "title": "Chilly Push",
    "world": 2,
    "parMoves": 32,
    "grid": [
      "\n\n#######\n#.....#\n#.TCT.#\n#.CTC.#\n#.TCT.#\n#.CTC.#\n#..P..#\n#######\n\n"
    ]
  },
  {
    "id": 18,
    "title": "Glacier",
    "world": 2,
    "parMoves": 34,
    "grid": [
      "\n\n..######\n..#.TTP#\n..#.CC.#\n..##.###\n...#.#\n...#.#\n####.#\n#....##\n#.#...#\n#...#.#\n###...#\n..#####\n\n"
    ]
  },
  {
    "id": 19,
    "title": "Frozen Lake",
    "world": 2,
    "parMoves": 36,
    "grid": [
      "\n\n#####\n#T..##\n#PCC.#\n##...#\n.##..#\n..##T#\n...###\n\n"
    ]
  },
  {
    "id": 20,
    "title": "Deep Freeze",
    "world": 2,
    "parMoves": 38,
    "grid": [
      "\n\n......#####\n......#T..#\n......#T#.#\n#######T#.#\n#.P.C.C.C.#\n#.#.#.#.###\n#.......#\n#########\n\n"
    ]
  },
  {
    "id": 21,
    "title": "Watch Your Step",
    "world": 3,
    "parMoves": 40,
    "grid": [
      "\n\n..######\n..#....#\n..#.##P##\n###.#.C.#\n#.TT#.C.#\n#.......#\n#..######\n####\n\n"
    ]
  },
  {
    "id": 22,
    "title": "Pitfall",
    "world": 3,
    "parMoves": 42,
    "grid": [
      "\n\n#####\n#...##\n#.C..#\n##.C.####\n.###PT..#\n..#..T#.#\n..#.....#\n..#######\n\n"
    ]
  },
  {
    "id": 23,
    "title": "Fragile Bridge",
    "world": 3,
    "parMoves": 44,
    "grid": [
      "\n\n####\n#T.##\n#TP.#\n#T.C#\n##C.###\n.#.C..#\n.#....#\n.#..###\n.####\n\n"
    ]
  },
  {
    "id": 24,
    "title": "Crumble",
    "world": 3,
    "parMoves": 46,
    "grid": [
      "\n\n#######\n#.....#\n#.#.#.#\n#T.C*P#\n#...###\n#####\n\n"
    ]
  },
  {
    "id": 25,
    "title": "Hole In One",
    "world": 3,
    "parMoves": 48,
    "grid": [
      "\n\n.....###\n######P##\n#....T*.#\n#...#...#\n#####C#.#\n....#...#\n....#####\n\n"
    ]
  },
  {
    "id": 26,
    "title": "Ruin Maze",
    "world": 3,
    "parMoves": 50,
    "grid": [
      "\n\n.####\n.#..####\n.#.....##\n##.##...#\n#T.T#.PC##\n#...#.CC.#\n#..T#....#\n##########\n\n"
    ]
  },
  {
    "id": 27,
    "title": "Shatter",
    "world": 3,
    "parMoves": 52,
    "grid": [
      "\n\n#####\n#.P.#\n#TTT#\n#CCC##\n#....#\n#....#\n######\n\n"
    ]
  },
  {
    "id": 28,
    "title": "Abyss",
    "world": 3,
    "parMoves": 54,
    "grid": [
      "\n\n#######\n#.....#\n#T.T..#\n#.##.##\n#..C.#\n###C.#\n..#P.#\n..#..#\n..####\n\n"
    ]
  },
  {
    "id": 29,
    "title": "Leap Of Faith",
    "world": 3,
    "parMoves": 56,
    "grid": [
      "\n\n########\n#...TT.#\n#..PCC.#\n#####.##\n...#..#\n...#..#\n...#..#\n...####\n\n"
    ]
  },
  {
    "id": 30,
    "title": "Temple of Cracks",
    "world": 3,
    "parMoves": 58,
    "grid": [
      "\n\n#######\n#.....###\n#..PCCTT#\n####.##.#\n..#.....#\n..#..####\n..#..#\n..####\n\n"
    ]
  },
  {
    "id": 31,
    "title": "Maze Start",
    "world": 4,
    "parMoves": 60,
    "grid": [
      "\n\n####\n#..####\n#.T.T.#\n#.CC#P#\n##....#\n.######\n\n"
    ]
  },
  {
    "id": 32,
    "title": "Corridors",
    "world": 4,
    "parMoves": 62,
    "grid": [
      "\n\n#####\n#...###\n#T.T..#\n#...#.#\n##.#..#\n.#PCC.#\n.#....#\n.#..###\n.####\n\n"
    ]
  },
  {
    "id": 33,
    "title": "Twisty",
    "world": 4,
    "parMoves": 64,
    "grid": [
      "\n\n#######\n#..*..#\n#.....#\n##.#.##\n.#CPT#\n.#...#\n.#####\n\n"
    ]
  },
  {
    "id": 34,
    "title": "Dead End",
    "world": 4,
    "parMoves": 66,
    "grid": [
      "\n\n#.#####\n..#...#\n###CCP#\n#...###\n#.....#\n#.T.T.#\n#######\n\n"
    ]
  },
  {
    "id": 35,
    "title": "Zig Zag",
    "world": 4,
    "parMoves": 68,
    "grid": [
      "\n\n.####\n.#..###\n.#.CC.#\n##TTT.#\n#..PC.#\n#...###\n#####\n\n"
    ]
  },
  {
    "id": 36,
    "title": "Tight Squeeze",
    "world": 4,
    "parMoves": 70,
    "grid": [
      "\n\n.#####\n.#.P.#\n.#...#\n###C.#\n#.TTT#\n#.CC.#\n###..#\n..####\n\n"
    ]
  },
  {
    "id": 37,
    "title": "Four Rooms",
    "world": 4,
    "parMoves": 72,
    "grid": [
      "\n\n######\n#...T#\n#.##.##\n#..CCP#\n#.#...#\n#T..###\n#####\n\n"
    ]
  },
  {
    "id": 38,
    "title": "Spiral",
    "world": 4,
    "parMoves": 74,
    "grid": [
      "\n\n#####\n#...#\n#.P.#\n#.CC###\n##T.T.#\n.#....#\n.######\n\n"
    ]
  },
  {
    "id": 39,
    "title": "Hidden Target",
    "world": 4,
    "parMoves": 76,
    "grid": [
      "\n\n.....#####\n.....#...##\n.....#....#\n.######...#\n##.....#T.#\n#.C.C.P..##\n#.######T#\n#........#\n##########\n\n"
    ]
  },
  {
    "id": 40,
    "title": "Labyrinth End",
    "world": 4,
    "parMoves": 78,
    "grid": [
      "\n\n####\n#..###\n#.CC.#\n#TTT.#\n#.PC.#\n#...##\n#####\n\n"
    ]
  },
  {
    "id": 41,
    "title": "Ice And Fire",
    "world": 5,
    "parMoves": 80,
    "grid": [
      "\n\n..####\n.##..#\n##PCT##\n#.CC..#\n#.T.T.#\n###...#\n..#####\n\n"
    ]
  },
  {
    "id": 42,
    "title": "Tricky Floor",
    "world": 5,
    "parMoves": 82,
    "grid": [
      "\n\n.####\n##..###\n#.....#\n#T**CP#\n#...###\n##..#\n.####\n\n"
    ]
  },
  {
    "id": 43,
    "title": "Sliding Pit",
    "world": 5,
    "parMoves": 84,
    "grid": [
      "\n\n#######\n#T.#..#\n#..C..#\n#T.C#P#\n#..C..#\n#T.#..#\n#######\n\n"
    ]
  },
  {
    "id": 44,
    "title": "Combo 1",
    "world": 5,
    "parMoves": 86,
    "grid": [
      "\n\n..####\n###..####\n#.......#\n#PC***T.#\n#.......#\n#########\n\n"
    ]
  },
  {
    "id": 45,
    "title": "Combo 2",
    "world": 5,
    "parMoves": 88,
    "grid": [
      "\n\n..####\n.##..#\n.#T.C#\n.#TC.#\n.#TC.#\n.#TC.#\n.#T.C##\n.#...P#\n.##...#\n..#####\n\n"
    ]
  },
  {
    "id": 46,
    "title": "Puzzle Box",
    "world": 5,
    "parMoves": 90,
    "grid": [
      "\n\n####\n#..############\n#.C.C.C.C.C.P.#\n#.TTTTT.......#\n###############\n\n"
    ]
  },
  {
    "id": 47,
    "title": "Brain Teaser",
    "world": 5,
    "parMoves": 92,
    "grid": [
      "\n\n......###\n#####.#T#\n#...###T#\n#...C.#T#\n#.C..C..#\n#####P#.#\n....#...#\n....#####\n\n"
    ]
  },
  {
    "id": 48,
    "title": "The Gauntlet",
    "world": 5,
    "parMoves": 94,
    "grid": [
      "\n\n##########\n#........#\n#.##T###.#\n#.#.CC.T.#\n#.T.PC##.#\n#####....#\n....######\n\n"
    ]
  },
  {
    "id": 49,
    "title": "Penultimate",
    "world": 5,
    "parMoves": 96,
    "grid": [
      "\n\n#####\n#...####\n#.#.#.T#\n#....C.###\n###.#CT..#\n#...#P...#\n#.#.######\n#...#\n#####\n\n"
    ]
  },
  {
    "id": 50,
    "title": "Final Exam",
    "world": 5,
    "parMoves": 98,
    "grid": [
      "\n\n.#####\n.#...#\n##...##\n#.CCC.#\n#.T+T.#\n#######\n\n"
    ]
  }
]