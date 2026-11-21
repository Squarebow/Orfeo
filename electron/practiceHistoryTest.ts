import { mkdtempSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { practiceStore } from './practiceHistory'

export function runPracticeHistoryTest(): number {
  console.group('[practiceHistory] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const dir = join(mkdtempSync(join(tmpdir(), 'orfeo-practice-')), 'practice')
  try {
    const st = practiceStore(dir)
    check(st.load('C:\\Lib\\a.mid') === null, 'nothing kept yet')
    st.save('C:\\Lib\\a.mid', { v: 1, sessions: [1] })
    check((st.load('C:/lib/A.mid') as any)?.sessions?.[0] === 1, 'kept, found again whatever the slashes and capitals')
    st.save('C:\\Lib\\a.mid', { v: 1, sessions: [1, 2] })
    check(readdirSync(dir).filter(f => f !== 'index.json').length === 1, 'one file per song, written over')
    check(!readdirSync(dir).some(f => f.endsWith('.tmp')), 'no spare file left behind')

    st.remap([{ oldPath: 'C:\\Lib\\a.mid', newPath: 'C:\\Lib\\Jazz\\a.mid' }])
    check(st.load('C:\\Lib\\a.mid') === null && (st.load('C:\\Lib\\Jazz\\a.mid') as any)?.sessions?.length === 2, 'moved: the history goes with the song')

    st.save('C:\\Lib\\b.mid', { v: 1, sessions: [9] })
    st.remap([{ oldPath: 'C:\\Lib\\Jazz\\a.mid', newPath: 'C:\\Lib\\b.mid' }])
    check((st.load('C:\\Lib\\b.mid') as any)?.sessions?.[0] === 9, 'a song already there keeps its own history')

    st.forget('C:\\Lib\\b.mid')
    check(st.load('C:\\Lib\\b.mid') === null, 'forgotten')
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true })
  }
  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
