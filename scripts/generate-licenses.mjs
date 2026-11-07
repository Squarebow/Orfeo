// Keeps THIRD_PARTY_LICENSES.md matched to what Orfeo really ships.
//
// npm packages: esbuild traces the app's imports (nothing is written), so a
// package counts when code from it reaches the app, whatever package.json calls
// it: React and Lucide are dev dependencies, but they ship. An unused dependency
// doesn't count. The packages copied beside the app (build.files) and the audio
// worklet are added to that.
// Rust crates: cargo's own record of what's compiled into the Windows add-on
// and the Store review helper.
//
// Only the parts between the markers are generated; the rest of the file is
// written by hand. Usage: npm run licenses, or npm run licenses -- --check,
// which changes nothing and fails if the file is out of date.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const NOTICES = join(root, 'THIRD_PARTY_LICENSES.md')
const check = process.argv.includes('--check')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// the audio worklet: spessasynth_processor.min.js, copied from spessasynth_lib
// with spessasynth_core and stb-vorbis already inside it
const WORKLET = ['spessasynth_lib', 'spessasynth_core', 'stb-vorbis']
// has its own section by hand: not open source, and its terms need explaining
const OWN_SECTION = new Set(['gsap'])
// these license files say more than one license: shown in full
const SHOW_IN_FULL = ['lucide-react']
// a short standard text isn't enough for these: the full text comes from a package
const TEXT_FROM_PACKAGE = new Set(['Apache-2.0', 'MPL-2.0', 'BlueOak-1.0.0'])

const GROUP_ORDER = ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', '0BSD', 'MPL-2.0', 'BlueOak-1.0.0']

const LICENSE_URL = {
  'MIT': 'https://opensource.org/license/mit',
  'ISC': 'https://opensource.org/license/isc-license-txt',
  '0BSD': 'https://opensource.org/license/0bsd',
  'BSD-3-Clause': 'https://opensource.org/license/bsd-3-clause',
  'BSD-2-Clause': 'https://opensource.org/license/bsd-2-clause',
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'MPL-2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
  'BlueOak-1.0.0': 'https://blueoakcouncil.org/license/1.0.0',
}

const CANONICAL_TEXT = {
  'MIT': `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`,

  'ISC': `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  '0BSD': `Permission to use, copy, modify, and/or distribute this software for
any purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`,

  'BSD-3-Clause': `Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DAMAGES ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.`,
}

// ── Which npm packages reach the app ─────────────────────────────────────────
const ASSETS = ['.css', '.woff', '.woff2', '.ttf', '.png', '.jpg', '.svg', '.webp', '.ico', '.sf2', '.wasm', '.mid']
const dropQuery = {
  name: 'drop-query',
  setup(b) {
    // build syntax. A ?worker import stands for a class; the worker's own file
    // is traced as an entry point. Anywhere else the file itself is what counts
    b.onResolve({ filter: /\?worker/ }, args => ({ path: args.path, namespace: 'worker' }))
    b.onLoad({ filter: /.*/, namespace: 'worker' }, () => ({ contents: 'export default class {}' }))
    b.onResolve({ filter: /\?/ }, args => b.resolve(args.path.split('?')[0], { kind: args.kind, resolveDir: args.resolveDir }))
  },
}

async function trace(entryPoints, platform) {
  const result = await build({
    absWorkingDir: root, entryPoints, platform, bundle: true, write: false, metafile: true,
    format: 'esm', outdir: 'out-unused', logLevel: 'silent', jsx: 'automatic',
    external: ['electron', 'pdfkit', ...builtinModules, ...builtinModules.map(m => `node:${m}`)],
    loader: Object.fromEntries(ASSETS.map(ext => [ext, 'empty'])),
    plugins: [dropQuery],
  })
  const dirs = new Set()
  for (const output of Object.values(result.metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      const m = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)
      if (m && bytesInOutput > 0) dirs.add(m[1])
    }
  }
  return dirs
}

function copiedPackages() {
  const dirs = new Set()
  for (const pattern of pkg.build.files) {
    const m = /^node_modules\/([^!*]+?)\/\*\*\/\*$/.exec(pattern)
    if (!m) continue
    const dir = `node_modules/${m[1]}`
    if (existsSync(join(root, dir, 'package.json'))) dirs.add(dir)
    else if (m[1].startsWith('@')) for (const name of readdirSync(join(root, dir))) dirs.add(`${dir}/${name}`)
  }
  return dirs
}

const licenseFile = dir => {
  const name = readdirSync(dir).find(f => /^(licen[cs]e|copying)(\.|-|$)/i.test(f))
  return name ? readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n').trim() : ''
}
const cell = s => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

function describe(dir) {
  const full = join(root, dir)
  const p = JSON.parse(readFileSync(join(full, 'package.json'), 'utf8'))
  const text = licenseFile(full)
  // a few packages leave it out of package.json and only have the license file
  const raw = p.license ?? p.licenses ?? (/permission is hereby granted, free of charge/i.test(text) ? 'MIT' : undefined)
  const license = (Array.isArray(raw) ? raw.map(l => l.type ?? l).join(' OR ') : raw?.type ?? raw ?? 'UNKNOWN').replace(/^\((.*)\)$/, '$1')
  const repoUrl = typeof p.repository === 'string' ? p.repository : p.repository?.url ?? ''
  const repo = repoUrl.replace(/^git\+/, '').replace(/^github:/, '').replace(/\.git$/, '').replace(/^(https?|ssh|git):\/\/(git@)?github\.com\//, '').replace(/^git@github\.com:/, '')
  const author = typeof p.author === 'string' ? p.author : p.author?.name ?? ''
  const copyright = text.split('\n').find(l => /copyright.*(\d{4}|\(c\)|©)/i.test(l) && !/<year>|\[year\]|\{yyyy\}|\[yyyy\]/i.test(l))
  return { name: p.name, version: p.version, license, repo, text, copyright: copyright?.trim().replace(/^#+\s*/, '') || author || '—' }
}

async function npmSection() {
  const dirs = new Set([
    ...await trace(['src/main.tsx', 'src/audio/exportStudio.worker.ts'], 'browser'),
    ...await trace(['electron/main.ts', 'electron/audioHost.ts', 'electron/preload.ts'], 'node'),
    ...copiedPackages(),
    ...WORKLET.map(name => `node_modules/${name}`),
  ])
  const seen = new Map()
  for (const dir of dirs) {
    const d = describe(dir)
    if (!OWN_SECTION.has(d.name)) seen.set(`${d.name}@${d.version}`, d)
  }
  const groups = new Map()
  for (const d of seen.values()) groups.set(d.license, [...(groups.get(d.license) ?? []), d])
  const keys = [...GROUP_ORDER.filter(k => groups.has(k)), ...[...groups.keys()].filter(k => !GROUP_ORDER.includes(k)).sort()]

  let out = ''
  for (const key of keys) {
    const list = groups.get(key).sort((a, b) => a.name.localeCompare(b.name))
    const fromPackage = TEXT_FROM_PACKAGE.has(key) ? list.map(d => d.text).sort((a, b) => b.length - a.length)[0] || undefined : undefined
    const text = fromPackage ?? CANONICAL_TEXT[key]
    const url = LICENSE_URL[key]
    out += `## ${key}${url ? ` — [full text](${url})` : ''} (${list.length} package${list.length === 1 ? '' : 's'})\n\n`
    if (text) out += `<details>\n<summary>Show license text</summary>\n\n\`\`\`\n${text}\n\`\`\`\n\n</details>\n\n`
    out += '| Package | Repository | Copyright |\n|---|---|---|\n'
    for (const d of list) out += `| \`${d.name}@${d.version}\` | ${cell(d.repo) || '—'} | ${cell(d.copyright)} |\n`
    out += '\n---\n\n'
  }
  for (const name of SHOW_IN_FULL) {
    const d = [...seen.values()].find(x => x.name === name)
    if (d) out += `## ${name}: the full license file\n\n<details>\n<summary>Show license text</summary>\n\n\`\`\`\n${d.text}\n\`\`\`\n\n</details>\n\n---\n\n`
  }
  const unknown = [...seen.values()].filter(d => d.license === 'UNKNOWN' || /gpl/i.test(d.license) || d.copyright === '—')
  return { text: out.trimEnd(), count: seen.size, unknown }
}

