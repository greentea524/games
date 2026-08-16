// Storage checks (#104), focused on `migrateKey`.
//
//   npx tsx shared/storage_test.ts
//
// Renaming a storage key on a deployed site is the kind of change that looks
// free and silently destroys every existing save. These assert the rules that
// make it safe, against a stubbed localStorage so no browser is needed.
import { migrateKey, loadSave, saveSave } from './storage'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

/** Minimal localStorage stand-in. `failWrites` models a full or disabled store. */
function stubStorage(initial: Record<string, string> = {}, failWrites = false) {
  const map = new Map(Object.entries(initial))
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      if (failWrites) throw new DOMException('QuotaExceededError')
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
  ;(globalThis as { localStorage?: unknown }).localStorage = store
  return map
}

// --- the happy path -------------------------------------------------------

let map = stubStorage({ old_key: 'seven' })
check('a value moves to the new key', migrateKey('old_key', 'new_key') === true)
check('the new key holds it', map.get('new_key') === 'seven', `got ${map.get('new_key')}`)
check('the old key is removed', !map.has('old_key'))

// --- the rules that stop it destroying data -------------------------------

map = stubStorage({ old_key: 'stale', new_key: 'current' })
check('an existing new value is never clobbered', migrateKey('old_key', 'new_key') === false)
check('the newer value survives', map.get('new_key') === 'current', `got ${map.get('new_key')}`)

map = stubStorage({})
check('a player who never had the old key is unaffected', migrateKey('old_key', 'new_key') === false)
check('and no empty value is written', !map.has('new_key'))

map = stubStorage({ old_key: 'v' })
check('migrating to the same key is a no-op', migrateKey('old_key', 'old_key') === false)
check('and leaves the value alone', map.get('old_key') === 'v')

// A failed write must leave the original in place, so the next startup can
// retry rather than the save being lost between the two operations.
map = stubStorage({ old_key: 'precious' }, true)
check('a failed write reports failure', migrateKey('old_key', 'new_key') === false)
check('and does not delete the original', map.get('old_key') === 'precious')

// --- idempotence ----------------------------------------------------------
//
// This runs on every startup, so running twice must not differ from once.
map = stubStorage({ old_key: 'once' })
migrateKey('old_key', 'new_key')
const afterFirst = map.get('new_key')
check('running again changes nothing', migrateKey('old_key', 'new_key') === false)
check('the value is stable', map.get('new_key') === afterFirst)

// --- a migrated pre-envelope value is still readable -----------------------
//
// The old cart-crate-level was a bare "7", not an envelope. It arrives at
// loadSave with a null version, which is exactly the case a revive handles.
stubStorage({ legacy: '7' })
const revived = loadSave('legacy', 1, 0, (payload) => {
  const n = typeof payload === 'number' ? payload : Number(payload)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
})
check('a migrated pre-envelope value still reads', revived === 7, `got ${revived}`)

stubStorage({ legacy: 'not-a-number' })
const junk = loadSave('legacy', 1, 0, (payload) => {
  const n = typeof payload === 'number' ? payload : Number(payload)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
})
check('a malformed value falls back rather than yielding NaN', junk === 0, `got ${junk}`)

// --- writes never throw ---------------------------------------------------

stubStorage({}, true)
check('a write to a full store reports failure instead of throwing', saveSave('k', 1, {}) === false)

console.log(ok ? '\nALL STORAGE CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
