import { GameState } from './state'

export interface ChoiceOption {
  label: string
  setFlag?: string
}

export interface DialogueLine {
  text: string
  give?: string // item id granted when this line is shown
  setFlag?: string // flag set true when this line is shown
  choice?: ChoiceOption[] // terminal choice shown after the text
}

interface DialogueBranch {
  requires?: string // flag that must be set for this branch to apply
  excludes?: string // flag that must NOT be set
  lines: DialogueLine[]
}

export interface NpcDef {
  id: string
  name: string
  shirt: 'light' | 'dark' | 'darkest'
  hair: 'light' | 'dark' | 'darkest'
  branches: DialogueBranch[]
}

export interface ItemDef {
  id: string
  name: string
  icon: string // BootScene texture key
}

export const ITEMS: Record<string, ItemDef> = {
  flashlight: { id: 'flashlight', name: 'Flashlight', icon: 'item_flashlight' },
  flower: { id: 'flower', name: 'Wilted Flower', icon: 'item_flower' },
}

export const NPCS: Record<string, NpcDef> = {
  mom: {
    id: 'mom',
    name: 'MOM',
    shirt: 'light',
    hair: 'dark',
    branches: [
      {
        excludes: 'got_flashlight',
        lines: [
          { text: "Oh, you're finally up, sleepyhead." },
          {
            text: 'The power keeps flickering. Take this flashlight, just in case.',
            give: 'flashlight',
            setFlag: 'got_flashlight',
          },
        ],
      },
      {
        lines: [{ text: 'Stay close to home, okay? Something feels off today.' }],
      },
    ],
  },
  ren: {
    id: 'ren',
    name: 'REN',
    shirt: 'darkest',
    hair: 'darkest',
    branches: [
      {
        excludes: 'heard_about_house',
        lines: [
          { text: 'Hey! You see the Bakers’ place?' },
          {
            text: 'It was RIGHT there. Now it’s just... grass.',
            setFlag: 'heard_about_house',
          },
        ],
      },
      {
        lines: [
          { text: 'Nobody else even remembers the house.' },
          { text: 'Am I going crazy, or are you with me on this?' },
        ],
      },
    ],
  },
  gus: {
    id: 'gus',
    name: 'GUS',
    shirt: 'dark',
    hair: 'light',
    branches: [
      {
        excludes: 'gus_flower',
        lines: [
          { text: 'Found this by the pond. Feels… wrong, somehow.' },
          { text: 'Here, kid. You take it.', give: 'flower', setFlag: 'gus_flower' },
          {
            text: 'Say— you believe the static shows another world?',
            choice: [
              { label: 'Yes', setFlag: 'believer' },
              { label: 'No', setFlag: 'skeptic' },
            ],
          },
        ],
      },
      {
        lines: [{ text: 'Some nights, I still see faces in the snow.' }],
      },
    ],
  },
}

// First branch whose flag conditions match the current state.
export function resolveDialogue(npc: NpcDef): DialogueLine[] {
  for (const b of npc.branches) {
    if (b.requires && !GameState.getFlag(b.requires)) continue
    if (b.excludes && GameState.getFlag(b.excludes)) continue
    return b.lines
  }
  return [{ text: '...' }]
}
