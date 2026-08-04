// Global game state: story flags + inventory + UI-blocking status,
// serialized to localStorage (#16).
import { TRANSFORMS, type TransformEvent } from './items'

const SAVE_KEY = 'static_save'
const SAVE_VERSION = 1

class GameStateClass {
  flags: Record<string, boolean> = {}
  inventory: string[] = []
  dialogueActive = false
  inventoryOpen = false
  uiClosedAt = 0
  chapter = 1
  // Last safe checkpoint (map entry); Continue restores here.
  lastMap: { mapKey: string; tx: number; ty: number } | null = null

  // Dual-world (Phase 3). In-memory for now; #16 persists it.
  world: 'normal' | 'static' = 'normal'

  /**
   * Flips the world and swaps every carried item for its counterpart.
   * Returns what changed so the caller can surface it — the swap used to
   * happen silently inside a closed menu, which made the mechanic invisible
   * to anyone who wasn't already looking for it (#72).
   */
  toggleWorld(): TransformEvent[] {
    this.world = this.world === 'normal' ? 'static' : 'normal'
    const changed: TransformEvent[] = []
    this.inventory = this.inventory.map(id => {
      for (const t of TRANSFORMS) {
        if (this.world === 'static' && id === t.normal) {
          changed.push({ itemId: t.statik, message: t.intoStatic })
          return t.statik
        }
        if (this.world === 'normal' && id === t.statik) {
          changed.push({ itemId: t.normal, message: t.intoNormal })
          return t.normal
        }
      }
      return id
    })
    return changed
  }

  paletteMode: 'dmg' | 'gbc' =
    (localStorage.getItem('static_palette') as 'dmg' | 'gbc') || 'gbc'

  setPaletteMode(mode: 'dmg' | 'gbc') {
    this.paletteMode = mode
    localStorage.setItem('static_palette', mode)
  }

  get uiBlocking(): boolean {
    return this.dialogueActive || this.inventoryOpen
  }

  setFlag(key: string) {
    this.flags[key] = true
    this.save() // flags are story progress: always autosave
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
  removeItem(id: string) {
    this.inventory = this.inventory.filter(i => i !== id)
  }

  // ---- Save system (#16): autosave at checkpoints + on flag changes ----
  checkpoint(mapKey: string, tx: number, ty: number) {
    this.lastMap = { mapKey, tx, ty }
    this.save()
  }

  save() {
    if (!this.lastMap) return // nothing meaningful to restore yet
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        chapter: this.chapter,
        flags: this.flags,
        inventory: this.inventory,
        world: this.world,
        ...this.lastMap,
      }),
    )
  }

  hasSave(): boolean {
    return !!localStorage.getItem(SAVE_KEY)
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return false
      const d = JSON.parse(raw)
      if (d.version !== SAVE_VERSION) return false // schema mismatch: fresh start
      this.chapter = d.chapter ?? 1
      this.flags = d.flags ?? {}
      this.inventory = Array.isArray(d.inventory) ? d.inventory : []
      this.world = d.world === 'static' ? 'static' : 'normal'
      this.lastMap = { mapKey: d.mapKey ?? 'town', tx: d.tx ?? 11, ty: d.ty ?? 18 }
      return true
    } catch {
      return false
    }
  }

  reset() {
    this.flags = {}
    this.inventory = []
    this.world = 'normal'
    this.chapter = 1
    this.lastMap = null
    localStorage.removeItem(SAVE_KEY)
  }
}

export const GameState = new GameStateClass()
