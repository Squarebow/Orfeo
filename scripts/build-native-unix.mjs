// macOS and Linux side of scripts/build-native.mjs: the Native engine add-on, and
// FluidSynth built from source, because its project publishes no macOS or Linux
// binaries. Everything lands in native/build/ (gitignored), as on Windows:
//   native/build/orfeo_audio.node                  the add-on (macOS: arm64 + x86_64 in one file)
//   native/build/fluidsynth/libfluidsynth.3.dylib  macOS, arm64 + x86_64 in one file
//   native/build/fluidsynth/libfluidsynth.so.3     Linux
//
// One self-contained library per system. FluidSynth uses its C++ system layer
// (osal=cpp11) instead of glib, and libsndfile with the codecs .sf3 sound sets
// need is linked in statically, so nothing has to be found on the user's machine
// and macOS needs no library relocation. Sources are pinned by SHA-256. Each
// macOS architecture is built on its own and the results joined with lipo: the
// codecs' CPU detection doesn't work in a two-architecture compile.
//
// Needs Rust, CMake and a C/C++ compiler; on Linux also the ALSA and D-Bus headers
// (libasound2-dev, libdbus-1-dev).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const native = join(root, 'native')
const out = join(native, 'build')
const work = join(out, '.fluid-src')
const debug = process.argv.includes('--debug')
const mac = process.platform === 'darwin'
// the oldest macOS Electron itself still runs on
const MACOS_TARGET = '12.0'

const gh = (repo, path) => `https://github.com/${repo}/${path}`
const SOURCES = {
  ogg: { url: gh('xiph/ogg', 'releases/download/v1.3.6/libogg-1.3.6.tar.gz'), sha256: '83e6704730683d004d20e21b8f7f55dcb3383cdf84c0daedf30bde175f774638', dir: 'libogg-1.3.6',
    args: ['-DINSTALL_DOCS=OFF', '-DBUILD_TESTING=OFF'] },
  vorbis: { url: gh('xiph/vorbis', 'releases/download/v1.3.7/libvorbis-1.3.7.tar.gz'), sha256: '0e982409a9c3fc82ee06e08205b1355e5c6aa4c36bca58146ef399621b0ce5ab', dir: 'libvorbis-1.3.7',
    args: [] },
  opus: { url: gh('xiph/opus', 'releases/download/v1.5.2/opus-1.5.2.tar.gz'), sha256: '65c1d2f78b9f2fb20082c38cbe47c951ad5839345876e46941612ee87f9a7ce1', dir: 'opus-1.5.2',
    args: ['-DOPUS_BUILD_PROGRAMS=OFF', '-DOPUS_BUILD_TESTING=OFF', '-DBUILD_TESTING=OFF'] },
  flac: { url: gh('xiph/flac', 'releases/download/1.5.0/flac-1.5.0.tar.xz'), sha256: 'f2c1c76592a82ffff8413ba3c4a1299b6c7ab06c734dee03fd88630485c2b920', dir: 'flac-1.5.0',
    args: ['-DBUILD_CXXLIBS=OFF', '-DBUILD_PROGRAMS=OFF', '-DBUILD_EXAMPLES=OFF', '-DBUILD_TESTING=OFF', '-DBUILD_DOCS=OFF', '-DINSTALL_MANPAGES=OFF', '-DWITH_FORTIFY_SOURCE=OFF'] },
  sndfile: { url: gh('libsndfile/libsndfile', 'releases/download/1.2.2/libsndfile-1.2.2.tar.xz'), sha256: '3799ca9924d3125038880367bf1468e53a1b7e3686a934f098b7e1d286cdb80e', dir: 'libsndfile-1.2.2',
    args: ['-DBUILD_PROGRAMS=OFF', '-DBUILD_EXAMPLES=OFF', '-DBUILD_TESTING=OFF', '-DENABLE_CPACK=OFF', '-DENABLE_MPEG=OFF', '-DENABLE_EXTERNAL_LIBS=ON', '-DINSTALL_PKGCONFIG_MODULE=OFF'] },
  fluidsynth: { url: gh('FluidSynth/fluidsynth', 'archive/refs/tags/v2.5.7.tar.gz'), sha256: 'ce27840221ab00dd59bf27e85ecbba480c6c2a7c9fbec4243658f68f59c07f4a', dir: 'fluidsynth-2.5.7',
    // the synth only: Orfeo renders it itself, so none of its audio or MIDI drivers
    args: ['-DBUILD_SHARED_LIBS=ON', '-Dosal=cpp11', '-Denable-libsndfile=ON',
      ...['alsa', 'aufile', 'dbus', 'ipv6', 'jack', 'ladspa', 'libinstpatch', 'midishare', 'network', 'openmp', 'oss', 'pipewire', 'pulseaudio', 'readline', 'sdl3', 'systemd', 'coreaudio', 'coremidi', 'framework']
        .map(o => `-Denable-${o}=OFF`)] },
}

// CI caches native/build/fluidsynth with this as part of its key: bump on any change
const FLUID_STAMP = `2.5.7-cpp11-static-sndfile-1 ${mac ? `macos-${MACOS_TARGET}` : 'linux'}`

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })

