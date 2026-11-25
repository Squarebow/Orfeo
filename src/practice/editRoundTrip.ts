// ── From practice mode to the Note Editor and back ──────────────────────────
// Practice mode edits nothing; fixing a hand or preparing the song happens in
// the Note Editor. Going there remembers where you were (the bar, and the
// looped bars), and coming back puts you there again, in practice mode: the
// Note Editor's own buttons say *Back to practice* instead of Save & Reload,
// and Split & Save at the end of preparing goes back by itself. Bars, not
// seconds: a save reloads the song, and the bar is what you were practising.
import { create } from 'zustand'
import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { endHandCheck, goToPassage, passagesOf, startPracticePrep } from '../utils/handCheck'
import { rescoreForCheck } from '../utils/practiceReadiness'
import { pianoSet, guessAcrossPiano } from './pianoSet'
import { HAND_ASSIGN_GROUPS } from '../utils/keyboardGroups'

export interface Away {
  /** the bar you were at (0 = the first) */
  bar: number
  /** the bars looped, first and last, or null */
  loop: { from: number; to: number } | null
  /** why you left: fixing hands, or preparing the song */
  why: 'fix' | 'prepare'
  /** the song, without its _ORFEO_vN (a save makes a new version of it) */
  song: string
}
const songStem = (): string => (((useStore.getState().midi as any)?._filePath as string | undefined) ?? '')
  .replace(/\\/g, '/').split('/').pop()!.replace(/\.(mid|midi|kar)$/i, '').replace(/_ORFEO_(v\d+|IMPORTED)$/i, '').toLowerCase()
export const usePracticeAway = create<{ away: Away | null }>(() => ({ away: null }))

const barAt = (time: number): number => {
  const bs = useStore.getState().barStarts
  let i = 0
  while (i + 1 < bs.length && bs[i + 1] <= time + 1e-6) i++
  return i
}
const barTime = (bar: number): number => useStore.getState().barStarts[bar] ?? 0
const barEnd = (bar: number): number => {
  const s = useStore.getState()
  return s.barStarts[bar + 1] ?? s.midi?.duration ?? barTime(bar)
}

/** Remember where practice mode is (call before leaving it for the Note Editor) */
export function rememberPracticePlace(why: Away['why']): void {
  const s = useStore.getState()
  const loop = s.loopRegionActive && s.loopStart !== null && s.loopEnd !== null
    ? { from: barAt(s.loopStart), to: Math.max(barAt(s.loopStart), barAt(s.loopEnd - 0.01)) } : null
  usePracticeAway.setState({ away: { bar: barAt(s.currentTime), loop, why, song: songStem() } })
}

/** Are we in the Note Editor on the way back to practice mode? */
export const awayFromPractice = (): boolean => usePracticeAway.getState().away !== null

/** Open the song's piano in the Note Editor for Prepare for practice (the
 *  same steps as the Playback Editor's button: hands in colour, Orfeo's
 *  guess across the piano, the first unsure passage looped) */
export function openPrepare(track: number): void {
  const s = useStore.getState()
  const set = pianoSet(s.tracks, track)
  s.soloTrackForEdit(track, { also: set })
  const t = s.tracks.find(x => x.index === track)
  if (t && HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum) { NES.reassignHandsMode = true; NES.onReassignHandsModeChange?.() }
  const { rhMaxFingers, lhMaxFingers } = useStore.getState()
  for (const i of set) rescoreForCheck(useStore.getState().midi?.tracks.find(x => x.index === i)?.notes ?? [], { rhMaxFingers, lhMaxFingers })
  guessAcrossPiano(set)
  startPracticePrep(track)
  useStore.getState().setNoteEditorActive(true)
  if (passagesOf(track).length === 0) useStore.setState({ handCheckDone: true })
  else goToPassage(track, 0)
}

/** Close the Note Editor and go back into practice mode, at the bar (and the
 *  loop) you left from. Edits are saved or discarded before this. */
export async function backToPractice(): Promise<void> {
  const away = usePracticeAway.getState().away
  usePracticeAway.setState({ away: null })
  endHandCheck()
  const s = useStore.getState()
  if (s.playbackState === 'playing') useStore.setState({ playbackState: 'paused' })
  s.unsoloTrackForEdit()
  s.setNoteEditorActive(false)
  NES.reset()
  // practice mode, lazily (it imports this module's callers). A song that
  // isn't a lesson yet (preparing not finished) goes on as it is, the way you
  // were trying it: never the Pick a song card nobody asked for (25. 11., the user)
  const { enterPractice, startTrial, usePractice } = await import('./practiceMode')
  if (!enterPractice(true)) return
  if (!usePractice.getState().songReady) startTrial()
  // another song opened meanwhile: it starts where it starts
  if (!away || away.song !== songStem()) return
  useStore.setState({
    currentTime: barTime(away.bar),
    ...(away.loop
      ? { loopStart: barTime(away.loop.from), loopEnd: barEnd(away.loop.to), loopRegionActive: true }
      : { loopRegionActive: false }),
  })
}

/** Leave the round trip without going back (e.g. a different song was opened) */
export function forgetPracticePlace(): void { usePracticeAway.setState({ away: null }) }
