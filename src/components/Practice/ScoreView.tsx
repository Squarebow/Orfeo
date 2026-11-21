import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Settings2 } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { useWaiting } from '../../practice/listen'
import { usePractice } from '../../practice/practiceMode'
import { buildScore, onTheGrid, fifthsOf, type Score, type ScoreNote } from '../../notation/score'
import { drawSystem, pageLayout, type PageLayout, type SystemLayout } from '../../notation/draw'
import type { ScoreOptions } from '../../notation/scoreOptions'

// ── The score, Full notation (practice stage 8) ──────────────────────────────
// In place of the piano roll: both hands on two staves, like a printed page
// that stays still: the whole view light grey, the notes in Orfeo's dark ink,
// Orfeo's amber for the bar you're in and the notes you're on. Three lines show at a time; when you
// reach the bottom line, the top one turns over to the bars after it, so
// there's always music ahead, the line you've just played stays, and nothing
// scrolls. The bar you're in is lit, and the notes you're on turn amber (while
// the song waits, the notes it waits for). How it's written (as written or
// simplified, chord names, triplets, swing, two voices, pedal) is set in
// Settings › Score; above the music, a note says when the writing is rounded
// or swung.

// Orfeo's colours on a printed page: its dark ink for the music, a softer
// grey for staff and bar lines, its amber for where you are
const PAGE = { paper: '#e8e7e4', ink: '#13131c', dim: '#7c7c86', muted: '#5c5c66', chord: '#13131c', now: '#e8a027', lit: 'rgba(232,160,39,0.24)' }

/** The practised song as a score (both hands, the chords above), and how it's written */
export function useSongScore(): { score: Score | null; tight: number; simple: boolean; options: ScoreOptions } {
  const midi = useStore(s => s.midi)
  const tracks = useStore(s => s.tracks)
  const key = useStore(s => s.detectedKey)
  const chords = useStore(s => s.chordSequence)
  const options = useStore(s => s.scoreOptions)
  return useMemo(() => {
    if (!midi) return { score: null, tight: 1, simple: false, options }
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
    const simple = options.writing === 'simple' || (options.writing === 'auto' && tight < 0.85)
    const tonic = key ? (((key.semitone + shift) % 12) + 12) % 12 : 0
    const score = buildScore({
      notes, beatTimes, barStarts: m._barStarts ?? [], timeSigs, duration: midi.duration,
      keyFifths: key ? fifthsOf(tonic, key.isMinor) : 0, grid: simple ? 2 : 1,
      pedal: options.pedal ? pedal : [], chords: options.chords === 'off' ? [] : chords,
      triplets: options.triplets, swing: options.swing, voices: options.voices,
    })
    return { score, tight, simple, options }
  }, [midi, tracks, key, chords, options])
}

/** Is the pedal down when bar `i` starts? */
function pedalDownAt(score: Score, i: number): boolean {
  let down = false
  for (let b = 0; b < i; b++) for (const p of score.bars[b].pedal ?? []) down = p.down
  return down
}

/** One line of the page: drawn once per line of bars, then only lit up */
function Line({ score, from, to, width, scale, first, page, options, onLayout }: {
  score: Score; from: number; to: number; width: number; scale: number; first: boolean; page: PageLayout; options: ScoreOptions; onLayout: (l: SystemLayout) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!ref.current || width < 100) return
    const bars = score.bars.slice(from, to)
    const prev = score.bars[from - 1]
    const lastOf = (h: 'R' | 'L') => prev?.[h][prev[h].length - 1]
    const colours = PAGE
    try {
      const l = drawSystem(ref.current, bars, {
        width: width / scale, fifths: score.keyFifths, pedalIn: pedalDownAt(score, from), page,
        chords: options.chords, pedal: options.pedal, textScale: scale,
        showTime: (b, i) => (first && i === 0) || (i === 0 ? !!prev && (prev.num !== b.num || prev.den !== b.den) : bars[i - 1].num !== b.num || bars[i - 1].den !== b.den),
        tieIn: { R: !!lastOf('R')?.tie, L: !!lastOf('L')?.tie },
        ink: colours.ink, dim: colours.dim, chordInk: colours.chord, font: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif',
      })
      onLayout(l)
    } catch (e) { console.error('[score] could not draw bars', from + 1, '–', to, e) }
  }, [score, from, to, width, scale, first, page, options])
  return <div ref={ref} style={{ width: width / scale, transform: `scale(${scale})`, transformOrigin: '0 0', height: page.height }} />
}

