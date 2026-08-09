// The panel a game shows when a run ends (#66).
//
// Every game used to end abruptly — the scene restarted or kicked back to the
// menu, and nothing told you how the run went. Nothing was counted, so nothing
// was worth beating next time. Windup was the clearest case: it has tracked
// run time since #79 and threw the number away.
//
// Each game supplies its own stats and its own palette; the layout, the
// highlight flash and the dismiss handling are written once here.
//
// Deliberately a plain function over a scene rather than a Phaser.Scene
// subclass. Every game already has its own scene graph and depth conventions,
// and a shared scene would fight them — this just adds objects to whatever
// scene is already on screen, above everything else in it.
import Phaser from 'phaser'

export interface RunStat {
  /** Left column. Kept short: the screen is 160px, ~18 characters at 8px. */
  label: string
  /** Right column, already formatted. */
  value: string
  /** A new personal best. The panel pulses it so the eye lands there. */
  highlight?: boolean
}

/**
 * The four tones every game's `PAL` already defines. Passing a game's own
 * palette is what keeps the panel from looking like a foreign object, and is
 * also how DMG/GBC mode carries through without this module knowing about it.
 */
export interface RunSummaryPalette {
  darkest: number
  dark: number
  light: number
  lightest: number
}

export interface RunSummaryOptions {
  title: string
  stats: RunStat[]
  onDismiss: () => void
  /** One line under the title — 'Vault cleared!', a cause of death. */
  subtitle?: string
  palette?: RunSummaryPalette
  /** Overrides the automatic 'Z: continue' / 'Tap to continue'. */
  prompt?: string
  /**
   * How long input is ignored after the panel opens. The button press that
   * ended the run is usually still held, and without this the panel opens and
   * closes in the same frame.
   */
  inputLockMs?: number
}

const DEFAULT_PALETTE: RunSummaryPalette = {
  darkest: 0x0f380f,
  dark: 0x306230,
  light: 0x8bac0f,
  lightest: 0x9bbc0f,
}

const WIDTH = 160
const HEIGHT = 144
const FONT = '"Press Start 2P", monospace'
// Press Start 2P is a bitmap face on an 8px grid: at any other size the glyph
// strokes land between pixels and go mushy. Static learned this the hard way
// (#9787eb), so everything here is 8px and the layout is built around it.
const SIZE = 8

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

/**
 * Warns when text is too wide for the panel, in dev only.
 *
 * The screen is 160px and the font is a fixed 8px cell, so the panel fits
 * about 17 characters — and nothing about passing a 20-character subtitle
 * looks wrong until you see it hanging over both borders. Caught that way
 * once; this catches it at the source instead.
 */
function warnIfTooWide(text: string, budget: number, what: string) {
  if (!import.meta.env?.DEV) return
  if (text.length * SIZE > budget) {
    console.warn(
      `[runSummary] ${what} "${text}" is ${text.length} chars; the panel fits ` +
        `${Math.floor(budget / SIZE)} at ${SIZE}px and it will overhang.`,
    )
  }
}

/**
 * Renders the panel over `scene` and calls `onDismiss` once, when the player
 * acknowledges it.
 *
 * The caller owns what happens next — restart, back to the menu, next level.
 * This only handles the panel.
 */
