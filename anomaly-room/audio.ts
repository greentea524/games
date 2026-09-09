// The Anomaly Room's sound (#114).
//
// #114 is blunt that atmosphere is the hard part and that it is "nearly all
// audio and lighting" — a silent, evenly lit room with a moved chair is a
// spot-the-difference puzzle, not a game. So: a low drone that sits under
// everything, and a stinger when a flag lands.
//
// Synthesised rather than sampled, which is not a purity argument. The page's
// CSP allows `media-src 'self'`, so a file would have to ship in the bundle,
// and a drone long enough not to loop audibly is the largest asset in the
// repo by an order of magnitude. Two oscillators and a filter are a few
// hundred bytes and never loop at all.
//
// Nothing starts before a gesture. Browsers suspend an `AudioContext` created
// outside one, and a game that assumed otherwise would be silent for every
// player whose browser enforces it.

export interface RoomAudio {
  /** Starts the context, if a gesture has made that legal. Idempotent. */
  wake(): void
  /** The two-note answer to a flag. */
  sting(correct: boolean): void
  muted(): boolean
  setMuted(muted: boolean): void
  dispose(): void
}

/** Drone pitches, a fifth apart and slightly detuned so they beat slowly. */
const DRONE = [55, 82.9, 83.6]

export function createRoomAudio(): RoomAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false
  let started = false

  function ensure(): AudioContext | null {
    if (ctx) return ctx
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ctx.destination)
    return ctx
  }

  function startDrone(context: AudioContext, out: GainNode) {
    // Rolled off hard. The drone is meant to be felt rather than heard; with
    // the top end left in it turns into a hum you notice, which is the
    // opposite of the job.
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 220
    filter.Q.value = 0.6

    const bed = context.createGain()
    bed.gain.value = 0
    bed.gain.linearRampToValueAtTime(0.045, context.currentTime + 4)

    for (const hz of DRONE) {
      const osc = context.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = hz
      const level = context.createGain()
      level.gain.value = hz < 60 ? 0.6 : 0.2
      osc.connect(level).connect(filter)
      osc.start()
    }
    filter.connect(bed).connect(out)
  }

  return {
    wake() {
      const context = ensure()
      if (!context) return
      void context.resume()
      if (started || !master) return
      started = true
      startDrone(context, master)
    },
    sting(correct) {
      const context = ensure()
      const out = master
      if (!context || !out || muted) return
      void context.resume()
      const now = context.currentTime
      // Up for a hit, down for a miss. The interval carries the whole message,
      // which means it still reads with the sound turned most of the way down.
      const notes = correct ? [523.25, 783.99] : [196, 146.83]
      notes.forEach((hz, i) => {
        const osc = context.createOscillator()
        osc.type = correct ? 'triangle' : 'sawtooth'
        osc.frequency.value = hz
        const env = context.createGain()
        const at = now + i * 0.09
        env.gain.setValueAtTime(0, at)
        env.gain.linearRampToValueAtTime(correct ? 0.16 : 0.12, at + 0.012)
        env.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)
        osc.connect(env).connect(out)
        osc.start(at)
        osc.stop(at + 0.45)
      })
    },
    muted: () => muted,
    setMuted(next) {
      muted = next
      if (master && ctx) {
        master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05)
      }
    },
    dispose() {
      void ctx?.close()
      ctx = null
      master = null
      started = false
    },
  }
}
