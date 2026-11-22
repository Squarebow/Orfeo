import { create } from 'zustand'
import { Take, type Recording } from './recorder'
import { recordingToMidi } from './recordingToMidi'
import { startClick, quarterBpm, barSec, type Meter, type ClickRun } from './click'
import { takeBaseName } from '../export/exporters'
import { t } from '../utils/i18n'

// ── Blank mode: solo piano on a blank canvas (after 2.0) ─────────────────────
// Choose the time signature, With click or Free, one track or two hands, then
// a bar or two of count-in and play. The click is heard, never recorded; the
// pedal is. On Stop the take saves by itself (Orfeo/Recordings), the silence
// before the first bar with notes goes, it opens like any song, and Orfeo
// offers to play it from the start.
//   With click: the tempo is set first, so the bars are exact.
//   Free: no click; the file gets 120 BPM in 4/4 for now, and the tempo is
//   worked out afterwards (Rebuild tempo), as the plan says.

export interface BlankSetup {
  meter: Meter
  bpm: number                 // in the time signature's own beat (6/8: eighths)
  withClick: boolean
  countInBars: number         // 0–2
  hands: 'one' | 'two'
  splitKey: number            // two hands: below it left, from it up right
}
export type BlankPhase = 'idle' | 'setup' | 'counting' | 'recording' | 'saving'

interface BlankState {
  phase: BlankPhase
  setup: BlankSetup
  bar: number                 // the bar you're in (count-in: negative)
  beat: number
  notes: number
  message: string             // after a take: where it went, or why nothing was kept
}

export const BLANK_DEFAULT: BlankSetup = { meter: { beats: 4, unit: 4 }, bpm: 90, withClick: true, countInBars: 1, hands: 'two', splitKey: 60 }

export const useBlank = create<BlankState>(() => ({ phase: 'idle', setup: BLANK_DEFAULT, bar: 0, beat: 0, notes: 0, message: '' }))

let take: Take | null = null
let click: ClickRun | null = null
let unsubs: (() => void)[] = []

export function openBlankSetup(): void { if (useBlank.getState().phase === 'idle') useBlank.setState({ phase: 'setup', message: '' }) }
export function closeBlankSetup(): void { if (useBlank.getState().phase === 'setup') useBlank.setState({ phase: 'idle' }) }
export function setBlankSetup(p: Partial<BlankSetup>): void { useBlank.setState(s => ({ setup: { ...s.setup, ...p } })) }

export async function startBlank(): Promise<void> {
  const st = useBlank.getState()
  if (st.phase !== 'setup') return
  const s = st.setup
  const { onPlayedKey, onPlayedControl } = await import('../hooks/useMidiInput')
  if (s.withClick) {
    useBlank.setState({ phase: 'counting', bar: -s.countInBars, beat: 1, notes: 0 })
    click = await startClick(s.bpm, s.meter, s.countInBars, b => useBlank.setState({ bar: b.bar, beat: b.beat, phase: b.countIn ? 'counting' : useBlank.getState().phase === 'saving' ? 'saving' : 'recording' }))
    take = new Take(click.startMs, { bpm: quarterBpm(s.bpm, s.meter), timeSig: [s.meter.beats, s.meter.unit] })
  } else {
    useBlank.setState({ phase: 'recording', bar: 0, beat: 0, notes: 0 })
    take = new Take(performance.now(), { bpm: 120, timeSig: [4, 4] })
  }
  unsubs = [
    onPlayedKey(k => { take?.key(k.note, k.vel, k.on, k.at); if (k.on) useBlank.setState({ notes: take?.noteCount ?? 0 }) }),
    onPlayedControl(c => take?.pedal(c.cc, c.value, c.at)),
  ]
}

/** Stop and keep the take (or throw it away) */
export async function stopBlank(keep = true): Promise<string | null> {
  const st = useBlank.getState()
  if (!take || (st.phase !== 'counting' && st.phase !== 'recording')) return null
  click?.stop(); click = null
  for (const u of unsubs) u()
  unsubs = []
  const rec = take.stop(performance.now())
  take = null
  if (!keep || !rec.events.some(e => e.type === 'on')) {
    useBlank.setState({ phase: 'idle', message: keep ? t`Nothing was played, so nothing was kept.` : '' })
    return null
  }
  // in practice mode: keep or throw away first, and the song you're practising stays open
  const { usePractice } = await import('../practice/practiceMode')
  const inPractice = usePractice.getState().active
  useBlank.setState({ phase: 'saving' })
  if (inPractice) {
    const { askKeep } = await import('./recordMode')
    if (!(await askKeep(t`Keep: saved as a new song in your Library's Orfeo › Recordings folder.`))) {
      useBlank.setState({ phase: 'idle', message: t`Your take was thrown away.` })
      return null
    }
  }
  try {
    const path = await saveTake(rec, st.setup, !inPractice)
    useBlank.setState({ phase: 'idle', message: inPractice ? t`Saved: ${path.split(/[\\/]/).pop()}` : t`Saved and opened: ${path}` })
    if (inPractice) { const { useRecord } = await import('./recordMode'); useRecord.setState({ lastSaved: path }) }
    else void offerToListen()
    return path
  } catch (e) {
    useBlank.setState({ phase: 'idle', message: t`The take couldn't be saved: ${String((e as Error)?.message ?? e)}` })
    return null
  }
}

/** The take as a MIDI file in Orfeo/Recordings, opened like any song */
export async function saveTake(rec: Recording, s: BlankSetup, open = true): Promise<string> {
  const { useStore } = await import('../store')
  const name = takeBaseName(null, rec.startedAt)
  const bytes = recordingToMidi(rec, {
    name, trimStart: true,
    splitKey: s.hands === 'two' ? s.splitKey : undefined,
    barSec: s.withClick ? barSec(s.bpm, s.meter) : undefined,
  })
  const lib = ((useStore.getState() as any).libraryFolder as string | null) ?? null
  return window.electronAPI.recordSaveTake({ fileName: `${name}.mid`, libraryFolder: lib, bytes, open })
}

async function offerToListen(): Promise<void> {
  const { confirmDialog } = await import('../utils/confirmController')
  const { useStore } = await import('../store')
  // wait for the take to open
  for (let i = 0; i < 40 && !/^Recording /.test(useStore.getState().midi?.fileName ?? ''); i++) await new Promise(r => setTimeout(r, 100))
  const choice = await confirmDialog({
    message: t`Your take is saved. Listen to it from the first bar?`,
    detail: t`It's in your Library's Orfeo › Recordings folder, open like any song.`,
    buttons: [t`Listen`, t`Not now`],
  })
  if (choice === 0) window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
}
