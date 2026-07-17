import Phaser from 'phaser'
import { GBC_WIDTH } from '../constants'

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private options: Phaser.GameObjects.Text[] = [];
  
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

    // Title
    const titleText = this.add.text(GBC_WIDTH / 2, 18, 'LANTERN KEEPER', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5)

    // Player and Lantern Sneak Peek
    const playerPreview = this.add.sprite(GBC_WIDTH / 2 - 16, 44, 'player_idle').setScale(2);
    const lanternPreview = this.add.sprite(GBC_WIDTH / 2 + 16, 44, 'lanternLit').setScale(2);

    this.headerContainer = this.add.container(0, 0, [titleText, playerPreview, lanternPreview]);

    // Menu Options
    const startText = this.add.text(GBC_WIDTH / 2, 74, 'Start Game', {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5);

    const controlsText = this.add.text(GBC_WIDTH / 2, 92, 'Controls', {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5);

    const aboutOptionText = this.add.text(GBC_WIDTH / 2, 110, 'About', {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5);

    this.options = [startText, controlsText, aboutOptionText];
    this.selectedIndex = 0;
    
    // Controls View
    this.controlsText = this.add.text(GBC_WIDTH / 2, 85,
      'Arrows: Move & Jump\nX/B: Dash\n\nPress X to return', {
      fontFamily: '"Press Start 2P"',
      fontSize: '7px',
      color: '#86b06a',
      align: 'center',
      resolution: 1,
    }).setOrigin(0.5).setVisible(false);

    // About / Story View
    const aboutTitle = this.add.text(GBC_WIDTH / 2, 20, 'STORY', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5);

    const storyText = this.add.text(GBC_WIDTH / 2, 68,
      'An ancient darkness\nhas fallen upon\nthe realm.\n\nLight the ancient\nlanterns to restore\nyour powers & reach\nthe Heart Tree.', {
      fontFamily: '"Press Start 2P"',
      fontSize: '6px',
      color: '#86b06a',
      align: 'center',
      lineSpacing: 3,
      resolution: 1,
    }).setOrigin(0.5);

    const returnText = this.add.text(GBC_WIDTH / 2, 126, 'Press X to return', {
      fontFamily: '"Press Start 2P"',
      fontSize: '6px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5);

    this.aboutContainer = this.add.container(0, 0, [aboutTitle, storyText, returnText]).setVisible(false);

    this.input.keyboard!.on('keydown', this.handleKey, this);
    
    this.updateSelection();
    
    // Allow touch/click on options
    startText.setInteractive().on('pointerdown', () => {
      if (this.viewMode === 'menu') this.startGame();
    });
    controlsText.setInteractive().on('pointerdown', () => {
      if (this.viewMode === 'menu') this.showControls();
    });
    aboutOptionText.setInteractive().on('pointerdown', () => {
      if (this.viewMode === 'menu') this.showAbout();
    });
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

  startGame() {
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
      if (this.selectedIndex === 0) {
        this.startGame();
      } else if (this.selectedIndex === 1) {
        this.showControls();
      } else if (this.selectedIndex === 2) {
        this.showAbout();
      }
    }
  }
}
