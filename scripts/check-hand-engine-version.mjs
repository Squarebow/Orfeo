#!/usr/bin/env node
// ── Fails loudly if src/utils/handAssignment.ts changed without a matching
// HAND_ENGINE_VERSION bump in handMetadata.ts. Without this, a file saved
// before an algorithm fix keeps showing the old, stale hand tags forever on
// reload — the whole point of the version hint is to skip recomputing, so a
// forgotten bump silently defeats every fix. Missed twice in one real
// session before this existed; that's the bug this exists to catch. ────────
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '../src/utils/handAssignment.ts')
const META = join(__dirname, '../src/utils/handMetadata.ts')
const HASH_FILE = join(__dirname, '../src/utils/handAssignment.hash.json')

const content = readFileSync(SRC, 'utf8')
const hash = createHash('sha256').update(content).digest('hex')

const metaContent = readFileSync(META, 'utf8')
const versionMatch = metaContent.match(/HAND_ENGINE_VERSION\s*=\s*(\d+)/)
if (!versionMatch) {
  console.error('[hand-engine-check] Could not find HAND_ENGINE_VERSION in handMetadata.ts')
  process.exit(1)
}
const currentVersion = versionMatch[1]
const updateMode = process.argv.includes('--update')

function record() {
  writeFileSync(HASH_FILE, JSON.stringify({ version: currentVersion, hash }, null, 2) + '\n')
}

if (updateMode) {
  record()
  console.log(`[hand-engine-check] Recorded hash for HAND_ENGINE_VERSION ${currentVersion}.`)
  process.exit(0)
}

if (!existsSync(HASH_FILE)) {
  console.warn('[hand-engine-check] No recorded hash yet — run `npm run check:hand-engine -- --update` once to initialize.')
  process.exit(0)
}

const recorded = JSON.parse(readFileSync(HASH_FILE, 'utf8'))

if (recorded.hash === hash) process.exit(0) // no change since last recorded state

if (recorded.version === currentVersion) {
  console.error(`
[hand-engine-check] handAssignment.ts changed but HAND_ENGINE_VERSION (${currentVersion}) was NOT bumped.

Any file saved with an older engine's hand tags will silently keep showing
stale results on reload — that's the whole point of the version hint.

If this change is algorithmically meaningful: bump HAND_ENGINE_VERSION in
src/utils/handMetadata.ts, then run:
  npm run check:hand-engine -- --update

If this was a comment/formatting-only change with no behavior change, run
the --update command above to acknowledge it without bumping the version.
`)
  process.exit(1)
}

// Version WAS bumped along with the change — the good path. Just record the
// new baseline silently so the next unrelated edit doesn't false-positive.
record()
console.log(`[hand-engine-check] HAND_ENGINE_VERSION bumped to ${currentVersion} — recorded new hash.`)
process.exit(0)
