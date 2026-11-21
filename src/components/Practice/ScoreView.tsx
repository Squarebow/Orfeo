import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { usePractice } from '../../practice/practiceMode'
import { useWaiting } from '../../practice/listen'
import { buildScore, onTheGrid, fifthsOf, type Score, type ScoreNote } from '../../notation/score'
import { drawSystem, SYSTEM_HEIGHT, LEAD_HEIGHT, type SystemLayout } from '../../notation/draw'
import { useScoreUi } from '../../notation/scoreMode'

export { useScoreUi } from '../../notation/scoreMode'

// ── The score, Full notation (practice stage 8) ──────────────────────────────
// In place of the piano roll: both hands on two staves, like a printed page
// that stays still. Three lines show at a time (four of a lead sheet); when
// you reach the bottom line, the top one turns over to the bars after it, so
// there's always music ahead, the line you've just played stays, and nothing
// scrolls. The bar you're in is lit, and the notes you're on turn amber
// (while the song waits, the notes it waits for).
// Ways of writing it: as written (sixteenths and triplets), simplified (timing
// rounded to eighths, for a song played in by hand; Orfeo picks between
// these two), or melody and chords (a lead sheet, for a busy part: Orfeo then
// listens to the melody only). A swung song is written straight, with a note
// saying so.

const AMBER = '#e8a027'

/** The practised song as a score (both hands), and how it's written */
export function useSongScore(): { score: Score | null; tight: number; simple: boolean; busy: boolean } {
  const midi = useStore(s => s.midi)
  const tracks = useStore(s => s.tracks)
  const key = useStore(s => s.detectedKey)
  const chords = useStore(s => s.chordSequence)
  const mode = useScoreUi(s => s.mode)
  return useMemo(() => {
    if (!midi) return { score: null, tight: 1, simple: false, busy: false }
    const m = midi as any
    const shift = key?.transpose ?? 0
    const notes: ScoreNote[] = []
    const pedal: { down: number; up: number }[] = []
    for (const ts of tracks) {
      if (!ts.practicePart || !ts.practiceHand) continue
      const tr = midi.tracks.find(x => x.index === ts.index)
      for (const n of tr?.notes ?? []) notes.push({ midi: n.midi + shift, time: n.time, dur: n.duration, hand: ts.practiceHand })
      // the pedal, from whichever piano track carries it
      if (!pedal.length) {
        let down: number | null = null
        for (const e of tr?.sustainEvents ?? []) {
          if (e.down && down === null) down = e.time
          else if (!e.down && down !== null) { pedal.push({ down, up: e.time }); down = null }
        }
        if (down !== null) pedal.push({ down, up: midi.duration })
      }
    }
    const beatTimes: number[] = m._beatTimes ?? []
    const timeSigs = (m._timeSigMap?.length ? m._timeSigMap : [{ num: midi.timeSignatureNumerator, den: midi.timeSignatureDenominator, time: 0 }])
    const tight = onTheGrid(notes, beatTimes, timeSigs[0]?.den ?? 4)
    const simple = mode === 'simple' || ((mode === 'auto' || mode === 'lead') && tight < 0.85)
    // a busy right hand: many notes at once, most of the time
    const rh = notes.filter(n => n.hand === 'R')
    const onsets = new Set(rh.map(n => Math.round(n.time * 20)))
    const busy = rh.length > 40 && rh.length / Math.max(1, onsets.size) > 3.2
    const tonic = key ? (((key.semitone + shift) % 12) + 12) % 12 : 0
    const score = buildScore(
      { notes, beatTimes, barStarts: m._barStarts ?? [], timeSigs, duration: midi.duration, keyFifths: key ? fifthsOf(tonic, key.isMinor) : 0, grid: simple ? 2 : 1, pedal },
      mode === 'lead' ? { lead: { chords } } : {},
    )
    return { score, tight, simple, busy }
  }, [midi, tracks, key, mode, chords])
}

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** Is the pedal down when bar `i` starts? */
function pedalDownAt(score: Score, i: number): boolean {
  let down = false
  for (let b = 0; b < i; b++) for (const p of score.bars[b].pedal ?? []) down = p.down
  return down
}

