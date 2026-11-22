import { create } from 'zustand'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { SongTake, songTakeToMidi } from './songTake'
import { useBlank, setBlankSetup, startBlank, stopBlank, BLANK_DEFAULT, type BlankSetup } from './blank'

// ── Recording in practice mode (after 2.0) ───────────────────────────────────
// The footer's REC button: two ways to record, and the switches for them.
//   Over the song: you record your own piano part over the arrangement. Press
//     Record and the song plays from its start (a loop is set aside while you
//     record); what you play is placed where you heard it (at any tempo, in any
//     key). The take ends when you stop or pause, at the song's end, or on a
//     jump. Then Keep or Discard: kept, a new version of the song has your
//     playing as its piano part, for the hand(s) you played (songTake.ts).
//     Your song stays open. Recording over a stretch only is Overdub (later).
//   Blank page: just you (and a click if you like), no song; kept, the take
//     saves as a new song in Library › Orfeo › Recordings (record/blank.ts).
// Your choices are remembered (prefs recordChoices).

export type RecordMode = 'song' | 'blank'
export type SongPhase = 'idle' | 'starting' | 'recording' | 'asking' | 'saving'

interface RecordState {
  mode: RecordMode
  songPhase: SongPhase
  notes: number
  message: string
  lastSaved: string | null   // the take you kept last (its file)
  asking: boolean            // Keep or Discard? on screen
}
export const useRecord = create<RecordState>(() => ({ mode: 'song', songPhase: 'idle', notes: 0, message: '', lastSaved: null, asking: false }))

// ── Your choices, remembered ─────────────────────────────────────────────────
interface Choices extends BlankSetup { mode: RecordMode }
let loaded = false
void window.electronAPI?.getPrefs?.().then((p: any) => {
  const c = p?.recordChoices
  if (c && typeof c === 'object') {
    if (c.mode === 'song' || c.mode === 'blank') useRecord.setState({ mode: c.mode })
    const { mode: _m, ...setup } = c
    setBlankSetup({ ...BLANK_DEFAULT, ...setup })
  }
  loaded = true
}).catch(() => { loaded = true })
let saved = ''
function remember(): void {
  if (!loaded) return
  const c: Choices = { mode: useRecord.getState().mode, ...useBlank.getState().setup }
  const json = JSON.stringify(c)
  if (json === saved) return
  saved = json
  window.electronAPI?.setPrefs?.({ recordChoices: c })?.catch?.(() => {})
}
useRecord.subscribe((s, p) => { if (s.mode !== p.mode) remember() })
useBlank.subscribe((s, p) => { if (s.setup !== p.setup) remember() })

export function setRecordMode(mode: RecordMode): void { useRecord.setState({ mode, message: '' }) }

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
  } else await startSongTake()
}

/** Stop and keep the take (or throw it away) */
export async function stopRecord(keep = true): Promise<void> {
  const b = useBlank.getState().phase
  if (b === 'counting' || b === 'recording') { await stopBlank(keep); return }
  if (useRecord.getState().songPhase === 'starting' || useRecord.getState().songPhase === 'recording') await finishSongTake(keep)
}

// ── Over the song ────────────────────────────────────────────────────────────
let take: SongTake | null = null
let hand: 'L' | 'R' | 'B' = 'B'
let lastT = 0
let loopWas: boolean | null = null   // the loop, set aside while you record
let unsubs: (() => void)[] = []

async function startSongTake(): Promise<void> {
  const s = useStore.getState()
  if (!s.midi || take) return
  const { onPlayedKey, onPlayedControl } = await import('../hooks/useMidiInput')
  const { heardSongTime, onSongJump, useWaiting } = await import('../practice/listen')
  const { practisedHand } = await import('../practice/practiceMode')
  const { practiceTransport } = await import('../practice/transport')
  hand = practisedHand()
  useRecord.setState({ songPhase: 'starting', notes: 0, message: '' })
  // your part, from the song's start: the loop waits until you're done
  if (s.playbackState === 'playing') {
    practiceTransport()?.pause()
    for (let i = 0; i < 20 && useStore.getState().playbackState === 'playing'; i++) await new Promise(r => setTimeout(r, 50))
  }
  loopWas = s.loopRegionActive
  if (s.loopRegionActive) s.setLoopRegionActive(false)
  take = new SongTake(0)
  lastT = 0
  // the song waiting for your notes is still the song playing, to you
  const live = () => useStore.getState().playbackState === 'playing' || useWaiting.getState().holding
  const shift = () => useStore.getState().detectedKey?.transpose ?? 0
  unsubs = [
    onPlayedKey(k => {
      if (!take || (k.on && !live())) return
      const at = heardSongTime(k.at)
      take.key(k.note - shift(), k.vel, k.on, at)
      lastT = Math.max(lastT, at)
      if (k.on) useRecord.setState({ notes: take.noteCount })
    }),
    onPlayedControl(c => { if (take && live()) take.pedal(c.cc, c.value, heardSongTime(c.at)) }),
    // a jump: the take is what you played until then
    onSongJump(() => { if (useRecord.getState().songPhase === 'recording') void finishSongTake(true) }),
    useStore.subscribe((st, prev) => {
      if (st.playbackState === 'playing' && useRecord.getState().songPhase === 'starting') useRecord.setState({ songPhase: 'recording' })
      if (st.playbackState === 'playing') lastT = Math.max(lastT, heardSongTime())
      // stopped or paused (not the song waiting for you): the take ends
      if (prev.playbackState === 'playing' && st.playbackState !== 'playing' && useRecord.getState().songPhase === 'recording') setTimeout(() => { if (take && !live()) void finishSongTake(true) }, 0)
    }),
    // Pause while the song waits for you
    useWaiting.subscribe((w, prev) => { if (prev.holding && !w.holding && useStore.getState().playbackState !== 'playing' && take) void finishSongTake(true) }),
  ]
  useRecord.setState({ songPhase: 'starting', notes: 0, message: '' })
  practiceTransport()?.playFrom(0)
}

async function finishSongTake(keep: boolean): Promise<void> {
  if (!take) return
  for (const u of unsubs) u()
  unsubs = []
  const end = lastT
  const events = take.stop(end)
  take = null
  const { practiceTransport } = await import('../practice/transport')
  if (useStore.getState().playbackState === 'playing') practiceTransport()?.pause()
  if (loopWas) useStore.getState().setLoopRegionActive(true)
  loopWas = null
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
  const kept = await askKeep(played === 'L' ? t`Keep: a new version of the song, with your playing as its left hand. The song you're practising stays as it is.`
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
    })
    if (!replaced.length) throw new Error(t`None of what you played was for the hand you're practising.`)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const r = await window.electronAPI.saveNoteEditor({ filePath, base64: btoa(bin), summary: 'Recorded my piano part', newVersion: true })
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
