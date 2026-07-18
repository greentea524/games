import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 160,
  height: 144,
  parent: 'game',
  backgroundColor: '#0f1a12',
  scene: {
    create: function() {
      this.add.text(10, 10, 'Static Game', { fontSize: '10px', color: '#fff' });
    }
  },
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
