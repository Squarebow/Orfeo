import { useEffect, useState } from 'react'
import { BookOpen, PanelLeftClose, Hand, Activity, Expand, StepForward, Sparkles, MessageSquareText } from 'lucide-react'
import { useStore } from '../../../store'
import { Switch, InlineIcon, OptionBtn } from '../controls'
import { useDevPractice, pluggedSim, type PianistStyle } from '../../../practice/devPlay'
import { useMidiSettings } from '../../../store/midiSettings'
import type { SettingDef } from '../types'
import { t } from '../../../utils/i18n'
import { PRACTICE_VISIBLE } from '../../../practice/practiceMode'
import { currentSession, showCardFor, useSession } from '../../../practice/session'
import { loadHistory, forgetHistory, allTakes, type SongHistory } from '../../../practice/history'
import type { TakeRecord } from '../../../practice/take'
import { takesCsv } from '../../../practice/words'

const PrompterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
)

// ── Dev Tools for practice mode (cards in defs/devtools.tsx). Dev-only words,
// not translated. Everything plays through a simulated keyboard. ──
const devBox: React.CSSProperties = { marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', display: 'grid', rowGap: 6 }
const devHead: React.CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }
function NeedsSim() {
  useMidiSettings(s => s.devices)
  return pluggedSim() ? null : <div style={{ color: 'var(--text-amber)' }}>Plug in a simulated keyboard first (Simulated keyboards, above).</div>
}

export function PracticeKeysPanel() {
  const { keysPlay, octave } = useDevPractice()
  return (
    <div style={devBox}>
      <div style={devHead}>Play without a keyboard · practice mode · session only</div>
      <Switch value={keysPlay} onChange={v => useDevPractice.setState({ keysPlay: v })} label="Clicks and computer keys play" />
      <div>In practice mode, clicking the on-screen keys and the computer keys play the simulated keyboard, so Orfeo hears them as your playing.</div>
      <div style={{ fontFamily: 'var(--font-mono)' }}>Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P = C{octave} up<br />Z S X D C V G B H N J M , L . = C{octave - 1} up<br />[ and ] = an octave down / up</div>
      <NeedsSim />
    </div>
  )
}

const STYLES: { v: PianistStyle; label: string }[] = [
  { v: 'off', label: 'Off' }, { v: 'spot', label: 'Spot on' }, { v: 'early', label: 'Early' }, { v: 'late', label: 'Late' },
  { v: 'wrong', label: 'Wrong notes' }, { v: 'missed', label: 'Missed notes' }, { v: 'hesitate', label: 'Hesitating' },
  { v: 'rolled', label: 'Rolled chords' }, { v: 'oneHand', label: 'Right hand only' },
]
export function PianistPanel() {
  const style = useDevPractice(s => s.pianist)
  return (
    <div style={devBox}>
      <div style={devHead}>Virtual pianist · practice mode · session only</div>
      <div>While practice mode plays, the pianist plays your part on the simulated keyboard, the way you choose. Early and late are 80 ms; wrong and missed, about one note in seven; hesitating stops 0.6 s before every sixth step.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {STYLES.map(x => <OptionBtn key={x.v} active={style === x.v} onClick={() => useDevPractice.setState({ pianist: x.v })}>{x.label}</OptionBtn>)}
      </div>
      <NeedsSim />
    </div>
  )
}

export function ListenTestPanel() {
  const on = useDevPractice(s => s.listenPanel)
  return (
    <div style={devBox}>
      <div style={devHead}>Orfeo listens · session only</div>
      <Switch value={on} onChange={v => useDevPractice.setState({ listenPanel: v })} label="Show the listening panel" />
      <div>In practice mode, a panel top right lists what Orfeo heard while the song plays: right, missed and extra notes, per hand, how early or late, and the last notes one by one.</div>
    </div>
  )
}

