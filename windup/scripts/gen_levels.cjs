const fs = require('fs');
const path = require('path');

const generateLevel = (index) => {
  let layout = Array(9).fill().map(() => Array(10).fill('.'));

  layout[7][1] = '@';
  
  for(let i=0; i<10; i++) {
    layout[8][i] = 'X';
  }

  layout[7][8] = 'G';

  let numPlatforms = Math.floor(index / 3);
  for(let i = 0; i < numPlatforms; i++) {
    let px = 2 + Math.floor(Math.random() * 6);
    let py = 3 + Math.floor(Math.random() * 4);
    layout[py][px] = 'X';
  }

  let numSprings = Math.floor(index / 5);
  for(let i = 0; i < numSprings; i++) {
    let px = 2 + Math.floor(Math.random() * 6);
    layout[8][px] = 's';
  }

  let numStations = 1;
  if (index > 15) numStations = 2;
  
  for(let i=0; i < numStations; i++) {
    let px = 4 + i * 2;
    layout[6][px] = 'S';
  }

  const strLayout = layout.map(row => `    "${row.join('')}"`).join(',\n');
  return `  ${index}: parseGrid([\n${strLayout}\n  ], legend, {\n    'M': { dx: 32, dy: 0, duration: 1500 }\n  })`;
};

let output = [];
for (let i = 3; i <= 32; i++) {
  output.push(generateLevel(i));
}

const levelsPath = path.join(__dirname, '..', 'levels.ts');
let levelsContent = fs.readFileSync(levelsPath, 'utf-8');

let insertPos = levelsContent.lastIndexOf('}');
if (insertPos !== -1) {
  let modified = levelsContent.substring(0, insertPos) + ",\n" + output.join(',\n') + "\n}";
  fs.writeFileSync(levelsPath, modified);
}
