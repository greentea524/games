// audio.ts
// Lightweight Web Audio API synth for 8-bit sound effects

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()

function playTone(
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  vol: number = 0.1
) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  osc.type = type
  osc.connect(gain)
  gain.connect(audioCtx.destination)

  const now = audioCtx.currentTime
  osc.frequency.setValueAtTime(freqStart, now)
  if (freqStart !== freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration)
  }

  gain.gain.setValueAtTime(vol, now)
  gain.gain.exponentialRampToValueAtTime(0.01, now + duration)

  osc.start(now)
  osc.stop(now + duration)
}

function playNoise(duration: number, vol: number = 0.1) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  const bufferSize = audioCtx.sampleRate * duration
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const noise = audioCtx.createBufferSource()
  noise.buffer = buffer

  // Simple bandpass filter for "woosh" or "hit" sound
  const filter = audioCtx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1000

  const gain = audioCtx.createGain()
  gain.gain.setValueAtTime(vol, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration)

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(audioCtx.destination)

  noise.start()
}

export const sfx = {
  jump: () => playTone('square', 150, 300, 0.15, 0.05),
  doubleJump: () => playTone('square', 200, 400, 0.15, 0.05),
  dash: () => playNoise(0.2, 0.15),
  wallKick: () => {
    playTone('square', 100, 50, 0.1, 0.05)
    playNoise(0.1, 0.05)
  },
  land: () => playTone('triangle', 80, 40, 0.1, 0.05),
  lantern: () => playTone('sine', 400, 800, 0.3, 0.1),
  win: () => {
    playTone('square', 400, 400, 0.2, 0.1)
    setTimeout(() => playTone('square', 500, 500, 0.2, 0.1), 200)
    setTimeout(() => playTone('square', 600, 800, 0.4, 0.1), 400)
  },
  die: () => playTone('sawtooth', 200, 50, 0.5, 0.1)
}
