import { readFileSync } from 'node:fs'
import { parseInline, parseLicenseMarkdown, type Block } from './licenseMarkdown'

export function runLicenseMarkdownTest(): number {
  console.group('[licenseMarkdown] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const b = parseLicenseMarkdown([
    '# Title', '', 'one line', '  and the next', '', '---', '',
    '| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |', 'after the table', '',
    '<details>', '<summary>More</summary>', '', '```', 'kept  as   is', '```', '', '</details>',
  ].join('\r\n'))
  check(b[0].kind === 'heading' && b[0].level === 1 && b[0].text === 'Title', 'heading')
  check(b[1].kind === 'para' && b[1].text === 'one line and the next', 'lines join into a paragraph')
  check(b[2].kind === 'rule', 'rule')
  check(b[3].kind === 'table' && b[3].head.join() === 'A,B' && b[3].rows.length === 2 && b[3].rows[1][1] === '4', 'table')
  check(b[4].kind === 'para' && b[4].text === 'after the table', 'the text after a table stays')
  const d = b[5]
  check(d.kind === 'details' && d.summary === 'More' && d.blocks[0].kind === 'code' && d.blocks[0].text === 'kept  as   is', 'details with a code block')

  const inl = parseInline('**bold** and *em*, `a*b*`, [site](https://a.org/x), [here](#top), see https://b.org.')
  check(inl.filter(x => x.kind === 'bold').length === 1 && inl.filter(x => x.kind === 'em').length === 1, 'bold and italics')
  check(inl.some(x => x.kind === 'code' && x.text === 'a*b*'), 'stars inside code stay')
  check(inl.some(x => x.kind === 'link' && x.text === 'site' && x.url === 'https://a.org/x'), 'link')
  check(inl.some(x => x.kind === 'text' && x.text === 'here') && !inl.some(x => x.kind === 'link' && x.text === 'here'), 'a link inside the page stays plain text')
  check(inl.some(x => x.kind === 'link' && x.url.startsWith('https://b.org')), 'a bare address is a link')
  check(!parseInline('[bad](javascript:alert(1))').some(x => x.kind === 'link'), 'only web links open')

  check(parseLicenseMarkdown('<!-- a marker -->\nvisible').every(x => x.kind !== 'para' || x.text === 'visible'), 'markers stay hidden')

  // The real files: every section read, nothing left as raw table or details text
  const flat = (bs: Block[]): Block[] => bs.flatMap(x => x.kind === 'details' ? [x, ...flat(x.blocks)] : [x])
  // Orfeo's own licence is the standard GPL text, plain, so GitHub recognises it; the
  // GSAP permission that used to sit in it now opens THIRD_PARTY_LICENSES.md
  const own = readFileSync('LICENSE.md', 'utf-8')
  check(/^\s*GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(own) && !/^#/m.test(own) && !own.includes('GSAP'), 'LICENSE.md: the standard GPL-3.0 text, nothing added')
  for (const f of ['THIRD_PARTY_LICENSES.md']) {
    const blocks = flat(parseLicenseMarkdown(readFileSync(f, 'utf-8')))
    const paras = blocks.flatMap(x => x.kind === 'para' ? [x.text] : [])
    check(blocks.some(x => x.kind === 'heading'), `${f}: headings`)
    check(!paras.some(p => p.startsWith('|') || p.includes('<details>') || p.includes('<summary>') || p.includes('<!--')), `${f}: no raw markup left`)
  }
  const third = flat(parseLicenseMarkdown(readFileSync('THIRD_PARTY_LICENSES.md', 'utf-8')))
  check(third.filter(x => x.kind === 'table').length >= 8, 'third-party tables are tables')
  check(third.some(x => x.kind === 'heading' && x.text === 'Demo songs') && third.some(x => x.kind === 'heading' && x.text === 'Fonts'), 'fonts and demo songs are there')
  const firstHeading = third.find(x => x.kind === 'heading' && x.level === 2)
  check(!!firstHeading && firstHeading.kind === 'heading' && firstHeading.text === 'Additional Permission Under GNU GPL Version 3 Section 7', 'the GSAP permission comes first')

  console.log(`licenseMarkdown: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
