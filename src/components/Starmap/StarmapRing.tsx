// ── StarmapRing ──────────────────────────────────────────────────────────────
// The Scales Explorer's Starmap view — drawn in place of the Circle of Fifths,
// in the same SVG space and footprint. 12 notes on a ring, C at the top,
// clockwise either by semitone (chromatic) or by fifths (C G D A E…); the
// scale's notes are bright, its home note amber, the blues "blue note"
// ringed in blue. The chord sounding now is drawn as a glowing star joining
// its notes, in the colour of its root, with its name in the centre; with no
// chord lit a faint outline joins the scale's notes.
// Each note owns a sector of the disc: hovering lights it amber, clicking
// picks that note as the key (parent decides major or minor). The star
// glides from chord to chord (hooks/useStarmapMorph.ts) in `morphMs`, which
// the parent keeps shorter than one progression step.

import { useEffect, useMemo, useState } from 'react'
import { getNoteName } from '../../utils/noteNames'
import { PITCH_CLASS_COLORS } from '../../utils/colors'
import { pcPoint, ringOrder, starShape, shapePoints, ringPosition, type RingLayout } from '../../utils/starmap'
import { useStarmapMorph } from '../../hooks/useStarmapMorph'
import { t } from '../../utils/i18n'
import type { NoteNaming, Accidentals } from '../../types'
import StarmapTitleMark from './StarmapTitleMark'

export interface LitChord { pcs: number[]; rootPc: number; name: string }

const R_DISC = 175      // same footprint as the Circle of Fifths' outer ring
const R_STAR = 122      // where the stars (notes) sit
const R_LABEL = 152     // note names, outside the stars
const R_SECTOR_IN = R_STAR // hover sector = the band between the star ring and the edge, where the names are
const BLUE_NOTE = '#5b9bd5'

