import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { useStore } from '../../store'
import MixerKnob from './MixerKnob'
import {
  setMasterChorus,
  setMasterReverb,
  setMasterTone,
} from '../../hooks/useSamplesEngine'

// ── VU meter constants ────────────────────────────────────────────────────────
const SEG_H    = 4
const SEG_GAP  = 2
const SEG_UNIT = SEG_H + SEG_GAP

const SPEC_COLS    = 8
const SPEC_COL_W   = 14
const SPEC_COL_GAP = 2
const SPEC_TOTAL_W = SPEC_COLS * SPEC_COL_W + (SPEC_COLS - 1) * SPEC_COL_GAP  // 126px
const SPEC_LABEL_H = 14

const METER_GREEN  = '#7ac040'
const METER_YELLOW = '#c0a020'
const METER_ORANGE = '#c07a20'
const METER_RED    = '#c04040'

// ── Segment color by normalized position ──────────────────────────────────────
function segColor(i: number, total: number): string {
  const pct = i / total
  if (pct >= 0.88) return METER_RED
  if (pct >= 0.75) return METER_ORANGE
  if (pct >= 0.60) return METER_YELLOW
  return METER_GREEN
}

// ── Draw mono VU — single wide centered column ────────────────────────────────
function drawMono(
  canvas: HTMLCanvasElement,
  level: number, attack: number,
  segs: number, canvasH: number, canvasW: number,
) {
  const dpr    = window.devicePixelRatio || 1
  const ctx    = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const COL_W     = 24 * dpr
  const xStart    = (canvasW * dpr - COL_W) / 2
  const activeSeg = Math.floor(level * segs)

  for (let i = 0; i < segs; i++) {
    const y = (canvasH - (i + 1) * SEG_UNIT) * dpr
    const h = SEG_H * dpr
    if (i < activeSeg) {
      ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 1
    } else if (i === activeSeg && attack > 0) {
      const t = attack
      ctx.fillStyle = `rgb(${Math.round(180 + 75 * t)},${Math.round(220 + 35 * t)},${Math.round(100 + 80 * t)})`
      ctx.globalAlpha = 0.65 + 0.35 * t
    } else {
      ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 0.08
    }
    ctx.fillRect(xStart, y, COL_W, h)
  }
  ctx.globalAlpha = 1
}

// ── Draw spectrogram VU — 8 columns, one per track slot ──────────────────────
function drawSpectro(
  canvas: HTMLCanvasElement,
  levels: number[], attacks: number[],
  segs: number, canvasH: number, canvasW: number,
) {
  const dpr    = window.devicePixelRatio || 1
  const ctx    = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const xStart = ((canvasW - SPEC_TOTAL_W) / 2) * dpr
  const colW   = SPEC_COL_W * dpr
  const gap    = SPEC_COL_GAP * dpr

  for (let col = 0; col < SPEC_COLS; col++) {
    const level     = levels[col] ?? 0
    const attack    = attacks[col] ?? 0
    const activeSeg = Math.floor(level * segs)
    const xOff      = xStart + col * (colW + gap)

    for (let i = 0; i < segs; i++) {
      const y = (canvasH - (i + 1) * SEG_UNIT) * dpr
      const h = SEG_H * dpr
      if (i < activeSeg) {
        ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 1
      } else if (i === activeSeg && attack > 0) {
        const t = attack
        ctx.fillStyle = `rgb(${Math.round(180 + 75 * t)},${Math.round(220 + 35 * t)},${Math.round(100 + 80 * t)})`
        ctx.globalAlpha = 0.65 + 0.35 * t
      } else {
        ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 0.08
      }
      ctx.fillRect(xOff, y, colW, h)
    }
  }
  ctx.globalAlpha = 1
}

