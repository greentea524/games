// Global game state: story flags + inventory + UI-blocking status,
// serialized to localStorage (#16).
import { TRANSFORMS, type TransformEvent } from './items'
import { loadSave, saveSave, clearSave } from '../shared/storage'

interface Saved {
  chapter: number
  flags: Record<string, boolean>
  inventory: string[]
  world: 'normal' | 'static'
  mapKey: string
  tx: number
  ty: number
}

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

  /**
   * Notified whenever a story flag is newly set (#95).
   *
   * Story flags are the only thing the world reacts to, so a change to one is
   * exactly the signal a scene needs to re-check which chapter beats are due.
   * Before this, beats were only evaluated when a map was built, so a beat
   * whose trigger flag was set while the player was already standing on the
   * map it belongs to was never seen at all.
   *
   * Subscribers must unsubscribe when their scene shuts down — a scene restart
   * would otherwise leave the old one holding a destroyed scene.
   */
  private flagListeners = new Set<() => void>()

  onFlagChange(fn: () => void): () => void {
    this.flagListeners.add(fn)
    return () => this.flagListeners.delete(fn)
  }

  setFlag(key: string) {
    if (this.flags[key]) return // already set: nothing changed, notify nobody
    this.flags[key] = true
    this.save() // flags are story progress: always autosave
    // Copied, because a listener is allowed to set another flag in response.
    for (const fn of [...this.flagListeners]) fn()
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
    saveSave(SAVE_KEY, SAVE_VERSION, {
      chapter: this.chapter,
      flags: this.flags,
      inventory: this.inventory,
      world: this.world,
      ...this.lastMap,
    })
  }

  hasSave(): boolean {
    return this.readSave() !== null
  }

  /**
   * Both shapes are accepted: the envelope written now, and the pre-#67 value
   * that carried `version: 1` inline. Both are version 1 payloads with the
   * same fields, so `storedVersion` tells them apart without either branch
   * needing different handling.
   */
  private readSave(): Saved | null {
    return loadSave<Saved | null>(SAVE_KEY, SAVE_VERSION, null, (payload, storedVersion) => {
      if (storedVersion !== SAVE_VERSION) return null // unknown schema: fresh start
      if (typeof payload !== 'object' || payload === null) return null
      const d = payload as Record<string, unknown>
      return {
        chapter: typeof d.chapter === 'number' ? d.chapter : 1,
        flags:
          typeof d.flags === 'object' && d.flags !== null
            ? (d.flags as Record<string, boolean>)
            : {},
        inventory: Array.isArray(d.inventory) ? (d.inventory as string[]) : [],
        world: d.world === 'static' ? 'static' : 'normal',
        mapKey: typeof d.mapKey === 'string' ? d.mapKey : 'town',
        tx: typeof d.tx === 'number' ? d.tx : 11,
        ty: typeof d.ty === 'number' ? d.ty : 18,
      }
    })
  }

  load(): boolean {
    const d = this.readSave()
    if (!d) return false
    this.chapter = d.chapter
    this.flags = d.flags
    this.inventory = d.inventory
    this.world = d.world
    this.lastMap = { mapKey: d.mapKey, tx: d.tx, ty: d.ty }
    return true
  }

  reset() {
    this.flags = {}
    this.inventory = []
    this.world = 'normal'
    this.chapter = 1
    this.lastMap = null
    clearSave(SAVE_KEY)
  }
}

export const GameState = new GameStateClass()
