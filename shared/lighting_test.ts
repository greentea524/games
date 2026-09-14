// Every light on the standalone 3D stage goes through `lambertIntensity` (#133).
//
//   npx tsx shared/lighting_test.ts
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

// --- the repository --------------------------------------------------------

const files = sources(ROOT)
const onStage = files.filter((f) => readFileSync(f, 'utf8').includes('shared/stage3d'))
check(
  'there are files on the standalone 3D stage to check',
  onStage.length > 0,
  `${onStage.length} import shared/stage3d`,
)

const lit: { file: string; light: Light }[] = []
for (const file of onStage) {
  for (const light of findLights(readFileSync(file, 'utf8'))) lit.push({ file, light })
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
  const src = readFileSync(file, 'utf8')
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

console.log(ok ? '\nALL LIGHTING CHECKS PASS' : '\nFAILURES ABOVE')
process.exit(ok ? 0 : 1)
