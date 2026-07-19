import { GameState } from './state'

export interface ChoiceOption {
  label: string
  setFlag?: string
}

export interface DialogueLine {
  text: string
  give?: string // item id granted when this line is shown
  take?: string // item id removed when this line is shown
  setFlag?: string // flag set true when this line is shown
  choice?: ChoiceOption[] // terminal choice shown after the text
}

interface DialogueBranch {
  requires?: string // flag that must be set for this branch to apply
  excludes?: string // flag that must NOT be set
  requiresItem?: string // item the player must carry for this branch
  lines: DialogueLine[]
}

export interface NpcDef {
  id: string
  name: string
  shirt: 'light' | 'dark' | 'darkest'
  hair: 'light' | 'dark' | 'darkest'
  frozen?: boolean // Static-side NPCs don't turn to face the player
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
  flower_fresh: { id: 'flower_fresh', name: 'Fresh Flower', icon: 'item_flower_fresh' },
  photo: { id: 'photo', name: 'Old Photo', icon: 'item_photo' },
  ledger: { id: 'ledger', name: 'Water Ledger', icon: 'item_ledger' },
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
          { text: 'The power keeps flickering.' },
          {
            text: 'Take this flashlight, just in case.',
            give: 'flashlight',
            setFlag: 'got_flashlight',
          },
        ],
      },
      {
        lines: [
          { text: 'Stay close to home, okay?' },
          { text: 'Something feels off today.' },
        ],
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
          { text: 'Hey! Did you see the Bakers’ place?' },
          { text: 'It was RIGHT there. Now it’s just grass.' },
          { text: 'It completely disappeared!', setFlag: 'heard_about_house' },
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
          { text: 'Found this by the pond. Feels wrong, somehow.' },
          { text: 'Here, kid. You take it.', give: 'flower', setFlag: 'gus_flower' },
          {
            text: 'Say— do you believe static shows another world?',
            choice: [
              { label: 'Yes', setFlag: 'believer' },
              { label: 'No', setFlag: 'skeptic' },
            ],
          },
        ],
      },
      {
        lines: [{ text: 'Some nights, I still see faces in the static.' }],
      },
    ],
  },
  // The frozen Baker, found on the Static-side outside the house that
  // vanished from the normal town (Thread A of #15).
  baker: {
    id: 'baker',
    name: 'THE BAKER',
    shirt: 'light',
    hair: 'light',
    frozen: true,
    branches: [
      {
        requiresItem: 'flower_fresh',
        excludes: 'flower_delivered',
        lines: [
          { text: 'A figure stands frozen mid-step, eyes fixed on nothing.' },
          {
            text: 'You tuck the fresh flower into their basket.',
            take: 'flower_fresh',
            setFlag: 'flower_delivered',
          },
          { text: 'For a heartbeat, the static seems to soften.' },
        ],
      },
      {
        excludes: 'flower_delivered',
        lines: [
          { text: 'A figure stands frozen mid-step. They do not see you.' },
          { text: 'Their empty basket sways, though there is no wind.' },
        ],
      },
      {
        lines: [
          { text: 'The flower rests in their basket, impossibly bright.' },
          { text: 'Something in town may have changed...' },
        ],
      },
    ],
  },
}

// Not a real NPC: narration shown when the player turns the fountain
// valve on the Static-side (Thread B of #15).
export const VALVE_DEF: NpcDef = {
  id: 'valve',
  name: 'RUSTED VALVE',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      excludes: 'fountain_drained',
      lines: [
        { text: 'A rusted valve juts from the dry fountain basin.' },
        {
          text: 'You heave it around. Deep below, water drains away.',
          setFlag: 'fountain_drained',
        },
        { text: 'Somewhere, something shifted.' },
      ],
    },
    {
      lines: [{ text: "The valve won't turn any further." }],
    },
  ],
}

// First branch whose flag conditions match the current state.
export function resolveDialogue(npc: NpcDef): DialogueLine[] {
  for (const b of npc.branches) {
    if (b.requires && !GameState.getFlag(b.requires)) continue
    if (b.excludes && GameState.getFlag(b.excludes)) continue
    if (b.requiresItem && !GameState.hasItem(b.requiresItem)) continue
    return b.lines
  }
  return [{ text: '...' }]
}
