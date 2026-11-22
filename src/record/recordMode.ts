import { create } from 'zustand'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { SongTake, songTakeToMidi } from './songTake'
import { useBlank, setBlankSetup, startBlank, stopBlank, BLANK_DEFAULT, type BlankSetup } from './blank'

// ── Recording in practice mode (after 2.0) ───────────────────────────────────
// The footer's REC button: three ways to record, and the switches for them.
//   Over the song: you record your own piano part over the arrangement. Press
//     Record and the song plays from its start, after a count-in (a loop is
//     set aside while you record); what you play is placed where you heard it
//     (at any tempo, in any key). Pause pauses the song and the recording;
//     Play goes on after a count-in, from the start of that bar (what you
//     played from there is played again). Stop (the red square) or the song's end
//     ends the take. Then Keep or Discard: kept, a new version of the song has your
//     playing as its piano part, for the hand(s) you played (songTake.ts).
//     Your song stays open.
//   Overdub: the same over the loop's bars only (punch in, punch out). The song
//     starts a bar or two before them (the run-up, after the count-in); only
//     what you play between the punch points is recorded, and kept it replaces
//     the piano part there; the rest of the song stays as it is. The song plays
//     on after the punch-out until you Stop.
//   Blank page: just you (and a click if you like), no song; kept, the take
//     saves as a new song in Library › Orfeo › Recordings (record/blank.ts).
// Your choices are remembered (prefs recordChoices).

export type RecordMode = 'song' | 'overdub' | 'blank'
export type SongPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'asking' | 'saving'

interface RecordState {
  mode: RecordMode
  songPhase: SongPhase
  notes: number
  message: string
  lastSaved: string | null   // the take you kept last (its file)
  asking: boolean            // Keep or Discard? on screen
  runUpBars: 1 | 2           // Overdub: bars played before the punch-in
  punchNow: 'before' | 'in' | 'after' | null   // Overdub: where the song is against the punch points
}
export const useRecord = create<RecordState>(() => ({ mode: 'song', songPhase: 'idle', notes: 0, message: '', lastSaved: null, asking: false, runUpBars: 1, punchNow: null }))

// ── Your choices, remembered ─────────────────────────────────────────────────
interface Choices extends BlankSetup { mode: RecordMode; runUpBars: 1 | 2 }
let loaded = false
void window.electronAPI?.getPrefs?.().then((p: any) => {
  const c = p?.recordChoices
  if (c && typeof c === 'object') {
    if (c.mode === 'song' || c.mode === 'overdub' || c.mode === 'blank') useRecord.setState({ mode: c.mode })
    if (c.runUpBars === 1 || c.runUpBars === 2) useRecord.setState({ runUpBars: c.runUpBars })
    const { mode: _m, runUpBars: _r, ...setup } = c
    setBlankSetup({ ...BLANK_DEFAULT, ...setup })
  }
  loaded = true
}).catch(() => { loaded = true })
let saved = ''
function remember(): void {
  if (!loaded) return
  const c: Choices = { mode: useRecord.getState().mode, runUpBars: useRecord.getState().runUpBars, ...useBlank.getState().setup }
  const json = JSON.stringify(c)
  if (json === saved) return
  saved = json
  window.electronAPI?.setPrefs?.({ recordChoices: c })?.catch?.(() => {})
}
useRecord.subscribe((s, p) => { if (s.mode !== p.mode || s.runUpBars !== p.runUpBars) remember() })
useBlank.subscribe((s, p) => { if (s.setup !== p.setup) remember() })

export function setRecordMode(mode: RecordMode): void { useRecord.setState({ mode, message: '' }) }
export function setRunUpBars(n: 1 | 2): void { useRecord.setState({ runUpBars: n }) }

/** Overdub's punch points: the loop's (Alt + drag on the piano roll), or null */
export function punchRange(): { from: number; to: number } | null {
  const s = useStore.getState()
  return s.loopStart !== null && s.loopEnd !== null && s.loopEnd > s.loopStart ? { from: s.loopStart, to: s.loopEnd } : null
}
/** The bars of a range, as the player counts them (bar 1 first) */
export function barsOf(r: { from: number; to: number }): { a: number; b: number } {
  const bars = useStore.getState().barStarts
  const barAt = (t: number) => { let i = 0; while (i + 1 < bars.length && bars[i + 1] <= t + 1e-6) i++; return i + 1 }
  const a = barAt(r.from)
  return { a, b: Math.max(a, barAt(r.to - 0.01)) }
}

/** Recording (or counting in, or saving), whichever way */
export function recordBusy(): boolean {
  return useRecord.getState().songPhase !== 'idle' || useBlank.getState().phase !== 'idle' && useBlank.getState().phase !== 'setup'
}

