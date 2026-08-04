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

// Items moved to `items.ts` so `state.ts` can read the transform table without
// importing this module, which imports GameState. Re-exported here because
// callers have always reached for them through dialogue.
export { ITEMS } from './items'
export type { ItemDef } from './items'

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

// ---- Examinable scenery ----
// Small helper: most props are a fixed observation with no state.
const examine = (id: string, name: string, ...text: string[]): NpcDef => ({
  id,
  name,
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [{ lines: text.map((t) => ({ text: t })) }],
})

// The bookshelf carries the slow reveal: the same shelf reads differently
// as the player learns what is happening to the town.
export const BOOKSHELF_DEF: NpcDef = {
  id: 'bookshelf',
  name: 'BOOKSHELF',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      requires: 'ch3_done',
      lines: [
        { text: 'The town history, third edition.' },
        { text: 'You check the index of families again.' },
        { text: 'Two names you remember are no longer printed there.' },
        { text: 'The paper is not damaged. They were simply never set.' },
      ],
    },
    {
      requires: 'chapter2_done',
      lines: [
        { text: 'A local history, a seed catalogue, some paperbacks.' },
        { text: 'The history has a fold-out map of the town.' },
        { text: 'You count the houses on it. You count them again.' },
        { text: 'The map has one more house than the street does.' },
      ],
    },
    {
      lines: [
        { text: 'A local history, a seed catalogue, some paperbacks.' },
        { text: 'Dust on the top shelf, none on the second.' },
        { text: 'Someone still reads these.' },
      ],
    },
  ],
}

// The journal is the always-available objective hint (Part C).
// Branches run newest-chapter-first; the first match wins.
export const JOURNAL_DEF: NpcDef = {
  id: 'journal',
  name: 'YOUR NOTEBOOK',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      requires: 'ch4_done',
      lines: [
        { text: 'Last entry:' },
        { text: 'Ren is safe. The static took something else instead.' },
        { text: 'The TV is louder now. It is asking for me by name.' },
        { text: '> Go home. Use the TV.' },
      ],
    },
    {
      requires: 'ch3_done',
      lines: [
        { text: 'Last entry:' },
        { text: "Ren's house is next. I am sure of it." },
        { text: 'On the static side it is half-drawn already.' },
        { text: '> Find the beacon, get the key, anchor the door.' },
      ],
    },
    {
      requires: 'gus_hut_vanished',
      lines: [
        { text: 'Last entry:' },
        { text: 'Gus is gone. Nobody remembers the hut was there.' },
        { text: 'On the static side both lost houses still stand.' },
        { text: '> Cross over. Look at the houses that vanished.' },
      ],
    },
    {
      requires: 'chapter2_done',
      lines: [
        { text: 'Last entry:' },
        { text: 'Things carried through the TV come back changed.' },
        { text: 'The town is losing houses in some kind of order.' },
        { text: '> Keep crossing over. Work out the pattern.' },
      ],
    },
    {
      requires: 'heard_about_house',
      lines: [
        { text: 'Last entry:' },
        { text: "The baker's house is gone and I am the only one who saw it." },
        { text: 'Mom says the TV has been hissing all morning.' },
        { text: '> Go home. Try the TV.' },
      ],
    },
    {
      requires: 'got_flashlight',
      lines: [
        { text: 'Last entry:' },
        { text: 'Power keeps flickering. Mom gave me the flashlight.' },
        { text: '> Go out into town. See what is wrong.' },
      ],
    },
    {
      lines: [
        { text: 'Your notebook. Mostly drawings.' },
        { text: 'The last page is blank, waiting.' },
        { text: '> Talk to Mom before heading out.' },
      ],
    },
  ],
}

// Static-side doors: the buildings are a recording, not a place.
export const STATIC_DOOR_DEF = examine(
  'static_door',
  'DOOR',
  'You reach for the handle.',
  'There is no handle. It is painted on,',
  'right down to the shine on the brass.',
  'Whoever copied this house never opened it.',
)

export const BED_DEF = examine(
  'bed',
  'BED',
  'Your bed, still unmade.',
  'You could sleep. You know you will not.',
)

export const RUG_DEF = examine(
  'rug',
  'RUG',
  'A worn rug, colours gone soft with age.',
  'The fringe is combed the wrong way near the TV.',
  'Something has been dragged across it.',
)

export const PLANT_DEF = examine(
  'plant',
  'POTTED PLANT',
  "Mom's fern. Watered too often, as usual.",
)

export const BUSH_DEF = examine(
  'bush',
  'HEDGE',
  'A thick hedge. Something small darts away under it.',
)

export const FOUNTAIN_DEF: NpcDef = {
  id: 'fountain',
  name: 'FOUNTAIN',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      requires: 'fountain_drained',
      lines: [
        { text: 'The basin is empty now.' },
        { text: 'Set into the dry floor is a hatch you have never seen.' },
      ],
    },
    {
      lines: [
        { text: 'The town fountain, still running.' },
        { text: 'Coins on the bottom. Some of them are old.' },
        { text: 'One is stamped with a building you cannot place.' },
      ],
    },
  ],
}

export const BAKERY_PHOTO_DEF = examine(
  'photo_wall',
  'FAMILY PHOTO',
  'The baker, younger, outside this same door.',
  'Two children squint into the sun beside him.',
  'You do not know their names.',
  'You have the sudden urge to learn them.',
)

export const GUS_STOVE_DEF = examine(
  'gus_shelf',
  'SHELF',
  'Seed packets, twine, a tin of screws sorted by size.',
  'A photograph lies face down on the top shelf.',
  'You leave it that way. It felt like the polite thing.',
)

export const REN_DESK_DEF: NpcDef = {
  id: 'ren_desk',
  name: 'DESK',
  shirt: 'dark',
  hair: 'dark',
  frozen: true,
  branches: [
    {
      requires: 'ch3_done',
      excludes: 'ren_warned',
      lines: [
        { text: "Ren's desk. Homework, half finished." },
        { text: 'An empty nail above it, key-shaped and clean.' },
        { text: 'Ren keeps it on them. You would have to ask.' },
      ],
    },
    {
      lines: [
        { text: "Ren's desk, buried in comics and homework." },
        { text: 'A drawing of the two of you is pinned above it.' },
      ],
    },
  ],
}

// First branch whose flag conditions match the current state.
/**
 * The current objective, read off whichever journal entry applies right now.
 *
 * JOURNAL_DEF marks its directive line with a leading '>', and its last
 * branch has no `requires`, so there is always an entry and always a
 * directive — but the fallback is kept anyway rather than asserting.
 *
 * This exists so the objective can be shown where the player is. The notebook
 * prop itself only exists in one room, which is the one place you are not
 * standing when you get lost.
 */
export function currentObjective(): string | null {
  for (const line of resolveDialogue(JOURNAL_DEF)) {
    if (line.text.startsWith('>')) return line.text.slice(1).trim()
  }
  return null
}

export function resolveDialogue(npc: NpcDef): DialogueLine[] {
  for (const b of npc.branches) {
    if (b.requires && !GameState.getFlag(b.requires)) continue
    if (b.excludes && GameState.getFlag(b.excludes)) continue
    if (b.requiresItem && !GameState.hasItem(b.requiresItem)) continue
    return b.lines
  }
  return [{ text: '...' }]
}