/** One line of the page: drawn once per line of bars, then only lit up */
function Line({ score, from, to, width, scale, first, onLayout }: { score: Score; from: number; to: number; width: number; scale: number; first: boolean; onLayout: (l: SystemLayout) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!ref.current || width < 100) return
    const bars = score.bars.slice(from, to)
    const prev = score.bars[from - 1]
    const lastOf = (h: 'R' | 'L') => prev?.[h][prev[h].length - 1]
    try {
      const l = drawSystem(ref.current, bars, {
        width: width / scale, fifths: score.keyFifths, lead: score.lead, pedalIn: pedalDownAt(score, from),
        showTime: (b, i) => (first && i === 0) || (i === 0 ? !!prev && (prev.num !== b.num || prev.den !== b.den) : bars[i - 1].num !== b.num || bars[i - 1].den !== b.den),
        tieIn: { R: !!lastOf('R')?.tie, L: !!lastOf('L')?.tie },
        ink: cssVar('--text-default', '#c6c8c8'), dim: '#5d6069',
      })
      onLayout(l)
    } catch (e) { console.error('[score] could not draw bars', from + 1, '–', to, e) }
  }, [score, from, to, width, scale, first])
  return <div ref={ref} style={{ width: width / scale, transform: `scale(${scale})`, transformOrigin: '0 0', height: score.lead ? LEAD_HEIGHT : SYSTEM_HEIGHT }} />
}

