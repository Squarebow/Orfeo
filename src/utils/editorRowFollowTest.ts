import { followTrackFlags, type TrackFlags } from './editorRowFollow'

const track = (index: number, over: Partial<TrackFlags> = {}): TrackFlags =>
  ({ index, muted: false, visible: true, showOnKeyboard: true, ...over })
const row = (index: number, over = {}) =>
  ({ index, included: true, visible: true, showOnKeyboard: true, ...over })

export function runEditorRowFollowTest(): number {
  console.group('[editorRowFollow] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a track muted when the editor opened, then unmuted in the Tracks panel
  let rows = followTrackFlags([row(5, { included: false })], [track(5, { muted: true })], [track(5)])
  check(rows[0].included === true, 'unmuting includes the row straight away')

  rows = followTrackFlags([row(5)], [track(5)], [track(5, { muted: true })])
  check(rows[0].included === false, 'muting excludes the row straight away')

  rows = followTrackFlags([row(1)], [track(1)], [track(1, { visible: false })])
  check(rows[0].visible === false && rows[0].included === true, 'the eye follows, nothing else moves')

  rows = followTrackFlags([row(1)], [track(1)], [track(1, { showOnKeyboard: false })])
  check(rows[0].showOnKeyboard === false, 'the keyboard icon follows')

  // something changed in the editor and not in the Tracks panel stays as it is
  rows = followTrackFlags([row(1, { included: false }), row(2)], [track(1), track(2)], [track(1), track(2, { visible: false })])
  check(rows[0].included === false, 'an untouched track keeps its editor choice')
  check(rows[1].visible === false, 'the other track still follows')

  rows = followTrackFlags([row(1, { visible: false })], [track(1)], [track(1, { muted: true })])
  check(rows[0].visible === false && rows[0].included === false, 'only the flag that changed moves')

  // both halves of a staged hand split belong to the source track
  rows = followTrackFlags(
    [row(3, { splitOriginIndex: 3 }), row(900, { splitOriginIndex: 3 })],
    [track(3)], [track(3, { muted: true })],
  )
  check(rows.every(r => r.included === false), 'both halves of a staged split follow')

  // a staged merge is its own new row
  const merged = row(901, { mergedFromIndices: [1, 2] })
  rows = followTrackFlags([merged], [track(1), track(2)], [track(1, { muted: true }), track(2)])
  check(rows[0].included === true, 'a staged merge is left alone')

  const same = [row(1)]
  check(followTrackFlags(same, [track(1)], [track(1)]) === same, 'nothing changed: the same rows come back')
  check(followTrackFlags(same, [], [track(1, { muted: true })]) === same, 'a track with no earlier state is left alone')

  console.log(`editorRowFollow: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