// ── Start and stop, whichever way is chosen ──────────────────────────────────
export async function startRecord(): Promise<void> {
  if (recordBusy()) return
  useRecord.setState({ message: '' })
  if (useRecord.getState().mode === 'blank') {
    const { practiceTransport } = await import('../practice/transport')
    if (useStore.getState().playbackState === 'playing') practiceTransport()?.pause()
    useBlank.setState({ phase: 'setup', message: '' })
    await startBlank()
  } else if (useRecord.getState().mode === 'overdub') {
    const r = punchRange()
    if (!r) { useRecord.setState({ message: t`Set a loop around the bars to record first: Alt + drag on the piano roll.` }); return }
    await startSongTake(r)
  } else await startSongTake(null)
}

/** Stop and keep the take (or throw it away) */
export async function stopRecord(keep = true): Promise<void> {
  const b = useBlank.getState().phase
  if (b === 'counting' || b === 'recording') { await stopBlank(keep); return }
  const p = useRecord.getState().songPhase
  if (p === 'starting' || p === 'recording' || p === 'paused') await finishSongTake(keep)
}

// ── Over the song ────────────────────────────────────────────────────────────
let take: SongTake | null = null
let hand: 'L' | 'R' | 'B' = 'B'
let punch: { from: number; to: number } | null = null
let lastT = 0
let loopWas: boolean | null = null   // the loop, set aside while you record
let unsubs: (() => void)[] = []

async function startSongTake(range: { from: number; to: number } | null): Promise<void> {
  const s = useStore.getState()
  if (!s.midi || take) return
  const { onPlayedKey, onPlayedControl } = await import('../hooks/useMidiInput')
  const { heardSongTime, useWaiting } = await import('../practice/listen')
  const { practisedHand } = await import('../practice/practiceMode')
  const { practiceTransport } = await import('../practice/transport')
  hand = practisedHand()
  punch = range
  useRecord.setState({ songPhase: 'starting', notes: 0, message: '', punchNow: range ? 'before' : null })
  // your part, from the song's start (Overdub: from the run-up): the loop waits until you're done
  if (s.playbackState === 'playing') {
    practiceTransport()?.pause()
    for (let i = 0; i < 20 && useStore.getState().playbackState === 'playing'; i++) await new Promise(r => setTimeout(r, 50))
  }
  loopWas = s.loopRegionActive
  if (s.loopRegionActive) s.setLoopRegionActive(false)
  // a count-in every time the song starts or goes on, while you record
  const { forceCountIn } = await import('../utils/countInRunner')
  forceCountIn(true)
  take = new SongTake(0)
  lastT = 0
  // the song waiting for your notes is still the song playing, to you
  const live = () => useStore.getState().playbackState === 'playing' || useWaiting.getState().holding
  const shift = () => useStore.getState().detectedKey?.transpose ?? 0
  unsubs = [
    // keys only while the song plays (not paused, not counting in); a key let go is always heard
    onPlayedKey(k => {
      if (!take || (k.on && !live())) return
      const at = heardSongTime(k.at)
      // Overdub: a key pressed outside the punch points isn't recorded (you hear it, as always)
      if (k.on && punch && (at < punch.from || at >= punch.to)) return
      take.key(k.note - shift(), k.vel, k.on, at)
      lastT = Math.max(lastT, at)
      if (k.on) useRecord.setState({ notes: take.noteCount })
    }),
    onPlayedControl(c => { if (take && live()) take.pedal(c.cc, c.value, heardSongTime(c.at)) }),
    // Overdub: where the song is against the punch points, for the REC button
    useStore.subscribe(st => {
      if (!punch) return
      const now = st.currentTime < punch.from ? 'before' : st.currentTime < punch.to ? 'in' : 'after'
      if (useRecord.getState().punchNow !== now) useRecord.setState({ punchNow: now })
    }),
    useStore.subscribe((st, prev) => {
      const phase = useRecord.getState().songPhase
      if (st.playbackState === 'playing') {
        lastT = Math.max(lastT, heardSongTime())
        // going on after a pause, from the start of the bar (the count-in's): played again from there
        if (phase === 'paused') { take?.rewindTo(st.currentTime); lastT = st.currentTime; useRecord.setState({ notes: take?.noteCount ?? 0 }) }
        if (phase === 'starting' || phase === 'paused') useRecord.setState({ songPhase: 'recording' })
      }
      if (prev.playbackState === 'playing' && st.playbackState !== 'playing' && phase === 'recording') {
        setTimeout(() => {
          if (!take || live()) return
          const now = useStore.getState()
          // the song's end ends the take; Pause only pauses it
          const atEnd = now.playbackState === 'stopped' && !!now.midi && now.currentTime >= now.midi.duration - 0.05
          if (atEnd) void finishSongTake(true)
          else useRecord.setState({ songPhase: 'paused' })
        }, 0)
      }
    }),
    // Pause while the song waits for you: paused too
    useWaiting.subscribe((w, prev) => {
      if (prev.holding && !w.holding && useStore.getState().playbackState !== 'playing' && take && useRecord.getState().songPhase === 'recording') useRecord.setState({ songPhase: 'paused' })
    }),
  ]
  // Overdub: the run-up, a bar or two before the punch-in
  let from = 0
  if (range) {
    const bars = s.barStarts
    let i = 0
    while (i + 1 < bars.length && bars[i + 1] <= range.from + 1e-6) i++
    from = bars[Math.max(0, i - useRecord.getState().runUpBars)] ?? 0
  }
  practiceTransport()?.seek(from)
  practiceTransport()?.play()
}