export function showRunSummary(scene: Phaser.Scene, opts: RunSummaryOptions): void {
  const pal = opts.palette ?? DEFAULT_PALETTE
  const stats = opts.stats
  const depth = 5000

  const titleH = SIZE + 6
  const subtitleH = opts.subtitle ? SIZE + 4 : 0
  const rowH = 11
  const promptH = SIZE + 8
  const padding = 7
  const bodyH = titleH + subtitleH + 5 + stats.length * rowH + promptH
  const panelH = Math.min(HEIGHT - 8, bodyH + padding * 2)
  const panelW = WIDTH - 16
  const panelX = (WIDTH - panelW) / 2
  const panelY = (HEIGHT - panelH) / 2

  const parts: Phaser.GameObjects.GameObject[] = []
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    parts.push(o)
    return o
  }

  // A full-screen scrim, so whatever the run ended on stops competing for
  // attention without being hidden completely.
  add(
    scene.add
      .rectangle(0, 0, WIDTH, HEIGHT, pal.darkest, 0.72)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth),
  )

  const box = add(scene.add.graphics().setScrollFactor(0).setDepth(depth + 1))
  // Opaque, not near-opaque: at 0.96 a light ending card behind it ghosts
  // through the panel and competes with 8px text.
  box.fillStyle(pal.darkest, 1)
  box.fillRoundedRect(panelX, panelY, panelW, panelH, 4)
  box.lineStyle(1, pal.light, 1)
  box.strokeRoundedRect(panelX, panelY, panelW, panelH, 4)

  const textBudget = panelW - 12
  warnIfTooWide(opts.title, textBudget, 'title')
  if (opts.subtitle) warnIfTooWide(opts.subtitle, textBudget, 'subtitle')
  for (const s of stats) {
    warnIfTooWide(`${s.label}${s.value}`, textBudget - SIZE, `row "${s.label}"`)
  }

  let y = panelY + padding

  add(
    scene.add
      .text(WIDTH / 2, y, opts.title, {
        fontFamily: FONT,
        fontSize: `${SIZE}px`,
        color: hex(pal.lightest),
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth + 2),
  )
  y += titleH

  if (opts.subtitle) {
    add(
      scene.add
        .text(WIDTH / 2, y, opts.subtitle, {
          fontFamily: FONT,
          fontSize: `${SIZE}px`,
          color: hex(pal.light),
          resolution: 2,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(depth + 2),
    )
    y += subtitleH
  }

  const rule = add(scene.add.graphics().setScrollFactor(0).setDepth(depth + 2))
  rule.fillStyle(pal.dark, 1)
  rule.fillRect(panelX + 6, y + 1, panelW - 12, 1)
  y += 5

  for (const stat of stats) {
    add(
      scene.add
        .text(panelX + 7, y, stat.label, {
          fontFamily: FONT,
          fontSize: `${SIZE}px`,
          color: hex(pal.light),
          resolution: 2,
        })
        .setScrollFactor(0)
        .setDepth(depth + 2),
    )
    const value = add(
      scene.add
        .text(panelX + panelW - 7, y, stat.value, {
          fontFamily: FONT,
          fontSize: `${SIZE}px`,
          color: hex(pal.lightest),
          resolution: 2,
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(depth + 2),
    )
    // A personal best pulses rather than changing colour: these palettes only
    // have four tones and the two light ones are a hair apart, so a colour
    // swap would not read at all on a 160px screen.
    if (stat.highlight) {
      scene.tweens.add({
        targets: value,
        alpha: 0.25,
        duration: 420,
        yoyo: true,
        repeat: -1,
      })
    }
    y += rowH
  }

  const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const promptText = opts.prompt ?? (isDesktop ? 'Z: continue' : 'Tap to continue')
  const prompt = add(
    scene.add
      .text(WIDTH / 2, panelY + panelH - padding - SIZE, promptText, {
        fontFamily: FONT,
        fontSize: `${SIZE}px`,
        color: hex(pal.light),
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth + 2),
  )
  scene.tweens.add({ targets: prompt, alpha: 0.3, duration: 620, yoyo: true, repeat: -1 })

  // ---- dismissal ----

  const openedAt = scene.time.now
  const lockMs = opts.inputLockMs ?? 400
  let dismissed = false

  const keyboard = scene.input.keyboard
  const zKey = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
  const enterKey = keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)

  const cleanup = () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate)
    scene.input.off('pointerdown', onPointer)
    if (zKey) keyboard?.removeKey(zKey)
    if (enterKey) keyboard?.removeKey(enterKey)
    for (const part of parts) {
      scene.tweens.killTweensOf(part)
      part.destroy()
    }
  }

  const dismiss = () => {
    if (dismissed) return
    dismissed = true
    cleanup()
    opts.onDismiss()
  }

  function onPointer() {
    if (scene.time.now - openedAt < lockMs) return
    dismiss()
  }

  // Polled rather than event-driven, because Phaser resolves JustDown against
  // its own per-frame snapshot: a key already held when the panel opened would
  // otherwise never produce an event at all.
  function onUpdate() {
    if (dismissed || scene.time.now - openedAt < lockMs) return
    if (
      (zKey && Phaser.Input.Keyboard.JustDown(zKey)) ||
      (enterKey && Phaser.Input.Keyboard.JustDown(enterKey))
    ) {
      dismiss()
    }
  }

  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate)
  scene.input.on('pointerdown', onPointer)
  // A scene that shuts down under the panel takes its listeners with it.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
}

/**
 * mm:ss:mmm — the exact format Windup's HUD uses.
 *
 * Matched rather than prettified so the number on the summary is the number
 * the player was just watching tick. A different format here would read as a
 * different measurement.
 */
export function formatRunTime(ms: number): string {
  const total = Math.max(0, ms)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = Math.floor(total % 1000)
  return (
    `${String(minutes).padStart(2, '0')}:` +
    `${String(seconds).padStart(2, '0')}:` +
    `${String(millis).padStart(3, '0')}`
  )
}
