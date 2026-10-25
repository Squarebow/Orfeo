// ── English source catalog for translation (Weblate) ──────────────────────
// Collects every text wrapped in t`…` (src/utils/i18n.ts) across src/ and
// electron/ and writes them to src/i18n/locales/en.json, the file Weblate
// translates from. The English text itself is the key; ${…} parts become
// {{v0}}, {{v1}}… placeholders. Run: npm run i18n:extract
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const OUT = 'src/i18n/locales/en.json'

function sourceFiles() {
  return ['src', 'electron'].flatMap(dir =>
    fs.readdirSync(dir, { recursive: true })
      .filter(f => /\.tsx?$/.test(f) && !/(Test|\.test)\.tsx?$/.test(f))
      .map(f => path.join(dir, f)))
}

export function extractMessages() {
  const keys = new Set()
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (n) => {
      if (ts.isTaggedTemplateExpression(n) && n.tag.getText(sf) === 't') {
        const tpl = n.template
        const key = ts.isNoSubstitutionTemplateLiteral(tpl)
          ? tpl.text
          : tpl.head.text + tpl.templateSpans.map((s, i) => `{{v${i}}}` + s.literal.text).join('')
        if (/\p{L}/u.test(key.replace(/\{\{v\d+\}\}/g, ''))) keys.add(key)
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return [...keys].sort((a, b) => a.localeCompare(b, 'en'))
}

const keys = extractMessages()
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(keys.map(k => [k, k])), null, 2) + '\n')
console.log(`${OUT}: ${keys.length} texts`)
