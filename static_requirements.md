# [Game] Static - GBC Top-Down Mystery Adventure

## 🎮 Core Concept
A GBC-style top-down mystery/adventure game where a kid explores a small town. An old TV acts as a portal to a glitchy "Static-side" mirrored world. The town is disappearing house by house, and items/clues from the other side bleed into reality. Tone: *Earthbound* meets *Link's Awakening*.

## 🛠 Technical Stack & Engine
- **Engine**: Phaser 3 (Web-based, JavaScript/TypeScript)
- **Deployment**: GitHub Pages / Vercel
- **Map Editor**: Tiled (tilemap support)
- **Resolution**: 160x144 logical resolution, 16x16 tiles (GBC format)
- **Visuals**: GBC dual-palette system (Normal vs. Static-side: grays + one accent), CRT/static noise shader for transitions.

## 📱 Mobile-Friendly Design (Mandatory)
- **Touch Controls**: Tap-to-walk (pathfinding to tap) as primary; on-screen d-pad as alternative.
- **Interactions**: Context-sensitive 'interact' button when near NPCs or objects.
- **Dialogue**: Tap anywhere to advance text; large touch targets for choices.
- **Fallback**: Keyboard support for desktop (auto-hide touch UI on keypress).
- **Pacing**: No timing-critical inputs (designed for casual touch).

## 🔄 Core Mechanics: Dual-World
- **Mirrored Maps**: "Town" (normal) and "Static-side" (glitchy/desaturated).
- **Portals**: Initial portal is the TV in the protagonist's house. Later, any switched-on TV works.
- **Item Crossovers**: Items carried across worlds transform (e.g., wilted flower <-> fresh flower). Puzzles involve bringing the "wrong-world" item to NPCs.
- **Global State Flags**: Actions in one world affect the other (e.g., drain a fountain in Static-side -> reveals a hatch in the Town).

## 🧩 Systems to Implement
1. **Dialogue System**: JSON-driven dialogue trees with condition flags (integrates with Pub/Sub event system).
2. **NPC Schedules**: Time-block positions (morning/afternoon/evening). Static-side NPCs are frozen in place.
3. **Save System**: Global world flags + inventory + chapter progress via `localStorage`.
4. **Puzzle Logic**: Item state toggling and cross-world environmental clues.

## 📖 Story Structure & Scope
- **Scope**: ~15 buildings, 8-10 named NPCs, 2 mirrored overworld maps + ~10 interior pairs. Playtime target: 2-3 hours.
- **Chapter 1 (Hook)**: Neighbor's house vanishes; nobody else remembers it.
- **Chapter 2 (Discovery)**: Find the TV portal; solve the first crossover puzzle.
- **Chapter 3 (Pattern)**: Learn houses vanish in order; find them intact but frozen on the Static-side.
- **Chapter 4 (Race)**: Story-gated sequence to predict and prevent the next vanishing.
- **Chapter 5 (Finale)**: Discover the Static-side is a "recording" by a lonely entity. Choose between empathy or severance (2 endings).

## 🎯 Milestones
- [ ] **Phase 1**: Town map + movement + collision + door transitions.
- [ ] **Phase 2**: Dialogue system + 3 initial NPCs + inventory UI.
- [ ] **Phase 3**: Dual-world switch logic + mirrored map rendering + first puzzle.
- [ ] **Phase 4**: World-state flag system + complete Chapters 1-2.
- [ ] **Phase 5**: Complete Chapters 3-5, 2 endings, save system integration, and polish.
