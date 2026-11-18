import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, TILE } from '../constants'
import { GameState } from '../state'
import { music, isMuted, setMuted } from '../audio'
import { HUD_THEME, css } from '../hud'
import { SUBTITLE, TITLE, TITLE_SCALE, startPrompt, titleLayout } from '../screens'
import { OPEN, floorFrame } from '../tiles'
import { playerKey, textureKey } from '../sprites'
import { prefersReducedMotion } from '../../shared/motion'

const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

/**
 * The title, on the real screen and in the palette chosen (#165).
 *
 * It was 160×144 behind a zoomed camera, on a navy that is none of the
 * green screen's tones, with the fox, the crate and the target drawn over
 * each other. Now the name is on one line, and under it is a strip of the
 * warehouse: a wall with its brick face, and the fox pushing a crate along
 * the floor toward a target. The palette switch restarts the scene.
 */
export class MainMenuScene extends Phaser.Scene {
  private canStart = false

  constructor() {
    super('mainmenu')
  }

  create() {
    this.canStart = false
    const mode = GameState.paletteMode
    const theme = HUD_THEME[mode]
    this.cameras.main.setBackgroundColor(css(theme.bar))
    const desktop = isDesktop()
    const at = titleLayout(GBC_WIDTH, GBC_HEIGHT, TILE, desktop)
    const still = prefersReducedMotion()

    this.add.text(at.title.x, at.title.y, TITLE, {
      fontFamily: FONT,
      fontSize: `${8 * TITLE_SCALE}px`,
      color: css(theme.accent),
      resolution: 1,
      shadow: { offsetX: 2, offsetY: 2, color: css(theme.edge), fill: true },
    })
    this.add.text(at.subtitle.x, at.subtitle.y, SUBTITLE, { fontFamily: FONT, fontSize: '8px', color: css(theme.dim), resolution: 1 })

    // The warehouse: a run of wall with its face to the floor, over a row of
    // flagstones in the shade of it.
    const across = Math.ceil(GBC_WIDTH / TILE)
    for (let i = 0; i < across; i++) {
      const x = i * TILE + TILE / 2
      this.add.image(x, at.wallRow + TILE / 2, textureKey('wall', mode, 1), OPEN.s)
      this.add.image(x, at.floorRow + TILE / 2, textureKey('floor', mode, 1), floorFrame(i, 1, true))
    }
    const on = (tile: number) => tile * TILE + TILE / 2
    const y = at.floorRow + TILE / 2
    this.add.image(on(at.target), y, textureKey('target', mode, 1))
    const crate = this.add.image(on(at.crate), y, textureKey('crate', mode, 1))
    const fox = this.add.image(on(at.fox), y, playerKey(mode, 'right', 'push'))
    // The fox leans in, and the crate gives a little. Decoration, so not
    // under reduced motion.
    if (!still) {
      this.tweens.add({ targets: [crate, fox], x: '+=4', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
    }

    const prompt = this.add.text(at.prompt.x, at.prompt.y, startPrompt(desktop), {
      fontFamily: FONT,
      fontSize: '8px',
      color: css(theme.accent),
      resolution: 1,
    })
    if (!still) this.tweens.add({ targets: prompt, alpha: 0.25, duration: 500, yoyo: true, repeat: -1 })

    this.time.delayedCall(500, () => {
      this.canStart = true
    })

    music.play('puzzle')

    this.input.on('pointerdown', () => this.startGame())

    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))
  }

  update() {
    const kb = this.input.keyboard!
    if (
      Phaser.Input.Keyboard.JustDown(kb.addKey('SPACE')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('ENTER')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('Z')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('X'))
    ) {
      this.startGame()
    }
  }

  private startGame() {
    if (!this.canStart) return
    import('../audio').then(a => a.playMenuConfirm())
    this.scene.start('levelselect')
  }
}
