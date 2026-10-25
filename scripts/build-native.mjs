// Builds Orfeo's native audio engine add-on and puts everything it needs in
// native/build/ (gitignored), which electron-builder ships as resources/native:
//   native/build/orfeo_audio.node     the add-on (Rust, native/orfeo-audio-node)
//   native/build/orfeo-review.exe     opens the Store's review window (native/orfeo-review)
//   native/build/fluidsynth/*.dll     FluidSynth 2.5.7 (glib build) + its DLLs
//
// FluidSynth's glib-free "cpp11" Windows builds crash with 8+ audio groups
// (2.5.7 and 2.6.x), which the engine uses — so the glib build is pinned here,
// checked against its SHA-256. Needs Rust (rustup, MSVC toolchain).
//
// usage: node scripts/build-native.mjs [--debug]

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..')
const native = join(root, 'native')
const out = join(native, 'build')
const debug = process.argv.includes('--debug')

const FLUID = {
  version: '2.5.7',
  url: 'https://github.com/FluidSynth/fluidsynth/releases/download/v2.5.7/fluidsynth-v2.5.7-win10-x64-glib.zip',
  sha256: '84a7fd3e3c9795edeb1619e358ac3a4094b728915f9c64a264222782474fcb64',
}

if (process.platform !== 'win32') {
  console.log('[native] the native engine is Windows-only for now — skipping')
  process.exit(0)
}

// ── 1. The add-on ───────────────────────────────────────────────────────────
// A terminal opened before Rust was installed doesn't have it on PATH yet:
// fall back to rustup's own folder rather than failing
const cargoHome = process.env.CARGO_HOME ?? join(process.env.USERPROFILE ?? '', '.cargo')
const cargoBin = join(cargoHome, 'bin')
const env = { ...process.env, Path: `${cargoBin};${process.env.Path ?? process.env.PATH ?? ''}` }
const cargo = existsSync(join(cargoBin, 'cargo.exe')) ? join(cargoBin, 'cargo.exe') : 'cargo'
console.log(`[native] cargo build (${debug ? 'debug' : 'release'})`)
execFileSync(cargo, ['build', '-p', 'orfeo-audio-node', '-p', 'orfeo-review', ...(debug ? [] : ['--release'])], { cwd: native, stdio: 'inherit', env })
mkdirSync(out, { recursive: true })
const target = join(native, 'target', debug ? 'debug' : 'release')
copyFileSync(join(target, 'orfeo_audio_node.dll'), join(out, 'orfeo_audio.node'))
copyFileSync(join(target, 'orfeo-review.exe'), join(out, 'orfeo-review.exe'))
console.log('[native] native/build/orfeo_audio.node, orfeo-review.exe')

// ── 2. FluidSynth, pinned and verified ─────────────────────────────────────
const fluidDir = join(out, 'fluidsynth')
const stamp = join(fluidDir, 'VERSION')
if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === FLUID.version) {
  console.log(`[native] FluidSynth ${FLUID.version} already in place`)
} else {
  console.log(`[native] downloading FluidSynth ${FLUID.version}`)
  const res = await fetch(FLUID.url)
  if (!res.ok) throw new Error(`FluidSynth download failed: ${res.status}`)
  const zip = Buffer.from(await res.arrayBuffer())
  const hash = createHash('sha256').update(zip).digest('hex')
  if (hash !== FLUID.sha256) throw new Error(`FluidSynth checksum mismatch: ${hash}`)
  const tmp = join(tmpdir(), `orfeo-fluidsynth-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  const zipPath = join(tmp, 'fs.zip')
  writeFileSync(zipPath, zip)
  // Windows' own tar (bsdtar) extracts zips — by full path, so Git's tar
  // (which can't read C:\ paths) is never picked up from PATH instead
  execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zipPath, '-C', tmp])
  const bin = readdirSync(tmp, { withFileTypes: true }).filter(d => d.isDirectory())
    .map(d => join(tmp, d.name, 'bin')).find(p => existsSync(join(p, 'libfluidsynth-3.dll')))
  if (!bin) throw new Error('libfluidsynth-3.dll not found in the FluidSynth zip')
  rmSync(fluidDir, { recursive: true, force: true })
  mkdirSync(fluidDir, { recursive: true })
  for (const f of readdirSync(bin)) if (f.toLowerCase().endsWith('.dll')) copyFileSync(join(bin, f), join(fluidDir, f))
  writeFileSync(stamp, FLUID.version + '\n')
  rmSync(tmp, { recursive: true, force: true })
  console.log(`[native] native/build/fluidsynth/ (${readdirSync(fluidDir).length - 1} DLLs)`)
}
