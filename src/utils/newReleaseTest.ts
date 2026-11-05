import { downloadEnding, isNewerVersion, newerRelease } from './newRelease'

export function runNewReleaseTest(): number {
  console.group('[newRelease] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  check(isNewerVersion('v1.7.0', '1.6.0'), 'a higher minor')
  check(isNewerVersion('1.10.0', '1.9.3'), 'numbers, not letters')
  check(isNewerVersion('2.0.0', '1.99.99'), 'a higher major')
  check(!isNewerVersion('1.6.0', '1.6.0'), 'the same')
  check(!isNewerVersion('1.5.9', '1.6.0'), 'older')
  check(isNewerVersion('1.7.0', '1.7.0-beta.1'), 'the release after its beta')
  check(!isNewerVersion('1.7.0-beta.1', '1.7.0'), 'a beta after its release')
  check(!isNewerVersion('nonsense', '1.6.0'), 'not a version')

  const assets = [{ name: 'Orfeo-1.7.0-portable.exe' }, { name: 'Orfeo-1.7.0-mac-arm64.dmg' }, { name: 'Orfeo-1.7.0-mac-x64.dmg' }]
  const release = { tag_name: 'v1.7.0', assets }
  check(newerRelease('1.6.0', release, downloadEnding('darwin')) === '1.7.0', 'Mac has its download')
  check(newerRelease('1.6.0', release, downloadEnding('win32')) === '1.7.0', 'portable has its download')
  check(newerRelease('1.6.0', release, downloadEnding('linux')) === null, 'Linux waits for its download')
  check(newerRelease('1.7.0', release, '.dmg') === null, 'already on it')
  check(newerRelease('1.6.0', { ...release, prerelease: true }, '.dmg') === null, 'never a pre-release')
  check(newerRelease('1.6.0', { ...release, draft: true }, '.dmg') === null, 'never a draft')
  check(newerRelease('1.6.0', {}, '.dmg') === null, 'an empty answer')

  console.log(`newRelease: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
