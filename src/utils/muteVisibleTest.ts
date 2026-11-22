import { useStore } from '../store'
import { isShown, isOnRoll } from './trackShown'

// Mute and the eye are separate buttons: neither switches the other (what
// actually shows is decided from both — trackShown.ts)
export function runMuteVisibleTest(): number {
  console.group('[mute/visible] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const track = (index: number, group: string) => ({ index, group, muted: false, solo: false, visible: true, showOnKeyboard: true }) as any
  const get = (i: number) => useStore.getState().tracks.find(t => t.index === i)!

  useStore.setState({ tracks: [track(0, 'piano'), track(1, 'reed')] })
  useStore.getState().setTrackMuted(1, true)
  check(get(1).muted && get(1).visible, 'muting a track leaves its eye as it was')
  useStore.getState().setTrackMuted(1, false)
  check(!get(1).muted && get(1).visible, 'unmuting leaves its eye as it was')
  useStore.setState({ tracks: [track(0, 'piano'), { ...track(1, 'reed'), visible: false }] })
  useStore.getState().setTrackMuted(1, true)
  useStore.getState().setTrackMuted(1, false)
  check(!get(1).visible, 'a hidden track heard again stays hidden (hear the sax, don\'t see it)')
  useStore.getState().muteGroup('piano', true)
  check(get(0).muted && get(0).visible, 'muting a group leaves their eyes as they were')
  // "Muted tracks stay on the roll" (Settings › Playback) changes the piano roll only
  const was = useStore.getState().mutedOnRoll
  const muted = { visible: true, muted: true, solo: false }
  useStore.getState().setMutedOnRoll(false)
  check(!isOnRoll(muted, false), 'setting off (default): muting takes a track off the roll, as always')
  check(isOnRoll({ ...muted, muted: false }, false), 'setting off: unmuted with its eye on is on the roll')
  check(!isShown(muted, false), 'setting off: a muted track lights no keys and lands no steps')
  useStore.getState().setMutedOnRoll(true)
  check(isOnRoll(muted, false), 'setting on: a muted track with its eye on stays on the roll')
  check(!isOnRoll({ ...muted, visible: false }, false), 'setting on: the eye still takes a muted track off the roll')
  check(!isOnRoll({ visible: true, muted: false, solo: false }, true), 'setting on: solo still keeps other tracks off the roll')
  check(!isShown(muted, false), 'setting on: keys, Reflect and steps still leave a muted track out')
  useStore.getState().setMutedOnRoll(was)
  useStore.setState({ tracks: [] })

  console.log(`mute/visible: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
