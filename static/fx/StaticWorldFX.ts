import Phaser from 'phaser'
import { GameState } from '../state'
import { prefersReducedMotion } from '../../shared/motion'

// Static-side post-process (#47): true desaturation as a duotone
// (dark slate -> pale cyan = the "grays + one accent" look), CRT
// scanlines, animated grain, and an occasional one-frame glitch band.
// Applied to the world camera only while GameState.world === 'static'.
//
// On the green screen it is none of those (#181). The duotone turned the
// whole Static side slate blue there, which is every pixel of the screen in
// colours the mode does not have. There the picture is snapped to the four
// tones, and the grain is a speckle of pixels knocked a tone either way:
// wrong, and still four tones. The glitch band only moves pixels, so it
// stays. Stepping every tone one darker as well was tried: with the darkness
// over it the whole town came out one tone, and nothing could be seen.
//
// Under reduced motion the grain and the band hold still (`uStill`).
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uDmg;
uniform float uStill;
varying vec2 outTexCoord;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 tone(float i) {
  if (i < 0.5) return vec3(0.059, 0.220, 0.059);
  if (i < 1.5) return vec3(0.188, 0.384, 0.188);
  if (i < 2.5) return vec3(0.545, 0.675, 0.059);
  return vec3(0.608, 0.737, 0.059);
}

void main() {
  vec2 uv = outTexCoord;

  // Occasional glitch: a thin horizontal band shifts for a few frames.
  float t = floor(uTime * 8.0) * (1.0 - uStill);
  float glitchOn = step(0.93, rand(vec2(t, 3.7))) * (1.0 - uStill);
  float band = step(abs(uv.y - rand(vec2(t, 9.1))), 0.02);
  uv.x += glitchOn * band * (rand(vec2(t, uv.y)) - 0.5) * 0.10;

  vec4 c = texture2D(uMainSampler, uv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  // One grain to a game pixel, shimmering at ~8fps for a broadcast feel.
  vec2 cell = floor(uv * vec2(240.0, 216.0));
  float g = rand(cell + vec2(t * 13.0, t * 7.0));

  if (uDmg > 0.5) {
    // Which of the four tones this is, by brightness; the thresholds sit
    // between the tones, but for the lowest, which is set under the lawn as
    // the darkness leaves it: so a dark town is two tones and not one.
    float i = step(0.16, lum) + step(0.435, lum) + step(0.594, lum);
    i = clamp(i + step(0.96, g) - step(g, 0.04), 0.0, 3.0);
    gl_FragColor = vec4(tone(i), c.a);
    return;
  }

  // Grayscale -> duotone (single sickly-cyan accent).
  vec3 darkc = vec3(0.06, 0.09, 0.11);
  vec3 lightc = vec3(0.70, 0.82, 0.83);
  vec3 col = mix(darkc, lightc, lum);

  // Scanlines: every other row slightly darker.
  float scan = 0.90 + 0.10 * step(0.5, fract(uv.y * 108.0));
  col *= scan;

  col += (g - 0.5) * 0.10;

  gl_FragColor = vec4(col, c.a);
}
`

export class StaticWorldFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAG })
  }

  onPreRender() {
    this.set1f('uTime', this.game.loop.time / 1000)
    this.set1f('uDmg', GameState.paletteMode === 'dmg' ? 1 : 0)
    this.set1f('uStill', prefersReducedMotion() ? 1 : 0)
  }
}