export default function ScoreView() {
  const { score, simple, options } = useSongScore()
  // three lines on a page of its own, two in Split (half the height)
  const LINES = usePractice(s => s.view === 'split') ? 2 : 3
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

  // lines of bars that fit the width, all given the same room
  const perLine = Math.max(2, Math.min(6, Math.floor(size.w / 250)))
  const lines = useMemo(() => {
    if (!score) return [] as [number, number][]
    const out: [number, number][] = []
    for (let i = 0; i < score.bars.length; i += perLine) out.push([i, Math.min(score.bars.length, i + perLine)])
    return out
  }, [score, perLine])
  const page = useMemo(() => (score ? pageLayout(score, lines, { chords: options.chords !== 'off', pedal: options.pedal }) : null), [score, lines, options])
  const sysH = page?.height ?? 240
  const scale = Math.min(1.25, Math.max(0.45, (size.h - 8) / (LINES * sysH)))

  // where the song is: the bar, and the line it's on
  const now = holdAt ?? currentTime
  const barIdx = useMemo(() => {
    if (!score) return 0
    let i = 0
    while (i + 1 < score.bars.length && score.bars[i + 1].start <= now + 1e-6) i++
    return i
  }, [score, now])
  const cur = Math.max(0, lines.findIndex(([a, b]) => barIdx >= a && barIdx < b))
  // the page: the line before, this one and the next, each in its own place
  // (line j always on slot j mod LINES), so reaching the bottom line turns the
  // top one over to the bars after it, and the lines stay where they are. Two
  // lines (Split): this one and the next, the one just played turning over.
  const from = Math.max(0, Math.min(LINES >= 3 ? cur - 1 : cur, lines.length - LINES))
  const slots = Array.from({ length: LINES }, (_, k) => {
    for (let j = from; j < from + LINES; j++) if (j % LINES === k && j < lines.length) return j
    return null
  })

  // where each drawn line's notes sit (a fresh set for each new score or page)
  const layouts = useMemo(() => ({ current: new Map<number, SystemLayout>() }), [score, page])
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

  if (!score || !page) return null
  const colours = PAGE
  const lit = layouts.current.get(cur)?.bars.find(b => b.n === barIdx + 1)
  const litSlot = slots.indexOf(cur)
  const note: CSSProperties = { fontSize: 12, color: PAGE.muted, fontFamily: 'var(--font-ui)', minWidth: 0 }

  return (
    <div style={{ position: 'absolute', inset: 0, background: PAGE.paper, display: 'flex', flexDirection: 'column', zIndex: 5 }}>
      <style>{`.score-sheet svg text { fill: ${colours.ink}; } .score-now path, .score-now rect, .score-now text { fill: ${colours.now} !important; stroke: ${colours.now} !important; }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 14px', minHeight: 30, boxSizing: 'border-box', flexWrap: 'wrap' }}>
        <button onClick={() => useStore.getState().openSettingsWindow('score')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: PAGE.ink, fontFamily: 'var(--font-ui)' }}>
          <Settings2 size={13} color={PAGE.now} /> {t`Score settings`}
        </button>
        {score.swing && <span style={{ ...note, color: PAGE.ink }}>{t`Swing: the eighths are written straight and played long-short.`}</span>}
        {simple && <span style={note}>{t`Many notes here fall between the sixteenths (played in by hand), so the timing is rounded to eighths to read clearly: the score won't match every note exactly.`}</span>}
      </div>
      <div ref={box} className="score-sheet" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', borderTop: `1px solid ${PAGE.dim}55` }}>
        {slots.map((j, k) => (
          <div key={k} style={{ position: 'absolute', left: 6, right: 6, top: 4 + k * sysH * scale, height: sysH * scale, transition: 'opacity .25s', opacity: j === null ? 0 : 1 }}>
            {k === litSlot && lit && (
              <div style={{ position: 'absolute', left: lit.x * scale, width: lit.w * scale, top: (page.upperTop - 14) * scale, height: (page.lowerTop + 54 - page.upperTop) * scale, background: colours.lit, borderRadius: 4 }} />
            )}
            {j !== null && (
              <Line score={score} from={lines[j][0]} to={lines[j][1]} width={size.w - 12} scale={scale} first={j === 0} page={page} options={options}
                onLayout={l => { layouts.current.set(j, l); bump(x => x + 1) }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