async function fetchSource(name) {
  const s = SOURCES[name]
  const src = join(work, s.dir)
  if (existsSync(src)) return src
  mkdirSync(work, { recursive: true })
  console.log(`[native] downloading ${s.dir}`)
  const res = await fetch(s.url)
  if (!res.ok) throw new Error(`${name} download failed: ${res.status}`)
  const data = Buffer.from(await res.arrayBuffer())
  const hash = createHash('sha256').update(data).digest('hex')
  if (hash !== s.sha256) throw new Error(`${name} checksum mismatch: ${hash}`)
  const archive = join(work, `${name}.tar`)
  writeFileSync(archive, data)
  run('tar', ['-xf', archive, '-C', work])
  rmSync(archive)
  return src
}

/** All the libraries for one architecture into its own prefix; returns FluidSynth's library file */
async function buildFluid(arch) {
  const prefix = join(work, `prefix-${arch ?? 'native'}`)
  const common = [
    '-DCMAKE_BUILD_TYPE=Release', `-DCMAKE_INSTALL_PREFIX=${prefix}`, `-DCMAKE_PREFIX_PATH=${prefix}`, '-DCMAKE_INSTALL_LIBDIR=lib',
    '-DCMAKE_POSITION_INDEPENDENT_CODE=ON', '-DBUILD_SHARED_LIBS=OFF',
    // ogg and vorbis still declare a CMake version newer releases refuse
    '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
    ...(arch ? [`-DCMAKE_OSX_ARCHITECTURES=${arch}`, `-DCMAKE_OSX_DEPLOYMENT_TARGET=${MACOS_TARGET}`] : []),
  ]
  for (const name of ['ogg', 'vorbis', 'opus', 'flac', 'sndfile', 'fluidsynth']) {
    const src = await fetchSource(name)
    const build = join(work, `build-${name}-${arch ?? 'native'}`)
    console.log(`[native] building ${name}${arch ? ` (${arch})` : ''}`)
    rmSync(build, { recursive: true, force: true })
    // libsndfile is static, so what it needs has to be named at the end of the link
    // line: dependants first, as the linker resolves them left to right
    const codecs = ['FLAC', 'vorbisenc', 'vorbisfile', 'vorbis', 'opus', 'ogg'].map(l => join(prefix, 'lib', `lib${l}.a`)).concat('-lm', '-lpthread').join(' ')
    const link = name === 'fluidsynth' ? [`-DCMAKE_C_STANDARD_LIBRARIES=${codecs}`, `-DCMAKE_CXX_STANDARD_LIBRARIES=${codecs}`] : []
    run('cmake', ['-S', src, '-B', build, ...common, ...SOURCES[name].args, ...link])
    run('cmake', ['--build', build, '--parallel'])
    run('cmake', ['--install', build])
  }
  const lib = join(prefix, 'lib', mac ? 'libfluidsynth.3.dylib' : 'libfluidsynth.so.3')
  if (!existsSync(lib)) throw new Error(`${lib} was not built`)
  return lib
}

// ── 1. The add-on ───────────────────────────────────────────────────────────
const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), '.cargo'), 'bin')
const env = { ...process.env, PATH: `${cargoBin}:${process.env.PATH ?? ''}`, ...(mac ? { MACOSX_DEPLOYMENT_TARGET: MACOS_TARGET } : {}) }
const profile = debug ? 'debug' : 'release'
const cargoBuild = (...extra) => run('cargo', ['build', '-p', 'orfeo-audio-node', ...(debug ? [] : ['--release']), ...extra], { cwd: native, env })
mkdirSync(out, { recursive: true })
console.log(`[native] cargo build (${profile})`)
if (mac) {
  const targets = ['aarch64-apple-darwin', 'x86_64-apple-darwin']
  run('rustup', ['target', 'add', ...targets], { env })
  for (const t of targets) cargoBuild('--target', t)
  run('lipo', ['-create', ...targets.map(t => join(native, 'target', t, profile, 'liborfeo_audio_node.dylib')), '-output', join(out, 'orfeo_audio.node')])
} else {
  cargoBuild()
  copyFileSync(join(native, 'target', profile, 'liborfeo_audio_node.so'), join(out, 'orfeo_audio.node'))
}
console.log('[native] native/build/orfeo_audio.node')

// ── 2. FluidSynth ───────────────────────────────────────────────────────────
const fluidDir = join(out, 'fluidsynth')
const stamp = join(fluidDir, 'VERSION')
if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === FLUID_STAMP) {
  console.log('[native] FluidSynth already in place')
} else {
  rmSync(fluidDir, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
  mkdirSync(fluidDir, { recursive: true })
  if (mac) {
    const libs = [await buildFluid('arm64'), await buildFluid('x86_64')]
    const lib = join(fluidDir, 'libfluidsynth.3.dylib')
    run('lipo', ['-create', ...libs, '-output', lib])
    // its recorded name is this machine's build folder otherwise
    run('install_name_tool', ['-id', '@loader_path/libfluidsynth.3.dylib', lib])
  } else {
    copyFileSync(await buildFluid(null), join(fluidDir, 'libfluidsynth.so.3'))
  }
  writeFileSync(stamp, FLUID_STAMP + '\n')
  rmSync(work, { recursive: true, force: true })
  console.log('[native] native/build/fluidsynth/')
}
