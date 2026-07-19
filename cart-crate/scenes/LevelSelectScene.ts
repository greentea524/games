import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT, PAL } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import { SaveSystem } from '../save'

export class LevelSelectScene extends Phaser.Scene {
  private pages: Phaser.GameObjects.Container[] = []
  private selectedIndex = 0
  private currentPage = 0
  private highestUnlocked = 0
  private levelNodes: { id: number, text: Phaser.GameObjects.Text, bg: Phaser.GameObjects.Graphics, locked: boolean }[] = []

  constructor() {
    super('levelselect')
  }

  create() {
    this.pages = []
    this.levelNodes = []
    this.cameras.main.setBackgroundColor('#081820')

    const savedStr = localStorage.getItem('cart-crate-level')
    this.highestUnlocked = savedStr ? parseInt(savedStr, 10) : 0

    // Header
    this.add.text(GBC_WIDTH / 2, 8, 'SELECT STAGE', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#e0f8cf',
      resolution: 2,
    }).setOrigin(0.5)

    const cols = 4
    const rows = 3
    const levelsPerPage = cols * rows
    const numPages = Math.ceil(CAMPAIGN_LEVELS.length / levelsPerPage)

    const startX = 28
    const startY = 36
    const spacingX = 34
    const spacingY = 32

    for (let p = 0; p < numPages; p++) {
      const pageContainer = this.add.container(p * GBC_WIDTH, 0)
      this.pages.push(pageContainer)

      for (let i = 0; i < levelsPerPage; i++) {
        const globalIdx = p * levelsPerPage + i
        if (globalIdx >= CAMPAIGN_LEVELS.length) break

        const levelConfig = CAMPAIGN_LEVELS[globalIdx]
        const col = i % cols
        const row = Math.floor(i / cols)

        const nx = startX + col * spacingX
        const ny = startY + row * spacingY

        const locked = globalIdx > this.highestUnlocked

        const bg = this.add.graphics()
        pageContainer.add(bg)

        const txt = this.add.text(nx, ny - 3, `${levelConfig.id}`, {
          fontFamily: FONT,
          fontSize: '8px',
          color: locked ? '#306230' : '#8bac0f',
          resolution: 2,
        }).setOrigin(0.5)
        pageContainer.add(txt)

        // Draw stars if unlocked and played
        if (!locked) {
          const data = SaveSystem.getLevelData(levelConfig.id)
          let starStr = ''
          for (let s = 0; s < data.stars; s++) starStr += '*'
          if (starStr) {
            const starsText = this.add.text(nx, ny + 7, starStr, {
              fontFamily: FONT,
              fontSize: '8px',
              color: '#ffcc00',
              resolution: 2,
            }).setOrigin(0.5)
            pageContainer.add(starsText)
          }
        }

        this.levelNodes.push({ id: levelConfig.id, text: txt, bg, locked })
      }
    }

    // Default select highest unlocked or last played
    this.selectedIndex = GameState.currentLevelIndex
    this.currentPage = Math.floor(this.selectedIndex / levelsPerPage)
    
    // Jump camera to current page
    this.cameras.main.scrollX = this.currentPage * GBC_WIDTH
    this.updateSelection()
  }

  update() {
    const kb = this.input.keyboard!
    let moved = false
    let newIndex = this.selectedIndex
    const cols = 4

    if (Phaser.Input.Keyboard.JustDown(kb.addKey('LEFT')) || Phaser.Input.Keyboard.JustDown(kb.addKey('A'))) {
      newIndex--
      moved = true
    } else if (Phaser.Input.Keyboard.JustDown(kb.addKey('RIGHT')) || Phaser.Input.Keyboard.JustDown(kb.addKey('D'))) {
      newIndex++
      moved = true
    } else if (Phaser.Input.Keyboard.JustDown(kb.addKey('UP')) || Phaser.Input.Keyboard.JustDown(kb.addKey('W'))) {
      newIndex -= cols
      moved = true
    } else if (Phaser.Input.Keyboard.JustDown(kb.addKey('DOWN')) || Phaser.Input.Keyboard.JustDown(kb.addKey('S'))) {
      newIndex += cols
      moved = true
    }

    if (moved) {
      if (newIndex >= 0 && newIndex < CAMPAIGN_LEVELS.length) {
        this.selectedIndex = newIndex
        import('../audio').then(a => a.playMenuSelect())
        this.updateSelection()

        // Handle pagination
        const newPage = Math.floor(this.selectedIndex / 12)
        if (newPage !== this.currentPage) {
          this.currentPage = newPage
          this.tweens.add({
            targets: this.cameras.main,
            scrollX: this.currentPage * GBC_WIDTH,
            duration: 250,
            ease: 'Quad.easeOut'
          })
        }
      }
    }

    if (
      Phaser.Input.Keyboard.JustDown(kb.addKey('SPACE')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('ENTER')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('Z')) ||
      Phaser.Input.Keyboard.JustDown(kb.addKey('X'))
    ) {
      const node = this.levelNodes[this.selectedIndex]
      if (node && !node.locked) {
        import('../audio').then(a => a.playMenuConfirm())
        GameState.currentLevelIndex = this.selectedIndex
        this.scene.start('board')
      } else {
        // Locked
        import('../audio').then(a => a.playMenuSelect()) // Maybe an error sound later
      }
    }
  }

  private updateSelection() {
    this.levelNodes.forEach((node, i) => {
      node.bg.clear()
      const cols = 4
      const row = Math.floor((i % 12) / cols)
      const col = (i % 12) % cols
      const nx = 28 + col * 34
      const ny = 36 + row * 32

      if (i === this.selectedIndex) {
        node.bg.fillStyle(0x0f380f, 1)
        node.bg.fillRoundedRect(nx - 14, ny - 12, 28, 24, 4)
        node.bg.lineStyle(2, 0xffcc00, 1)
        node.bg.strokeRoundedRect(nx - 14, ny - 12, 28, 24, 4)
        node.text.setColor('#ffcc00')
      } else {
        node.bg.lineStyle(1, node.locked ? 0x306230 : 0x8bac0f, 1)
        node.bg.strokeRoundedRect(nx - 14, ny - 12, 28, 24, 4)
        node.text.setColor(node.locked ? '#306230' : '#8bac0f')
      }
    })
  }
}
