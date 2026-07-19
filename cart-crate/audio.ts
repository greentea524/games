let zzfxV = 0.3
let zzfxX: AudioContext

export const zzfxInit = () => {
  if (!zzfxX) {
    zzfxX = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (zzfxX.state === 'suspended') {
    zzfxX.resume()
  }
}

export const zzfx = (...zzfxParams: any[]) => {
  if (!zzfxX) return
  return zzfxP(zzfxG(...zzfxParams))
}

const zzfxP = (...t: any[]) => {
  let e = zzfxX.createBufferSource(),
    f = zzfxX.createBuffer(t.length, t[0].length, zzfxX.sampleRate)
  t.map((d, i) => f.getChannelData(i).set(d))
  e.buffer = f
  e.connect(zzfxX.destination)
  e.start()
  return e
}

const zzfxG = (
  q = 1,
  k = 0.05,
  c = 220,
  e = 0,
  t = 0,
  m = 0.1,
  r = 0,
  F = 1,
  v = 0,
  z = 0,
  w = 0,
  A = 0,
  l = 0,
  B = 0,
  x = 0,
  A2 = 0,
  d = 0,
  u = 1,
  c2 = 0,
  b = 0
) => {
  let y = 2 * Math.PI,
    H = (v *= (500 * y) / zzfxX.sampleRate ** 2),
    I = (0 < x ? 1 : -1) * (y / 4),
    J = (c *= (1 + 2 * k * Math.random() - k) * (y / zzfxX.sampleRate)),
    Z = [],
    g = 0,
    E = 0,
    a = 0,
    n = 1,
    J2 = 0,
    K = 0,
    f = 0,
    p = 0,
    h

  e = 99 + zzfxX.sampleRate * e
  m = zzfxX.sampleRate * m
  r = zzfxX.sampleRate * r
  t = zzfxX.sampleRate * t
  d = zzfxX.sampleRate * d

  for (h = e + m + r + t + d; a < h; Z[a++] = f)
    ++K > 100 * c2 &&
      ((K = 0),
      (f =
        g *
        q *
        zzfxV *
        (a < e
          ? a / e
          : a < e + m
          ? 1 - ((a - e) / m) * (1 - F)
          : a < e + m + r
          ? F
          : a < h - d
          ? ((h - a - d) / t) * F
          : 0)),
      (f = f ? (x ? f / 2 + (x > 0 ? -0.5 : 0) * Math.sin(I) : Math.sin(g)) : 0),
      (f = b ? f / 2 + b * p : f)),
      (p = f),
      (g += J += H += v += w *= y / zzfxX.sampleRate ** 3),
      (E += 1 + A * Math.sin((a * B * y) / zzfxX.sampleRate)),
      (n += 1 - u),
      (J2 += (z * y) / zzfxX.sampleRate),
      (g += z ? Math.sin(J2) * n : 0),
      (I += (A2 * y) / zzfxX.sampleRate)

  return [Z]
}

// Predefined sounds
export const playMove = () => zzfx(1.2,0.05,400,0,0,0.02,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playPush = () => zzfx(1.5,0.05,120,0,0.02,0.1,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playDock = () => zzfx(1,0.05,800,0.05,0.05,0.1,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playFall = () => zzfx(1,0.2,400,0,0.2,0.3,1,1,-5,0,0,0,0,0,0,0,0,1,0,0)
export const playWin = () => {
  zzfx(1,0.1,600,0.05,0.05,0.1,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
  setTimeout(() => zzfx(1,0.1,800,0.05,0.05,0.2,0,1,0,0,0,0,0,0,0,0,0,1,0,0), 150)
  setTimeout(() => zzfx(1,0.1,1200,0.1,0.1,0.3,0,1,0,0,0,0,0,0,0,0,0,1,0,0), 300)
}
export const playMenuSelect = () => zzfx(0.5,0.05,600,0,0,0.02,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
export const playMenuConfirm = () => zzfx(1,0.05,900,0,0.05,0.05,0,1,0,0,0,0,0,0,0,0,0,1,0,0)
