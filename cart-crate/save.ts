export interface LevelSaveData {
  completed: boolean
  stars: number
  bestMoves: number
}

export class SaveSystem {
  private static STORAGE_KEY = 'cart_crate_save_v1'

  static getLevelData(levelId: number): LevelSaveData {
    const raw = localStorage.getItem(this.STORAGE_KEY)
    if (!raw) return { completed: false, stars: 0, bestMoves: 0 }
    try {
      const data = JSON.parse(raw)
      return data[levelId] || { completed: false, stars: 0, bestMoves: 0 }
    } catch {
      return { completed: false, stars: 0, bestMoves: 0 }
    }
  }

  static saveLevelCompletion(levelId: number, moves: number, parMoves: number): number {
    const raw = localStorage.getItem(this.STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : {}

    let stars = 1
    if (moves <= parMoves) stars = 3
    else if (moves <= parMoves + 3) stars = 2

    const prev = data[levelId] || { completed: false, stars: 0, bestMoves: 999 }
    data[levelId] = {
      completed: true,
      stars: Math.max(prev.stars, stars),
      bestMoves: Math.min(prev.bestMoves || 999, moves),
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    return stars
  }
}
