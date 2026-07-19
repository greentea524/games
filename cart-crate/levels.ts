export interface LevelConfig {
  id: number
  title: string
  world: number
  parMoves: number
  solution?: string
  grid: string[]
}

export const CAMPAIGN_LEVELS: LevelConfig[] = [
  {
    "id": 1,
    "title": "First Delivery",
    "world": 1,
    "parMoves": 10,
    "solution": "RRRR",
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
    "solution": "DRRRRLLLDRRR",
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
    "solution": "RRRR",
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
    "solution": "RRRRR",
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
    "solution": "RRRRRLLLDRRRR",
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
    "solution": "RRU",
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
    "solution": "LLLLDDRR",
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
    "solution": "ULLRRRR",
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
    "solution": "RRDRURR",
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
    "solution": "DRRRUDRRRULLLLDLU",
    "grid": [
      "##########",
      "#..T.T...#",
      "#.P..C.C.#",
      "#........#",
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
    "solution": "DLURRRDLULLDDRULURUULDRDDRRULDLUU",
    "grid": [
      "####..",
      "#.T#..",
      "#..###",
      "#*P..#",
      "#..C.#",
      "#..###",
      "####.."
    ]
  },
  {
    "id": 12,
    "title": "Ricochet",
    "world": 2,
    "parMoves": 22,
    "solution": "RDDLRUULDUULLDDR",
    "grid": [
      "######",
      "#....#",
      "#.#P.#",
      "#.C*.#",
      "#.T*.#",
      "#....#",
      "######"
    ]
  },
  {
    "id": 13,
    "title": "Ice Corner",
    "world": 2,
    "parMoves": 24,
    "solution": "RUULLLULDRRRRDDLURULLLDDLLLUURRDRDLUUURDD",
    "grid": [
      "..####...",
      "###..####",
      "#.....C.#",
      "#.#..#C.#",
      "#.T.T#P.#",
      "#########"
    ]
  },
  {
    "id": 14,
    "title": "Stop And Go",
    "world": 2,
    "parMoves": 26,
    "solution": "ULLDLDRUURRDLLRRDDLURUL",
    "grid": [
      "########",
      "#......#",
      "#.T**CP#",
      "#......#",
      "#####..#",
      "....####"
    ]
  },
  {
    "id": 15,
    "title": "Slip And Slide",
    "world": 2,
    "parMoves": 28,
    "solution": "LURLLDRDRDRRUULLDLUDDLLUR",
    "grid": [
      ".#######",
      ".#.....#",
      ".#.TCT.#",
      "##.CPC.#",
      "#..TCT.#",
      "#......#",
      "########"
    ]
  },
  {
    "id": 16,
    "title": "Ice Blocks",
    "world": 2,
    "parMoves": 30,
    "solution": "ULLDLLLLULDULLDRRRRRRDRRRUULLDURRDDLLLLULLLLLDDRULURRRRRRDRRRUULLDURRDDLLLULLLLLDDRULURRRRRDRRRUULLDURRDDLL",
    "grid": [
      "######.#####",
      "#....###...#",
      "#.CC.....#P#",
      "#.C.#TTT...#",
      "#...########",
      "#####......."
    ]
  },
  {
    "id": 17,
    "title": "Chilly Push",
    "world": 2,
    "parMoves": 32,
    "grid": [
      "#######",
      "#.....#",
      "#.TCT.#",
      "#.CTC.#",
      "#.TCT.#",
      "#.CTC.#",
      "#..P..#",
      "#######"
    ]
  },
  {
    "id": 18,
    "title": "Glacier",
    "world": 2,
    "parMoves": 34,
    "solution": "LLDDDDDDLDDDRRUULUUUUUUURRDLULDDDDDDLLLDDRRUDLLUURRDDDRRUULUUUUUULURDDDDDDDRDDLLUUDLLUURRDRUUUUUU",
    "grid": [
      "..######",
      "..#.TTP#",
      "..#.CC.#",
      "..##.###",
      "...#.#..",
      "...#.#..",
      "####.#..",
      "#....##.",
      "#.#...#.",
      "#...#.#.",
      "###...#.",
      "..#####."
    ]
  },
  {
    "id": 19,
    "title": "Frozen Lake",
    "world": 2,
    "parMoves": 36,
    "solution": "URRDULLDRDRLUURDRDDLURULDLURUL",
    "grid": [
      "#####.",
      "#T..##",
      "#PCC.#",
      "##...#",
      ".##..#",
      "..##T#",
      "...###"
    ]
  },
  {
    "id": 20,
    "title": "Deep Freeze",
    "world": 2,
    "parMoves": 38,
    "solution": "RDDRRUULLDDRRRRUUUUURRDDDLRUUULLDDDLLDDRRUUUUDDDDLLLLUURRRLDDRRUUUDDDLLLLLLUURRRRRLDDRRUU",
    "grid": [
      "......#####",
      "......#T..#",
      "......#T#.#",
      "#######T#.#",
      "#.P.C.C.C.#",
      "#.#.#.#.###",
      "#.......#..",
      "#########.."
    ]
  },
  {
    "id": 21,
    "title": "Watch Your Step",
    "world": 3,
    "parMoves": 40,
    "solution": "ULLLDDDDRRRRULULDRDLLLUUUURRRDDDLDLLULLDDRULURDRRRURRDLLLLULLDDRURRRUURUULLLDD",
    "grid": [
      "..######.",
      "..#....#.",
      "..#.##P##",
      "###.#.C.#",
      "#.TT#.C.#",
      "#.......#",
      "#..######",
      "####....."
    ]
  },
  {
    "id": 22,
    "title": "Pitfall",
    "world": 3,
    "parMoves": 42,
    "solution": "UULULLDRDRLUURDRDDRDDLLURUUULLDRURDDRRRDDLLUDLLUR",
    "grid": [
      "#####....",
      "#...##...",
      "#.C..#...",
      "##.C.####",
      ".###PT..#",
      "..#..T#.#",
      "..#.....#",
      "..#######"
    ]
  },
  {
    "id": 23,
    "title": "Fragile Bridge",
    "world": 3,
    "parMoves": 44,
    "solution": "RDLDDRDDLUUUURULDDDDRRRULLDLUUULUDRRDDRDLDLUUURULRUL",
    "grid": [
      "####...",
      "#T.##..",
      "#TP.#..",
      "#T.C#..",
      "##C.###",
      ".#.C..#",
      ".#....#",
      ".#..###",
      ".####.."
    ]
  },
  {
    "id": 24,
    "title": "Crumble",
    "world": 3,
    "parMoves": 46,
    "solution": "UULLLLDDDRRULLUURRRRDDLLLRRRUULLDURRDDLLDLLURRUULLD",
    "grid": [
      "#######",
      "#.....#",
      "#.#.#.#",
      "#T.C*P#",
      "#...###",
      "#####.."
    ]
  },
  {
    "id": 25,
    "title": "Hole In One",
    "world": 3,
    "parMoves": 48,
    "solution": "DRDDDLLUUDDRRUULULLLDLLURRRRDRRDDLLUU",
    "grid": [
      ".....###.",
      "######P##",
      "#....T*.#",
      "#...#...#",
      "#####C#.#",
      "....#...#",
      "....#####"
    ]
  },
  {
    "id": 26,
    "title": "Ruin Maze",
    "world": 3,
    "parMoves": 50,
    "solution": "LDDRUDRRULLDLUUURULLLULDDDLDRUUURRRDRRDLDLUURULLLULDDDLDDRRULDLURUUURRRDDDDRRRULLDLUUURULLLULDDDDLDR",
    "grid": [
      ".####.....",
      ".#..####..",
      ".#.....##.",
      "##.##...#.",
      "#T.T#.PC##",
      "#...#.CC.#",
      "#..T#....#",
      "##########"
    ]
  },
  {
    "id": 27,
    "title": "Shatter",
    "world": 3,
    "parMoves": 52,
    "solution": "DRDULLDRDDRRULUDDLUUDDLUU",
    "grid": [
      "#####.",
      "#.P.#.",
      "#TTT#.",
      "#CCC##",
      "#....#",
      "#....#",
      "######"
    ]
  },
  {
    "id": 28,
    "title": "Abyss",
    "world": 3,
    "parMoves": 54,
    "solution": "RUUUULLLDDRRDRUUDLLLUUURRRRDLDDDDDLUURUUULULLDDDRRDRUUDLLLUUURRDLURRRDL",
    "grid": [
      "#######",
      "#.....#",
      "#T.T..#",
      "#.##.##",
      "#..C.#.",
      "###C.#.",
      "..#P.#.",
      "..#..#.",
      "..####."
    ]
  },
  {
    "id": 29,
    "title": "Leap Of Faith",
    "world": 3,
    "parMoves": 56,
    "solution": "URRDDDLDDRUUUURULLLDRURDDDLDDRUUUULLLLURR",
    "grid": [
      "########",
      "#...TT.#",
      "#..PCC.#",
      "#####.##",
      "...#..#.",
      "...#..#.",
      "...#..#.",
      "...####."
    ]
  },
  {
    "id": 30,
    "title": "Temple of Cracks",
    "world": 3,
    "parMoves": 58,
    "solution": "URDDDRRRUULLLLRDDLDDRUUUDRRRUULLULLDRRRLULLLLDRRRR",
    "grid": [
      "#######..",
      "#.....###",
      "#..PCCTT#",
      "####.##.#",
      "..#.....#",
      "..#..####",
      "..#..#...",
      "..####..."
    ]
  },
  {
    "id": 31,
    "title": "Maze Start",
    "world": 4,
    "parMoves": 60,
    "solution": "DLLUDLULUURDRDDLU",
    "grid": [
      "####...",
      "#..####",
      "#.T.T.#",
      "#.CC#P#",
      "##....#",
      ".######"
    ]
  },
  {
    "id": 32,
    "title": "Corridors",
    "world": 4,
    "parMoves": 62,
    "solution": "DRRRUULDLDLUUULURRDLDDRRRDLLDLUUUURULDDDRRURUUL",
    "grid": [
      "#####..",
      "#...###",
      "#T.T..#",
      "#...#.#",
      "##.#..#",
      ".#PCC.#",
      ".#....#",
      ".#..###",
      ".####.."
    ]
  },
  {
    "id": 33,
    "title": "Twisty",
    "world": 4,
    "parMoves": 64,
    "solution": "RUULLURDRDDDLLUUDRRUULULLDRDDRRUURULLRDDDLLUURURDDULLLUR",
    "grid": [
      "#######",
      "#..*..#",
      "#.....#",
      "##.#.##",
      ".#CPT#.",
      ".#...#.",
      ".#####."
    ]
  },
  {
    "id": 34,
    "title": "Dead End",
    "world": 4,
    "parMoves": 66,
    "solution": "ULLDDLDDRRULUUURRDLULDDDULLDDRRUULD",
    "grid": [
      "#.#####",
      "..#...#",
      "###CCP#",
      "#...###",
      "#.....#",
      "#.T.T.#",
      "#######"
    ]
  },
  {
    "id": 35,
    "title": "Zig Zag",
    "world": 4,
    "parMoves": 68,
    "solution": "URRDLULLUURDLDRLDDRURRUULLULD",
    "grid": [
      ".####..",
      ".#..###",
      ".#.CC.#",
      "##TTT.#",
      "#..PC.#",
      "#...###",
      "#####.."
    ]
  },
  {
    "id": 36,
    "title": "Tight Squeeze",
    "world": 4,
    "parMoves": 70,
    "solution": "DRDDLUDRDDLUULLDRURRDDLURULRUUULLDRDUURDD",
    "grid": [
      ".#####",
      ".#.P.#",
      ".#...#",
      "###C.#",
      "#.TTT#",
      "#.CC.#",
      "###..#",
      "..####"
    ]
  },
  {
    "id": 37,
    "title": "Four Rooms",
    "world": 4,
    "parMoves": 72,
    "solution": "DLULDDLLUUUURRRDULLLDDDDRRUULRDRRULUULLLDDDURRDRUU",
    "grid": [
      "######.",
      "#...T#.",
      "#.##.##",
      "#..CCP#",
      "#.#...#",
      "#T..###",
      "#####.."
    ]
  },
  {
    "id": 38,
    "title": "Spiral",
    "world": 4,
    "parMoves": 74,
    "solution": "RDULLDRDDRRULDLUULUURRDDLDRUUULDD",
    "grid": [
      "#####..",
      "#...#..",
      "#.P.#..",
      "#.CC###",
      "##T.T.#",
      ".#....#",
      ".######"
    ]
  },
  {
    "id": 39,
    "title": "Hidden Target",
    "world": 4,
    "parMoves": 76,
    "solution": "ULLLDRURRDRRDDLLLLLLLUURURRDRRRLULLLLDLDDRRRRRRRUUUUDDLLULLLLDRRRRRLLLLLLDDRRRRRRRUUURUULDDDUUUULLDRURDD",
    "grid": [
      ".....#####.",
      ".....#...##",
      ".....#....#",
      ".######...#",
      "##.....#T.#",
      "#.C.C.P..##",
      "#.######T#.",
      "#........#.",
      "##########."
    ]
  },
  {
    "id": 40,
    "title": "Labyrinth End",
    "world": 4,
    "parMoves": 78,
    "solution": "ULUURDLDDDRRURUULLULD",
    "grid": [
      "####..",
      "#..###",
      "#.CC.#",
      "#TTT.#",
      "#.PC.#",
      "#...##",
      "#####."
    ]
  },
  {
    "id": 41,
    "title": "Ice And Fire",
    "world": 5,
    "parMoves": 80,
    "solution": "DURURDDRDDLLUULUR",
    "grid": [
      "..####.",
      ".##..#.",
      "##PCT##",
      "#.CC..#",
      "#.T.T.#",
      "###...#",
      "..#####"
    ]
  },
  {
    "id": 42,
    "title": "Tricky Floor",
    "world": 5,
    "parMoves": 82,
    "solution": "ULLDULLDDRURURRDLLLDDRULURUULDRRRDL",
    "grid": [
      ".####..",
      "##..###",
      "#.....#",
      "#T**CP#",
      "#...###",
      "##..#..",
      ".####.."
    ]
  },
  {
    "id": 43,
    "title": "Sliding Pit",
    "world": 5,
    "parMoves": 84,
    "solution": "ULLRRDDLLUDLULUURDLDDRRRRUULLLRDDLLUURRDL",
    "grid": [
      "#######",
      "#T.#..#",
      "#..C..#",
      "#T.C#P#",
      "#..C..#",
      "#T.#..#",
      "#######"
    ]
  },
  {
    "id": 44,
    "title": "Combo 1",
    "world": 5,
    "parMoves": 86,
    "solution": "DRUDRRURLLUURDLDRDLLLURLURRURD",
    "grid": [
      "..####...",
      "###..####",
      "#.......#",
      "#PC***T.#",
      "#.......#",
      "#########"
    ]
  },
  {
    "id": 45,
    "title": "Combo 2",
    "world": 5,
    "parMoves": 88,
    "solution": "LLULUURDRDLDDRRULDLUURULULUURDRDLRDDLDDRRULDLUUUURULUURDDDDDLDDRRULDLUUUUURUL",
    "grid": [
      "..####.",
      ".##..#.",
      ".#T.C#.",
      ".#TC.#.",
      ".#TC.#.",
      ".#TC.#.",
      ".#T.C##",
      ".#...P#",
      ".##...#",
      "..#####"
    ]
  },
  {
    "id": 46,
    "title": "Puzzle Box",
    "world": 5,
    "parMoves": 90,
    "grid": [
      "####...........",
      "#..############",
      "#.C.C.C.C.C.P.#",
      "#.TTTTT.......#",
      "###############"
    ]
  },
  {
    "id": 47,
    "title": "Brain Teaser",
    "world": 5,
    "parMoves": 92,
    "solution": "DRRUULLULLDRRRLDDRRUUUUDDLLULLULLDDRRRRRLDDRRUUUDLLULLULDLDRRRRRLDDRRUU",
    "grid": [
      "......###",
      "#####.#T#",
      "#...###T#",
      "#...C.#T#",
      "#.C..C..#",
      "#####P#.#",
      "....#...#",
      "....#####"
    ]
  },
  {
    "id": 48,
    "title": "The Gauntlet",
    "world": 5,
    "parMoves": 94,
    "solution": "LLLUUURRRDDUURRRRDDLLLRRRDDLLLULLRURR",
    "grid": [
      "##########",
      "#........#",
      "#.##T###.#",
      "#.#.CC.T.#",
      "#.T.PC##.#",
      "#####....#",
      "....######"
    ]
  },
  {
    "id": 49,
    "title": "Penultimate",
    "world": 5,
    "parMoves": 96,
    "solution": "RUULLLUULLDDRLUURRDDRRRDDLURULLLUULLDDRRDDLLDDRRUUUURRURDLLLLLUURRDULLDDRRRRDRUDDRRUL",
    "grid": [
      "#####.....",
      "#...####..",
      "#.#.#.T#..",
      "#....C.###",
      "###.#CT..#",
      "#...#P...#",
      "#.#.######",
      "#...#.....",
      "#####....."
    ]
  },
  {
    "id": 50,
    "title": "Final Exam",
    "world": 5,
    "parMoves": 98,
    "solution": "UDLLURUURRDDULDUULDD",
    "grid": [
      ".#####.",
      ".#...#.",
      "##...##",
      "#.CCC.#",
      "#.T+T.#",
      "#######"
    ]
  }
]