import { useStore } from '../store'

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
  useStore.setState({ tracks: [] })

  console.log(`mute/visible: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
