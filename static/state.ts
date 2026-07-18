// Global game state: story flags + inventory + UI-blocking status.
// Kept as a single object so Phase 4 can serialize it to localStorage.
class GameStateClass {
  flags: Record<string, boolean> = {}
  inventory: string[] = []
  dialogueActive = false
  inventoryOpen = false
  // Game-clock time (ms) a dialogue/menu last closed; used to debounce the
  // shared interact key so closing a box doesn't immediately reopen it.
  uiClosedAt = 0

  get uiBlocking(): boolean {
    return this.dialogueActive || this.inventoryOpen
  }

  setFlag(key: string) {
    this.flags[key] = true
  }
  getFlag(key: string): boolean {
    return !!this.flags[key]
  }

  addItem(id: string): boolean {
    if (!this.inventory.includes(id)) {
      this.inventory.push(id)
      return true
    }
    return false
  }
  hasItem(id: string): boolean {
    return this.inventory.includes(id)
  }
}

export const GameState = new GameStateClass()