// Made-up takes, to read the words without playing
function sample(kind: string): { take: TakeRecord; opts: Parameters<typeof showCardFor>[1] } {
  const bars = (rows: number[][]) => rows.map(r => r as TakeRecord['bars'][number])
  const base: TakeRecord = {
    at: Date.now(), way: 'practise', hand: 'R', level: 1, wait: false, ramp: false, speed: 100, from: 0, to: 16, fromBar: 1, toBar: 8,
    end: 'pause', realSec: 16, overTempo: 1, counts: { hit: 32, missed: 0, extra: 0 }, L: { hit: 0, missed: 0, extra: 0 }, R: { hit: 32, missed: 0, extra: 0 },
    bars: bars([1, 2, 3, 4, 5, 6, 7, 8].map(b => [b, 4, 0, 0, 0, 0])), timing: { mean: 4, spread: 25, n: 32 }, waits: 0, waitSec: 0,
  }
  if (kind === 'rough') return { take: { ...base, counts: { hit: 22, missed: 10, extra: 4 }, R: { hit: 22, missed: 10, extra: 4 }, timing: { mean: -38, spread: 70, n: 22 },
    bars: bars([[1, 4, 0, 0, 0, 0], [2, 4, 0, 0, 0, 0], [3, 2, 2, 0, 0, 0], [4, 4, 0, 0, 0, 0], [5, 1, 3, 2, 0, 0], [6, 1, 3, 2, 0, 0], [7, 2, 2, 0, 0, 0], [8, 4, 0, 0, 0, 0]]) }, opts: {} }
  if (kind === 'hands') return { take: { ...base, hand: 'B', counts: { hit: 52, missed: 12, extra: 1 }, L: { hit: 20, missed: 12, extra: 1 }, R: { hit: 32, missed: 0, extra: 0 },
    bars: bars([1, 2, 3, 4, 5, 6, 7, 8].map(b => [b, 6, b === 6 || b === 7 ? 5 : 0, b === 7 ? 1 : 0, 0, 0])), timing: { mean: 10, spread: 95, n: 52 } }, opts: { metronome: true } }
  if (kind === 'wait') return { take: { ...base, way: 'wait', hand: 'B', wait: true, realSec: 22, overTempo: 1.38, counts: { hit: 64, missed: 0, extra: 3 },
    bars: bars([1, 2, 3, 4, 5, 6, 7, 8].map(b => [b, 8, 0, b === 5 ? 3 : 0, b === 5 ? 2 : b === 2 ? 1 : 0, b === 5 ? 4.5 : b === 2 ? 0.8 : 0])), waits: 3, waitSec: 5.3, timing: { mean: 0, spread: 0, n: 0 } },
    opts: { earlier: [{ ...base, way: 'wait', hand: 'B', wait: true, overTempo: 1.9, waits: 9, at: 0 }] } }
  const round = (clean: boolean): TakeRecord => ({ ...base, end: 'loop', ramp: true, speed: 65, from: 4, to: 12, fromBar: 3, toBar: 6, bars: bars([3, 4, 5, 6].map(b => [b, 4, clean ? 0 : 1, 0, 0, 0])) })
  return { take: round(true), opts: { session: [round(false), round(true), round(true)], rampedTo: 70 } }
}

