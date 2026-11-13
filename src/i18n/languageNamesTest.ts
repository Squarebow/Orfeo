import { languageName } from './languageNames'

export function runLanguageNamesTest(): number {
  console.group('[languageNames] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const table: Record<string, string> = {
    de: 'Deutsch', es: 'Español', fr: 'Français', pl: 'Polski', pt_BR: 'Português brasileiro',
    ru: 'Русский', sl: 'Slovenščina', zh_Hans: '简体中文', en: 'English',
  }
  for (const [code, name] of Object.entries(table)) check(languageName(code) === name, `${code} is ${name}, got ${languageName(code)}`)
  for (const code of [...Object.keys(table), 'nb_NO', 'zh_Hant', 'xx_YY', '']) {
    const n = languageName(code)
    check(!/[()]/.test(n), `${code}: no brackets in "${n}"`)
  }
  const nb = languageName('nb_NO')
  check(nb.length > 0 && nb !== 'nb_NO', `nb_NO has a name, got ${nb}`)
  check(languageName('xx_YY').length > 0, 'unknown code still gives something')
  check(languageName('!!bad!!') === '!!bad!!', 'invalid tag falls back to the code')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