export default function ScoreView() {
  const { score, simple, busy } = useSongScore()
  const mode = useScoreUi(s => s.mode)
  const currentTime = useStore(s => s.currentTime)
  const holdAt = useWaiting(s => (s.holding ? s.at : null))
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const lead = !!score?.lead
  const LINES = lead ? 4 : 3
  const sysH = lead ? LEAD_HEIGHT : SYSTEM_HEIGHT
  // lines of bars that fit the width
  const perLine = Math.max(2, Math.min(6, Math.floor(size.w / 250)))
  const lines = useMemo(() => {
    if (!score) return [] as [number, number][]
    const out: [number, number][] = []
    for (let i = 0; i < score.bars.length; i += perLine) out.push([i, Math.min(score.bars.length, i + perLine)])
    return out
  }, [score, perLine])
  const scale = Math.min(1.25, Math.max(0.5, (size.h - 8) / (LINES * sysH)))

  // where the song is: the bar, and the line it's on
  const now = holdAt ?? currentTime
  const barIdx = useMemo(() => {
    if (!score) return 0
    let i = 0
    while (i + 1 < score.bars.length && score.bars[i + 1].start <= now + 1e-6) i++
    return i
  }, [score, now])
  const cur = Math.max(0, lines.findIndex(([a, b]) => barIdx >= a && barIdx < b))
  // the page: the line before, this one and the next ones, each in its own place
  // (line j always on slot j mod LINES), so reaching the bottom line turns the
  // top one over to the bars after it, and the lines stay where they are
  const from = Math.max(0, Math.min(cur - 1, lines.length - LINES))
  const slots = Array.from({ length: LINES }, (_, k) => {
    for (let j = from; j < from + LINES; j++) if (j % LINES === k && j < lines.length) return j
    return null
  })

  // where each drawn line's notes sit (a fresh set for each new score)
  const layouts = useMemo(() => ({ current: new Map<number, SystemLayout>() }), [score])
  const [, bump] = useState(0)
  // light the notes you're on (or that the song waits for)
  useEffect(() => {
    const l = layouts.current.get(cur)
    document.querySelectorAll('.score-now').forEach(e => e.classList.remove('score-now'))
    if (!l) return
    for (const hand of ['R', 'L'] as const) {
      let at = -Infinity
      for (const p of l.notes) if (p.hand === hand && p.time <= now + 0.02 && p.time > at) at = p.time
      for (const p of l.notes) if (p.hand === hand && Math.abs(p.time - at) < 1e-6) p.el?.classList.add('score-now')
    }
  })

  if (!score) return null
  const lit = layouts.current.get(cur)?.bars.find(b => b.n === barIdx + 1)
  const litSlot = slots.indexOf(cur)
  const seg = (active: boolean): CSSProperties => ({
    height: 22, padding: '0 8px', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase', background: active ? 'var(--bg-panel2)' : 'transparent', color: active ? 'var(--text-amber)' : 'var(--text-dim)', whiteSpace: 'nowrap',
  })
  const note: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', minWidth: 0 }
  const shown = lead ? 'lead' : simple ? 'simple' : 'full'

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)', display: 'flex', flexDirection: 'column', zIndex: 5 }}>
      <style>{`.score-sheet svg text { fill: var(--text-default); } .score-now path, .score-now rect, .score-now text { fill: ${AMBER} !important; stroke: ${AMBER} !important; }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px', minHeight: 32, boxSizing: 'border-box', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--bg-tile)', borderRadius: 6 }}>
          <Tooltip title={t`As written`} description={t`Every note where it falls: sixteenths, and triplets where the music moves in three.`}>
            <button style={seg(shown === 'full')} onClick={() => useScoreUi.setState({ mode: 'full' })}>{t`As written`}</button>
          </Tooltip>
          <Tooltip title={t`Simplified`} description={t`Timing rounded to eighths, easier to read for a song played in by hand.`}>
            <button style={seg(shown === 'simple')} onClick={() => useScoreUi.setState({ mode: 'simple' })}>{t`Simplified`}</button>
          </Tooltip>
          <Tooltip title={t`Melody and chords`} description={t`Just the tune, with the chord names above, like a lead sheet. Orfeo then listens to the melody only; play the chords however you like.`}>
            <button style={seg(shown === 'lead')} onClick={() => useScoreUi.setState({ mode: 'lead' })}>{t`Melody and chords`}</button>
          </Tooltip>
        </div>
        {mode !== 'auto' && <button onClick={() => useScoreUi.setState({ mode: 'auto' })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 2, fontFamily: 'var(--font-ui)' }}>{t`Let Orfeo choose`}</button>}
        {score.swing && <span style={{ ...note, color: 'var(--text-default)' }}>{t`Swing: the eighths are written straight and played long-short.`}</span>}
        {simple && !lead && <span style={note}>{t`Many notes here fall between the sixteenths (played in by hand), so the timing is rounded to eighths to read clearly: the score won't match every note exactly.`}</span>}
        {lead && <span style={note}>{t`The melody with its chords. Orfeo listens to the melody; play the chords however you like.`}</span>}
        {busy && !lead && <span style={note}>{t`A busy part: Melody and chords may read more easily.`}</span>}
      </div>
      <div ref={box} className="score-sheet" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', padding: '0 6px' }}>
        {slots.map((j, k) => (
          <div key={k} style={{ position: 'absolute', left: 6, right: 6, top: 4 + k * sysH * scale, height: sysH * scale, transition: 'opacity .25s', opacity: j === null ? 0 : 1 }}>
            {k === litSlot && lit && (
              <div style={{ position: 'absolute', left: lit.x * scale, width: lit.w * scale, top: (lead ? 18 : 6) * scale, height: (sysH - (lead ? 30 : 30)) * scale, background: 'rgba(232,160,39,0.07)', borderRadius: 4 }} />
            )}
            {j !== null && (
              <Line score={score} from={lines[j][0]} to={lines[j][1]} width={size.w - 12} scale={scale} first={j === 0}
                onLayout={l => { layouts.current.set(j, l); bump(x => x + 1) }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
