import { useStore } from '../store'
import { liveHandColor } from './liveHandColor'
import { HAND_LH_CSS, HAND_RH_CSS } from '../utils/handColors'

export function runLiveHandColorTest(): number {
  console.group('[liveHandColor] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const set = useStore.getState().setShowHandLabels
  const base = '#6ec6ff'
  const before = useStore.getState().showHandLabels

  // the toggle flips while the song plays: the next light must follow it
  set(true)
  check(liveHandColor({ hand: 'L' }, base, false) === HAND_LH_CSS, 'toggle on: left hand colour')
  check(liveHandColor({ hand: 'R' }, base, false) === HAND_RH_CSS, 'toggle on: right hand colour')
  set(false)
  check(liveHandColor({ hand: 'L' }, base, false) === base, 'toggle off: the track colour, at once')
  check(liveHandColor({ hand: 'R' }, base, false) === base, 'toggle off: for both hands')
  check(liveHandColor({ hand: 'L' }, base, true) === HAND_LH_CSS, 'a split one-hand track keeps its hand colour')
  check(liveHandColor({}, base, false) === base, 'a note with no hand keeps the track colour')
  set(true)
  check(liveHandColor({}, base, false) === base, 'no hand, toggle on: still the track colour')
  // the roll draws hand colours whenever the toggle is on, whichever hand-label
  // style is chosen; the keys follow the roll (they once also needed Performance)
  const mode = useStore.getState().handLabelMode
  useStore.setState({ handLabelMode: 'practice' })
  check(liveHandColor({ hand: 'R' }, base, false) === HAND_RH_CSS, 'hand colours on, Practice label style: the hand colour, as on the roll')
  useStore.setState({ handLabelMode: mode })
  set(before)

  console.log(`liveHandColor: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
