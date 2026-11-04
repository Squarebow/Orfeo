import { BookOpen, PanelLeftClose, Hand, Activity, Expand, StepForward, Fingerprint, RefreshCw, Gauge, Repeat } from 'lucide-react'
import { useStore } from '../../../store'
import { Switch, InlineIcon } from '../controls'
import type { SettingDef } from '../types'
import { t } from '../../../utils/i18n'

function NumInput({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>
      {label}
      <input
        type="number" min={min} max={max} value={value}
        onChange={e => { const v = Number(e.target.value); if (v >= min && v <= max) onChange(v) }}
        style={{
          width: 44, padding: '1px 4px', borderRadius: 4, border: '1px solid var(--border)',
          background: 'var(--bg-modal)', color: 'var(--text-default)',
          fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'right',
        }}
      />
      %
    </label>
  )
}

function TempoTrainerControl() {
  const enabled = useStore(s => s.tempoTrainerEnabled)
  const startPct = useStore(s => s.tempoTrainerStartPct)
  const stepPct = useStore(s => s.tempoTrainerStepPct)
  const currentPct = useStore(s => s.tempoTrainerCurrentPct)
  const s = useStore.getState()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Switch value={enabled} onChange={s.setTempoTrainerEnabled} label="Tempo trainer" />
      {enabled && (
        <div style={{ display: 'flex', gap: 8, paddingLeft: 2, flexWrap: 'wrap' }}>
          <NumInput label="Start" value={startPct} onChange={s.setTempoTrainerStartPct} min={10} max={100} />
          <NumInput label="+step" value={stepPct} onChange={s.setTempoTrainerStepPct} min={1} max={20} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-amber)', alignSelf: 'center' }}>
            now {currentPct}%
          </span>
        </div>
      )}
    </div>
  )
}

function StatsControl() {
  const correct = useStore(s => s.practiceCorrect)
  const wrong = useStore(s => s.practiceWrong)
  const total = correct + wrong
  const pct = total > 0 ? Math.round(correct / total * 100) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
        {total === 0 ? 'No data' : <><span style={{ color: '#22c55e' }}>{correct}✓</span> <span style={{ color: '#ef4444' }}>{wrong}✗</span> {pct}%</>}
      </span>
      <button onClick={useStore.getState().resetPracticeStats} style={{
        padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
        background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 10,
      }}>Reset</button>
    </div>
  )
}

const PrompterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
)

export const PRACTICE_DEFS: SettingDef[] = [
  {
    id: 'waitForInput', icon: Fingerprint, kind: 'switch',
    Control: () => { const v = useStore(s => s.waitForInputEnabled); return <Switch value={v} onChange={useStore.getState().setWaitForInputEnabled} label="Wait for Input" /> },
    Description: () => <>Pauses at each step and highlights the note(s) to play in <span style={{ color: '#22c55e' }}>green</span>. Press the correct note(s) to advance. Use together with Step Through (← →).</>,
  },
  {
    id: 'loopUntilCorrect', icon: Repeat, kind: 'switch',
    Control: () => { const v = useStore(s => s.loopUntilCorrect); return <Switch value={v} onChange={useStore.getState().setLoopUntilCorrect} label="Loop until correct" /> },
    Description: () => <>On a wrong note, restart from the loop region start (or beginning). Requires Wait for Input + a loop region set on the piano roll.</>,
  },
  {
    id: 'durationFeedback', icon: RefreshCw, kind: 'switch',
    Control: () => { const v = useStore(s => s.durationFeedbackEnabled); return <Switch value={v} onChange={useStore.getState().setDurationFeedbackEnabled} label="Duration feedback" /> },
    Description: () => <>After releasing a note, shows whether you held it too short, too long, or just right.</>,
  },
  {
    id: 'tempoTrainer', icon: Gauge, kind: 'choice',
    Control: TempoTrainerControl,
    Description: () => <>Start at a slower tempo and auto-increment BPM each time you advance a step correctly. Resets when you toggle it off and back on.</>,
  },
  {
    id: 'practiceStats', icon: Activity, kind: 'choice',
    Control: StatsControl,
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
    Control: () => { const v = useStore(s => s.chordPrompterEnabled); return <Switch value={v} onChange={useStore.getState().setChordPrompterEnabled} label="Chord Prompter" /> },
    Description: () => <>Shows past, current and upcoming chords during playback. Click <InlineIcon><PrompterIcon /></InlineIcon> icon above keyboard to enable it.</>,
  },
  {
    id: 'closePanels', icon: PanelLeftClose, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoCollapseDrawers); return <Switch value={v} onChange={useStore.getState().setAutoCollapseDrawers} label="Close panels on playback" /> },
    Description: () => <>Automatically hide side panels during playback to maximize the piano roll view. For full-screen view click <InlineIcon><Expand size={10} /></InlineIcon> to enter presentation mode.</>,
  },
  {
    id: 'handTags', icon: Hand, kind: 'switch',
    Control: () => { const v = useStore(s => s.showHandLetters); return <Switch value={v} onChange={useStore.getState().setShowHandLetters} label="Hand tags" /> },
  },
  {
    id: 'trackVu', icon: Activity, kind: 'switch',
    Control: () => { const v = useStore(s => s.trackVuColorEnabled); return <Switch value={v} onChange={useStore.getState().setTrackVuColorEnabled} label="Track color VU meters" /> },
  },
]
