// ── npm test: TypeScript and Vite-only imports for plain Node ───────────────
// The test files are TypeScript and import each other without a file extension
// (`./smfLead`); some reach into Vite-only syntax (`?worker&inline`). Node's
// ESM resolver needs the extension, and this Node build (the distro one on
// Linux) has no TypeScript support at all, so `--experimental-transform-types`
// is not an option. These module hooks fix both without a new dependency:
// esbuild (already in the tree through electron-vite) does the TypeScript,
// the resolver does the extensions, and Vite-suffixed imports get a stub.
//
// Loaded before the test run: node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts
// Needs Node 22.15+ (module.registerHooks). It is imported as a namespace on
// purpose: a named import of a missing export dies with a SyntaxError before
// any message of ours can be printed.
import * as nodeModule from 'node:module'
import { transformSync } from 'esbuild'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const registerHooks = nodeModule.registerHooks
if (typeof registerHooks !== 'function') {
  console.error(`[Orfeo] npm test needs Node 22.15 or newer (module.registerHooks) — this is ${process.version}.`)
  console.error('[Orfeo] Use the official build from nodejs.org; the tests themselves need no other setup.')
  process.exit(1)
}

// One stub per Vite-suffixed import, so a module that merely mentions a worker
// can still be loaded (a test that really spawns one gets the stub class and
// says so, instead of failing at import time).
const STUBS = {
  worker: `export default class ViteWorkerStub {
    constructor() { this.onmessage = null; this.onerror = null; this.onclose = null }
    postMessage() { throw new Error('a real worker cannot start under npm test') }
    terminate() {}
    addEventListener() {} removeEventListener() {} dispatchEvent() { return false }
  }`,
}

// __APP_VERSION__, as electron.vite.config.ts defines it for the app
const APP_VERSION = JSON.stringify(JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version)

let stubCount = 0
const stubUrl = (kind) => `orfeo-test-stub:${kind}:${stubCount++}`

const asPath = (url) => { try { return fileURLToPath(url) } catch { return '' } }
// A resolved specifier must be a file: existsSync() also says yes to a
// directory, and Node then reads it and fails with EISDIR far from here.
const isFile = (url) => { try { return statSync(asPath(url)).isFile() } catch { return false } }

// Packages whose ESM build sits in the "module" field while plain Node ESM would
// pick the CJS "main" (whose export names the lexer cannot see): @tonejs/midi is
// exactly that. Vite prefers "module" for the app, so preferring it here keeps
// what a test imports the same as what the app imports.
const pkgModuleField = (name) => {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8'))
    return typeof pkg.module === 'string' ? pkg.module : null
  } catch { return null }
}
const EXTS = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js']
const firstExisting = (base, suffix) => {
  for (const ext of EXTS) {
    try {
      const u = new URL(suffix + ext, base)
      if (isFile(u)) return u
    } catch { /* not a usable specifier for this base */ }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // A bare package with an ESM build: point straight at it
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      const entry = pkgModuleField(name)
      const rest = specifier.slice(name.length).replace(/^\//, '')
      const pkgBase = pathToFileURL(join(process.cwd(), 'node_modules', name)) + '/'
      const found = firstExisting(entry && !rest ? new URL(entry, pkgBase) : new URL(rest || entry, pkgBase), '')
      if (found) return { url: found.href, shortCircuit: true }
    }
    const base = context.parentURL
    const bare = specifier.split('?')[0]
    const suffix = specifier.includes('?') ? specifier.split('?').slice(1).join('?') : null

    // Vite-suffixed imports (workers, ?raw, …): the file behind them is real, so
    // answer before Node gets a chance to load the plain source and to be misled
    // by its exports. Checked first on purpose — `a.ts?x` resolves just fine.
    if (suffix && base) {
      const target = firstExisting(base, bare)
      if (target) return { url: stubUrl('worker'), format: 'module', shortCircuit: true }
    }

    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (!base) throw err
      // Extensionless imports inside the TypeScript sources (and inside ESM
      // builds of dependencies, which are written the same way)
      const found = firstExisting(base, bare.startsWith('.') || bare.startsWith('/') ? bare : bare + '/')
      if (found) return { url: found.href, shortCircuit: true }
      throw err
    }
  },

  load(url, context, nextLoad) {
    if (url.startsWith('orfeo-test-stub:')) {
      const kind = url.split(':')[1]
      return { format: 'module', source: STUBS[kind] ?? STUBS.worker, shortCircuit: true }
    }
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) {
      const path = asPath(url)
      const source = readFileSync(path, 'utf8')
      const { code } = transformSync(source, {
        loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
        format: 'esm',
        target: 'node20',
        platform: 'node',
        sourcefile: path,
        sourcemap: 'inline',
        // Vite gives every module `import.meta.env`; Node does not, and code like
        // midiSimulator.ts reads it at import time. Test mode = dev mode: the
        // development-only paths are reachable, which is what tests exercise.
        banner: 'if (!import.meta.env) import.meta.env = { DEV: true, MODE: "test-build", PROD: false };',
        // the same build-time constants electron.vite.config.ts defines
        define: { __APP_VERSION__: APP_VERSION, __NEXT_VERSION__: '""' },
        // JSX in .ts files (Settings defs are .tsx) keeps esbuild's own handling
      })
      return { format: 'module', source: code, shortCircuit: true }
    }
    // Plain JSON imported without an attribute (allowed by the bundler settings)
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { format: 'module', source: `export default ${readFileSync(asPath(url), 'utf8')}`, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
