const fs = require('fs');

const content = fs.readFileSync('C:\\\\Users\\\\DELL\\\\.gemini\\\\antigravity\\\\brain\\\\87b1b91a-5fd9-43e2-a305-5fb9a421841d\\\\.system_generated\\\\steps\\\\1459\\\\content.md', 'utf8');

const rawLevels = content.split(/; \d+/).slice(1);
const microbanLevels = [];

for (let i = 0; i < 40; i++) {
  const raw = rawLevels[i].split('\\n').filter(l => l.trim().length > 0);
  
  // Convert characters
  const grid = raw.map(row => {
    let newRow = '';
    for (let char of row) {
      if (char === ' ') newRow += '.';
      else if (char === '#') newRow += '#';
      else if (char === '.') newRow += 'T';
      else if (char === '$') newRow += 'C';
      else if (char === '@') newRow += 'P';
      else if (char === '*') newRow += '*';
      else if (char === '+') newRow += '+';
      else newRow += char;
    }
    return newRow;
  });
  
  // Pad grid to have equal length rows if necessary, not strictly needed but good practice
  const maxW = Math.max(...grid.map(r => r.length));
  const paddedGrid = grid.map(r => r.padEnd(maxW, '.'));
  
  microbanLevels.push(paddedGrid);
}

// Load existing levels.ts
const levelsFile = fs.readFileSync('levels.ts', 'utf8');
const startMarker = 'export const CAMPAIGN_LEVELS: LevelConfig[] = ';
const startIndex = levelsFile.indexOf(startMarker) + startMarker.length;
const levelsStr = levelsFile.substring(startIndex);
const existingLevels = JSON.parse(levelsStr);

// Keep 1-10
const finalLevels = existingLevels.slice(0, 10);

const titles = [
  "Ice Slide", "Ricochet", "Ice Corner", "Stop And Go", "Slip And Slide",
  "Ice Blocks", "Chilly Push", "Glacier", "Frozen Lake", "Deep Freeze",
  "Watch Your Step", "Pitfall", "Fragile Bridge", "Crumble", "Hole In One",
  "Ruin Maze", "Shatter", "Abyss", "Leap Of Faith", "Temple of Cracks",
  "Maze Start", "Corridors", "Twisty", "Dead End", "Zig Zag",
  "Tight Squeeze", "Four Rooms", "Spiral", "Hidden Target", "Labyrinth End",
  "Ice And Fire", "Tricky Floor", "Sliding Pit", "Combo 1", "Combo 2",
  "Puzzle Box", "Brain Teaser", "The Gauntlet", "Penultimate", "Final Exam"
];

for (let i = 0; i < 40; i++) {
  finalLevels.push({
    id: i + 11,
    title: titles[i],
    world: Math.floor((i + 10) / 10) + 1,
    parMoves: 20 + i * 2, // arbitrary
    grid: microbanLevels[i]
  });
}

const fileContent = "export interface LevelConfig {\\n" +
  "  id: number\\n" +
  "  title: string\\n" +
  "  world: number\\n" +
  "  parMoves: number\\n" +
  "  grid: string[]\\n" +
  "}\\n\\n" +
  "export const CAMPAIGN_LEVELS: LevelConfig[] = " + JSON.stringify(finalLevels, null, 2) + "\\n";

fs.writeFileSync('levels.ts', fileContent);
console.log('Successfully imported Microban levels!');
