// ── Reads LICENSE.md and THIRD_PARTY_LICENSES.md for the Licenses window ─────
// Only what those two files use: headings, paragraphs, tables, code blocks,
// <details>, bold, italics, code and links. The result is plain data, shown as
// ordinary text, so nothing in the files can run as a page.
export type Inline =
  | { kind: 'text' | 'bold' | 'em' | 'code'; text: string }
  | { kind: 'link'; text: string; url: string }

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'details'; summary: string; blocks: Block[] }

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
const isTableRule = (line: string | undefined) => !!line && /^\s*\|[\s:|-]+\|\s*$/.test(line)

export function parseLicenseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'para', text: para.join(' ') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i], trimmed = line.trim()
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (!trimmed || (trimmed.startsWith('<!--') && trimmed.endsWith('-->'))) flush()
    else if (trimmed.startsWith('```')) {
      flush()
      const code: string[] = []
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i])
      blocks.push({ kind: 'code', text: code.join('\n') })
    } else if (trimmed === '<details>') {
      flush()
      const inner: string[] = []
      let summary = ''
      for (i++; i < lines.length && lines[i].trim() !== '</details>'; i++) {
        const s = /^<summary>(.*)<\/summary>$/.exec(lines[i].trim())
        if (s) summary = s[1]
        else inner.push(lines[i])
      }
      blocks.push({ kind: 'details', summary, blocks: parseLicenseMarkdown(inner.join('\n')) })
    } else if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
    } else if (/^-{3,}$/.test(trimmed)) {
      flush()
      blocks.push({ kind: 'rule' })
    } else if (trimmed.startsWith('|') && isTableRule(lines[i + 1])) {
      flush()
      const head = cells(line), rows: string[][] = []
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]))
      i--
      blocks.push({ kind: 'table', head, rows })
    } else para.push(trimmed)
  }
  flush()
  return blocks
}

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:[^)\s]+|#[^)\s]*)\)|(https?:\/\/[^\s<>)|]+)|\*([^*\s][^*]*)\*/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) })
    if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] })
    else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] })
    else if (m[3] !== undefined) out.push(m[4].startsWith('#') ? { kind: 'text', text: m[3] } : { kind: 'link', text: m[3], url: m[4] })
    else if (m[5] !== undefined) out.push({ kind: 'link', text: m[5], url: m[5] })
    else out.push({ kind: 'em', text: m[6] })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}
