import { BookOpen, PanelLeftClose, Hand, Activity, Expand, StepForward, Sparkles } from 'lucide-react'
import { useStore } from '../../../store'
import { Switch, InlineIcon, OptionBtn } from '../controls'
import { useDevPractice, pluggedSim, type PianistStyle } from '../../../practice/devPlay'
import { useMidiSettings } from '../../../store/midiSettings'
import type { SettingDef } from '../types'
import { t } from '../../../utils/i18n'
import { PRACTICE_VISIBLE } from '../../../practice/practiceMode'

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

export const PRACTICE_DEFS: SettingDef[] = [
  {
    // dev mode and test builds only until 2.0
    id: 'practiceMode', icon: Sparkles, kind: 'switch', useVisible: () => PRACTICE_VISIBLE,
    Control: () => { const v = useStore(s => s.practiceModeEnabled); return <Switch value={v} onChange={useStore.getState().setPracticeModeEnabled} label={t`Practice mode`} /> },
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
