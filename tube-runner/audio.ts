// Tube Runner's noises. Same approach as Tower Stacker's: synthesised, so no
// audio files ship and the CSP needs nothing beyond the `data:`/`blob:` it
// already grants for `media-src`.
let ctx: AudioContext | null = null
let muted = false

export function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function setMuted(next: boolean): void {
  muted = next
}
export function isMuted(): boolean {
  return muted
}

function tone(
  freq: number,
  endFreq: number,
  durationMs: number,
  type: OscillatorType,
  gain: number,
): void {
  if (muted) return
  const ac = ensureCtx()
  if (!ac) return
  const now = ac.currentTime
  const dur = durationMs / 1000
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + dur)
  amp.gain.setValueAtTime(0.0001, now)
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(amp).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

/**
 * Passing through a ring. Short and dry — one of these fires every third of a
 * second at the speed cap, so anything with a tail would smear into a drone.
 */
export function playClear(count: number): void {
  const step = count % 8
  tone(440 * Math.pow(2, step / 12), 0, 55, 'square', 0.1)
}

/** Clipping a ring. The run is over. */
export function playCrash(): void {
  tone(180, 40, 620, 'sawtooth', 0.2)
}

/** Menus. */
export function playBlip(): void {
  tone(620, 880, 60, 'square', 0.12)
}
