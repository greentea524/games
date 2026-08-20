import Phaser from 'phaser'
import { PAL } from '../constants'
import { GameState } from '../state'
import { recordRun, loadMeta } from '../meta'
import type { RunStats } from '../meta'
import { music, sfx } from '../audio'
import { showRunSummary } from '../../shared/runSummary'
import { RELIC_TARGET } from '../relics'

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('gameover')
  }

  create(data: { victory: boolean }) {
    this.cameras.main.setBackgroundColor('#0b0f0c')

    music.stop()
    const victory = data?.victory ?? false

    // Read the record before recording this run, or every descent past the
    // previous best would compare against itself and never look like one.
    const bestBefore = loadMeta().bestFloor

    const stats: RunStats = {
      date: new Date().toISOString(),
      className: GameState.selectedClass,
      // A win used to be recorded as floor 13: the old victory incremented
      // the depth past the last floor and then ended the run, so
      // `floorDepth - 1` came out at 12. The portal (#84) ends the run while
      // the player is still standing on floor 12, so the same expression
      // would now under-report a completed run as 11 floors and a victory
      // would fail to beat a death on the last floor.
      floorsCleared: victory ? GameState.floorDepth : GameState.floorDepth - 1,
      turnsUsed: GameState.turnsCount,
      goldEarned: GameState.runGold,
      victory,
    }
    recordRun(stats)

    // This screen already reported class, floor, turns and gold — it was the
    // one game that did. #66 keeps all of it and moves the rendering to the
    // shared panel so all five games agree on what an ending looks like, and
    // adds the kill count, which nothing was tracking.
    showRunSummary(this, {
      title: victory ? 'VICTORY!' : 'YOU DIED',
      // Victory now means the relics were taken and the portal was walked
      // into, not that a staircase was reached (#84) — so the line says what
      // was actually done.
      subtitle: victory ? 'You escaped!' : GameState.selectedClass.toUpperCase(),
      palette: PAL,
      stats: [
        { label: 'FLOOR', value: `${GameState.floorDepth}`, highlight: stats.floorsCleared > bestBefore },
        { label: 'KILLS', value: `${GameState.killsCount}` },
        { label: 'RELICS', value: `${GameState.relics.length}/${RELIC_TARGET}` },
        { label: 'TURNS', value: `${GameState.turnsCount}` },
        { label: 'GOLD', value: `+${GameState.runGold}` },
        { label: 'BEST', value: `${Math.max(bestBefore, stats.floorsCleared)}` },
      ],
      onDismiss: () => {
        sfx.menuSelect()
        this.scene.stop('ui')
        this.scene.start('title')
      },
    })
  }
}
