import { AudioLines, Timer, TriangleAlert, ListOrdered, Hand, Repeat, Focus } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { Switch, OptionBtn, FingerStepper, InlineIcon, SubLabel, HelpText } from '../controls'
import type { SettingDef } from '../types'

function TapTempoExtra() {
  const on = useStore(s => s.tapTempoPadEnabled)
  const mode = useStore(s => s.tapTempoMode)
  const setMode = useStore(s => s.setTapTempoMode)
  if (!on) return null
  return (
    <>
      <SubLabel>{t`Tap Tempo counting`}</SubLabel>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <OptionBtn active={mode === 'beat'} onClick={() => setMode('beat')}>{t`Every beat`}</OptionBtn>
        <OptionBtn active={mode === 'bar'} onClick={() => setMode('bar')}>{t`Only the 1`}</OptionBtn>
      </div>
      <HelpText>
        {mode === 'beat'
          ? t`Tap 1, 2, 3, 4 — like tapping your foot. Your first tap is the 1.`
          : t`Tap only the first beat of each bar. Every tap is a 1.`}
      </HelpText>
    </>
  )
}

function TempoWarningsExtra() {
  const on = useStore(s => s.tempoWarningsEnabled)
  const dismissedCount = useStore(s => Object.keys(s.tempoWarningDismissed).length)
  if (!on || dismissedCount === 0) return null
  return (
    <>
      <SubLabel>{t`Dismissed tempo warnings`}</SubLabel>
      <OptionBtn active={false} onClick={useStore.getState().clearTempoWarningDismissals}>
        {dismissedCount === 1 ? t`Show the warning for 1 dismissed song again` : t`Show warnings for ${dismissedCount} dismissed songs again`}
      </OptionBtn>
    </>
  )
}

function CountInExtra() {
  const on = useStore(s => s.countInEnabled)
  const bars = useStore(s => s.countInBars)
  const setBars = useStore(s => s.setCountInBars)
  if (!on) return null
  return (
    <>
      <SubLabel>{t`Count-in bars`}</SubLabel>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        {[1, 2, 3, 4].map(n => <OptionBtn key={n} active={bars === n} onClick={() => setBars(n)}>{String(n)}</OptionBtn>)}
      </div>
    </>
  )
}

// Max fingers per hand — a real hand-split parameter (handAssignment.ts)
function HandAssignmentExtra() {
  const on = useStore(s => s.showHandLabels)
  const lh = useStore(s => s.lhMaxFingers)
  const rh = useStore(s => s.rhMaxFingers)
  if (!on) return null
  return (
    <>
      <SubLabel>Max Fingers</SubLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-default)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>Left hand</span>
          <FingerStepper value={lh} onChange={useStore.getState().setLhMaxFingers} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-default)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>Right hand</span>
          <FingerStepper value={rh} onChange={useStore.getState().setRhMaxFingers} />
        </div>
      </div>
      <HelpText>How many notes of a wide chord each hand can take before the rest is absorbed by the other — left counts from the bottom of the chord, right from the top.</HelpText>
    </>
  )
}

export const PLAYBACK_DEFS: SettingDef[] = [
  {
    id: 'noteEditor', icon: AudioLines, kind: 'switch',
    Control: () => { const v = useStore(s => s.noteEditorEnabled); return <Switch value={v} onChange={useStore.getState().setNoteEditorEnabled} label="MIDI Note Editor" /> },
    Description: () => <>Shows <InlineIcon><AudioLines size={11} /></InlineIcon> icon in the Tracks panel. Enables MIDI note-editing mode directly on the piano roll.</>,
  },
  {
    id: 'tapTempo', icon: Timer, kind: 'switch', Extra: TapTempoExtra,
    Control: () => { const v = useStore(s => s.tapTempoPadEnabled); return <Switch value={v} onChange={useStore.getState().setTapTempoPadEnabled} label={t`Tap Tempo`} /> },
  },
  {
    id: 'tempoWarnings', icon: TriangleAlert, kind: 'switch', Extra: TempoWarningsExtra,
    Description: () => <>
      {t`Marks songs whose bar lines and metronome don't match the music's steady beat — the ones Tap Tempo can fix.`}
      <br />
      {t`Shown`} <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--text-amber)', verticalAlign: '1px', margin: '0 2px' }} /> {t`next to Key in the top bar and in the Library.`}
    </>,
    Control: () => { const v = useStore(s => s.tempoWarningsEnabled); return <Switch value={v} onChange={useStore.getState().setTempoWarningsEnabled} label={t`Tempo warnings`} /> },
  },
  {
    id: 'countIn', icon: ListOrdered, kind: 'switch', Extra: CountInExtra,
    Control: () => { const v = useStore(s => s.countInEnabled); return <Switch value={v} onChange={useStore.getState().setCountInEnabled} label={t`Count-in`} /> },
  },
  {
    id: 'handAssignment', icon: Hand, kind: 'switch', Extra: HandAssignmentExtra,
    Control: () => { const v = useStore(s => s.showHandLabels); return <Switch value={v} onChange={useStore.getState().setShowHandLabels} label="Hand Assignment" /> },
    Description: () => <>
      Automated hand assignment for piano that colors each note by the hand that plays it. A guideline, not a verified transcript!
      <br /><br />
      For a perfectly accurate split use MIDI note editor and click the <InlineIcon><Hand size={11} /></InlineIcon> icon to manually assign notes to left and right hand.
    </>,
  },
  {
    id: 'loopRegion', icon: Repeat, kind: 'switch',
    Control: () => { const v = useStore(s => s.loopRegionEnabled); return <Switch value={v} onChange={useStore.getState().setLoopRegionEnabled} label="Loop region" /> },
    Description: () => <>Shows a strip to select and loop-play a section. Alt+Click & drag to select. Click <InlineIcon><Repeat size={11} /></InlineIcon> icon to loop.</>,
  },
  {
    id: 'focusMode', icon: Focus, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoMuteNonKeyboard); return <Switch value={v} onChange={useStore.getState().setAutoMuteNonKeyboard} label="Focus mode" /> },
  },
]
