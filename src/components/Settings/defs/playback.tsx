import { AudioLines, Timer, TriangleAlert, ListOrdered, Hand, Repeat, Focus, Pause, SkipForward, Gauge } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { Switch, OptionBtn, FingerStepper, InlineIcon, SubLabel, HelpText } from '../controls'
import type { SettingDef } from '../types'
import { applySkipEmptyBarsChange } from '../../../utils/reloadOpenSong'
import { confirmDialog } from '../../../utils/confirmController'
import { simAvailable } from '../../../utils/midiSimulator'
import { holdNotesForTest } from '../../../hooks/useMidiInput'
import { unsavedDetail } from '../../../utils/unsavedChanges'

// Test builds: see the closing warning without changing a song and closing Orfeo
function UnsavedWarningPreview() {
  if (!simAvailable) return null
  const show = () => void confirmDialog({
    title: t`Unsaved changes`,
    message: t`These changes to the song will be lost when Orfeo closes:`,
    detail: unsavedDetail({ shown: 2, lights: 1, muted: 1, mixer: 3, playbackEditor: true }),
    buttons: [t`Close Without Saving`, t`Cancel`],
    destructiveIndex: 0,
    startOnSafe: true,
  })
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Closing warning · test builds only`}</div>
      <button onClick={show}
        style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-default)',
          fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>{t`Show warning`}</button>
    </div>
  )
}

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

// Keep drum count-ins — under the main switch, only while it's on
function SkipEmptyBarsExtra() {
  const on = useStore(s => s.skipEmptyBars)
  const keep = useStore(s => s.keepDrumCountIn)
  if (!on) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, minHeight: 22,
      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-default)' }}>
      <span>{t`Keep drum count-ins`}</span>
      <Switch value={keep} onChange={v => { useStore.getState().setKeepDrumCountIn(v); void applySkipEmptyBarsChange() }} label={t`Keep drum count-ins`} />
    </div>
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

// Link to Settings › Appearance › Hand colours — in the card's description
// and under the Setup row; opens the Settings window on Appearance
function HandColoursLink() {
  return (
    <button onClick={() => useStore.getState().openSettingsWindow('appearance')}
      style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', font: 'inherit', fontStyle: 'normal', color: 'var(--text-amber)' }}>
      {t`Set your own hand colours`}
    </button>
  )
}

// ── Test builds: the Explorers listening to a keyboard, without one. Closes
// Settings, opens the Explorer and holds five chords one after another, as if
// played on a keyboard. Saves nothing. ───────────────────
// C, C/E (1st inversion), Dm7, G7♭9 (only in Extended), C–D♭–D (no chord)
const HELD_CHORDS = [[48, 60, 64, 67], [52, 55, 60], [50, 62, 65, 69, 72], [43, 59, 62, 65, 68], [60, 61, 62]]
function tryExplorerListening(which: 'chords' | 'scales') {
  const s = useStore.getState()
  s.closeSettingsWindow()
  if (which === 'chords') s.setChordExplorerOpen(true); else s.setScaleExplorerOpen(true)
  HELD_CHORDS.forEach((notes, i) => setTimeout(() => holdNotesForTest(notes, 1600), 700 + i * 2200))
}
function ExplorersHearPreview() {
  if (!simAvailable) return null
  const btn = (label: string, which: 'chords' | 'scales') => (
    <button onClick={() => tryExplorerListening(which)}
      style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-inactive)',
        fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>{label}</button>
  )
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Explorers hear your keyboard · test builds only`}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {btn(t`Try in Chords Explorer`, 'chords')}
        {btn(t`Try in Scales Explorer`, 'scales')}
      </div>
    </div>
  )
}

