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
        requires: 'heard_about_house',
        excludes: 'chapter2_done',
        lines: [
          { text: 'A vanished house? Honey, you read too many comics.' },
          { text: 'Though... that old TV of ours has been hissing all morning.' },
          { text: 'Like it wants to say something. Creepy old thing.' },
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
        excludes: 'baker_vanished',
        lines: [
          { text: 'Morning! Smell that? The Baker’s got rye today.' },
          { text: 'Best street in town, I keep telling you.' },
        ],
      },
      {
        requires: 'baker_vanished',
        excludes: 'heard_about_house',
        lines: [
          { text: 'Hey! Did you see the Bakers’ place?!' },
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
        requires: 'gus_hut_vanished',
        lines: [
          { text: 'Hut? What hut? I’ve always slept under the stars, kid.' },
          { text: '...Why does my back hurt like I owned a bed, though?' },
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
          {
            text: 'A figure stands frozen mid-step, eyes fixed on nothing.',
            setFlag: 'seen_baker_static',
          },
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
          {
            text: 'A figure stands frozen mid-step. They do not see you.',
            setFlag: 'seen_baker_static',
          },
          { text: 'Their empty basket sways, though there is no wind.' },
        ],
      },
      {
        lines: [
          {
            text: 'The flower rests in their basket, impossibly bright.',
            setFlag: 'seen_baker_static',
          },
          { text: 'Something in town may have changed...' },
        ],
      },
    ],
  },
}

// The Baker before the vanishing (Chapter 1, normal town).
export const BAKER_NORMAL_DEF: NpcDef = {
  id: 'baker',
  name: 'THE BAKER',
  shirt: 'light',
  hair: 'light',
  branches: [
    {
      lines: [
        { text: 'Fresh rye, straight from the oven!' },
        { text: 'Funny weather today. The radio is all static.' },
      ],
    },
  ],
}

// Narration: the vanishing itself (Chapter 1 trigger).
export const VANISH_DEF: NpcDef = {
  id: 'vanish',
  name: '???',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      lines: [
        { text: 'The air crackles, like a channel changing.' },
        { text: 'Where the Bakers’ house stood... there is only grass.' },
        { text: 'Somehow, you feel you are the only one who noticed.' },
      ],
    },
  ],
}

// Narration: Chapter 3 hook, after the first crossover puzzle.
export const CH3_HINT_DEF: NpcDef = {
  id: 'ch3hint',
  name: 'A THOUGHT',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      lines: [
        { text: 'The static side keeps what the town forgets.' },
        { text: 'And the houses over there... they stand in a line.' },
        { text: 'As if something is working down a list.' },
      ],
    },
  ],
}

// The frozen copy of Gus outside his hut on the Static-side (Chapter 3).
export const GUS_STATIC_DEF: NpcDef = {
  id: 'gus_static',
  name: 'GUS?',
  shirt: 'dark',
  hair: 'light',
  frozen: true,
  branches: [
    {
      lines: [
        {
          text: 'A grey figure sits outside the hut, mid-laugh, unmoving.',
          setFlag: 'seen_gus_static',
        },
        { text: 'It looks exactly like Gus. But Gus is still in town...' },
      ],
    },
  ],
}

// Narration: the second vanishing (Chapter 3 trigger).
export const GUS_VANISH_DEF: NpcDef = {
  id: 'gus_vanish',
  name: '???',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      lines: [
        { text: 'The channel changes again.' },
        { text: 'Gus’s hut unravels into grass and static.' },
        { text: 'You already know: nobody else will remember it.' },
      ],
    },
  ],
}

// Narration: the pattern clicks (Chapter 3 gate).
export const PATTERN_DEF: NpcDef = {
  id: 'pattern',
  name: 'A REALIZATION',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      lines: [
        {
          text: 'Two houses stand on the static side now.',
          setFlag: 'ch3_done',
        },
        { text: 'The Baker’s. Then Gus’s hut. In the order they were lost.' },
        { text: 'A list, worked top to bottom...' },
        { text: 'Ren’s house is next.' },
      ],
    },
  ],
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
