import { acceptMixerValues, countUnsaved, hasUnsaved, setPlaybackEditorCheck, unsavedDetail, type TrackBaseline } from './unsavedChanges'

export function runUnsavedChangesTest(): number {
  console.group('[unsavedChanges] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const values = { muted: false, visible: true, showOnKeyboard: true, volume: 1, pan: 0, chorus: 0, reverb: 0 }
  const baseline: TrackBaseline = { 0: values, 1: values }
  const track = (index: number, change = {}) => ({ index, ...values, ...change })
  const same = [track(0), track(1)]

  check(!hasUnsaved(countUnsaved(same, baseline, false)), 'nothing changed')
  check(!hasUnsaved(countUnsaved([track(0, { solo: true }), track(1)], baseline, false)), 'solo is not a change')

  const c = countUnsaved([track(0, { visible: false, muted: true }), track(1, { showOnKeyboard: false, pan: 0.5 })], baseline, false)
  check(c.shown === 1 && c.muted === 1 && c.lights === 1 && c.mixer === 1 && hasUnsaved(c), 'each kind is counted')

  const focus = countUnsaved([track(0, { visible: false, muted: true }), track(1)], baseline, true)
  check(!hasUnsaved(focus), 'Focus mode hiding and muting is not a change')
  check(countUnsaved([track(0, { volume: 0.5 })], baseline, true).mixer === 1, 'the Mixer still counts during Focus mode')
  check(!hasUnsaved(countUnsaved([track(9, { muted: true })], baseline, false)), 'a track the song did not load with is skipped')

  setPlaybackEditorCheck(() => true)
  check(hasUnsaved(countUnsaved(same, baseline, false)), 'edits waiting in the Playback Editor')
  setPlaybackEditorCheck(null)

  const text = unsavedDetail(c)
  check(text.includes('Mixer channels changed: 1') && text.includes('Save & Reload'), 'says what changed and how to keep it')
  check(text.includes("Mute can't be saved yet"), 'says mute cannot be kept')
  check(!unsavedDetail({ ...c, muted: 0 }).includes("Mute can't"), 'mute note only when mute changed')

  const accepted = acceptMixerValues([track(0, { volume: 0.5, muted: true })], baseline)
  check(!countUnsaved([track(0, { volume: 0.5 })], accepted, false).mixer, 'a discarded Mixer change is not asked about again')
  check(accepted[0].muted === false && accepted[1].volume === 1, 'only the Mixer values move, only for those tracks')

  console.log(`unsavedChanges: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
