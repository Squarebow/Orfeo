import { useStore } from '../store'
import { liveHandColor } from './liveHandColor'
import { HAND_LH_CSS, HAND_RH_CSS } from '../utils/handColors'

// The piano you'd play shows its hands by itself (handColouredTracks.ts); every
// other keyboard keeps its own colour. No switch since 25. 11.
export function runLiveHandColorTest(): number {
  console.group('[liveHandColor] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const before = useStore.getState()
  const base = '#6ec6ff'
  const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ midi: 60, time: i, duration: 1, velocity: 1, hand: (i % 2 ? 'L' : 'R') as 'L' | 'R', trackIndex: 0 }))
  const piano = { index: 0, notes: notes(80), group: 'piano', isDrum: false, program: 0 }
  const organ = { index: 1, notes: notes(80).map(n => ({ ...n, trackIndex: 1 })), group: 'organ', isDrum: false, program: 16 }
  useStore.setState({
    midi: { ...(before.midi ?? {}), tracks: [piano, organ] } as any,
    tracks: [{ index: 0, color: base, group: 'piano', isDrum: false, program: 0 }, { index: 1, color: base, group: 'organ', isDrum: false, program: 16 }] as any,
    noteEditorActive: false,
  })
  check(liveHandColor({ hand: 'L', trackIndex: 0 }, base, false) === HAND_LH_CSS, 'the piano: left hand colour')
  check(liveHandColor({ hand: 'R', trackIndex: 0 }, base, false) === HAND_RH_CSS, 'the piano: right hand colour')
  check(liveHandColor({ hand: 'L', trackIndex: 1 }, base, false) === base, 'an organ beside it: its own colour')
  check(liveHandColor({ hand: 'L', trackIndex: 1 }, base, true) === HAND_LH_CSS, 'a one-hand track keeps its hand colour anywhere')
  check(liveHandColor({ trackIndex: 0 }, base, false) === base, 'a note with no hand keeps the track colour')
  check(liveHandColor({ hand: 'L' }, base, false) === base, 'a note from no track: its own colour')
  // no piano: the keyboard part shows its hands
  useStore.setState({ midi: { ...(before.midi ?? {}), tracks: [organ] } as any })
  check(liveHandColor({ hand: 'R', trackIndex: 1 }, base, false) === HAND_RH_CSS, 'no piano: the organ shows its hands')
  useStore.setState({ midi: before.midi, tracks: before.tracks, noteEditorActive: before.noteEditorActive })

  console.log(`liveHandColor: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
