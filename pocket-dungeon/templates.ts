export interface RoomTemplate {
  width: number
  height: number
  grid: string[]
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  // 5x5 Square
  {
    width: 5,
    height: 5,
    grid: [
      '.....',
      '.....',
      '.....',
      '.....',
      '.....'
    ]
  },
  // 7x7 Square
  {
    width: 7,
    height: 7,
    grid: [
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......'
    ]
  },
  // L-Shape
  {
    width: 7,
    height: 7,
    grid: [
      '.......',
      '.......',
      '.......',
      '...####',
      '...####',
      '...####',
      '...####'
    ]
  },
  // Plus Shape
  {
    width: 7,
    height: 7,
    grid: [
      '##...##',
      '##...##',
      '.......',
      '.......',
      '.......',
      '##...##',
      '##...##'
    ]
  },
  // Pillars
  {
    width: 7,
    height: 7,
    grid: [
      '.......',
      '.#.#.#.',
      '.......',
      '.#.#.#.',
      '.......',
      '.#.#.#.',
      '.......'
    ]
  },
  // Big Room with center block
  {
    width: 9,
    height: 9,
    grid: [
      '.........',
      '.........',
      '.........',
      '...###...',
      '...###...',
      '...###...',
      '.........',
      '.........',
      '.........'
    ]
  },
  // Small Room
  {
    width: 3,
    height: 3,
    grid: [
      '...',
      '...',
      '...'
    ]
  },
  // Diamond
  {
    width: 7,
    height: 7,
    grid: [
      '###.###',
      '##...##',
      '#.....#',
      '.......',
      '#.....#',
      '##...##',
      '###.###'
    ]
  },
  // Cross Hallway
  {
    width: 5,
    height: 5,
    grid: [
      '##.##',
      '##.##',
      '.....',
      '##.##',
      '##.##'
    ]
  }
]
