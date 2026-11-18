// Breaking text into lines, as it is drawn (#175).
//
// Phaser's own wrapping measures with the browser's font metrics, which a
// test cannot see. These screens draw the lines this returns, joined, so what
// `screens_test.ts` measures is what is on the screen.

/** Lines of at most `cols` characters, broken at spaces. */
export function wrapText(text: string, cols: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (!line) line = word
    else if (line.length + 1 + word.length <= cols) line += ` ${word}`
    else {
      out.push(line)
      line = word
    }
  }
  out.push(line)
  return out
}
