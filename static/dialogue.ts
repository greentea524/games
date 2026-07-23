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
  ren_key: { id: 'ren_key', name: "Ren's Key", icon: 'item_ren_key' },
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
      // Chapter 4 (#19): Ren realizes their house is next.
      {
        requires: 'ch3_done',
        excludes: 'ren_warned',
        lines: [
          { text: 'You’re saying MY house is next? I— I believe you.' },
          {
            text: 'Here, take my key. If there’s anything you can do... do it.',
            give: 'ren_key',
            setFlag: 'ren_warned',
          },
          { text: 'I’ll wait right here. I’m not going anywhere.' },
        ],
      },
      {
        requires: 'ren_warned',
        excludes: 'ch4_done',
        lines: [
          { text: 'Did it work? Please tell me you stopped it.' },
          { text: 'The air keeps humming, like a TV left on...' },
        ],
      },
      {
        requires: 'ch4_done',
        lines: [
          { text: 'You saved it. You saved my HOUSE.' },
          { text: 'I saw it flicker and... hold. I’ll never forget this.' },
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

// Chapter 4 (#19): urgency beat when the race begins.
export const RACE_START_DEF: NpcDef = {
  id: 'race_start',
  name: 'THE RACE',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      lines: [
        { text: 'Ren’s house is next on the list.' },
        { text: 'You have to anchor it — before the channel turns.' },
        { text: 'Warn Ren. Find how the static copies a house. Then break it.' },
      ],
    },
  ],
}

// The Static-side beacon writing Ren's house into the recording.
export const BEACON_DEF: NpcDef = {
  id: 'beacon',
  name: 'STATIC BEACON',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      excludes: 'beacon_found',
      lines: [
        { text: 'A pale beacon pulses against Ren’s house, copying it.' },
        { text: 'Line by line, it writes the house into the static.' },
        {
          text: 'You can’t stop it here — only from the real side, at the door.',
          setFlag: 'beacon_found',
        },
      ],
    },
    { lines: [{ text: 'The beacon pulses on, patient and cold.' }] },
  ],
}

// The anchoring act at Ren's door in the normal world (gated).
export const ANCHOR_DEF: NpcDef = {
  id: 'anchor',
  name: "REN'S DOOR",
  shirt: 'light',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      requires: 'beacon_found',
      requiresItem: 'ren_key',
      excludes: 'ch4_done',
      lines: [
        {
          text: 'You lock the door with Ren’s key and hold it fast.',
          setFlag: 'prevented_vanishing',
        },
        {
          text: 'Then you carve REN’S NAME deep into the frame. A record.',
          setFlag: 'ch4_done',
          take: 'ren_key',
        },
        { text: 'The channel tries to turn. The house flickers... and HOLDS.' },
      ],
    },
    {
      requires: 'ch4_done',
      lines: [{ text: 'The name in the frame still holds. The house is safe.' }],
    },
    {
      excludes: 'beacon_found',
      lines: [
        { text: 'You rattle the door, but nothing happens.' },
        { text: 'The static keeps a copy somewhere. Find it first.' },
      ],
    },
    // Reached only with the beacon found but no key in hand.
    { lines: [{ text: 'The door is locked. You’d need Ren’s key.' }] },
  ],
}

// Chapter 5 (#20): opening beat, pointing the player home to the TV.
export const CH5_START_DEF: NpcDef = {
  id: 'ch5_start',
  name: 'THE CALLING',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      lines: [
        { text: 'Ren’s house is safe. But it isn’t over.' },
        { text: 'The static is calling — through the TV, back home.' },
        { text: 'Whatever is behind it... it wants to be found.' },
      ],
    },
  ],
}

// Chapter 5 (#20): the lonely entity at the heart of the static. Its
// reveal is colored by which #15 thread the player pursued, but both
// endings stay available (choice is explicit, not gated).
const ENTITY_CHOICE = [
  { label: 'Stay with it', setFlag: 'ending_empathy' },
  { label: 'End the signal', setFlag: 'ending_severance' },
]
export const ENTITY_DEF: NpcDef = {
  id: 'entity',
  name: 'THE STATIC',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      requires: 'thread_flower_done',
      excludes: 'game_ended',
      lines: [
        { text: 'The shape flickers — a thousand borrowed faces.' },
        { text: 'I only wanted to KEEP them. So I would not be alone.' },
        { text: 'You left a flower for the forgotten. You understand me.' },
        { text: 'So choose. What becomes of me?', choice: ENTITY_CHOICE },
      ],
    },
    {
      requires: 'thread_fountain_done',
      excludes: 'game_ended',
      lines: [
        { text: 'The shape flickers — a thousand borrowed faces.' },
        { text: 'I take, and I keep. It is all I know how to do.' },
        { text: 'You dug up what I buried. You see exactly what I am.' },
        { text: 'So choose. What becomes of me?', choice: ENTITY_CHOICE },
      ],
    },
    {
      excludes: 'game_ended',
      lines: [
        { text: 'The shape flickers — a thousand borrowed faces.' },
        { text: 'I am what remains when a place is forgotten.' },
        { text: 'And I am so tired of being alone.' },
        { text: 'So choose. What becomes of me?', choice: ENTITY_CHOICE },
      ],
    },
    { lines: [{ text: 'Only static remains.' }] },
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
