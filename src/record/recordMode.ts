import { create } from 'zustand'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { SongTake, songTakeToMidi } from './songTake'
import { useBlank, setBlankSetup, startBlank, stopBlank, BLANK_DEFAULT, type BlankSetup } from './blank'

// ── Recording in practice mode (after 2.0) ───────────────────────────────────
// The footer's REC button: two ways to record, and the switches for them.
//   Over the song: press Record and the song plays; what you play is placed in
//     the song where you heard it (at any tempo, in any key) and saved, as its
//     own track, in a new version of the song. The song's own piano part for
//     that hand stays in it, muted. The take ends when the song stops or
//     pauses, at its end, when the loop goes round, or on a jump.
//   Blank page: just you (and a click if you like), no song; the take saves
//     as a new song in Library › Orfeo › Recordings (record/blank.ts).
// Your choices are remembered (prefs recordChoices).

export type RecordMode = 'song' | 'blank'
export type SongPhase = 'idle' | 'starting' | 'recording' | 'saving'

interface RecordState {
  mode: RecordMode
  songPhase: SongPhase
  notes: number
  message: string
}
export const useRecord = create<RecordState>(() => ({ mode: 'song', songPhase: 'idle', notes: 0, message: '' }))

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
let unsubs: (() => void)[] = []

async function startSongTake(): Promise<void> {
  const s = useStore.getState()
  if (!s.midi || take) return
  const { onPlayedKey, onPlayedControl } = await import('../hooks/useMidiInput')
  const { heardSongTime, onSongJump, useWaiting } = await import('../practice/listen')
  const { practisedHand } = await import('../practice/practiceMode')
  const { practiceTransport } = await import('../practice/transport')
  hand = practisedHand()
  take = new SongTake(s.currentTime)
  lastT = s.currentTime
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
    // the loop going round, or a jump: the take is what you played until then
    onSongJump(() => { if (useRecord.getState().songPhase === 'recording') void finishSongTake(true) }),
    useStore.subscribe((st, prev) => {
      if (st.playbackState === 'playing' && useRecord.getState().songPhase === 'starting') useRecord.setState({ songPhase: 'recording' })
      if (st.playbackState === 'playing') lastT = Math.max(lastT, heardSongTime())
      // stopped or paused (not the song waiting for you): the take ends
      if (prev.playbackState === 'playing' && st.playbackState !== 'playing') setTimeout(() => { if (take && !live()) void finishSongTake(true) }, 0)
    }),
    // Pause while the song waits for you
    useWaiting.subscribe((w, prev) => { if (prev.holding && !w.holding && useStore.getState().playbackState !== 'playing' && take) void finishSongTake(true) }),
  ]
  useRecord.setState({ songPhase: live() ? 'recording' : 'starting', notes: 0, message: '' })
  if (!live()) practiceTransport()?.play()
}

async function finishSongTake(keep: boolean): Promise<void> {
  if (!take) return
  for (const u of unsubs) u()
  unsubs = []
  const events = take.stop(lastT)
  take = null
  const { practiceTransport } = await import('../practice/transport')
  if (useStore.getState().playbackState === 'playing') practiceTransport()?.pause()
  if (!keep || !events.some(e => e.type === 'on')) {
    useRecord.setState({ songPhase: 'idle', message: keep ? t`Nothing was played, so nothing was kept.` : '' })
    return
  }
  useRecord.setState({ songPhase: 'saving' })
  try {
    const s = useStore.getState()
    const m = s.midi
    const filePath = (m as any)?._filePath as string | undefined
    const origRaw = m?._origRaw ?? m?._raw
    if (!m || !filePath || !origRaw) throw new Error(t`The song isn't a file Orfeo can save next to.`)
    // the song's own piano part for the hand(s) you played
    const parts = s.tracks.filter(tr => tr.practicePart && (hand === 'B' || tr.practiceHand === hand))
    const piano = m.tracks.find(tr => tr.index === parts[0]?.index)
    const setup = useBlank.getState().setup
    const { bytes } = songTakeToMidi(events, {
      origRaw, playedRaw: m._leadTick ? m._raw : null, leadTick: m._leadTick ?? 0,
      hand, splitKey: setup.hands === 'two' ? setup.splitKey : null, baseName: t`My take`,
      program: piano?.program && piano.program >= 0 ? piano.program : 0, pianoChannel: piano?.channel,
      mute: parts.map(p => p.index),
    })
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const r = await window.electronAPI.saveNoteEditor({ filePath, base64: btoa(bin), summary: 'Recorded a take over the song', newVersion: true })
    if (!r.ok || !r.filePath) throw new Error(r.message ?? t`Save failed`)
    void useStore.getState().notifyLibrarySaved(r.filePath)
    useRecord.setState({ songPhase: 'idle', message: t`Saved: ${r.fileName ?? r.filePath}` })
    void offerToOpen(r.filePath, t`Your take is saved, as its own track in a new version of the song.`,
      hand === 'B' ? t`The song's own piano part is in it too, muted. The song you're practising stays as it was.`
        : t`The song's own part for that hand is in it too, muted. The song you're practising stays as it was.`)
  } catch (e) {
    useRecord.setState({ songPhase: 'idle', message: t`The take couldn't be saved: ${String((e as Error)?.message ?? e)}` })
  }
}

/** After a take in practice mode: open it now (leaving practice mode), or go on practising */
export async function offerToOpen(path: string, message: string, detail: string): Promise<void> {
  const { confirmDialog } = await import('../utils/confirmController')
  const choice = await confirmDialog({ message, detail: `${detail}\n${path.split(/[\\/]/).pop()}`, buttons: [t`Open it`, t`Keep practising`] })
  if (choice !== 0) return
  const { leavePractice } = await import('../practice/practiceMode')
  const { openSongPath } = await import('../utils/queueControl')
  leavePractice()
  await openSongPath(path)
}
