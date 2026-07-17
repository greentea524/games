import Phaser from 'phaser'
import { GBC_WIDTH } from '../constants'

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private options: Phaser.GameObjects.Text[] = [];
  
  private viewMode: 'menu' | 'controls' = 'menu';
  private controlsText!: Phaser.GameObjects.Text;
  private inputCooldownUntil = 0;

  constructor() {
    super('menu')
  }

  create() {
    this.inputCooldownUntil = this.time.now + 200
    this.cameras.main.setBackgroundColor('#0f1a12')

    // Title
    this.add.text(GBC_WIDTH / 2, 20, 'LANTERN KEEPER', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 1,
    }).setOrigin(0.5)

    // Player and Lantern Sneak Peek
    this.add.sprite(GBC_WIDTH / 2 - 16, 50, 'player_idle').setScale(2);
    this.add.sprite(GBC_WIDTH / 2 + 16, 50, 'lanternLit').setScale(2);

    // Menu Options
    const startText = this.add.text(GBC_WIDTH / 2, 85, 'Start Game', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5);

    const controlsText = this.add.text(GBC_WIDTH / 2, 105, 'Controls', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#86b06a',
      resolution: 1,
    }).setOrigin(0.5);

    this.options = [startText, controlsText];
    this.selectedIndex = 0;
    
    // Controls View
    this.controlsText = this.add.text(GBC_WIDTH / 2, 90,
      'Arrows: Move & Jump\nX/B: Dash\n\nPress X to return', {
      fontFamily: '"Press Start 2P"',
      fontSize: '8px',
      color: '#86b06a',
      align: 'center',
      resolution: 1,
    }).setOrigin(0.5).setVisible(false);

    this.input.keyboard!.on('keydown', this.handleKey, this);
    
    this.updateSelection();
    
    // Allow touch/click on options
    startText.setInteractive().on('pointerdown', () => {
      if (this.viewMode === 'menu') this.startGame();
    });
    controlsText.setInteractive().on('pointerdown', () => {
      if (this.viewMode === 'menu') this.showControls();
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
    this.scene.start('play');
  }
  
  showControls() {
    this.viewMode = 'controls';
    this.options.forEach(opt => opt.setVisible(false));
    this.controlsText.setVisible(true);
  }
  
  hideControls() {
    this.viewMode = 'menu';
    this.options.forEach(opt => opt.setVisible(true));
    this.controlsText.setVisible(false);
  }

  handleKey(event: KeyboardEvent) {
    if (this.time.now < this.inputCooldownUntil) return;

    if (this.viewMode === 'controls') {
      if (event.code === 'KeyX' || event.code === 'KeyZ' || event.code === 'Enter') {
        this.hideControls();
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
        this.scene.start('play', { levelKey: 'level1', hasDoubleJump: false, hasDash: false, hasWallCling: false })
      } else if (this.selectedIndex === 1) {
        this.showControls();
      }
    }
  }
}
