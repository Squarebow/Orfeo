import { Sparkles } from 'lucide-react'
import { useStore } from '../../store'
import { useMidiSettings } from '../../store/midiSettings'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { PRACTICE_VISIBLE, practiceGate, canEnterPractice, enterPractice, type GateReason } from '../../practice/practiceMode'

// ── The way into practice mode, on the Tracks panel's icon rail ──────────────
// Alive when Practice mode is on in Settings, a USB keyboard is plugged in and
// there's something to practise: the open song, or songs in the practice queue
// (picked inside practice mode). Otherwise greyed out, saying why.
export function reasonText(reason: GateReason | 'no-queue', n?: number): string {
  switch (reason) {
    case 'no-queue': return t`Add songs to your practice queue (right-click a song › Add to practice queue), or open a song that's ready to practise.`
    case 'off': return t`Turn on Practice mode in Settings › Practice.`
    case 'no-keyboard': return t`Connect a USB keyboard to start practising.`
    case 'no-song': return t`Open a song to practise.`
    case 'editing': return t`Close the Note Editor first.`
    case 'no-piano': return t`This song has no piano part to practise.`
    case 'too-many': return t`This song has ${n ?? 3} piano tracks. Practice mode needs one piano, as a left-hand and a right-hand track: merge them in the Playback Editor, or give the extra ones another instrument.`
    case 'prepare': return t`The piano needs a track for each hand first. In the Playback Editor, press Prepare for practice on the piano: check the hands, then Split & Save.`
  }
}

export default function PracticeButton({ size, strokeWidth, wrapperStyle }: { size: number; strokeWidth?: number; wrapperStyle?: React.CSSProperties }) {
  // what the gate reads, so it is worked out again when any of it changes
  useStore(s => s.midi); useStore(s => s.tracks); useStore(s => s.practiceModeEnabled)
  useStore(s => s.noteEditorActive); useStore(s => s.handCheckRev)
  useMidiSettings(s => s.devices); useStore(s => s.queue.paths.length)

  if (!PRACTICE_VISIBLE) {
    // the placeholder players see until 2.0
    return (
      <Tooltip title={t`Practice mode - coming soon`} oneLine wrapperStyle={wrapperStyle}>
        <div style={{ color: 'var(--state-disabled)', padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', opacity: 0.55, borderRadius: 4 }}>
          <Sparkles size={size} strokeWidth={strokeWidth} />
        </div>
      </Tooltip>
    )
  }
  const can = canEnterPractice()
  const gate = practiceGate()
  const ready = can.ok
  const why = gate.ok ? t`Practise this song's piano part with your keyboard.`
    : can.ok ? t`Practise with your keyboard: pick a song from your practice queue.`
    : reasonText(can.reason, !gate.ok && can.reason === 'too-many' ? gate.pianos : !gate.ok ? gate.passages : undefined)
  return (
    <Tooltip title={t`Practice mode`} description={why} wrapperStyle={wrapperStyle}>
      <button
        onClick={() => { if (ready) enterPractice() }}
        aria-disabled={!ready}
        aria-label={t`Practice mode`}
        style={{
          background: 'none', cursor: ready ? 'pointer' : 'default', padding: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
          border: 'none',
          color: ready ? 'var(--text-amber)' : 'var(--state-disabled)', opacity: ready ? 1 : 0.7,
          transition: 'color 0.15s',
        }}
      >
        <Sparkles size={size} strokeWidth={strokeWidth} />
      </button>
    </Tooltip>
  )
}