// ── Which Rust crates are compiled into the add-on ───────────────────────────
function rustSection() {
  const cargoHome = process.env.CARGO_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.cargo')
  const cargo = [join(cargoHome, 'bin', 'cargo.exe'), join(cargoHome, 'bin', 'cargo')].find(existsSync) ?? 'cargo'
  const raw = execFileSync(cargo, ['metadata', '--format-version', '1', '--filter-platform', 'x86_64-pc-windows-msvc', '--locked'],
    { cwd: join(root, 'native'), maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const meta = JSON.parse(raw)
  const byId = new Map(meta.packages.map(p => [p.id, p]))
  const nodes = new Map(meta.resolve.nodes.map(n => [n.id, n]))
  const compiled = new Set()
  const walk = id => {
    if (compiled.has(id)) return
    compiled.add(id)
    for (const dep of nodes.get(id).deps) {
      // only what's linked in: not build scripts, tests, or code that only
      // runs while compiling
      const linked = dep.dep_kinds.some(k => k.kind === null)
      const macro = byId.get(dep.pkg).targets.some(t => t.kind.includes('proc-macro'))
      if (linked && !macro) walk(dep.pkg)
    }
  }
  for (const name of ['orfeo-audio-node', 'orfeo-review']) walk(meta.packages.find(p => p.name === name).id)
  const groups = new Map()
  for (const id of compiled) {
    const p = byId.get(id)
    if (!p.source) continue                       // Orfeo's own crates
    const license = (p.license ?? 'UNKNOWN').replace(/\//g, ' OR ')
    groups.set(license, [...(groups.get(license) ?? []), `${p.name} ${p.version}`])
  }
  let out = '| License | Crates |\n|---|---|\n'
  for (const key of [...groups.keys()].sort()) out += `| ${key} | ${groups.get(key).sort().map(c => `\`${c}\``).join(', ')} |\n`
  return out.trimEnd()
}

function replaceBetween(file, name, body) {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`
  const a = file.indexOf(start), b = file.indexOf(end)
  if (a < 0 || b < a) throw new Error(`THIRD_PARTY_LICENSES.md has no ${name} markers`)
  return `${file.slice(0, a + start.length)}\n${body}\n${file.slice(b)}`
}

const before = readFileSync(NOTICES, 'utf8')
const crlf = before.includes('\r\n')
const npm = await npmSection()
let after = before.replace(/\r\n/g, '\n')
after = replaceBetween(after, 'npm-packages', npm.text)
after = replaceBetween(after, 'rust-crates', rustSection())
if (crlf) after = after.replace(/\n/g, '\r\n')

for (const d of npm.unknown) console.warn(`check by hand: ${d.name}@${d.version} (${d.license}, ${d.copyright})`)
if (check) {
  if (after !== before) { console.error('THIRD_PARTY_LICENSES.md is out of date: run npm run licenses'); process.exit(1) }
  console.log('THIRD_PARTY_LICENSES.md is up to date')
} else {
  writeFileSync(NOTICES, after)
  console.log(`THIRD_PARTY_LICENSES.md: ${npm.count} npm packages, Rust crates updated`)
}
