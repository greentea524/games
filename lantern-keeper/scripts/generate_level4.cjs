const fs = require('fs');
const path = require('path');

const WIDTH = 60;
const HEIGHT = 80;

// Create 1D array filled with empty space
const data = new Array(WIDTH * HEIGHT).fill(0);

// Helper to set tile
function setTile(x, y, tile) {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
    data[y * WIDTH + x] = tile;
  }
}

// Helper to draw a rect
function drawRect(x, y, w, h, tile = 5) {
  for (let iy = 0; iy < h; iy++) {
    for (let ix = 0; ix < w; ix++) {
      setTile(x + ix, y + iy, tile);
    }
  }
}

// 1. Fill borders
drawRect(0, 0, WIDTH, HEIGHT, 5);
drawRect(2, 2, WIDTH - 4, HEIGHT - 4, 0); // Hollow out

// The start is at the bottom left.
// Let's create a solid floor at the bottom
drawRect(0, HEIGHT - 5, WIDTH, 5, 5);

// Let's create a winding vertical path.
// Player starts at (5, HEIGHT - 8).
let objects = [
  {
    "name": "start",
    "x": 5 * 8,
    "y": (HEIGHT - 5) * 8 - 8, // bottom left
    "point": true
  }
];

// Room 1: Bottom area (requires double jump to proceed up)
// We block the right side.
drawRect(20, HEIGHT - 20, WIDTH - 20, 20, 5); 
// Gap to jump up:
drawRect(12, HEIGHT - 20, 8, 2, 5); // Platform to jump onto
drawRect(2, HEIGHT - 28, 10, 2, 5); // Next platform
drawRect(16, HEIGHT - 36, 12, 2, 5); // Next platform

// Add a lantern here
objects.push({
  "name": "lantern1",
  "x": 22 * 8,
  "y": (HEIGHT - 36) * 8,
  "point": true
});

// Room 2: The Shaft (requires Wall Cling to ascend)
// A narrow chimney from Y = HEIGHT - 36 up to Y = HEIGHT - 65
drawRect(10, HEIGHT - 65, 4, 30, 5); // Left wall of shaft
drawRect(20, HEIGHT - 65, 4, 30, 5); // Right wall of shaft
// Gap in the right wall to enter
drawRect(20, HEIGHT - 40, 4, 4, 0); 

// Lantern at the top of the shaft
objects.push({
  "name": "lantern2",
  "x": 16 * 8,
  "y": (HEIGHT - 65) * 8,
  "point": true
});

// Room 3: The Dash Gap (requires Dash)
// Top area from X=24 to X=50
drawRect(24, HEIGHT - 60, 6, 2, 5); 
drawRect(42, HEIGHT - 60, 10, 2, 5); // Big gap (12 tiles wide). Dash + Double jump gets across.

objects.push({
  "name": "lantern3",
  "x": 48 * 8,
  "y": (HEIGHT - 60) * 8,
  "point": true
});

// Room 4: Final ascent to Heart Tree
// After the gap, climb up again.
drawRect(52, 10, 4, HEIGHT - 60 - 10, 5); // Right wall
drawRect(40, 20, 4, HEIGHT - 60 - 20, 5); // Left wall
// This is another wall jump shaft.

// Heart tree at the top left.
drawRect(2, 8, 38, 2, 5); // Platform for heart tree
objects.push({
  "name": "lantern4",
  "x": 42 * 8,
  "y": 20 * 8,
  "point": true
});

objects.push({
  "name": "heart_tree",
  "x": 20 * 8,
  "y": 8 * 8,
  "point": true
});

// Convert objects to Tiled format
const tiledObjects = objects.map((o, i) => ({
  ...o,
  id: i + 1,
  rotation: 0,
  type: "",
  visible: true,
  width: o.width || 0,
  height: o.height || 0
}));

// Build JSON
const levelJson = {
  "compressionlevel": -1,
  "height": HEIGHT,
  "width": WIDTH,
  "tilewidth": 8,
  "tileheight": 8,
  "infinite": false,
  "orientation": "orthogonal",
  "renderorder": "right-down",
  "type": "map",
  "version": "1.10",
  "tiledversion": "1.10.2",
  "layers": [
    {
      "data": data,
      "height": HEIGHT,
      "id": 1,
      "name": "Tile Layer 1",
      "opacity": 1,
      "type": "tilelayer",
      "visible": true,
      "width": WIDTH,
      "x": 0,
      "y": 0
    },
    {
      "draworder": "topdown",
      "id": 2,
      "name": "lanterns",
      "objects": tiledObjects,
      "opacity": 1,
      "type": "objectgroup",
      "visible": true,
      "x": 0,
      "y": 0
    }
  ],
  "tilesets": [
    {
      "columns": 8,
      "firstgid": 1,
      "image": "tiles.png",
      "imageheight": 8,
      "imagewidth": 64,
      "margin": 0,
      "name": "tiles",
      "spacing": 0,
      "tilecount": 8,
      "tileheight": 8,
      "tilewidth": 8
    }
  ]
};

const outPath = path.join(__dirname, '..', 'public', 'assets', 'level4.json');
const altPath = path.join(__dirname, '..', 'assets', 'level4.json');

// Try both paths just in case
try { fs.writeFileSync(outPath, JSON.stringify(levelJson, null, 1)); } catch (e) {}
try { fs.writeFileSync(altPath, JSON.stringify(levelJson, null, 1)); } catch (e) {}

console.log('Successfully generated level4.json!');
