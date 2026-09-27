// Every light on the standalone 3D stage goes through `lambertIntensity` (#133).
//
//   npx tsx shared/stage3d_test.ts
//
// Named for `shared/stage3d.ts`, whose contract this enforces. It was
// `lighting_test.ts` until #139, which was wrong twice over: this file has
// nothing to do with `shared/lighting.ts` — a darkness overlay for the Phaser
// games — and the name implied that module was covered when it had no check at
// all. `X_test.ts` beside `X.ts` means it tests `X` everywhere else here
// (`storage.ts`, `relics.ts`), so the name has to mean that or say something
// else.
//
// ## The defect this exists for
//
// three applies `BRDF_Lambert` — `RECIPROCAL_PI * diffuseColor` — to the
// ambient term as well as the direct one, so a light of intensity `i`
// contributes `i / PI` to the image. A rig written from the brightness someone
// actually wanted comes out at a third of it.
//
// **It has cost four games.** Tower Stacker found it by measuring a framebuffer
// that had collapsed to one tone; Tube Runner inherited the fix; Tilt Maze
// rediscovered it as a board too dark to see; Minigolf met it again. Every one
// looked like a lighting choice rather than a bug, and every one was caught by
// eye or by a tone measurement written for something else.
//
// `shared/stage3d.ts` has carried the fix since Tower Stacker. The problem is
// that it is **opt-in**: `new THREE.AmbientLight(0xffffff, 0.55)` compiles,
// runs, and looks plausibly-but-wrongly dark. Six games now call the helper at
// sixteen sites; a seventh gets it wrong by writing the obvious thing, and
// finds out late, the way the first four did.
//
// ## Why a source check rather than a nicer API
//
// #133 weighed handing the lights out from the stage — `stage.ambient(...)`,
// `stage.directional(...)` — and it does not actually prevent anything:
// `new THREE.DirectionalLight` is still right there, and a rig written against
// three's own documentation reaches for it first. This is the half that fails
// loudly on the day the seventh game is written, and it is much the smaller
// change.
//
// ## Which materials the factor is right for
//
// #133 left this open, and it is answered by reading the shipped GLSL rather
// than from memory. `BRDF_Lambert` is applied to `directDiffuse` *and*
// `indirectDiffuse` in every lit material three ships:
//
//   lights_lambert_pars_fragment.glsl    both
//   lights_phong_pars_fragment.glsl      both
//   lights_physical_pars_fragment.glsl   both
//   lights_toon_pars_fragment.glsl       both
//
// So the correction is right for the diffuse response of Lambert, Phong,
// Standard/Physical and Toon alike — which is the whole of the first two
// materials' answer to light, and the diffuse half of the others'. A specular
// lobe is *not* scaled by it and sits on top; that is a reason to re-tune a
// rig that adds specularity, not a reason to skip the factor. `MeshBasicMaterial`
// ignores lights entirely and has nothing to correct.
//
// ## The controls
//
// Per CLAUDE.md, each was reintroduced and watched go red:
//
//   - `lambertIntensity` dropped from one light in `minigolf/game.ts` — the
//     defect exactly as all four games had it;
//   - the intensity argument omitted in `voxel-digger/game.ts`, where three
//     silently defaults it to 1 and the rig is wrong without anyone typing a
//     number at all;
//   - the argument left correct in `tilt-maze/game.ts` and undone by a
//     `key.intensity = 0.9` on the next line;
//   - the import path renamed under the scanner, so it matches nothing. The
//     two guards catch that; note that the main check *passes vacuously* at
//     "0 lights", which is exactly why those guards are not optional;
//   - the same light rewritten as a named import, `new DirectionalLight(...)`
//     with no `THREE.` in front of it — the route a rig written against three's
//     own documentation would take.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../qa/harness.mjs'

