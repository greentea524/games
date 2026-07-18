// Global game state: story flags + inventory + UI-blocking status.
// Kept as a single object so Phase 4 can serialize it to localStorage.
class GameStateClass {
  flags: Record<string, boolean> = {}
  inventory: string[] = []
  dialogueActive = false
  inventoryOpen = false
  uiClosedAt = 0

  paletteMode: 'dmg' | 'gbc' =
    (localStorage.getItem('static_palette') as 'dmg' | 'gbc') || 'dmg'

  setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
    localStorage.setItem('static_palette', mode)
  }

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