// ── One note's sector of the disc (30°, centred on its ring position) ──────
function sectorPath(cx: number, cy: number, pos: number): string {
  const a1 = ((pos * 30 - 15 - 90) * Math.PI) / 180
  const a2 = ((pos * 30 + 15 - 90) * Math.PI) / 180
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`
  return `M ${p(R_SECTOR_IN, a1)} L ${p(R_DISC, a1)} A ${R_DISC} ${R_DISC} 0 0 1 ${p(R_DISC, a2)} L ${p(R_SECTOR_IN, a2)} A ${R_SECTOR_IN} ${R_SECTOR_IN} 0 0 0 ${p(R_SECTOR_IN, a1)} Z`
}

export default function StarmapRing({
  cx, cy, layout, tonicPc, scalePcs, scaleName, blueNotePc, litChord, naming, accidentals, keyQuality, morphMs, onPickNote,
}: {
  cx: number
  cy: number
  layout: RingLayout
  tonicPc: number | null
  scalePcs: number[]
  scaleName: string
  blueNotePc: number | null
  litChord: LitChord | null
  naming: NoteNaming
  accidentals: Accidentals
  keyQuality: 'major' | 'minor'
  morphMs: number
  onPickNote: (pc: number) => void
}) {
  const [hoverPc, setHoverPc] = useState<number | null>(null)
  // sectors move when the ring order switches — drop a stale highlight
  useEffect(() => setHoverPc(null), [layout])
  const pos = (pc: number) => ringPosition(pc, layout)
  const inScale = new Set(scalePcs)
  // the star's points are ring positions, so a layout switch glides too
  const order = litChord ? starShape(litChord.pcs.map(pos)) : null
  const target = useMemo(
    () => (litChord && order ? { order, rootPc: litChord.rootPc, name: litChord.name } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order?.join(','), litChord?.rootPc, litChord?.name],
  )
  const f = useStarmapMorph(target, morphMs)
  const chordPcs = new Set(target && litChord ? litChord.pcs.map(pc => ((pc % 12) + 12) % 12) : [])
  const scaleShape = scalePcs.length >= 3 ? ringOrder(scalePcs.map(pos)) : null
  // points re-sorted round the ring every frame, so the star never crosses itself
  const pts = [...f.positions].sort((a, b) => (((a % 12) + 12) % 12) - (((b % 12) + 12) % 12))
  const r = R_STAR * f.radiusK
  const sizeFor = (n: string) => (n.length > 6 ? 21 : 27)

  return (
    <g>
      <defs>
        {PITCH_CLASS_COLORS.map((c, pc) => (
          <radialGradient key={pc} id={`starmap-halo-${pc}`}>
            <stop offset="0%" stopColor={c} stopOpacity={0.55} />
            <stop offset="100%" stopColor={c} stopOpacity={0} />
          </radialGradient>
        ))}
      </defs>

      {/* Night-sky disc — same size and edge as the Circle of Fifths */}
      <circle cx={cx} cy={cy} r={R_DISC} fill="var(--bg-circle-center)" stroke="var(--state-hover-bg)" strokeWidth={1} />

      {/* Note sectors — hover lights one amber, click picks it as the key */}
      {Array.from({ length: 12 }, (_, pc) => {
        const name = getNoteName(60 + pc, naming, accidentals)
        return (
          <path key={pc} d={sectorPath(cx, cy, pos(pc))}
            fill={hoverPc === pc ? 'var(--accent-amber-medium)' : 'transparent'}
            style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
            onMouseEnter={() => setHoverPc(pc)} onMouseLeave={() => setHoverPc(h => (h === pc ? null : h))}
            onClick={() => onPickNote(pc)} />
        )
      })}

      <circle cx={cx} cy={cy} r={R_STAR} fill="none" stroke="var(--border)" strokeWidth={1} style={{ pointerEvents: 'none' }} />

      {/* Faint outline of the scale — fades out while a chord is lit */}
      {scaleShape && (
        <polygon points={shapePoints(scaleShape, cx, cy, R_STAR)} fill="var(--text-amber)" fillOpacity={0.03}
          stroke="var(--text-amber)" strokeOpacity={0.28} strokeWidth={1} strokeLinejoin="round"
          style={{ pointerEvents: 'none', opacity: target ? 0 : 1, transition: 'opacity 0.3s ease' }} />
      )}

      {/* The chord's star — wide faint glow under a crisp line, barely tinted
          inside; points ride the rim while it glides */}
      {pts.length >= 2 && f.opacity > 0 && (
        <g style={{ pointerEvents: 'none' }} opacity={f.opacity}>
          <polygon points={shapePoints(pts, cx, cy, r)} fill={f.colour} fillOpacity={0.06}
            stroke={f.colour} strokeOpacity={0.18} strokeWidth={6} strokeLinejoin="round" />
          <polygon points={shapePoints(pts, cx, cy, r)} fill="none"
            stroke={f.colour} strokeOpacity={0.95} strokeWidth={1.5} strokeLinejoin="round" />
          {!f.settled && pts.map((p, i) => { const q = pcPoint(p, cx, cy, r); return <circle key={i} cx={q.x} cy={q.y} r={3.2} fill={f.colour} /> })}
        </g>
      )}

      {/* The 12 notes — star and label; the star itself carries the key-name
          tooltip, the label lights amber with its sector */}
      {Array.from({ length: 12 }, (_, pc) => {
        const star = pcPoint(pos(pc), cx, cy, R_STAR)
        const label = pcPoint(pos(pc), cx, cy, R_LABEL)
        const isTonic = pc === tonicPc
        const scaleNote = inScale.has(pc)
        const chordNote = chordPcs.has(pc)
        const isRoot = target?.rootPc === pc
        const name = getNoteName(60 + pc, naming, accidentals)
        const labelFill = isTonic || hoverPc === pc ? 'var(--text-amber)' : scaleNote ? 'var(--text-key-label)' : 'var(--text-inactive)'
        return (
          <g key={pc}>
            <g style={{ pointerEvents: 'none' }}>
              {chordNote ? (
                <g opacity={f.mix * f.opacity}>
                  <circle cx={star.x} cy={star.y} r={10} fill={`url(#starmap-halo-${pc})`} />
                  <circle cx={star.x} cy={star.y} r={3.6} fill={PITCH_CLASS_COLORS[pc]} />
                  {isRoot && <circle cx={star.x} cy={star.y} r={7} fill="none" stroke={PITCH_CLASS_COLORS[pc]} strokeWidth={1.2} />}
                </g>
              ) : scaleNote ? (
                <circle cx={star.x} cy={star.y} r={isTonic ? 3.6 : 2.8} fill={isTonic ? 'var(--text-amber)' : 'var(--text-key-label)'} />
              ) : (
                <circle cx={star.x} cy={star.y} r={1.4} fill="var(--text-inactive)" />
              )}
              {pc === blueNotePc && (
                <circle cx={star.x} cy={star.y} r={5.5} fill="none" stroke={BLUE_NOTE} strokeWidth={1.4} />
              )}
              <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle"
                fontSize={scaleNote ? 15 : 12} fontWeight={scaleNote ? 700 : 400} fontFamily="var(--font-mono)"
                fill={labelFill} style={{ userSelect: 'none', transition: 'fill 0.15s' }}
              >{name}</text>
            </g>
            {/* small hit spot on the star — key-name tooltip, same click */}
            <circle cx={star.x} cy={star.y} r={7} fill="transparent" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverPc(pc)} onMouseLeave={() => setHoverPc(h => (h === pc ? null : h))}
              onClick={() => onPickNote(pc)} />
          </g>
        )
      })}

      {/* Centre — the chord's name while one is lit (old and new names
          cross-fade), else the Starmap title */}
      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {f.prevName && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" opacity={1 - f.mix}
            fontSize={sizeFor(f.prevName)} fontWeight={700} fontFamily="var(--font-mono)" fill={f.colour}
          >{f.prevName}</text>
        )}
        {f.name && f.opacity > 0 && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" opacity={(f.prevName ? f.mix : 1) * f.opacity}
            fontSize={sizeFor(f.name)} fontWeight={700} fontFamily="var(--font-mono)" fill={f.colour}
          >{f.name}</text>
        )}
        <g opacity={1 - f.opacity}>
          <StarmapTitleMark cx={cx} cy={cy} width={160} fill="var(--text-amber)" />
        </g>
      </g>
    </g>
  )
}
