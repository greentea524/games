import Phaser from 'phaser'

// Static-side post-process (#47): true desaturation as a duotone
// (dark slate -> pale cyan = the "grays + one accent" look), CRT
// scanlines, animated grain, and an occasional one-frame glitch band.
// Applied to the world camera only while GameState.world === 'static'.
const FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
varying vec2 outTexCoord;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = outTexCoord;

  // Occasional glitch: a thin horizontal band shifts for a few frames.
  float t = floor(uTime * 8.0);
  float glitchOn = step(0.93, rand(vec2(t, 3.7)));
  float band = step(abs(uv.y - rand(vec2(t, 9.1))), 0.02);
  uv.x += glitchOn * band * (rand(vec2(t, uv.y)) - 0.5) * 0.10;

  vec4 c = texture2D(uMainSampler, uv);

  // Grayscale -> duotone (single sickly-cyan accent).
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 darkc = vec3(0.06, 0.09, 0.11);
  vec3 lightc = vec3(0.70, 0.82, 0.83);
  vec3 col = mix(darkc, lightc, lum);

  // Scanlines: every other logical (144px) row slightly darker.
  float scan = 0.90 + 0.10 * step(0.5, fract(uv.y * 72.0));
  col *= scan;

  // Animated grain, shimmering at ~8fps for a retro broadcast feel.
  float g = rand(uv * vec2(160.0, 144.0) + vec2(t * 13.0, t * 7.0));
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
  }
}
