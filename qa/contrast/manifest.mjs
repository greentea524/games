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
    // The shell control that puts the game in DMG mode (#134).
    paletteToggle: '#palette-toggle',
    // Tap A three times: title -> class select -> dungeon.
    advance: 3,
    scene: 'dungeon',
    surfaces: {
      // Frame 0 of the tileset is the room floor. Measured #9bbc0f, which is
      // PAL.lightest — the brightest tone the DMG ramp has, which is why so
      // many sprites here have shipped invisible.
      floor: { texture: 'tiles_dmg_v2', frame: 0 },
      // The bottom status bar, where the relic pips live (#131).
      //
      // Not a texture — it is a rectangle `UIScene` draws at 80% opacity over
      // the dungeon, so its tone is a composite and has to be derived. Both
      // halves are read from the running game: the fill and the alpha off the
      // live rectangle, the thing behind it off the floor surface above. The
      // point is what identifies the rectangle, so moving the bar without
      // moving this fails loudly rather than silently measuring the wrong
      // thing.
      hud: { overlay: { scene: 'ui', at: [120, 204] }, over: 'floor' },
    },
    on: {
      // Everything the player is meant to pick out against the room floor.
      floor: [
      'hero_dmg_down', 'hero_dmg_up', 'hero_dmg_left', 'hero_dmg_right',
      'rat_dmg', 'bat_dmg', 'archer_dmg', 'spider_dmg', 'slime_dmg',
      'skeleton_dmg', 'boss_dmg', 'boss_brute_dmg', 'boss_choir_dmg',
      'cobweb_dmg',
      'item_weapon_dmg', 'item_armor_dmg', 'item_accessory_dmg',
      'item_food_dmg', 'item_potion_dmg', 'item_scroll_dmg',
      'item_key_dmg', 'item_rewind_dmg',
      'chest_wooden_closed_dmg', 'chest_wooden_open_dmg',
      'chest_golden_closed_dmg', 'chest_golden_open_dmg',
      'chest_locked_closed_dmg', 'chest_locked_open_dmg',
      'relic_dmg', 'portal_dmg',
      ],
      // #84's pips. They were excluded for four issues on the grounds that
      // they answer to the status bar rather than the floor, which was true
      // and was the wrong conclusion: the bar is a surface, so it gets named.
      hud: [
        'relicpip_held_dmg', 'relicpip_empty_dmg',
        // The heart and the three slot pictures (#158).
        'hud_heart_dmg', 'hud_weapon_dmg', 'hud_armour_dmg', 'hud_keys_dmg',
      ],
    },
    exclude: {
      tiles_dmg_v2: 'the tileset is the surface, not something drawn on it',
    },
  },
  {
    game: 'cart-crate',
    // The shell control that puts the game in DMG mode (#134).
    paletteToggle: '#palette-toggle',
    advance: 2,
    scene: 'board',
    surfaces: {
      // Frame 0 of the floor strip: the plain square (#161). All four frames
      // are the lightest tone on the green screen.
      floor: { texture: 'floor_dmg', frame: 0 },
      // The warehouse outside the level (#163): its own, dark floor.
      surround: { texture: 'decorfloor_dmg', frame: 0 },
    },
    on: {
      surround: ['decor_dmg'],
      floor: [
        'player_dmg_down', 'player_dmg_up', 'player_dmg_left', 'player_dmg_right',
        // The fox mid-step and leaning into a crate (#162).
        'player_dmg_down_step', 'player_dmg_up_step', 'player_dmg_left_step', 'player_dmg_right_step',
        'player_dmg_down_push', 'player_dmg_up_push', 'player_dmg_left_push', 'player_dmg_right_push',
        'crate_dmg', 'crate_on_dmg', 'target_dmg', 'target_lit_dmg',
        'hole_dmg',
        'wall_dmg', 'wallcorner_dmg',
      ],
    },
    // Ice and cracked ground are floor with a mark on it — that is what they
    // are meant to be, so they answer to the variant rule instead.
    floorVariants: ['ice_dmg', 'cracked_dmg'],
    exclude: {
      floor_dmg: 'the floor is the surface',
      decorfloor_dmg: 'the surround\'s floor is the surface',
    },
  },
  {
    game: 'static',
    // The shell control that puts the game in DMG mode (#134).
    paletteToggle: '#palette-toggle',
    advance: 3,
    scene: 'world',
    surfaces: {
      // The village as it is drawn (#178). The strip is fed to a Phaser
      // tilemap, which indexes the image directly and registers no frames —
      // hence the rect. Its first picture is plain grass, in PAL.lightest,
      // which is what most of the game is walked on.
      floor: { texture: 'village_dmg', rect: [0, 0, 24, 24] },
    },
    on: {
      floor: [
      'kid_dmg_down_0', 'kid_dmg_down_1', 'kid_dmg_up_0', 'kid_dmg_up_1',
      'kid_dmg_left_0', 'kid_dmg_left_1', 'kid_dmg_right_0', 'kid_dmg_right_1',
      // Every facing of everyone: each is its own picture since #179.
      ...['mom', 'ren', 'gus', 'baker'].flatMap((id) => ['down', 'up', 'left', 'right'].map((f) => `npc_dmg_${id}_${f}`)),
      'item_dmg_flashlight', 'item_dmg_flashlight_dead', 'item_dmg_flower',
      'item_dmg_flower_fresh', 'item_dmg_photo', 'item_dmg_ledger', 'item_dmg_ren_key',
      'item_dmg_signal_shard', 'item_dmg_photo_intact', 'item_dmg_ledger_unredacted',
      'corruption_sealed_dmg', 'corruption_open_dmg',
      // The second frame of everything that crackles, and the three that
      // had no green-screen picture before #179.
      'corruption_sealed_dmg_b', 'corruption_open_dmg_b',
      'tv_dmg', 'tv_dmg_b', 'entity_dmg', 'entity_dmg_b', 'beacon_dmg',
      'prop_lamp_dmg', 'prop_sign_dmg', 'prop_barrel_dmg',
      'fountain_full_dmg', 'fountain_drained_dmg', 'hatch_dmg',
      'prop_bed_dmg', 'prop_bookshelf_dmg', 'prop_plant_dmg',
      'prop_bush_dmg', 'prop_fence_dmg', 'prop_flower_dmg',
      ],
    },
    floorVariants: ['prop_rug_dmg'],
    exclude: {
      village_dmg: 'the drawn village is the surface',
      // The twelve tiles the maps are written in. They still collide, and
      // are no longer drawn (#178).
      tiles_dmg: 'the maps\' own tiles, hidden under the drawn village',
    },
  },
  {
    game: 'windup',
    // The shell control that puts the game in DMG mode (#134).
    paletteToggle: '#btn-palette',
    advance: 2,
    scene: 'platformer',
    surfaces: {
      // A platformer's gameplay sprites sit against the camera background,
      // not against the floor — the player is in the air as often as not.
      // Read in DMG: the camera takes each palette's own colour since #167,
      // and the sprites scored against it are the green screen's.
      sky: { cameraBackground: true, inDmg: true },
      // A block of stone with stone on every side (#167): its face, which
      // is what most of a wall is. The brick it replaced is what #52's
      // backdrop was accidentally painted to match, so this is the tone the
      // separation check has to measure against.
      platform: { texture: 'stone_dmg', frame: 15 * 2 },
    },
    on: {
      sky: [
        // The toy in all six poses and its key, the orb, the station and the
        // goal, all redrawn at 24 in #168.
        'robot_dmg', 'key_dmg',
        'station_dmg', 'station_empty_dmg', 'energy_dmg', 'goal_dmg', 'puff_dmg',
        // The HUD portrait (#56). It was excluded as "drawn on the HUD panel
        // rather than in the world", and there is no HUD panel — `UIScene`
        // holds a portrait, a graphics energy bar and two labels, and nothing
        // behind any of them. The portrait sits on the camera background like
        // every other sprite in this list (#131).
        'windup_dmg_head',
        // #167's hazards and machines. Spikes and springs stand in the open,
        // the arc's emitters hang in it, and a moving platform crosses it.
        // A belt and a pool are set in the floor, but their tops are open to
        // the room like everything else's.
        'spike_dmg', 'spring_dmg', 'mover_dmg', 'pylon_dmg', 'belt_dmg', 'lava_dmg',
      ],
      // The toy stands on the stone as often as it is in the air, and the
      // ticket asks that it read against every platform (#168).
      platform: ['robot_dmg', 'key_dmg'],
    },
    // #52's defect, and it is the opposite relation. The backdrop must NOT be
    // confusable with the platform tile: it shipped drawn in the brick tone,
    // so background scenery read as something you could stand on. Here a high
    // score is the failure. Since #167 the backdrop is three layers and two
    // gears, all drawn in the two dark tones.
    backdropVsPlatform: [
      'bgfar_dmg', 'bgmid_dmg', 'bgnear_dmg', 'gearbig_dmg', 'gearsmall_dmg',
    ],
    exclude: {
      tiles_dmg: 'no longer drawn: every body is still made from it, then given its picture (#167)',
      stone_dmg: 'the platforms are the surface',
    },
  },
]
