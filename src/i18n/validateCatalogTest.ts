import { validateCatalog } from './validateCatalog'

export function runValidateCatalogTest(): number {
  console.group('[validateCatalog] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const english: Record<string, string> = {}
  for (let i = 0; i < 20; i++) english[`Text ${i}`] = `Text ${i}`
  english['Move {{v0}} by {{v1}}'] = 'Move {{v0}} by {{v1}}'

  const good = (n: number): Record<string, string> => {
    const o: Record<string, string> = {}
    for (let i = 0; i < n; i++) o[`Text ${i}`] = `Besedilo ${i}`
    return o
  }

  check(validateCatalog('x', english) === null, 'string is rejected')
  check(validateCatalog(null, english) === null, 'null is rejected')
  check(validateCatalog([], english) === null, 'array is rejected')
  check(validateCatalog({ ...good(5), 'Text 6': 7 }, english) === null, 'non-string value is rejected')

  const r1 = validateCatalog({ ...good(10), 'Not a key': 'x' }, english)
  check(r1 !== null && r1.kept === 10 && r1.dropped === 1, 'unknown key dropped, known kept')
  check(r1 !== null && !('Not a key' in r1.catalog) && r1.catalog['Text 0'] === 'Besedilo 0', 'catalog holds only known keys')

  const r2 = validateCatalog({ ...good(10), 'Move {{v0}} by {{v1}}': 'Premakni {{v1}} za {{v0}}' }, english)
  check(r2 !== null && r2.kept === 11 && r2.dropped === 0, 'same placeholders in another order kept')

  const r3 = validateCatalog({ ...good(10), 'Move {{v0}} by {{v1}}': 'Premakni {{v0}}' }, english)
  check(r3 !== null && r3.kept === 10 && r3.dropped === 1 && !('Move {{v0}} by {{v1}}' in r3.catalog), 'different placeholders dropped')

  const r4 = validateCatalog({ ...good(10), 'Text 15': '' }, english)
  check(r4 !== null && r4.kept === 10 && r4.dropped === 1, 'empty string dropped')

  check(validateCatalog(good(2), english) === null, 'below 10 % kept is rejected (2 of 21)')
  check(validateCatalog(good(3), english) !== null, '3 of 21 is above the floor')
  check(validateCatalog({}, english) === null, 'empty object rejected')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
