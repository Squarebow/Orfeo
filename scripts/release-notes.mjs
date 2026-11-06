#!/usr/bin/env node
// ── Builds the GitHub release notes for one version from docs/CHANGELOG.md ──
//
// Usage:
//   node scripts/release-notes.mjs 1.5.0                 → prints the notes
//   node scripts/release-notes.mjs 1.5.0 --out notes.md  → writes them to a file
//   npm run release:notes -- 1.5.0                       → same, via npm
//
// What it reads, for version 1.5.0:
//   ## [1.5.0] — 12. 10. 2026 — Title        (or ## [1.5] for an x.y.0 version)
//
//   **In short**                             (optional, 2–4 lines)
//   - One line a user understands in a second.
//
//   ### New / ### Changed / ### Fixed        (the full entry)
//
// What it writes: the title, the In short lines (or, without them, the first
// sentence of each New and Fixed item), download links, and the full entry
// folded under "Full changelog".
//
// Only the entries above the public 1.0.0 heading are searched. Further down,
// CHANGELOG.md still holds entries from the numbering used before the public
// release (1.6.0 … 1.11.7 from August 2026); they must never be picked up as
// notes for a new release with the same number.
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHANGELOG = join(ROOT, 'docs', 'CHANGELOG.md')
const REPO = process.env.GITHUB_REPOSITORY || 'Squarebow/Orfeo'
const PUBLIC_FIRST = '1.0.0' // headings below this one belong to the old numbering

// ── Arguments ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const version = (args.find((a) => !a.startsWith('--')) || '').replace(/^v/, '')
const outIndex = args.indexOf('--out')
const outFile = outIndex >= 0 ? args[outIndex + 1] : null

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) {
  fail(`"${version}" is not a version like 1.5.0 or 1.5.0-beta.1.`)
}

// ── Find the version's section ──────────────────────────────────────────────
const text = readFileSync(CHANGELOG, 'utf8').replace(/\r\n/g, '\n')
const lines = text.split('\n')
const headings = [] // { index, label, rest }
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^## \[([^\]]+)\]\s*(.*)$/)
  if (m) headings.push({ index: i, label: m[1].trim(), rest: m[2] })
}
const publicEnd = headings.findIndex((h) => h.label === PUBLIC_FIRST)
const searchable = publicEnd >= 0 ? headings.slice(0, publicEnd + 1) : headings

const base = version.replace(/-.*$/, '') // 1.5.0-beta.1 → 1.5.0
const short = base.replace(/\.0$/, '') // 1.5.0 → 1.5
const wanted = [version, base, short]
const pos = searchable.findIndex((h) => wanted.includes(h.label))
if (pos < 0) {
  fail(
    `docs/CHANGELOG.md has no section for ${version}.\n` +
      `Add one at the top, e.g.\n\n## [${base}] — ${today()} — Title\n\n### New\n- …`
  )
}
const head = searchable[pos]
const endLine = headings[headings.indexOf(head) + 1]?.index ?? lines.length
const body = lines.slice(head.index + 1, endLine).join('\n').trim()

// ── Title and date from the heading: "— 4. 10. 2026 — Settings window" ──────
const parts = head.rest.split(/\s+—\s+/).map((s) => s.replace(/^—\s*/, '').trim()).filter(Boolean)
const date = parts.find((p) => /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}$/.test(p)) || ''
const title = parts.filter((p) => p !== date).join(' — ')

// ── In short, or the fallback summary ───────────────────────────────────────
const sections = splitSections(body)
let summary = []
const inShort = body.match(/\*\*In short\*\*\s*\n((?:\s*[-*] .+\n?)+)/)
if (inShort) {
  summary = inShort[1].split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter(Boolean)
} else {
  for (const name of ['New', 'Added', 'Fixed']) {
    for (const item of sections[name] || []) summary.push(firstSentence(item))
  }
  if (!summary.length) for (const item of sections.Changed || []) summary.push(firstSentence(item))
  summary = summary.slice(0, 6)
}

// ── Counts for the fold title ───────────────────────────────────────────────
const count = (n) => (sections[n] || []).length
const counts = [
  [count('New') + count('Added'), 'new'],
  [count('Changed'), 'changed'],
  [count('Fixed'), 'fixed'],
]
  .filter(([n]) => n > 0)
  .map(([n, w]) => `${n} ${w}`)
  .join(', ')

// ── Assemble ────────────────────────────────────────────────────────────────
const fullBody = body.replace(/\*\*In short\*\*\s*\n(?:\s*[-*] .+\n?)+/, '').trim()
const dl = `https://github.com/${REPO}/releases/download/v${version}`
const out = [
  `## Orfeo ${version}${title ? ` — ${title}` : ''}`,
  date ? `*${date}*` : '',
  '',
  ...summary.map((s) => `- ${s}`),
  '',
  `**Download:** [Installer](${dl}/Orfeo-Setup-${version}.exe) (recommended, updates itself) · ` +
    `[Portable](${dl}/Orfeo-${version}-portable.exe) (no install)` +
    // a beta never goes to the Store; a release reaches it after certification
    (version.includes('-') ? '  ' : ` · [Microsoft Store](https://apps.microsoft.com/detail/9NJ9Q01P8JQD) (updates through the Store, usually within a few days)  `),
  `**Mac and Linux:** choose your file under *Assets* below. These files can join this page a little after the Windows ones. They don't update themselves: a dot on the update button tells you when a new version is out.  `,
  `**Already installed on Windows?** Orfeo updates itself the next time it starts. ` +
    `Found a problem? [Report a bug](https://orfeo.cc/docs/support/report-a-bug).`,
  '',
  `<details><summary>Full changelog${counts ? `: ${counts}` : ''}</summary>`,
  '',
  fullBody,
  '',
  '</details>',
  '',
  `Every version since 1.0, in full: [CHANGELOG](https://github.com/${REPO}/blob/main/docs/CHANGELOG.md)`,
  '',
]
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')

if (outFile) writeFileSync(outFile, out)
else process.stdout.write(out)

// ── Helpers ─────────────────────────────────────────────────────────────────
function splitSections(md) {
  const result = {}
  let current = null
  let item = null
  for (const line of md.split('\n')) {
    const h = line.match(/^###\s+(.+)$/)
    if (h) {
      current = h[1].trim()
      result[current] = []
      item = null
      continue
    }
    if (!current) continue
    if (/^- /.test(line)) {
      item = line.slice(2)
      result[current].push(item)
    } else if (item !== null && /^\s+\S/.test(line)) {
      result[current][result[current].length - 1] += ' ' + line.trim()
    }
  }
  return result
}

function firstSentence(item) {
  const bold = item.match(/^\*\*(.+?)\*\*/)
  if (bold && /[.!?]$/.test(bold[1].trim())) return bold[1].trim()
  const plain = item.replace(/\*\*|`/g, '')
  // Split after . ! ? but not after abbreviations like "e.g." or "i.e."
  const sentence = plain.split(/(?<!\b(?:e\.g|i\.e|etc|vs)\.)(?<=[.!?])\s/)[0]
  return sentence.length > 160 ? sentence.slice(0, 157).replace(/\s+\S*$/, '') + '…' : sentence
}

function today() {
  const d = new Date()
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`
}

function fail(message) {
  console.error(`\n[release-notes] ${message}\n`)
  process.exit(1)
}
