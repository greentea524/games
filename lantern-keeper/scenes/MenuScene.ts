import Phaser from 'phaser'
import { GBC_WIDTH } from '../constants'

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private options: Phaser.GameObjects.Text[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private xKey!: Phaser.Input.Keyboard.Key;
  private zKey!: Phaser.Input.Keyboard.Key;
  
  private viewMode: 'menu' | 'controls' = 'menu';
  private controlsText!: Phaser.GameObjects.Text;
  
  constructor() {
    super('menu')
  }

  create() {
    this.cameras.main.setBackgroundColor('#0f1a12')

    // Title
    this.add.text(GBC_WIDTH / 2, 20, 'LANTERN KEEPER', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#e0f8cf',
    }).setOrigin(0.5)

    // Player and Lantern Sneak Peek
    this.add.sprite(GBC_WIDTH / 2 - 16, 50, 'player_idle').setScale(2);
    this.add.sprite(GBC_WIDTH / 2 + 16, 50, 'lanternLit').setScale(2);

    // Menu Options
    const startText = this.add.text(GBC_WIDTH / 2, 85, 'Start Game', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '10px',
      color: '#86b06a',
    }).setOrigin(0.5);

    const controlsText = this.add.text(GBC_WIDTH / 2, 105, 'Controls', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '10px',
      color: '#86b06a',
    }).setOrigin(0.5);

    this.options = [startText, controlsText];
    this.selectedIndex = 0;
    
    // Controls View
    this.controlsText = this.add.text(GBC_WIDTH / 2, 90, 
      'Arrows: Move & Jump\nX/B: Dash\n\nPress X to return', {
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '8px',
      color: '#86b06a',
      align: 'center',
    }).setOrigin(0.5).setVisible(false);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.xKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.zKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);

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

  update() {
    if (this.viewMode === 'controls') {
      if (Phaser.Input.Keyboard.JustDown(this.xKey) || Phaser.Input.Keyboard.JustDown(this.zKey) || Phaser.Input.Keyboard.JustDown(this.enterKey)) {
        this.hideControls();
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
      this.updateSelection();
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
      this.updateSelection();
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.xKey) || Phaser.Input.Keyboard.JustDown(this.zKey)) {
      if (this.selectedIndex === 0) {
        this.scene.start('play', { levelKey: 'level1', hasDoubleJump: false, hasDash: false, hasWallCling: false })
      } else if (this.selectedIndex === 1) {
        this.showControls();
      }
    }
  }
}