// ── MasterStrip — 160×480 ────────────────────────────────────────────────────
export default function MasterStrip() {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine     = useStore(s => s.audioEngine)
  const masterVolume    = useStore(s => s.masterVolume)
  const setMasterVolume = useStore(s => s.setMasterVolume)

  const knobsDisabled = audioEngine === 'gm'

  // ── VU display mode — spectro default ────────────────────────────────────
  const [vuMode, setVuMode] = useState<'mono' | 'spectro'>('spectro')

  // ── Knob local state ──────────────────────────────────────────────────────
  const [chorus, setChorusState] = useState(0)
  const [reverb, setReverbState] = useState(0)
  const [tone,   setToneState]   = useState(0)

  // ── VU refs ───────────────────────────────────────────────────────────────
  const vuRef     = useRef<HTMLCanvasElement>(null)
  const vuLevels  = useRef<number[]>(Array(SPEC_COLS).fill(0))
  const vuAttacks = useRef<number[]>(Array(SPEC_COLS).fill(0))
  const rafRef    = useRef(0)

  // ── VU section dimensions — measured via ResizeObserver ──────────────────
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionH, setSectionH] = useState(150)
  const [sectionW, setSectionW] = useState(144)

  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setSectionH(e.contentRect.height)
      setSectionW(e.contentRect.width)
    })
    ro.observe(el)
    setSectionH(el.getBoundingClientRect().height)
    setSectionW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const labelReserve = vuMode === 'spectro' ? SPEC_LABEL_H + 2 : 0
  const vuCanvasH    = Math.max(30, sectionH - 12 - labelReserve)
  const vuSegs       = Math.max(5, Math.floor(vuCanvasH / SEG_UNIT))

  // ── Resize canvas ─────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = vuRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = sectionW * dpr
    canvas.height = vuCanvasH * dpr
    canvas.style.width  = sectionW + 'px'
    canvas.style.height = vuCanvasH + 'px'
  }, [sectionW, vuCanvasH])

  // ── VU subscription — per-track velocity at currentTime ──────────────────
  useEffect(() => {
    const unsub = useStore.subscribe(state => {
      const { currentTime, playbackState, midi: md, tracks: tks } = state
      if (playbackState !== 'playing' || !md) return
      for (let i = 0; i < SPEC_COLS; i++) {
        const tr = tks.find(t => t.index === i)
        if (!tr || tr.muted) continue
        const pt = md.tracks.find((t: any) => t.index === i)
        if (!pt) continue
        let maxVel = 0
        for (const note of pt.notes) {
          if (note.time > currentTime + 0.02) break
          if (currentTime < note.time + note.duration && note.velocity > maxVel)
            maxVel = note.velocity
        }
        if (maxVel > vuLevels.current[i]) vuAttacks.current[i] = 1
        if (maxVel > 0) vuLevels.current[i] = maxVel
      }
    })
    return unsub
  }, [])

  // ── rAF decay loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      for (let i = 0; i < SPEC_COLS; i++) {
        vuLevels.current[i]  = Math.max(0, vuLevels.current[i]  - 0.013)
        vuAttacks.current[i] = Math.max(0, vuAttacks.current[i] - 0.06)
      }
      if (vuRef.current) {
        if (vuMode === 'mono') {
          drawMono(vuRef.current, Math.max(...vuLevels.current), Math.max(...vuAttacks.current), vuSegs, vuCanvasH, sectionW)
        } else {
          drawSpectro(vuRef.current, vuLevels.current, vuAttacks.current, vuSegs, vuCanvasH, sectionW)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuMode, vuSegs, vuCanvasH, sectionW])

  // ── Knob handlers ─────────────────────────────────────────────────────────
  const handleChorus = useCallback((v: number) => { setChorusState(v); setMasterChorus(v) }, [])
  const handleReverb = useCallback((v: number) => { setReverbState(v); setMasterReverb(v) }, [])
  const handleTone   = useCallback((v: number) => { setToneState(v);   setMasterTone(v)   }, [])

  return (
    <div style={{
      width: 160, height: 574, flexShrink: 0,
      background: 'var(--bg-tile)',
      border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* ── 1. Header (30px) ──────────────────────────────────────────────── */}
      <div style={{
        height: 30, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: 12, fontFamily: 'JetBrains Mono', letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--text-amber)', fontWeight: 700,
        }}>
          Master
        </span>
      </div>

      {/* ── 2. VU section (flex-grow, ~150px) ────────────────────────────── */}
      <div ref={sectionRef} style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 6, paddingBottom: 6,
      }}>
        <canvas ref={vuRef} style={{ display: 'block', imageRendering: 'pixelated', flexShrink: 0 }} />
        {vuMode === 'spectro' && (
          <div style={{
            width: SPEC_TOTAL_W, height: SPEC_LABEL_H,
            display: 'flex', justifyContent: 'space-between',
            marginTop: 2, flexShrink: 0,
          }}>
            {Array.from({ length: SPEC_COLS }, (_, i) => (
              <span key={i} style={{
                width: SPEC_COL_W, textAlign: 'center',
                fontSize: 7, fontFamily: 'JetBrains Mono',
                color: '#404058', lineHeight: 1, flexShrink: 0,
              }}>
                {i + 1}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. VU display toggle — centered, label below (28px) ──────────── */}
      <div style={{
        height: 28, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 3,
      }}>
        <div
          onClick={() => setVuMode(v => v === 'mono' ? 'spectro' : 'mono')}
          style={{
            width: 26, height: 13, borderRadius: 7, flexShrink: 0,
            background: vuMode === 'spectro' ? 'var(--text-amber)' : '#303048',
            position: 'relative', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <div style={{
            position: 'absolute', top: 2,
            left: vuMode === 'spectro' ? 13 : 2,
            width: 9, height: 9,
            background: '#fff', borderRadius: '50%',
            transition: 'left 0.15s',
          }} />
        </div>
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          color: 'var(--text-dimmest)', whiteSpace: 'nowrap',
          textTransform: 'uppercase',
        }}>
          VU display
        </span>
      </div>

      {/* ── 3b. Spacer — pushes FX section down to match channel strip height ── */}
      <div style={{ height: 34, flexShrink: 0 }} />

      {/* ── 4. FX row — Chorus + Reverb side by side, "FX" between (72px) ── */}
      <div style={{
        height: 72, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0,
      }}>
        <MixerKnob
          value={chorus} onChange={handleChorus}
          accentColor="var(--knob-chorus)" size={52}
          disabled={knobsDisabled} label="Chorus"
        />
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
          color: 'var(--text-muted)', textTransform: 'uppercase',
          padding: '0 10px', flexShrink: 0,
          marginBottom: 12,  /* align with knob centers, above the label row */
        }}>
          FX
        </span>
        <MixerKnob
          value={reverb} onChange={handleReverb}
          accentColor="var(--knob-reverb)" size={52}
          disabled={knobsDisabled} label="Reverb"
        />
      </div>

      {/* ── 5. Tone EQ row (60px) — same knob size as Chorus/Reverb ─────── */}
      <div style={{
        height: 60, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MixerKnob
          value={tone} onChange={handleTone}
          accentColor="var(--knob-tone)" size={52}
          disabled={knobsDisabled} bipolar label="Tone"
        />
      </div>

      {/* ── 6. Master Volume — size=200, dense tick ring (230px) ──────────── */}
      {/* dotCount=36 / tickMajorEvery=6 → 6 major ticks + 5 minor between each */}
      <div style={{
        height: 230, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        gap: 5, paddingBottom: 10,
      }}>
        <MixerKnob
          value={masterVolume} onChange={setMasterVolume}
          accentColor="var(--text-amber)" size={200}
          dotCount={36} tickMajorEvery={6} tickScale={0.5} triScale={0.5}
        />
        <span style={{
          fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-dimmest)',
        }}>
          Master Volume
        </span>
      </div>

    </div>
  )
}
