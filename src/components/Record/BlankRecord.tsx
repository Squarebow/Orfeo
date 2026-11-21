import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Circle, Square, X } from 'lucide-react'
import { t } from '../../utils/i18n'
import { useBlank, startBlank, stopBlank, closeBlankSetup, setBlankSetup } from '../../record/blank'
import type { Meter } from '../../record/click'

// ── Blank mode on screen (after 2.0): the setup panel, then a small bar while
// you play (count-in, bar and beat, notes, Stop). Same dark panel, amber edge
// and glow as practice mode's choices. ─────────────────────────────────────
const AMBER = 'var(--text-amber)'
const panel: CSSProperties = {
  background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
  '--_modal-shadow': 'var(--elevation-popover)',
} as CSSProperties
const head: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: AMBER }
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const noteName = (n: number) => `${NOTE[n % 12]}${Math.floor(n / 12) - 1}`

function Pick({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '5px 10px', fontFamily: 'var(--font-ui)', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
      background: on ? 'var(--accent-amber-subtle)' : 'none', color: on ? AMBER : 'var(--text-default)',
      border: `1px solid ${on ? 'var(--accent-amber-strong)' : 'var(--border)'}`,
    }}>{children}</button>
  )
}
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'grid', gap: 6 }}>
    <div style={head}>{label}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
  </div>
)

const METERS: Meter[] = [{ beats: 2, unit: 4 }, { beats: 3, unit: 4 }, { beats: 4, unit: 4 }, { beats: 6, unit: 8 }]

function Setup() {
  const s = useBlank(st => st.setup)
  const [listening, setListening] = useState(false)
  // the split key: the next key you press on your keyboard
  useEffect(() => {
    if (!listening) return
    let off = () => {}
    void import('../../hooks/useMidiInput').then(m => {
      off = m.onPlayedKey(k => { if (k.on) { setBlankSetup({ splitKey: k.note }); setListening(false) } })
    })
    return () => off()
  }, [listening])
  return (
    <div role="dialog" aria-label={t`Record`} className="orfeo-modal-glow app-no-drag"
      style={{ ...panel, position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9600, width: 420, padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: 'var(--text-active)' }}>{t`Record on a blank page`}</span>
        <button onClick={closeBlankSetup} aria-label={t`Close`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <Row label={t`Time`}>
        {METERS.map(m => <Pick key={`${m.beats}/${m.unit}`} on={s.meter.beats === m.beats && s.meter.unit === m.unit} onClick={() => setBlankSetup({ meter: m })}>{`${m.beats}/${m.unit}`}</Pick>)}
      </Row>
      <Row label={t`Click`}>
        <Pick on={s.withClick} onClick={() => setBlankSetup({ withClick: true })} title={t`The bars are exact from the start.`}>{t`With click`}</Pick>
        <Pick on={!s.withClick} onClick={() => setBlankSetup({ withClick: false })} title={t`No click; the tempo is worked out afterwards.`}>{t`Free`}</Pick>
      </Row>
      {s.withClick && (
        <Row label={t`Tempo and count-in`}>
          <input type="number" min={30} max={240} value={s.bpm} aria-label={t`Tempo`}
            onChange={e => setBlankSetup({ bpm: Math.max(30, Math.min(240, Number(e.target.value) || 90)) })}
            style={{ width: 64, padding: '4px 6px', background: 'var(--bg-input)', color: 'var(--text-active)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.meter.unit === 8 ? t`eighths a minute` : t`BPM`}</span>
          {[0, 1, 2].map(n => <Pick key={n} on={s.countInBars === n} onClick={() => setBlankSetup({ countInBars: n })}>{n === 0 ? t`No count-in` : n === 1 ? t`1 bar` : t`2 bars`}</Pick>)}
        </Row>
      )}
      <Row label={t`Tracks`}>
        <Pick on={s.hands === 'one'} onClick={() => setBlankSetup({ hands: 'one' })}>{t`One piano`}</Pick>
        <Pick on={s.hands === 'two'} onClick={() => setBlankSetup({ hands: 'two' })}>{t`Left and right hand`}</Pick>
      </Row>
      {s.hands === 'two' && (
        <Row label={t`Split key`}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-active)', minWidth: 36 }}>{noteName(s.splitKey)}</span>
          <Pick on={listening} onClick={() => setListening(!listening)}>{listening ? t`Press a key on your keyboard…` : t`Choose with a key`}</Pick>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t`Below it: left hand. From it up: right hand.`}</span>
        </Row>
      )}
      <div style={{ fontSize: 11, lineHeight: 1.45, color: 'var(--text-muted)' }}>
        {s.withClick ? t`The click is heard, not recorded. The pedal is recorded.` : t`Play when you're ready. The tempo and bars are worked out afterwards (Rebuild tempo).`}
      </div>
      <button onClick={() => void startBlank()} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        background: AMBER, color: 'var(--text-on-amber)', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}><Circle size={12} fill="currentColor" /> {t`Record`}</button>
    </div>
  )
}

function Running() {
  const { phase, bar, beat, notes } = useBlank()
  const counting = phase === 'counting'
  return (
    <div role="status" className="orfeo-modal-glow app-no-drag" style={{
      ...panel, position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 9600,
      display: 'flex', alignItems: 'center', gap: 14, padding: '8px 14px', fontFamily: 'var(--font-ui)',
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: counting ? 'var(--text-muted)' : 'var(--status-protected, #e5484d)' }} />
      <span style={{ ...head, color: counting ? 'var(--text-muted)' : AMBER }}>{phase === 'saving' ? t`Saving…` : counting ? t`Count-in` : t`Recording`}</span>
      {beat > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-active)' }}>{counting ? `${beat}` : `${bar}.${beat}`}</span>}
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t`${notes} notes`}</span>
      <button onClick={() => void stopBlank(true)} disabled={phase === 'saving'} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: AMBER, color: 'var(--text-on-amber)', border: 'none', fontSize: 12, fontWeight: 700 }}>
        <Square size={10} fill="currentColor" /> {t`Stop`}
      </button>
      <button onClick={() => void stopBlank(false)} disabled={phase === 'saving'} title={t`Throw this take away`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>{t`Discard`}</button>
    </div>
  )
}

export default function BlankRecord() {
  const phase = useBlank(s => s.phase)
  if (phase === 'setup') return <Setup />
  if (phase === 'counting' || phase === 'recording' || phase === 'saving') return <Running />
  return null
}
