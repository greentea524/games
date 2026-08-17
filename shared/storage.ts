// One read/write path for every game's saved state (#67).
//
// Before this, four games each hand-rolled localStorage access and only one
// checked a version, so a malformed or stale value failed differently in each.
// The rules here are the same everywhere:
//
//   - reads never throw and never return a half-parsed value
//   - a missing, unreadable, or wrong-version payload yields the fallback
//   - writes never throw, so a full or disabled localStorage cannot kill a run
//
// Payloads are wrapped in a small envelope so the version travels with the
// data instead of being mixed into it:
//
//   { "v": 2, "d": { ...game state... } }

/** The envelope written by `saveSave`. */
interface Envelope {
  v: number
  d: unknown
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Envelope).v === 'number' &&
    'd' in (value as Envelope)
  )
}

/**
 * Reads localStorage without letting it throw.
 *
 * Access itself can throw, not just fail — Safari's private mode and some
 * embedded webviews raise on the property access rather than returning null.
 */
function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Loads saved state, or `fallback` if there is nothing usable there.
 *
 * `revive` is where a caller validates its own shape and handles its own older
 * formats — this module cannot know either. It receives the payload and the
 * version that was stored (`null` when the value predates versioning), and
 * returns the state to use, or `null` to fall back.
 *
 * Without `revive`, the payload is returned only when its version matches
 * exactly. That is the strict default: a value this code does not recognise is
 * treated as absent rather than trusted.
 */
export function loadSave<T>(
  key: string,
  version: number,
  fallback: T,
  revive?: (payload: unknown, storedVersion: number | null) => T | null,
): T {
  const raw = readRaw(key)
  if (raw === null) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallback
  }

  let payload: unknown
  let storedVersion: number | null

  if (isEnvelope(parsed)) {
    payload = parsed.d
    storedVersion = parsed.v
  } else {
    // Pre-envelope value. Some of these carried an inline `version` field;
    // honour it so a caller can tell "old format" from "unknown format".
    payload = parsed
    const inline =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { version?: unknown }).version
        : undefined
    storedVersion = typeof inline === 'number' ? inline : null
  }

  if (revive) {
    const revived = revive(payload, storedVersion)
    return revived === null ? fallback : revived
  }

  return storedVersion === version ? (payload as T) : fallback
}

/**
 * Writes saved state. Returns whether it landed, for the rare caller that
 * wants to know; ignoring it is fine, which is the point — a failed write
 * must not interrupt play.
 */
export function saveSave(key: string, version: number, data: unknown): boolean {
  try {
    const envelope: Envelope = { v: version, d: data }
    localStorage.setItem(key, JSON.stringify(envelope))
    return true
  } catch {
    // Quota exceeded, disabled storage, or a value that will not serialise.
    return false
  }
}

/** Removes saved state. Safe to call when there is none. */
export function clearSave(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * Moves a value from an old key to a new one, once (#104).
 *
 * Renaming a storage key on a deployed site silently orphans every existing
 * save: the old key is simply never read again, and the player's progress
 * appears to vanish. This copies the raw string across the first time the new
 * key is found empty, then removes the old one.
 *
 * Raw, not parsed, so it works for envelopes and for the plain `'1'`/`'0'`
 * flags the mute settings use.
 *
 * Safe to call on every startup: once the new key exists this does nothing,
 * and a player who never had the old key is unaffected.
 *
 * @returns whether anything was moved.
 */
export function migrateKey(oldKey: string, newKey: string): boolean {
  if (oldKey === newKey) return false
  // Never clobber a newer value with a stale one.
  if (readRaw(newKey) !== null) return false
  const legacy = readRaw(oldKey)
  if (legacy === null) return false
  try {
    localStorage.setItem(newKey, legacy)
    localStorage.removeItem(oldKey)
    return true
  } catch {
    // Storage full or disabled. Leaving the old key in place is the right
    // failure: the next startup tries again rather than losing the save.
    return false
  }
}