export const PLAYBACK_DEFS: SettingDef[] = [
  {
    id: 'unsavedWarning', icon: TriangleAlert, kind: 'switch', Extra: UnsavedWarningPreview,
    Control: () => { const v = useStore(s => s.unsavedWarningEnabled); return <Switch value={v} onChange={useStore.getState().setUnsavedWarningEnabled} label={t`Warn about unsaved changes`} /> },
  },
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
      <br /><br />
      {t`Shown`} <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--text-amber)', verticalAlign: '1px', margin: '0 2px' }} /> {t`next to Key in the top bar and in the Library.`}
    </>,
    Control: () => { const v = useStore(s => s.tempoWarningsEnabled); return <Switch value={v} onChange={useStore.getState().setTempoWarningsEnabled} label={t`Tempo warnings`} /> },
  },
  {
    id: 'countIn', icon: ListOrdered, kind: 'switch', Extra: CountInExtra,
    Control: () => { const v = useStore(s => s.countInEnabled); return <Switch value={v} onChange={useStore.getState().setCountInEnabled} label={t`Count-in`} /> },
  },
  {
    id: 'skipEmptyBars', icon: SkipForward, kind: 'switch', Extra: SkipEmptyBarsExtra,
    Description: () => <>
      {t`Songs that begin with silent bars open with the music on bar 1: the piano roll, bar numbers, playback, loops and step-through all start there. Your files are never changed — switch it off to see a song exactly as written. Switching this on switches off Chord Transcription, whose charts number the bars as the file has them.`}
      <br /><br />
      {t`Keep drum count-ins keeps one or two bars of plain drum clicks before the music.`}
    </>,
    Control: () => { const v = useStore(s => s.skipEmptyBars); return <Switch value={v} onChange={x => { useStore.getState().setSkipEmptyBars(x); void applySkipEmptyBarsChange() }} label={t`Skip empty bars at the start`} /> },
  },
  {
    id: 'handAssignment', icon: Hand, kind: 'switch', Extra: HandAssignmentExtra,
    Control: () => { const v = useStore(s => s.showHandLabels); return <Switch value={v} onChange={useStore.getState().setShowHandLabels} label="Hand Assignment" /> },
    Description: () => <>
      {t`On a single piano track, Orfeo works out which hand plays each note and colours it to match. Several piano or organ tracks are read together, as one player's two hands. A guideline, not a verified transcript!`}
      <br /><br />
      For a perfectly accurate split use MIDI note editor and click the <InlineIcon><Hand size={11} /></InlineIcon> icon to manually assign notes to left and right hand.
      <br /><br />
      <HandColoursLink />
    </>,
    SummaryEnd: HandColoursLink,
  },
  {
    id: 'loopRegion', icon: Repeat, kind: 'switch',
    Control: () => { const v = useStore(s => s.loopRegionEnabled); return <Switch value={v} onChange={useStore.getState().setLoopRegionEnabled} label="Loop region" /> },
    Description: () => <>Shows a strip to select and loop-play a section. Alt+Click & drag to select. Click <InlineIcon><Repeat size={11} /></InlineIcon> icon to loop.</>,
  },
  {
    id: 'tempoDisplay', icon: Gauge, kind: 'choice',
    Control: () => {
      const v = useStore(s => s.tempoDisplay)
      const set = useStore.getState().setTempoDisplay
      return (
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <OptionBtn active={v === 'bpm'} onClick={() => set('bpm')}>{t`BPM`}</OptionBtn>
          <OptionBtn active={v === 'percent'} onClick={() => set('percent')}>{t`Speed %`}</OptionBtn>
        </div>
      )
    },
  },
  {
    id: 'explorerPause', icon: Pause, kind: 'switch', Extra: ExplorersHearPreview,
    Control: () => { const v = useStore(s => s.explorerPausesPlayback); return <Switch value={v} onChange={useStore.getState().setExplorerPausesPlayback} label={t`Explorers pause playback`} /> },
  },
  {
    id: 'focusMode', icon: Focus, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoMuteNonKeyboard); return <Switch value={v} onChange={useStore.getState().setAutoMuteNonKeyboard} label="Focus mode" /> },
  },
]