let ok = true
const check = (name: string, pass: boolean, note?: string) => {
  if (!pass) ok = false
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`)
}

const SKIP = new Set(['node_modules', 'dist', '.git', 'public'])

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sources(full, out)
    // `*_test.ts` is skipped, this file included. A check file's lights are
    // fixtures — the ones below are deliberately wrong — and scanning them
    // would report the fixture as a defect. The parser is exercised against
    // those fixtures directly instead, which is the stronger arrangement
    // anyway: it fails if the scanner stops working, not just if a game does.
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('_test.ts')) {
      out.push(full)
    }
  }
  return out
}

export interface Light {
  /** e.g. `AmbientLight`. */
  kind: string
  /** The arguments as written, split at top-level commas. */
  args: string[]
  line: number
}

/**
 * Every `new THREE.<something>Light(...)` in a source string.
 *
 * Written as a paren-balancing scan rather than one regular expression, for a
 * reason worth stating: the intensity argument is routinely a call itself —
 * `lambertIntensity(AMBIENT)` — so a pattern that stops at the first `)` reads
 * the argument list as `0xffffff, lambertIntensity(AMBIENT` and a pattern that
 * stops at the last one swallows whatever follows on the line. Both produce a
 * scanner that is confidently wrong, which is worse here than one that throws.
 */
export function findLights(src: string): Light[] {
  const out: Light[] = []
  // `THREE.` is optional, so a file that switches to named imports —
  // `import { AmbientLight } from 'three'` — does not walk out from under the
  // check. The cost is that a local class whose name ends in `Light` is caught
  // too, which is the right side to err on.
  const open = /new\s+(?:THREE\.)?([A-Za-z]*Light)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = open.exec(src))) {
    let depth = 1
    let i = open.lastIndex
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
    }
    if (depth !== 0) continue // unbalanced; the file will not compile anyway
    const inner = src.slice(open.lastIndex, i - 1)
    const args: string[] = []
    let level = 0
    let start = 0
    for (let j = 0; j < inner.length; j++) {
      const c = inner[j]
      if (c === '(' || c === '[' || c === '{') level++
      else if (c === ')' || c === ']' || c === '}') level--
      else if (c === ',' && level === 0) {
        args.push(inner.slice(start, j).trim())
        start = j + 1
      }
    }
    args.push(inner.slice(start).trim())
    out.push({
      kind: m[1],
      args: args.filter((a) => a.length > 0),
      line: src.slice(0, m.index).split('\n').length,
    })
  }
  return out
}

/** The intensity argument is three's second, and may be absent (it defaults to 1). */
export const intensityOf = (light: Light): string | null => light.args[1] ?? null

/**
 * Blanks comments, keeping every offset and newline.
 *
 * #139 found this the hard way, and the way it found it is the point. Renaming
 * this file put the string `shared/stage3d_test.ts` into `shared/stage3d.ts`'s
 * own docstring, which made that file match the scan below — and its docstring
 * *illustrates the defect* with `new THREE.AmbientLight(0xffffff, 0.55)` in
 * prose. The check reported the documentation of the bug as the bug.
 *
 * A scanner that reads comments as code is wrong beyond that one file: any game
 * documenting why the helper exists would trip it, and the fix would look like
 * deleting the explanation.
 *
 * Replaced with spaces rather than removed so the reported line numbers still
 * point at the real line. Strings are respected, because `'https://x'` and
 * `"/* "` both appear in ordinary code and neither starts a comment.
 */
export function stripComments(src: string): string {
  let out = ''
  let i = 0
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  while (i < src.length) {
    const two = src.slice(i, i + 2)
    if (two === '//') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      out += blank(src.slice(i, stop))
      i = stop
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      out += blank(src.slice(i, stop))
      i = stop
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i]
      let j = i + 1
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\') j++
        j++
      }
      out += src.slice(i, Math.min(j + 1, src.length))
      i = j + 1
    } else {
      out += src[i]
      i++
    }
  }
  return out
}

/**
 * Whether a file is *on* the stage, meaning it imports it.
 *
 * `includes('shared/stage3d')` was the first version and it matches a mention,
 * not an import — so the moment this file's own name appeared in `stage3d.ts`'s
 * docstring, `stage3d.ts` counted as one of its own consumers.
 */
export function importsStage3d(src: string): boolean {
  return /from\s+['"][^'"]*shared\/stage3d['"]/.test(src)
}

// --- the scanner has to prove it works, every run --------------------------
//
// A source check that silently matches nothing reports "all clear" forever,
// which is the failure mode CLAUDE.md warns about in its own words: a check
// that passed for the wrong reason. So the parser is run over a fixture with
// the defect in it before it is trusted with the repository.

{
  const FIXTURE = `
    scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(0.55)))
    const key = new THREE.DirectionalLight(0xffffff, 0.9)
    const fill = new THREE.DirectionalLight(
      0x88aaff,
      lambertIntensity(0.35),
    )
    const plain = new THREE.HemisphereLight(0xffffff)
    const named = new PointLight(0xffffff, lambertIntensity(0.2))
  `
  const found = findLights(FIXTURE)
  check(
    'the scanner finds every light, across lines and nested calls',
    found.length === 5 && found.map((l) => l.kind).join(' ') ===
      'AmbientLight DirectionalLight DirectionalLight HemisphereLight PointLight',
    found.map((l) => `${l.kind}(${l.args.length})`).join(' '),
  )
  check(
    'and it does not stop at the first close paren',
    intensityOf(found[0]) === 'lambertIntensity(0.55)',
    `read ${JSON.stringify(intensityOf(found[0]))}`,
  )
  const bad = found.filter((l) => {
    const i = intensityOf(l)
    return i === null || !i.includes('lambertIntensity(')
  })
  check(
    'and it reports the uncorrected ones, which is the defect itself',
    bad.length === 2 && bad[0].kind === 'DirectionalLight' && bad[1].kind === 'HemisphereLight',
    bad.map((l) => `${l.kind} intensity=${intensityOf(l) ?? 'omitted'}`).join(', '),
  )
}

{
  // The two helpers #139 added, against the exact shapes that fooled the first
  // version. Fixtures rather than the repository, for the reason the parser's
  // fixture exists: a scanner has to be shown working before it is trusted.
  const PROSE = [
    '/**',
    " * past it: `new THREE.AmbientLight(0xffffff, 0.55)` compiles and looks dark.",
    ' */',
    "const url = 'https://example.com/a//b'",
    'scene.add(new THREE.AmbientLight(0xffffff, lambertIntensity(0.55))) // real',
    "const notAComment = '/* still a string */'",
  ].join('\n')
  const stripped = stripComments(PROSE)
  check(
    'comments are blanked and code is not',
    !stripped.includes('compiles and looks dark') && stripped.includes('lambertIntensity(0.55)'),
    'the prose example is gone, the real light remains',
  )
  check(
    'and a URL inside a string survives its double slash',
    stripped.includes('https://example.com/a//b'),
    "'//' in a string does not start a comment",
  )
  check(
    'and offsets are preserved, so reported line numbers stay true',
    stripped.length === PROSE.length &&
      stripped.split('\n').length === PROSE.split('\n').length,
    `${stripped.length} chars over ${stripped.split('\n').length} lines, unchanged`,
  )
  check(
    'stripping is what stops the prose example being read as a light',
    findLights(PROSE).length === 2 && findLights(stripped).length === 1,
    `${findLights(PROSE).length} found raw, ${findLights(stripped).length} after stripping`,
  )

  check(
    'a file is on the stage when it imports it',
    importsStage3d("import { createStage3D } from '../shared/stage3d'") &&
      importsStage3d('import type { Stage3D } from "../shared/stage3d"'),
    'both quote styles',
  )
  check(
    'and merely naming it is not enough',
    !importsStage3d(' * `shared/stage3d_test.ts` is what makes that true.') &&
      !importsStage3d('// see shared/stage3d for the helper'),
    'the mention that made stage3d.ts a consumer of itself',
  )
}

// --- the repository --------------------------------------------------------

const files = sources(ROOT)
const onStage = files.filter((f) => importsStage3d(readFileSync(f, 'utf8')))
check(
  'there are files on the standalone 3D stage to check',
  onStage.length > 0,
  `${onStage.length} import shared/stage3d`,
)

const lit: { file: string; light: Light }[] = []
for (const file of onStage) {
  for (const light of findLights(stripComments(readFileSync(file, 'utf8')))) {
    lit.push({ file, light })
  }
}
check(
  'and they build lights',
  lit.length > 0,
  lit.length
    ? `${lit.length} across ${new Set(lit.map((l) => l.file)).size} file(s)`
    : 'none found — has the import path or the constructor spelling changed?',
)

const uncorrected = lit.filter(({ light }) => {
  const i = intensityOf(light)
  return i === null || !i.includes('lambertIntensity(')
})
check(
  'every light on the stage goes through lambertIntensity',
  uncorrected.length === 0,
  uncorrected.length
    ? uncorrected
        .map(
          ({ file, light }) =>
            `${relative(ROOT, file)}:${light.line} ${light.kind} intensity=${intensityOf(light) ?? 'omitted (three defaults it to 1)'}`,
        )
        .join('; ')
    : `${lit.length} lights`,
)

// An intensity written after construction bypasses the argument entirely, and
// reads as innocuous. Nothing in the repo does this today; the check is here so
// that it stays that way rather than becoming the next way in.
const assigned: string[] = []
for (const file of onStage) {
  const src = stripComments(readFileSync(file, 'utf8'))
  src.split('\n').forEach((line, i) => {
    if (/\.intensity\s*=(?!=)/.test(line) && !line.includes('lambertIntensity(')) {
      assigned.push(`${relative(ROOT, file)}:${i + 1} ${line.trim()}`)
    }
  })
}
check(
  'and none of them has its intensity assigned afterwards instead',
  assigned.length === 0,
  assigned.length ? assigned.join('; ') : 'no post-construction assignment',
)

console.log(ok ? '\nALL STAGE3D LIGHTING CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