function HistoryNumbers() {
  useSession(s => s.card)
  const { song, session } = currentSession()
  const [h, setH] = useState<SongHistory | null>(null)
  useEffect(() => { let live = true; if (song) loadHistory(song).then(x => { if (live) setH(x) }); return () => { live = false } }, [song])
  if (!song) return <div>No song open in practice mode (or the song has no place in the Library): nothing is kept.</div>
  const takes = allTakes(h)
  const last = session?.takes[session.takes.length - 1]
  return (
    <>
      <div>{song.replace(/\\/g, '/').split('/').pop()}: {h?.sessions.length ?? 0} sessions, {takes.length} takes kept · this session {session?.takes.length ?? 0}</div>
      {last && <div style={{ fontFamily: 'var(--font-mono)' }}>last: bars {last.fromBar}–{last.toBar} · right {last.counts.hit} missed {last.counts.missed} extra {last.counts.extra} · {last.timing.n ? `${last.timing.mean} ms ±${last.timing.spread}` : `waited ${last.waits}× ${last.waitSec} s`} · {last.overTempo}× tempo · ended by {last.end}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {last && <OptionBtn active={false} onClick={() => showCardFor(last, { earlier: takes.filter(k => k !== last) })}>Show the words for the last take</OptionBtn>}
        <OptionBtn active={false} onClick={() => { void window.electronAPI?.practiceSaveCsv?.('practice.csv', takesCsv(takes)) }}>Save as CSV</OptionBtn>
        <OptionBtn active={false} onClick={async () => { await forgetHistory(song); setH({ ...(await loadHistory(song)) }) }}>Forget this song's practice</OptionBtn>
      </div>
    </>
  )
}

export function PracticeHistoryPanel() {
  return (
    <div style={devBox}>
      <div style={devHead}>How it went · practice history</div>
      <div>Every take's numbers are kept per song in Orfeo's data folder (practice/), never in the file. After you stop, a card says how it went. Try the words without playing (go into practice mode, then close Settings to see the card):</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {[['good', 'All right'], ['rough', 'A rough go'], ['hands', 'One hand weaker'], ['wait', 'Wait for me'], ['rounds', 'Loop rounds + speed up']].map(([k, label]) => (
          <OptionBtn key={k} active={false} onClick={() => { const s = sample(k); showCardFor(s.take, s.opts) }}>{label}</OptionBtn>
        ))}
      </div>
      <HistoryNumbers />
    </div>
  )
}

export const PRACTICE_DEFS: SettingDef[] = [
  {
    // dev mode and test builds only until 2.0
    id: 'practiceMode', icon: Sparkles, kind: 'switch', useVisible: () => PRACTICE_VISIBLE,
    Control: () => { const v = useStore(s => s.practiceModeEnabled); return <Switch value={v} onChange={useStore.getState().setPracticeModeEnabled} label={t`Practice mode`} /> },
  },
  {
    id: 'practiceSummary', icon: MessageSquareText, kind: 'switch', useVisible: () => PRACTICE_VISIBLE,
    Control: () => { const v = useStore(s => s.practiceSummaryEnabled); return <Switch value={v} onChange={useStore.getState().setPracticeSummaryEnabled} label={t`How it went`} /> },
  },
  {
    id: 'stepThrough', icon: StepForward, kind: 'switch',
    Control: () => { const v = useStore(s => s.stepThroughEnabled); return <Switch value={v} onChange={useStore.getState().setStepThroughEnabled} label={t`Step Through`} /> },
    Description: () => {
      const arrow = (a: string) => <span style={{ color: 'var(--text-amber)', fontStyle: 'normal' }}>{a}</span>
      return <>{t`Each press of`} {arrow('←')} {t`or`} {arrow('→')} {t`(or the arrows in the keyboard bar) steps back or forward to the next note or chord, plays it, lights it and moves the playhead there. Shift jumps a whole bar.`}</>
    },
  },
  {
    id: 'chordPrompter', icon: BookOpen, kind: 'switch',
    Control: () => { const v = useStore(s => s.chordPrompterEnabled); return <Switch value={v} onChange={useStore.getState().setChordPrompterEnabled} label={t`Chord Prompter`} /> },
    Description: () => <>{t`Shows past, current and upcoming chords during playback. Click`} <InlineIcon><PrompterIcon /></InlineIcon> {t`icon above keyboard to enable it.`}</>,
  },
  {
    id: 'closePanels', icon: PanelLeftClose, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoCollapseDrawers); return <Switch value={v} onChange={useStore.getState().setAutoCollapseDrawers} label={t`Close panels on playback`} /> },
    Description: () => <>{t`Automatically hide side panels during playback to maximize the piano roll view. For full-screen view click`} <InlineIcon><Expand size={10} /></InlineIcon> {t`to enter presentation mode.`}</>,
  },
  {
    id: 'handTags', icon: Hand, kind: 'switch',
    Control: () => { const v = useStore(s => s.showHandLetters); return <Switch value={v} onChange={useStore.getState().setShowHandLetters} label={t`Hand tags`} /> },
  },
  {
    id: 'trackVu', icon: Activity, kind: 'switch',
    Control: () => { const v = useStore(s => s.trackVuColorEnabled); return <Switch value={v} onChange={useStore.getState().setTrackVuColorEnabled} label={t`Track color VU meters`} /> },
  },
]
