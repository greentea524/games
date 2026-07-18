export interface LevelConfig {
  id: number
  title: string
  world: number
  parMoves: number
  grid: string[]
}

export const CAMPAIGN_LEVELS: LevelConfig[] = [
  {
    id: 1,
    title: "First Delivery",
    world: 1,
    parMoves: 4,
    grid: [
      '##########',
      '#........#',
      '#.P.C..T.#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
  },
  {
    id: 2,
    title: "Double Crate",
    world: 1,
    parMoves: 8,
    grid: [
      '##########',
      '#........#',
      '#.P......#',
      '#...C..T.#',
      '#...C..T.#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
  },
  {
    id: 3,
    title: "Slippery Ice",
    world: 1,
    parMoves: 6,
    grid: [
      '##########',
      '#........#',
      '#.P.I.C.T#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
  },
  {
    id: 4,
    title: "Cracked Floor",
    world: 1,
    parMoves: 7,
    grid: [
      '##########',
      '#........#',
      '#.P.X.C.T#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
  },
  {
    id: 5,
    title: "Warehouse Master",
    world: 1,
    parMoves: 12,
    grid: [
      '##########',
      '#..#.....#',
      '#.P.C.I.T#',
      '#...C...T#',
      '#..#.....#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ],
  },
]
