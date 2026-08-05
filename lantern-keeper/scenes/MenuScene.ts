import Phaser from 'phaser'
import { GBC_WIDTH } from '../constants'
import { music, isMuted, setMuted } from '../audio'
import { clearProgress, hasProgress, loadProgress } from '../progress'

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private options: Phaser.GameObjects.Text[] = [];
  private optionActions: (() => void)[] = [];
  
  private viewMode: 'menu' | 'controls' | 'about' = 'menu';
  private controlsText!: Phaser.GameObjects.Text;
  private aboutContainer!: Phaser.GameObjects.Container;
  private headerContainer!: Phaser.GameObjects.Container;
  private inputCooldownUntil = 0;

  constructor() {
    super('menu')
  }

  create() {
    this.inputCooldownUntil = this.time.now + 200
    this.cameras.main.setBackgroundColor('#0f1a12')
    music.play('adventure')

    // Title
    const titleText = this.add.text(GBC_WIDTH / 2, 18, 'LANTERN KEEPER', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5)

    // Player and Lantern Sneak Peek
    const playerPreview = this.add.sprite(GBC_WIDTH / 2 - 16, 44, 'player_idle').setScale(2);
    const lanternPreview = this.add.sprite(GBC_WIDTH / 2 + 16, 44, 'lanternLit').setScale(2);

    this.headerContainer = this.add.container(0, 0, [titleText, playerPreview, lanternPreview]);

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

    // 74 + 18 * 3 = 128, and an 8px line ends at 136 on a 144px screen.
    this.options = specs.map((spec, i) =>
      this.add
        .text(GBC_WIDTH / 2, 74 + i * 18, spec.label, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '8px',
          color: '#86b06a',
          resolution: 1,
        })
        .setOrigin(0.5),
    )
    this.optionActions = specs.map((spec) => spec.action)
    this.selectedIndex = 0;
    
    // Controls View
    this.controlsText = this.add.text(GBC_WIDTH / 2, 85,
      'Arrows: Move & Jump\nX/B: Dash\n\nPress X to return', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#86b06a',
      align: 'center',
      resolution: 1,
    }).setOrigin(0.5).setVisible(false);

    // About / Story View
    const aboutTitle = this.add.text(GBC_WIDTH / 2, 20, 'STORY', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5);

    const storyText = this.add.text(GBC_WIDTH / 2, 68,
      'An ancient darkness\nhas fallen upon\nthe realm.\n\nLight the ancient\nlanterns to restore\nyour powers & reach\nthe Heart Tree.', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#86b06a',
      align: 'center',
      lineSpacing: 3,
      resolution: 1,
    }).setOrigin(0.5);

    const returnText = this.add.text(GBC_WIDTH / 2, 126, 'Press X to return', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5);

    this.aboutContainer = this.add.container(0, 0, [aboutTitle, storyText, returnText]).setVisible(false);

    this.input.keyboard!.on('keydown', this.handleKey, this);
    
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
  
  updateSelection() {
    this.options.forEach((opt, index) => {
      if (index === this.selectedIndex) {
        opt.setColor('#e0f8cf');
        opt.setText('> ' + opt.text.replace('> ', ''));
      } else {
        opt.setColor('#86b06a');
        opt.setText(opt.text.replace('> ', ''));
      }
    });
  }

  /** Resumes the saved run — level reached, abilities earned, lanterns lit. */
  continueGame() {
    const p = loadProgress()
    this.scene.start('play', {
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
    this.scene.start('play', { levelKey: 'level1', hasDoubleJump: false, hasDash: false, hasWallCling: false });
  }
  
  showControls() {
    this.viewMode = 'controls';
    this.options.forEach(opt => opt.setVisible(false));
    this.headerContainer.setVisible(true);
    this.controlsText.setVisible(true);
  }
  
  hideControls() {
    this.viewMode = 'menu';
    this.options.forEach(opt => opt.setVisible(true));
    this.headerContainer.setVisible(true);
    this.controlsText.setVisible(false);
  }

  showAbout() {
    this.viewMode = 'about';
    this.options.forEach(opt => opt.setVisible(false));
    this.headerContainer.setVisible(false);
    this.aboutContainer.setVisible(true);
  }

  hideAbout() {
    this.viewMode = 'menu';
    this.options.forEach(opt => opt.setVisible(true));
    this.headerContainer.setVisible(true);
    this.aboutContainer.setVisible(false);
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
