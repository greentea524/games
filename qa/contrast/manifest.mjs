// What each game's DMG art is drawn against (#106).
//
// Every entry here was measured in a browser, not read off the source. The
// surfaces are sampled from the generated textures at run time, so nothing in
// this file hardcodes a colour and a palette change cannot silently invalidate
// it.
//
// Lantern Keeper is absent on purpose. It has no DMG mode at all — one
// GBC-inspired ramp in `constants.ts`, no palette toggle in its shell, and
// zero textures with `dmg` in the key. The issue this came from said "all five
// games"; it is four.

/**
 * A surface is the thing a sprite is drawn on top of. Some are standalone
 * textures, some are one frame of a tileset, and some are a scene's camera
 * background colour rather than a texture at all.
 */
export const GAMES = [
  {
    game: 'pocket-dungeon',
    // Tap A three times: title -> class select -> dungeon.
    advance: 3,
    scene: 'dungeon',
    surfaces: {
      // Frame 0 of the tileset is the room floor. Measured #9bbc0f, which is
      // PAL.lightest — the brightest tone the DMG ramp has, which is why so
      // many sprites here have shipped invisible.
      floor: { texture: 'tiles_dmg_v2', frame: 0 },
    },
    // Everything the player is meant to pick out against the room floor.
    onFloor: [
      'hero_dmg_down', 'hero_dmg_up', 'hero_dmg_left', 'hero_dmg_right',
      'rat_dmg', 'bat_dmg', 'archer_dmg', 'spider_dmg', 'slime_dmg',
      'skeleton_dmg', 'boss_dmg',
      'cobweb_dmg',
      'item_weapon_dmg', 'item_armor_dmg', 'item_accessory_dmg',
      'item_food_dmg', 'item_potion_dmg', 'item_scroll_dmg',
      'item_key_dmg', 'item_rewind_dmg',
      'chest_wooden_closed_dmg', 'chest_wooden_open_dmg',
      'chest_golden_closed_dmg', 'chest_golden_open_dmg',
      'chest_locked_closed_dmg', 'chest_locked_open_dmg',
    ],
    exclude: {
      tiles_dmg_v2: 'the tileset is the surface, not something drawn on it',
    },
  },
  {
    game: 'cart-crate',
    advance: 2,
    scene: 'board',
    surfaces: {
      floor: { texture: 'floor_dmg' },
    },
    onFloor: [
      'player_dmg_down', 'player_dmg_up', 'player_dmg_left', 'player_dmg_right',
      'crate_dmg', 'target_dmg', 'target_lit_dmg',
      'hole_dmg',
      'wall_dmg', 'shelf_dmg', 'pegboard_dmg', 'barrel_dmg',
    ],
    // Ice and cracked ground are floor with a mark on it — that is what they
    // are meant to be, so they answer to the variant rule instead.
    floorVariants: ['ice_dmg', 'cracked_dmg'],
    exclude: {
      floor_dmg: 'the floor is the surface',
    },
  },
  {
    game: 'static',
    advance: 3,
    scene: 'world',
    surfaces: {
      // Static's tileset is fed to a Phaser tilemap, which indexes the image
      // directly and registers no frames — hence the rect. Tile 0 is GRASS,
      // drawn in PAL.lightest, which is what most of the game is walked on.
      floor: { texture: 'tiles_dmg', rect: [0, 0, 16, 16] },
    },
    onFloor: [
      'kid_dmg_down_0', 'kid_dmg_down_1', 'kid_dmg_up_0', 'kid_dmg_up_1',
      'kid_dmg_left_0', 'kid_dmg_left_1', 'kid_dmg_right_0', 'kid_dmg_right_1',
      'npc_dmg_mom_down', 'npc_dmg_ren_down', 'npc_dmg_gus_down', 'npc_dmg_baker_down',
      'item_dmg_flashlight', 'item_dmg_flashlight_dead', 'item_dmg_flower',
      'item_dmg_flower_fresh', 'item_dmg_photo', 'item_dmg_ledger', 'item_dmg_ren_key',
      'item_dmg_signal_shard', 'item_dmg_photo_intact', 'item_dmg_ledger_unredacted',
      'fountain_full_dmg', 'fountain_drained_dmg', 'hatch_dmg',
      'prop_bed_dmg', 'prop_bookshelf_dmg', 'prop_plant_dmg',
      'prop_bush_dmg', 'prop_fence_dmg', 'prop_flower_dmg',
    ],
    floorVariants: ['prop_rug_dmg'],
    exclude: {
      tiles_dmg: 'the tileset is the surface',
      // The NPC side and back frames are the same art as their `_down` frame
      // with a different face; checking one per NPC is enough to catch a tone
      // mistake, and listing 16 near-identical keys would be noise.
      'npc_dmg_mom_up': 'same body art as npc_dmg_mom_down',
      'npc_dmg_mom_left': 'same body art as npc_dmg_mom_down',
      'npc_dmg_mom_right': 'same body art as npc_dmg_mom_down',
      'npc_dmg_ren_up': 'same body art as npc_dmg_ren_down',
      'npc_dmg_ren_left': 'same body art as npc_dmg_ren_down',
      'npc_dmg_ren_right': 'same body art as npc_dmg_ren_down',
      'npc_dmg_gus_up': 'same body art as npc_dmg_gus_down',
      'npc_dmg_gus_left': 'same body art as npc_dmg_gus_down',
      'npc_dmg_gus_right': 'same body art as npc_dmg_gus_down',
      'npc_dmg_baker_up': 'same body art as npc_dmg_baker_down',
      'npc_dmg_baker_left': 'same body art as npc_dmg_baker_down',
      'npc_dmg_baker_right': 'same body art as npc_dmg_baker_down',
    },
  },
  {
    game: 'windup',
    advance: 2,
    scene: 'platformer',
    surfaces: {
      // A platformer's gameplay sprites sit against the camera background,
      // not against the floor — the player is in the air as often as not.
      sky: { cameraBackground: true },
      // Frame 1 is the brick wall, not frame 0 — frame 0 is grass ground.
      // The brick is what #52's backdrop was accidentally painted to match,
      // so the brick is the tone the separation check has to measure against.
      platform: { texture: 'tiles_dmg', frame: 1 },
    },
    onSky: [
      'windup_dmg_left', 'windup_dmg_right',
      'station_dmg', 'station_empty_dmg', 'energy_dmg', 'goal_dmg', 'puff_dmg',
    ],
    // #52's defect, and it is the opposite relation. The backdrop must NOT be
    // confusable with the platform tile: it shipped drawn in the brick tone,
    // so background scenery read as something you could stand on. Here a high
    // score is the failure.
    backdropVsPlatform: [
      'bg_gear_lg_dmg', 'bg_gear_sm_dmg', 'bg_pipe_dmg', 'bg_girder_dmg', 'bg_lamp_dmg',
    ],
    exclude: {
      tiles_dmg: 'the tileset is the surface',
      windup_dmg_head: 'the portrait, drawn on the HUD panel rather than in the world',
    },
  },
]
