// ── Checking the hands, passage by passage ──────────────────────────────────
// From the Playback Editor ("passages worth a look") or the Note Editor's
// HANDS row: each passage where Orfeo was least sure of the hands becomes the
// loop, highlighted on the piano roll, and the HANDS section offers Play, "The
// hands are right" and "Fix by hand" (`panel` false after Fix by hand: the
// section then says how to fix them). Your own loop comes back when checking ends
// (the Note Editor closes or the last passage is done).
import { useStore } from '../store'
import { getLowConfidencePassages, isLowConfidence, markPassageSeen, passageKey, type LowConfidencePassage } from './handPreview'
import { NES } from './noteEditorState'
import { pianoSet } from '../practice/pianoSet'

// a little air either side, so the loop doesn't clip the passage's first note
const PAD_SEC = 0.15

let savedLoop: { loopStart: number | null; loopEnd: number | null; loopRegionActive: boolean } | null = null
// The track "Prepare for practice" is checking: when its last passage is
// done, the panel says to save, and then the song is ready to practise.
let preparing: number | null = null

/** Prepare for practice: the next check of `track` ends with "save, and it's ready" */
export function startPracticePrep(track: number): void {
  preparing = track
  useStore.setState({ handCheckDone: false })
}

// The tracks checked together: a song's piano is one instrument, whether it
// comes as one track or two (practice/pianoSet.ts)
const groupOf = (track: number): number[] => pianoSet(useStore.getState().tracks, track)
const notesOf = (track: number) => groupOf(track)
  .flatMap(i => useStore.getState().midi?.tracks.find(t => t.index === i)?.notes ?? [])
  .sort((a, b) => a.time - b.time)
export const passagesOf = (track: number): LowConfidencePassage[] => getLowConfidencePassages(notesOf(track))
const keyOf = (track: number) => passageKey((useStore.getState().midi as any)?._filePath, track)

/** Start (or move) the check: loop passage `index` of `track`, panel showing */
export function goToPassage(track: number, index: number): void {
  const ps = passagesOf(track)
  if (ps.length === 0) { endHandCheck(); return }
  const i = Math.max(0, Math.min(ps.length - 1, index))
  const p = ps[i]
  const s = useStore.getState()
  if (!savedLoop) savedLoop = { loopStart: s.loopStart, loopEnd: s.loopEnd, loopRegionActive: s.loopRegionActive }
  const start = Math.max(0, p.start - PAD_SEC)
  useStore.setState({
    loopStart: start, loopEnd: p.end + PAD_SEC, loopRegionActive: true,
    currentTime: start,
    ...(s.playbackState === 'playing' ? { playbackState: 'paused' as const } : {}),
    handCheck: { track, index: i, panel: true },
  })
  markPassageSeen(keyOf(track), p.start)
}

/** Play the passage on a loop, or pause it */
export function togglePassagePlay(): void {
  const s = useStore.getState()
  if (s.playbackState === 'playing') { useStore.setState({ playbackState: 'paused' }); return }
  const t = s.loopStart !== null && s.loopEnd !== null && (s.currentTime < s.loopStart || s.currentTime >= s.loopEnd) ? s.loopStart : s.currentTime
  useStore.setState({ currentTime: t, playbackState: 'playing' })
}

/** "The hands are right": an edit like assigning a hand (undoable, counted in
 *  the Edits badge, saved with the song). The passage's notes become hands
 *  you decided, so a saved song keeps them and never marks them again. Then
 *  on to the next passage. */
export function markPassageCorrect(): void {
  const hc = useStore.getState().handCheck
  if (!hc) return
  const p = passagesOf(hc.track)[hc.index]
  if (!p) return
  const inside = (n: { time: number }) => n.time >= p.start - 1e-6 && n.time <= p.end + 1e-6
  const shown = notesOf(hc.track).filter(n => isLowConfidence(n) && inside(n))
  // the Note Editor's own copy of the same tracks, which is what gets saved
  const storeTracks = useStore.getState().midi?.tracks ?? []
  const editTracks = NES.editMidi ? NES.editMidi.tracks.filter(t => t.notes.length > 0) : []
  const edited = groupOf(hc.track).flatMap(i => {
    const pos = storeTracks.findIndex(t => t.index === i)
    const editTrack = pos >= 0 ? editTracks[pos] : undefined
    return (editTrack?.notes ?? []).filter(n => (n as any).hand !== undefined && inside(n)) as any[]
  })
  const before = {
    shown: shown.map(n => n.handConfidence),
    edited: edited.map(n => ({ c: n.handConfidence, s: n.handSource })),
  }
  const bump = () => useStore.setState(s => ({ handCheckRev: s.handCheckRev + 1 }))
  const cmd = {
    description: `Confirm hands in a passage (${shown.length} notes)`,
    apply() {
      for (const n of shown) n.handConfidence = 1
      for (const n of edited) { n.handConfidence = 1; n.handSource = 'manual' }
      bump()
    },
    revert() {
      shown.forEach((n, i) => { n.handConfidence = before.shown[i] })
      edited.forEach((n, i) => { n.handConfidence = before.edited[i].c; n.handSource = before.edited[i].s })
      bump()
    },
  }
  cmd.apply()
  if (NES.editMidi) {
    NES.history.push(cmd)
    NES.dirty = true
    NES.onHistoryChange?.()
  }
  // the list is one shorter, so the same number is now the next passage
  if (passagesOf(hc.track).length === 0) {
    const prepared = preparing === hc.track
    endHandCheck()
    if (prepared) useStore.setState({ handCheckDone: true })
  }
  else goToPassage(hc.track, Math.min(hc.index, passagesOf(hc.track).length - 1))
}

/** "Fix by hand": stop; the passage stays looped and marked, the HANDS section says how to fix it */
export function fixPassageByHand(): void {
  const s = useStore.getState()
  if (!s.handCheck) return
  useStore.setState({ handCheck: { ...s.handCheck, panel: false }, ...(s.playbackState === 'playing' ? { playbackState: 'paused' as const } : {}) })
}

// A new or reloaded song ends the check: its loop was cleared with it, so
// nothing to put back. Closing the Note Editor ends it with your loop back.
useStore.subscribe((s, prev) => {
  if (s.midi !== prev.midi && (s.handCheck || savedLoop || s.handCheckDone || preparing !== null)) {
    savedLoop = null; preparing = null; useStore.setState({ handCheck: null, handCheckDone: false }); return
  }
  if (prev.noteEditorActive && !s.noteEditorActive) {
    endHandCheck()
    preparing = null
    if (s.handCheckDone) useStore.setState({ handCheckDone: false })
  }
})

/** Done: your own loop back */
export function endHandCheck(): void {
  const s = useStore.getState()
  if (!s.handCheck && !savedLoop) return
  const back = savedLoop ?? { loopStart: null, loopEnd: null, loopRegionActive: false }
  savedLoop = null
  preparing = null
  useStore.setState({ ...back, handCheck: null })
}
