import Phaser from 'phaser'
import { GBC_HEIGHT, GBC_WIDTH } from '../constants'
import { music, isMuted, setMuted } from '../audio'
import { clearProgress, hasProgress, loadProgress } from '../progress'
import { RETURN, SCREEN_COLOURS, STORY, controls, pageLayout, pageLines, titleLayout, type Box } from '../screens'
import { SIZE } from '../sprites'
import { WARM_GLOW } from '../forest'
import { FONT, css, heading, isDesktop, panel, screenForest } from './screenForest'

/**
 * The title, with its two pages: the controls and the story (#175).
 *
 * Laid out on the real screen by `screens.ts`, over the forest, with the
 * keeper on the stone at the foot of it. It was 160×144 behind a zoomed
 * camera, in pale green on black.
 */
export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private options: Phaser.GameObjects.Text[] = [];
  private optionActions: (() => void)[] = [];

  private viewMode: 'menu' | 'controls' | 'about' = 'menu';
  private menuView!: Phaser.GameObjects.Container;
  private controlsView!: Phaser.GameObjects.Container;
  private aboutView!: Phaser.GameObjects.Container;
  private figures!: Phaser.GameObjects.Container;
  private inputCooldownUntil = 0;

  constructor() {
    super('menu')
  }

  create() {
    this.inputCooldownUntil = this.time.now + 200
    music.play('adventure')
    screenForest(this, 'forest')

    // Menu Options. Built from a list so 'New Game' can appear only when
    // there is progress to keep, without hard-coding two sets of positions.
    const resuming = hasProgress()
    const specs: { label: string; action: () => void }[] = resuming
      ? [
          { label: 'Continue', action: () => this.continueGame() },
          { label: 'New Game', action: () => this.newGame() },
        ]
      : [{ label: 'Start Game', action: () => this.newGame() }]
    specs.push({ label: 'Controls', action: () => this.showControls() })
    specs.push({ label: 'About', action: () => this.showAbout() })

    const at = titleLayout(GBC_WIDTH, GBC_HEIGHT, specs.map((s) => s.label), SIZE.player_idle, SIZE.lanternLit)

    // The keeper and a lit lantern, on the stone. Not on the story, whose
    // page is long enough to reach them: `screens_test.ts` says which.
    this.figures = this.add.container(0, 0, [
      this.add
        .image(at.lantern.x + at.lantern.width / 2, at.lantern.y + at.lantern.height / 2, 'warm_glow')
        .setDisplaySize(96, 96)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(WARM_GLOW.alpha),
      this.add.image(at.keeper.x, at.keeper.y, 'player_idle').setOrigin(0).setScale(at.keeper.width / SIZE.player_idle[0]),
      this.add.image(at.lantern.x, at.lantern.y, 'lanternLit').setOrigin(0).setScale(at.lantern.width / SIZE.lanternLit[0]),
    ])

    const style = { fontFamily: FONT, fontSize: '8px', color: css(SCREEN_COLOURS.dim), resolution: 1 }
    this.options = specs.map((spec, i) => this.add.text(GBC_WIDTH / 2, at.options[i].y, spec.label, style).setOrigin(0.5, 0))
    this.optionActions = specs.map((spec) => spec.action)
    this.selectedIndex = 0;
    this.menuView = this.add.container(0, 0, [panel(this, at.panel), heading(this, at.title, 'LANTERN KEEPER'), ...this.options])

    const desktop = isDesktop()
    this.controlsView = this.page('CONTROLS', controls(desktop), RETURN(desktop)).setVisible(false)
    this.aboutView = this.page('STORY', pageLines(STORY), RETURN(desktop)).setVisible(false)

    this.input.keyboard!.on('keydown', this.handleKey, this);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', this.handleKey, this))

    this.updateSelection();

    // Allow touch/click on options
    this.options.forEach((opt, i) => {
      opt.setInteractive().on('pointerdown', () => {
        if (this.viewMode === 'menu') this.optionActions[i]()
      })
    })

    const mKey = this.input.keyboard!.addKey('M')
    mKey.on('down', () => setMuted(!isMuted()))
  }

  /** A heading, a panel of lines, and how to go back. */
  private page(title: string, lines: string[], back: string): Phaser.GameObjects.Container {
    const head: Box = { x: Math.round((GBC_WIDTH - title.length * 16) / 2), y: 22, width: title.length * 16, height: 16 }
    const box = pageLayout(GBC_WIDTH, head, lines.length)
    const text = this.add.text(box.x + 12, box.y + 8, lines.join('\n'), {
      fontFamily: FONT,
      fontSize: '8px',
      color: css(SCREEN_COLOURS.text),
      lineSpacing: 4,
      resolution: 1,
    })
    const backText = this.add
      .text(GBC_WIDTH / 2, box.y + box.height + 10, back, { fontFamily: FONT, fontSize: '8px', color: css(SCREEN_COLOURS.selected), resolution: 1 })
      .setOrigin(0.5, 0)
    const backPanel = panel(this, { x: backText.x - backText.width / 2 - 6, y: backText.y - 5, width: backText.width + 12, height: 18 })
    return this.add.container(0, 0, [heading(this, head, title), panel(this, box), text, backPanel, backText])
  }

  updateSelection() {
    this.options.forEach((opt, index) => {
      if (index === this.selectedIndex) {
        opt.setColor(css(SCREEN_COLOURS.selected));
        opt.setText('> ' + opt.text.replace('> ', ''));
      } else {
        opt.setColor(css(SCREEN_COLOURS.dim));
        opt.setText(opt.text.replace('> ', ''));
      }
    });
  }

  /** Resumes the saved run — level reached, abilities earned, lanterns lit. */
  continueGame() {
    const p = loadProgress()
    this.scene.start('map', {
      levelKey: p.levelKey,
      hasDoubleJump: p.hasDoubleJump,
      hasDash: p.hasDash,
      hasWallCling: p.hasWallCling,
      totalLanternsLit: p.totalLanternsLit,
    });
  }

  /** Starts over. Clears the save so 'Continue' cannot resurrect the old run. */
  newGame() {
    clearProgress()
    this.scene.start('map', { levelKey: 'level1', hasDoubleJump: false, hasDash: false, hasWallCling: false });
  }
  
  showControls() {
    this.viewMode = 'controls';
    this.menuView.setVisible(false);
    this.controlsView.setVisible(true);
  }

  hideControls() {
    this.viewMode = 'menu';
    this.menuView.setVisible(true);
    this.controlsView.setVisible(false);
  }

  showAbout() {
    this.viewMode = 'about';
    this.menuView.setVisible(false);
    this.figures.setVisible(false);
    this.aboutView.setVisible(true);
  }

  hideAbout() {
    this.viewMode = 'menu';
    this.menuView.setVisible(true);
    this.figures.setVisible(true);
    this.aboutView.setVisible(false);
  }

  handleKey(event: KeyboardEvent) {
    if (event.code === 'KeyM') return;
    if (this.time.now < this.inputCooldownUntil) return;

    if (this.viewMode === 'controls') {
      if (event.code === 'KeyX' || event.code === 'KeyZ' || event.code === 'Enter') {
        this.hideControls();
      }
      return;
    }

    if (this.viewMode === 'about') {
      if (event.code === 'KeyX' || event.code === 'KeyZ' || event.code === 'Enter') {
        this.hideAbout();
      }
      return;
    }

    if (event.code === 'ArrowUp') {
      this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
      this.updateSelection();
    } else if (event.code === 'ArrowDown') {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
      this.updateSelection();
    }

    if (event.code === 'Enter' || event.code === 'KeyX' || event.code === 'KeyZ') {
      // Dispatch by index into the same list the labels came from. This used
      // to be a hard-coded 0/1/2 chain, which silently mismapped the moment
      // 'New Game' was inserted.
      this.optionActions[this.selectedIndex]?.()
    }
  }
}
