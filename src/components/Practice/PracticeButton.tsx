import { Sparkles } from 'lucide-react'
import { useStore } from '../../store'
import { useMidiSettings } from '../../store/midiSettings'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { PRACTICE_VISIBLE, practiceGate, enterPractice, type GateReason } from '../../practice/practiceMode'

// ── The way into practice mode, on the Tracks panel's icon rail ──────────────
// Alive when Practice mode is on in Settings, a USB keyboard is plugged in and
// the open song is ready to practise; otherwise greyed out, saying why.
function reasonText(reason: GateReason, n?: number): string {
  switch (reason) {
    case 'off': return t`Turn on Practice mode in Settings › Practice.`
    case 'no-keyboard': return t`Connect a USB keyboard to start practising.`
    case 'no-song': return t`Open a song to practise.`
    case 'editing': return t`Close the Note Editor first.`
    case 'no-piano': return t`This song has no piano part to practise.`
    case 'too-many': return t`This song has ${n ?? 3} piano tracks. Practice mode needs one or two: merge two in the Playback Editor, or give one another instrument.`
    case 'not-ready': return n === 1
      ? t`Orfeo isn't sure of the hands in 1 passage. Press Prepare for practice on the piano track in the Playback Editor first.`
      : t`Orfeo isn't sure of the hands in ${n ?? 0} passages. Press Prepare for practice on the piano track in the Playback Editor first.`
  }
}

export default function PracticeButton({ size, strokeWidth, wrapperStyle }: { size: number; strokeWidth?: number; wrapperStyle?: React.CSSProperties }) {
  // what the gate reads, so it is worked out again when any of it changes
  useStore(s => s.midi); useStore(s => s.tracks); useStore(s => s.practiceModeEnabled)
  useStore(s => s.noteEditorActive); useStore(s => s.handCheckRev)
  useMidiSettings(s => s.devices)

  if (!PRACTICE_VISIBLE) {
    // the placeholder players see until 2.0
    return (
      <Tooltip title={t`Practice mode - coming soon`} oneLine wrapperStyle={wrapperStyle}>
        <div style={{ color: 'var(--state-disabled)', padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', opacity: 0.55, border: '1px dashed var(--border2)', borderRadius: 4 }}>
          <Sparkles size={size} strokeWidth={strokeWidth} />
        </div>
      </Tooltip>
    )
  }
  const gate = practiceGate()
  const ready = gate.ok
  const why = gate.ok ? t`Practise this song's piano part with your keyboard.` : reasonText(gate.reason, gate.reason === 'too-many' ? gate.pianos : gate.passages)
  return (
    <Tooltip title={t`Practice mode`} description={why} wrapperStyle={wrapperStyle}>
      <button
        onClick={() => { if (ready) enterPractice() }}
        aria-disabled={!ready}
        aria-label={t`Practice mode`}
        style={{
          background: 'none', cursor: ready ? 'pointer' : 'default', padding: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
          border: ready ? '1px solid transparent' : '1px dashed var(--border2)',
          color: ready ? 'var(--text-amber)' : 'var(--state-disabled)', opacity: ready ? 1 : 0.7,
          transition: 'color 0.15s',
        }}
      >
        <Sparkles size={size} strokeWidth={strokeWidth} />
      </button>
    </Tooltip>
  )
}