async function finishSongTake(keep: boolean): Promise<void> {
  if (!take) return
  for (const u of unsubs) u()
  unsubs = []
  const end = lastT
  const events = take.stop(end)
  take = null
  const range = punch
  punch = null
  useRecord.setState({ punchNow: null })
  const { practiceTransport } = await import('../practice/transport')
  if (useStore.getState().playbackState === 'playing') practiceTransport()?.pause()
  if (loopWas) useStore.getState().setLoopRegionActive(true)
  loopWas = null
  const { forceCountIn } = await import('../utils/countInRunner')
  forceCountIn(false)
  if (!keep || !events.some(e => e.type === 'on')) {
    useRecord.setState({ songPhase: 'idle', message: keep ? t`Nothing was played, so nothing was kept.` : '' })
    return
  }
  const s = useStore.getState()
  const m = s.midi
  // the song's own piano part, by hand (one piano track for one hand: that hand)
  const parts: { L?: number; R?: number } = {}
  for (const tr of s.tracks) if (tr.practicePart && tr.practiceHand) parts[tr.practiceHand] = tr.index
  const { usePractice } = await import('../practice/practiceMode')
  const played = usePractice.getState().onlyHand ?? hand
  useRecord.setState({ songPhase: 'asking' })
  const bars = range ? barsOf(range) : null
  const kept = await askKeep(bars ? (
      (played === 'L' ? t`Keep: a new version of the song, with your playing in place of its left hand` : played === 'R' ? t`Keep: a new version of the song, with your playing in place of its right hand` : t`Keep: a new version of the song, with your playing in place of its piano part`)
      + ' ' + (bars.a === bars.b ? t`in bar ${bars.a}.` : t`in bars ${bars.a} to ${bars.b}.`) + ' ' + t`The rest of the song stays as it is, and so does the song you're practising.`)
    : played === 'L' ? t`Keep: a new version of the song, with your playing as its left hand. The song you're practising stays as it is.`
    : played === 'R' ? t`Keep: a new version of the song, with your playing as its right hand. The song you're practising stays as it is.`
    : t`Keep: a new version of the song, with your playing as its piano part. The song you're practising stays as it is.`)
  if (!kept) { useRecord.setState({ songPhase: 'idle', message: t`Your take was thrown away.` }); return }
  useRecord.setState({ songPhase: 'saving' })
  try {
    const filePath = (m as any)?._filePath as string | undefined
    const origRaw = m?._origRaw ?? m?._raw
    if (!m || !filePath || !origRaw) throw new Error(t`The song isn't a file Orfeo can save next to.`)
    const { bytes, replaced } = songTakeToMidi(events, {
      origRaw, playedRaw: m._leadTick ? m._raw : null, leadTick: m._leadTick ?? 0,
      transpose: 0,   // your keys were taken back to the file's key as you played
      parts, hand: played, splitKey: useBlank.getState().setup.splitKey, end,
      punch: range ?? undefined,
    })
    if (!replaced.length) throw new Error(t`None of what you played was for the hand you're practising.`)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const r = await window.electronAPI.saveNoteEditor({ filePath, base64: btoa(bin), summary: bars ? `Overdub, bars ${bars.a}-${bars.b}` : 'Recorded my piano part', newVersion: true })
    if (!r.ok || !r.filePath) throw new Error(r.message ?? t`Save failed`)
    void useStore.getState().notifyLibrarySaved(r.filePath)
    useRecord.setState({ songPhase: 'idle', lastSaved: r.filePath, message: t`Saved: ${r.fileName ?? r.filePath}` })
  } catch (e) {
    useRecord.setState({ songPhase: 'idle', message: t`The take couldn't be saved: ${String((e as Error)?.message ?? e)}` })
  }
}

/** After a take: keep it or throw it away. Escape keeps it (a take is never lost by accident). */
export async function askKeep(detail: string): Promise<boolean> {
  const { confirmDialog } = await import('../utils/confirmController')
  useRecord.setState({ asking: true })
  const choice = await confirmDialog({ message: t`Keep your take?`, detail, buttons: [t`Discard`, t`Keep`], destructiveIndex: 0 })
  useRecord.setState({ asking: false })
  return choice === 1
}

/** The take you kept last: open it (leaving practice mode) */
export async function openLastTake(): Promise<void> {
  const path = useRecord.getState().lastSaved
  if (!path) return
  const { leavePractice } = await import('../practice/practiceMode')
  const { openSongPath } = await import('../utils/queueControl')
  leavePractice()
  await openSongPath(path)
}
