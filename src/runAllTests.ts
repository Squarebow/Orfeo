/// <reference types="node" />
// ── npm test: run every Orfeo test once, and be honest about the ones we skip ──
// Each test file exports a `runXTest(): number` that returns its failure count
// (see docs/CONTRIBUTING.md → "Running the tests"). Nothing used to call them.
// This walks src/ and electron/, runs every file, and exits non-zero if any
// test failed — so `npm test` is a real gate, locally and in CI.
//
// One file per child process, on purpose: a test that leaves a timer, a port or
// a promise behind can then neither hang nor silently poison the rest of the run.
// A file that cannot be loaded is a failure, never a skip — a broken import is
// exactly what a test run should surface. Only the SKIP table leaves a file out,
// and every entry has to state its reason.
//
// Directly:  node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts
// One file:  … src/runAllTests.ts --file src/utils/smfLeadTest.ts   (used by the parent)
import { existsSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOTS = ['src', 'electron']
const SELF = 'runAllTests.ts'
const PER_FILE_TIMEOUT_MS = 120_000

// Files that cannot run headless, with the reason the next reader needs.
// Keys are repo-relative, forward slashes.
const SKIP: Record<string, string> = {
  // The native add-on is built by `npm run native:build`, which needs the Windows
  // toolchain (native/build/ is not in the repository). The rules that test checks
  // — packing events, channel mix, tail length — are covered headless elsewhere.
  'src/audio/exportNativeTest.ts': 'needs the built native add-on (npm run native:build, Windows only)',
  // the audio host process itself (utilityProcess + MessagePort + the add-on) only
  // runs on Windows; every rule it uses lives in hostRenders.ts, which is tested.
}

const rel = (path: string) => path.split(sep).join('/')

const walk = (dir: string, out: string[]): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/Test\.ts$/.test(name) && name !== SELF) out.push(full)
  }
  return out
}

// ── The smallest environment these tests need, and no more ──────────────────
// Store modules, engines and dialogs touch `window`, `localStorage` and a
// `document.documentElement.style` — Orfeo's own guards for a not-yet-mounted
// page. Faking a DOM would let a broken component pass here, so this covers
// exactly those guards; anything deeper belongs in the app, not in `npm test`.
function installTestEnvironment(): void {
  const g = globalThis as any
  // A real window is an EventTarget with the handful of things Orfeo reads at
  // module load. Aliasing window to globalThis instead would give a module that
  // calls window.addEventListener(...) a confusing crash instead of a test run.
  if (g.window === undefined) {
    g.window = {
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      localStorage: g.localStorage, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      navigator: g.navigator, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
      setTimeout, clearTimeout, setInterval, clearInterval, fetch: globalThis.fetch,
    }
  }
  if (g.localStorage === undefined) {
    const store = new Map<string, string>()
    g.localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size },
    }
  }
  if (g.document === undefined) {
    const style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }
    g.document = {
      documentElement: { style, setAttribute() {}, getAttribute: () => null, classList: { add() {}, remove() {}, contains: () => false } },
      body: { style, appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {} },
      createElement: () => ({ style: { ...style }, setAttribute() {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, focus() {}, remove() {} }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {},
    }
  }
  // Node 22 has its own navigator; leave it alone. Only the pieces Orfeo reads
  // that a browser would provide are added when missing.
  if (g.navigator !== undefined && !('hardwareConcurrency' in g.navigator)) {
    try { Object.defineProperty(g.navigator, 'hardwareConcurrency', { value: 4 }) } catch { /* read-only in this Node */ }
  }
  if (g.matchMedia === undefined) g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
}

// ── Single-file mode: import one test file, call every runner it exports ────
async function runOne(path: string): Promise<void> {
  installTestEnvironment()
  const mod = await import(pathToFileURL(path).href)
  const runners = Object.entries(mod).filter(([name, v]) => /^run\w*Test\w*$/.test(name) && typeof v === 'function') as [string, () => number | Promise<number>][]
  if (!runners.length) {
    console.log('no run…Test…() export found — expected an exported runSomethingTest(): number')
    process.exit(2)
  }
  // Keep the loop alive while a test runs: some Orfeo modules unref their own
  // handles on purpose (never keep a process alive), and a test awaiting one of
  // them would otherwise be cut off mid-flight by Node leaving.
  const keepAlive = setInterval(() => {}, 1000)
  let failed = 0
  for (const [name, fn] of runners) {
    try {
      const r = await fn()
      failed += typeof r === 'number' ? r : 0
    } catch (e: any) {
      failed++
      console.log(`${name} threw: ${e?.message ?? e}`)
    }
  }
  clearInterval(keepAlive)
  // Whatever a test left running (timers, ports) must not keep this child alive:
  // the number above is the answer, and an exit code is the only honest report.
  process.exit(failed ? 1 : 0)
}

// ── Parent mode ──────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const files = ROOTS.filter((r) => existsSync(r)).flatMap((r) => walk(r, [])).sort()
  let failedFiles = 0
  let failedChecks = 0
  let skipped = 0

  for (const file of files) {
    const key = rel(file)
    if (SKIP[key]) {
      skipped++
      console.log(`skip  ${key} — ${SKIP[key]}`)
      continue
    }
    const r = spawnSync(process.execPath,
      ['--import', './scripts/ts-esbuild-hooks.mjs', 'src/runAllTests.ts', '--file', file],
      { encoding: 'utf8', timeout: PER_FILE_TIMEOUT_MS })
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
    if (r.error || r.signal || r.status === null) {
      failedFiles++
      console.log(`FAIL  ${key} — ${r.signal ? `killed (${r.signal}) after ${PER_FILE_TIMEOUT_MS / 1000}s, no answer` : `runner could not start: ${r.error?.message}`}`)
      continue
    }
    const own = out.split('\n').filter((l) => !/^\s*$/.test(l))
    if (r.status !== 0) {
      failedFiles++
      // the failure count is only known through the exit code; the file's own
      // report lines are what a person needs to see
      failedChecks += own.filter((l) => /failed$/i.test(l)).map((l) => Number((l.match(/(\d+) failed/) ?? [0, 1])[1])).reduce((a, b) => a + b, 1)
      console.log(`FAIL  ${key}`)
      for (const l of own) console.log(`      ${l}`)
    } else {
      console.log(`ok    ${key}${own.length ? ` — ${own[own.length - 1]}` : ''}`)
    }
  }

  const ran = files.length - skipped
  console.log(`\nnpm test: ${ran} files run, ${skipped} skipped, ${failedFiles} with failures`)
  process.exitCode = failedFiles ? 1 : 0
}

if (process.argv[2] === '--file') await runOne(process.argv[3])
else await main()
