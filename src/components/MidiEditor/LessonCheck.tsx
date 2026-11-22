// ── Lesson check — the Playback Editor's "Analyse and suggest" (2.0) ────────
// What Orfeo found in the song as saved (practice/songCheck.ts): tracks to
// leave out or merge, each with its own Apply, and faults in the notes that no
// button here can fix. Applying stages the same edits the Include and Merge
// columns make by hand, so the rows show them and Save keeps them; Undo puts
// the rows back as they were.
import { useState, type CSSProperties } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronRight, Undo2, Sparkles } from 'lucide-react'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import type { SongCheck, Suggestion, Problem } from '../../practice/songCheck'

const pct = (x: number) => `${Math.max(1, Math.round(100 * x))} %`

const SOUND: Record<string, () => string> = {
  sax: () => t`a saxophone`, choir: () => t`a choir`, voice: () => t`a voice`, guitar: () => t`a guitar`,
  bass: () => t`a bass`, organ: () => t`an organ`, strings: () => t`strings`, trumpet: () => t`a trumpet`,
  trombone: () => t`a trombone`, horn: () => t`a horn`, brass: () => t`brass`, flute: () => t`a flute`,
  clarinet: () => t`a clarinet`, oboe: () => t`an oboe`, pad: () => t`a synth pad`, synth: () => t`a synth`,
}

export function suggestionText(s: Suggestion, name: (i: number) => string): string {
  if (s.kind === 'merge') return t`Merge ${s.tracks.map(name).join(', ')} into one piano part, then prepare it for practice.`
  if (s.kind === 'instrument') return t`Give ${name(s.track)} the sound of ${(SOUND[s.word] ?? (() => s.word))()}: it plays with a piano sound, but its name says it isn't the piano part.`
  if (s.why === 'copy') return t`Leave out ${name(s.track)}: it only copies ${name(s.of)}, so the song sounds the same without it.`
  if (s.why === 'tune') return t`Leave out ${name(s.track)}: it only doubles the tune of ${name(s.of)}.`
  return t`Leave out ${name(s.track)}: two hands can't play it together with the other piano parts. The song loses this part.`
}

export function problemText(p: Problem): string {
  switch (p.kind) {
    case 'stacked': return t`The same key is struck twice at once on ${pct(p.share)} of the piano's notes.`
    case 'too-fast': return t`Keys are struck again faster than a hand can on ${pct(p.share)} of the piano's notes.`
    case 'out-of-range': return p.notes === 1 ? t`1 note lies outside the piano's 88 keys.` : t`${p.notes} notes lie outside the piano's 88 keys.`
    case 'unplayable': return t`The two hand tracks ask for what no hand can play (more than five keys, a stretch past a tenth, a leap too fast) in ${pct(p.share)} of their moments. Check the hands in the Note Editor.`
  }
}

export default function LessonCheck({ check, name, applied, onApply, onUndo }: {
  check: SongCheck
  name: (index: number) => string
  /** which suggestions (by place in the list) were applied and wait for Save */
  applied: boolean[]
  onApply: (s: Suggestion[]) => void
  onUndo: () => void
}) {
  const [open, setOpen] = useState(true)
  const n = check.suggestions.length + check.problems.length
  const any = applied.some(Boolean)
  const left = check.suggestions.filter((_, i) => !applied[i])
  const line: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: 1.4, color: 'var(--text-default)' }
  const btn: CSSProperties = {
    flexShrink: 0, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--accent-amber-strong)',
    background: 'var(--accent-amber-subtle)', color: 'var(--text-amber)', fontSize: 11, fontFamily: 'var(--font-ui)', cursor: 'pointer',
  }
  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--bg-tile)', background: 'var(--bg-modal-header)', flexShrink: 0 }}>
      <button data-no-drag="true" onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%' }}>
        {open ? <ChevronDown size={12} color="var(--text-muted)" /> : <ChevronRight size={12} color="var(--text-muted)" />}
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{t`Lesson check`}</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: n ? 'var(--text-amber)' : 'var(--text-dim)' }}>
          {any ? t`changes applied, Save to keep them` : n === 0 ? t`nothing to fix` : n === 1 ? t`1 thing to look at` : t`${n} things to look at`}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 18 }}>
          {n === 0 && (
            <div style={line}><Check size={13} style={{ color: 'var(--status-success)', flexShrink: 0, marginTop: 2 }} />
              <span style={{ color: 'var(--text-dim)' }}>{t`No copies, no doubled notes, and each hand can play its part.`}</span></div>
          )}
          {check.problems.map((p, i) => (
            <div key={`p${i}`} style={line}><AlertCircle size={13} style={{ color: 'var(--text-amber)', flexShrink: 0, marginTop: 2 }} /><span>{problemText(p)}</span></div>
          ))}
          {check.suggestions.map((s, i) => (
            <div key={`s${i}`} style={{ ...line, alignItems: 'center' }}>
              <Sparkles size={13} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{suggestionText(s, name)}</span>
              {applied[i]
                ? <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={11} style={{ color: 'var(--status-success)' }} /> {t`applied`}</span>
                : <button data-no-drag="true" style={btn} onClick={() => onApply([s])}>{t`Apply`}</button>}
            </div>
          ))}
          {(left.length > 1 || any) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              {left.length > 1 && <button data-no-drag="true" style={btn} onClick={() => onApply(left)}>{t`Apply all`}</button>}
              {any && (
                <Tooltip title={t`Undo`} description={t`Puts the tracks back as they were before the lesson check's changes.`}>
                  <button data-no-drag="true" style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={onUndo}><Undo2 size={11} /> {t`Undo`}</button>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
