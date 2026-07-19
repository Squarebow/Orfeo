import { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react'
import { Eye, VolumeX, Volume2 } from 'lucide-react'
import { useStore, DEFAULT_MUTED_GROUPS } from '../../store'
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

// ── EyeClosed — matching the one in ChannelStrip ─────────────────────────────
function EyeClosed({ size = 12 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-.722-3.25"/>
      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
      <path d="m20 15-1.726-2.05"/>
      <path d="m4 15 1.726-2.05"/>
      <path d="m9 18 .722-3.25"/>
    </svg>
  )
}

// ── Mini piano SVG — identical to ChannelStrip's Kbd button icon ──────────────
function PianoIcon() {
  return (
    <svg width="18" height="13" viewBox="0 0 13 9" fill="none">
      <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" vectorEffect="non-scaling-stroke"/>
      <rect x="2.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
      <rect x="5"   y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
      <rect x="7.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
      <rect x="10"  y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
    </svg>
  )
}

// ── IBtn — icon button matching ChannelStrip's IBtn ───────────────────────────
function IBtn({ children, onClick, active, title, activeColor = 'var(--text-amber)' }: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
  activeColor?: string
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, background: 'var(--bg-deep)', border: 'none',
        cursor: 'pointer', borderRadius: 4, transition: 'color 0.1s',
        color: active ? activeColor : '#404058', flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#808098' }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? activeColor : '#404058' }}
    >
      {children}
    </button>
  )
}

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

// ── MasterStrip — 160×574 ─────────────────────────────────────────────────────
export default function MasterStrip() {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine          = useStore(s => s.audioEngine)
  const masterVolume         = useStore(s => s.masterVolume)
  const setMasterVolume      = useStore(s => s.setMasterVolume)
  const tracks               = useStore(s => s.tracks)
  const updateTrack          = useStore(s => s.updateTrack)
  const autoMuteNonKeyboard  = useStore(s => s.autoMuteNonKeyboard)
  const setTrackMuteFilter   = useStore(s => s.setTrackMuteFilter)

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

  // ── Global action state — derived from all track states ───────────────────
  const allMuted       = tracks.length > 0 && tracks.every(t => t.muted)
  const allVisible     = tracks.length > 0 && tracks.every(t => t.visible)
  const allOnKeyboard  = tracks.length > 0 && tracks.every(t => t.showOnKeyboard)

  // ── Global action handlers ─────────────────────────────────────────────────
  const handleMuteAll = useCallback(() => {
    const target = !allMuted
    tracks.forEach(t => updateTrack(t.index, { muted: target }))
  }, [allMuted, tracks, updateTrack])

  const handleVisibleAll = useCallback(() => {
    const target = !allVisible
    tracks.forEach(t => updateTrack(t.index, { visible: target }))
  }, [allVisible, tracks, updateTrack])

  const handleKeyboardAll = useCallback(() => {
    const target = !allOnKeyboard
    tracks.forEach(t => updateTrack(t.index, { showOnKeyboard: target }))
  }, [allOnKeyboard, tracks, updateTrack])

  // ── Mute-filter state — mirrors TrackPanel's isCurrentlyFiltered ──────────
  const isCurrentlyFiltered = useMemo(() => {
    const filterable = tracks.filter(t => !t.isDrum && DEFAULT_MUTED_GROUPS.has(t.group ?? ''))
    return filterable.length > 0 && filterable.every(t => t.muted)
  }, [tracks])

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

      {/* ── 2. VU section (flex-grow, ~127px) ───────────────────────────────── */}
      <div ref={sectionRef} style={{
        flex: 1.3, minHeight: 0,
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

      {/* ── Spacer — breathing room between VU canvas and toggle row ──────── */}
      <div style={{ height: 8, flexShrink: 0 }} />

      {/* ── 3. VU display toggle (28px) — label left, toggle right, single row ─ */}
      <div style={{
        height: 28, flexShrink: 0,
        display: 'flex', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center',
        gap: 8,
      }}>
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          color: 'var(--text-dimmest)', whiteSpace: 'nowrap',
          textTransform: 'uppercase',
        }}>
          VU display
        </span>
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
      </div>

      {/* ── Spacer — gap between VU toggle and global icons ────────────── */}
      <div style={{ height: 8, flexShrink: 0 }} />

      {/* ── 4. Global icons row (36px) — mute all / waterfall all / kbd all ── */}
      <div style={{
        height: 36, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 4,
      }}>
        <IBtn
          onClick={handleMuteAll}
          active={allMuted}
          title={allMuted ? 'Unmute all tracks' : 'Mute all tracks'}
          activeColor="var(--status-error)"
        >
          {allMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </IBtn>
        <IBtn
          onClick={handleVisibleAll}
          active={allVisible}
          title={allVisible ? 'Hide all in waterfall' : 'Show all in waterfall'}
          activeColor="var(--text-amber)"
        >
          {allVisible ? <Eye size={13} /> : <EyeClosed size={13} />}
        </IBtn>
        <IBtn
          onClick={handleKeyboardAll}
          active={allOnKeyboard}
          title={allOnKeyboard ? 'Hide all on keyboard' : 'Show all on keyboard'}
          activeColor="var(--text-amber)"
        >
          <PianoIcon />
        </IBtn>
      </div>

      {/* ── 5. Mute-filter toggle row (34px) — cloned from TrackPanel header ─ */}
      <div style={{
        height: 34, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
      }}>
        {autoMuteNonKeyboard && (
          <button
            onClick={() => setTrackMuteFilter(!isCurrentlyFiltered)}
            title={isCurrentlyFiltered ? 'Play all tracks' : 'Play only piano, bass & drums'}
            style={{
              padding: '2px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--text-amber)',
              color: '#1a1000',
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'Inter',
              letterSpacing: '0.02em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              lineHeight: '18px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="6" height="7" viewBox="0 0 6 7" style={{ marginRight: 3, flexShrink: 0 }}>
              <polygon points="0,0 6,3.5 0,7" fill="currentColor"/>
            </svg>
            {isCurrentlyFiltered ? 'Selection' : 'All tracks'}
          </button>
        )}
      </div>

      {/* ── 6. FX row — Chorus + Reverb side by side (56px) ──────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
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
          marginBottom: 12,
        }}>
          FX
        </span>
        <MixerKnob
          value={reverb} onChange={handleReverb}
          accentColor="var(--knob-reverb)" size={52}
          disabled={knobsDisabled} label="Reverb"
        />
      </div>

      {/* ── 7. Tone EQ row (44px) ─────────────────────────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MixerKnob
          value={tone} onChange={handleTone}
          accentColor="var(--knob-tone)" size={52}
          disabled={knobsDisabled} bipolar label="Tone"
        />
      </div>

      {/* ── 8. Master Volume — flex:2 so it gets ~2/3 of shared space (~223px) ── */}
      {/* The knob wrapper uses position:relative + top:30 to shift the knob   */}
      {/* 30px down from its natural flex position without moving the label.    */}
      <div style={{
        flex: 2, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        overflow: 'hidden',
        paddingBottom: 16,
      }}>
        <div style={{ position: 'relative', top: 30, flexShrink: 0 }}>
          <MixerKnob
            value={masterVolume} onChange={setMasterVolume}
            accentColor="var(--text-amber)" size={200}
            dotCount={36} tickMajorEvery={6} tickScale={0.5} triScale={0.5}
          />
        </div>
        <span style={{
          fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-dimmest)',
          marginTop: 4,
        }}>
          Master Volume
        </span>
      </div>

    </div>
  )
}
