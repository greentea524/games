import Phaser from 'phaser'
import { GBC_WIDTH, GBC_HEIGHT, FONT } from '../constants'
import { GameState } from '../state'
import { CAMPAIGN_LEVELS } from '../levels'
import { SaveSystem, loadHighestUnlocked } from '../save'
import { HUD_THEME, css } from '../hud'
import { COLS, PER_PAGE, TITLE_SCALE, WORLD_NAMES, pageOf, selectHint, selectLayout } from '../screens'
import { DMG, mix, worldPalette } from '../tiles'

const isDesktop = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches

/**
 * The level select: a page to each world, in that world's colours (#165).
 *
 * It was 160×144 behind a zoomed camera, on a navy that is none of the green
 * screen's tones, in pages of twelve that cut across the worlds. Each page is
 * now one world's ten stages, under its name, each stage a square of that
 * world's floor. The palette switch restarts the scene.
 */
export class LevelSelectScene extends Phaser.Scene {
  private pages: Phaser.GameObjects.Container[] = []
  private selectedIndex = 0
  private currentPage = 0
  private highestUnlocked = 0
  private levelNodes: { id: number, text: Phaser.GameObjects.Text, bg: Phaser.GameObjects.Graphics, locked: boolean }[] = []
  private leftArrowText!: Phaser.GameObjects.Text
  private rightArrowText!: Phaser.GameObjects.Text
  private numPages = 0

  constructor() {
    super('levelselect')
  }

  create() {
    this.pages = []
    this.levelNodes = []
    const mode = GameState.paletteMode
    const theme = HUD_THEME[mode]
    this.cameras.main.setBackgroundColor(css(theme.bar))
    const desktop = isDesktop()
    this.highestUnlocked = loadHighestUnlocked()
    this.numPages = Math.ceil(CAMPAIGN_LEVELS.length / PER_PAGE)

    const head = selectLayout(GBC_WIDTH, GBC_HEIGHT, '', desktop)
    // Fixed to the camera, which slides between the pages.
    this.add
      .text(head.heading.x, head.heading.y, 'SELECT STAGE', {
        fontFamily: FONT,
        fontSize: `${8 * TITLE_SCALE}px`,
        color: css(theme.accent),
        resolution: 1,
        shadow: { offsetX: 2, offsetY: 2, color: css(theme.edge), fill: true },
      })
      .setScrollFactor(0)
    this.add
      .text(head.hint.x, head.hint.y, selectHint(desktop), { fontFamily: FONT, fontSize: '8px', color: css(theme.dim), resolution: 1 })
      .setScrollFactor(0)
    this.leftArrowText = this.add
      .text(head.left.x, head.left.y, '<', { fontFamily: FONT, fontSize: '8px', color: css(theme.accent), resolution: 1 })
      .setScrollFactor(0)
      .setVisible(false)
    this.rightArrowText = this.add
      .text(head.right.x, head.right.y, '>', { fontFamily: FONT, fontSize: '8px', color: css(theme.accent), resolution: 1 })
      .setScrollFactor(0)
      .setVisible(false)

    for (let p = 0; p < this.numPages; p++) {
      const pageContainer = this.add.container(p * GBC_WIDTH, 0)
      this.pages.push(pageContainer)
      const world = CAMPAIGN_LEVELS[p * PER_PAGE]?.world ?? p + 1
      const name = WORLD_NAMES[world - 1] ?? `WORLD ${world}`
      const at = selectLayout(GBC_WIDTH, GBC_HEIGHT, name, desktop)
      pageContainer.add(this.add.text(at.world.x, at.world.y, name, { fontFamily: FONT, fontSize: '8px', color: css(theme.text), resolution: 1 }))

      for (let i = 0; i < PER_PAGE; i++) {
        const globalIdx = p * PER_PAGE + i
        if (globalIdx >= CAMPAIGN_LEVELS.length) break
        const levelConfig = CAMPAIGN_LEVELS[globalIdx]
        const cell = at.cells[i]
        const locked = globalIdx > this.highestUnlocked

        const bg = this.add.graphics()
        pageContainer.add(bg)
        const txt = this.add
          .text(cell.x + cell.width / 2, cell.y + 8, `${levelConfig.id}`, { fontFamily: FONT, fontSize: '8px', color: css(theme.text), resolution: 1 })
          .setOrigin(0.5, 0)
        pageContainer.add(txt)

        if (!locked) {
          const data = SaveSystem.getLevelData(levelConfig.id)
          const stars = '*'.repeat(data.stars)
          if (stars) {
            pageContainer.add(
              this.add
                .text(cell.x + cell.width / 2, cell.y + 22, stars, { fontFamily: FONT, fontSize: '8px', color: css(theme.accent), resolution: 1 })
                .setOrigin(0.5, 0),
            )
          }
        }
        this.levelNodes.push({ id: levelConfig.id, text: txt, bg, locked })
      }
    }

    // Default select highest unlocked or last played
    this.selectedIndex = GameState.currentLevelIndex
    this.currentPage = pageOf(this.selectedIndex)

    // Jump camera to current page
    this.cameras.main.scrollX = this.currentPage * GBC_WIDTH
    this.updateSelection()
    this.updateArrows()
  }

  update() {
    const kb = this.input.keyboard!
    let moved = false
    let newIndex = this.selectedIndex
    const cols = COLS

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
        const newPage = pageOf(this.selectedIndex)
        if (newPage !== this.currentPage) {
          this.currentPage = newPage
          this.tweens.add({
            targets: this.cameras.main,
            scrollX: this.currentPage * GBC_WIDTH,
            duration: 250,
            ease: 'Quad.easeOut'
          })
          this.updateArrows()
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
    const mode = GameState.paletteMode
    const theme = HUD_THEME[mode]
    const desktop = isDesktop()
    this.levelNodes.forEach((node, i) => {
      const cell = selectLayout(GBC_WIDTH, GBC_HEIGHT, '', desktop).cells[i % PER_PAGE]
      const world = CAMPAIGN_LEVELS[i]?.world ?? 1
      const pal = mode === 'dmg' ? DMG : worldPalette(world)
      // A square of the world's own floor, its walls' colour round it: dimmed
      // while the stage is locked. On the green screen, the dark tone.
      const fill = mode === 'dmg' ? theme.edge : node.locked ? mix(pal.floorB, theme.bar, 0.65) : mix(pal.floorA, theme.bar, 0.25)
      node.bg.clear()
      node.bg.fillStyle(fill, 1)
      node.bg.fillRect(cell.x, cell.y, cell.width, cell.height)
      if (i === this.selectedIndex) {
        node.bg.lineStyle(2, theme.accent, 1)
        node.bg.strokeRect(cell.x + 1, cell.y + 1, cell.width - 2, cell.height - 2)
        node.text.setColor(css(theme.accent))
      } else {
        node.bg.lineStyle(1, mode === 'dmg' ? theme.dim : pal.rim, 1)
        node.bg.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1)
        node.text.setColor(css(node.locked ? theme.dim : theme.text))
      }
    })
  }

  private updateArrows() {
    this.leftArrowText.setVisible(this.currentPage > 0)
    this.rightArrowText.setVisible(this.currentPage < this.numPages - 1)
  }
}
