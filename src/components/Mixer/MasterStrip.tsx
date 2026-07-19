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

// ── Aggregate pitch-band constants — 8 bands covering MIDI 21–108 ─────────────
// Each band represents ~11 semitones; column visuals reuse bars-mode dimensions.
const BAND_COUNT  = 8
const BAND_MIN    = 21   // A0
const BAND_STEP   = 11   // semitones per band

const BAR_COL_W   = 14
const BAR_COL_GAP = 2
const BAR_TOTAL_W = BAND_COUNT * BAR_COL_W + (BAND_COUNT - 1) * BAR_COL_GAP  // 126px

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

// ── Draw aggregate bars VU — 8 pitch-band columns ────────────────────────────
function drawBars(
  canvas: HTMLCanvasElement,
  levels: number[], attacks: number[],
  segs: number, canvasH: number, canvasW: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const xStart = ((canvasW - BAR_TOTAL_W) / 2) * dpr
  const colW   = BAR_COL_W * dpr
  const gap    = BAR_COL_GAP * dpr

  for (let col = 0; col < BAND_COUNT; col++) {
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
        // Attack flash uses zone color — prevents white bleed on red segments
        ctx.fillStyle = segColor(i, segs)
        ctx.globalAlpha = 0.5 + 0.5 * attack
      } else {
        ctx.fillStyle = segColor(i, segs); ctx.globalAlpha = 0.08
      }
      ctx.fillRect(xOff, y, colW, h)
    }
  }
  ctx.globalAlpha = 1
}

// ── Draw wave VU — smooth bezier curve filled with gradient ──────────────────
// Driven by smoothly interpolated pitch-band levels (waveLevels), not hard bars.
function drawWave(
  canvas: HTMLCanvasElement,
  levels: number[],
  canvasH: number, canvasW: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const W = canvasW * dpr
  const H = canvasH * dpr
  const N = levels.length

  // Map band levels to canvas points — bottom = silence, top = full level
  const pts = levels.map((v, i) => ({
    x: (N === 1 ? W / 2 : (i / (N - 1)) * W),
    y: H * (1 - v),
  }))

  // Vertical gradient: red at top, dark green at bottom
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0,    METER_RED)
  grad.addColorStop(0.25, METER_ORANGE)
  grad.addColorStop(0.45, METER_YELLOW)
  grad.addColorStop(1,    '#1a3a12')

  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(pts[0].x, pts[0].y)

  // Bezier smoothing between adjacent band points
  for (let i = 0; i < N - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    ctx.bezierCurveTo(mx, pts[i].y, mx, pts[i + 1].y, pts[i + 1].x, pts[i + 1].y)
  }

  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.globalAlpha = 0.88
  ctx.fill()
  ctx.globalAlpha = 1
}

// ── MasterStrip — 160×574 ─────────────────────────────────────────────────────
export default function MasterStrip() {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine         = useStore(s => s.audioEngine)
  const masterVolume        = useStore(s => s.masterVolume)
  const setMasterVolume     = useStore(s => s.setMasterVolume)
  const tracks              = useStore(s => s.tracks)
  const updateTrack         = useStore(s => s.updateTrack)
  const autoMuteNonKeyboard = useStore(s => s.autoMuteNonKeyboard)
  const setTrackMuteFilter  = useStore(s => s.setTrackMuteFilter)
  const vuDisplayMode       = useStore(s => s.vuDisplayMode)
  const setVuDisplayMode    = useStore(s => s.setVuDisplayMode)

  const knobsDisabled = audioEngine === 'gm'

  // ── Knob local state ──────────────────────────────────────────────────────
  const [chorus, setChorusState] = useState(0)
  const [reverb, setReverbState] = useState(0)
  const [tone,   setToneState]   = useState(0)

  // ── VU refs — bars mode uses hard levels + attacks, wave uses smooth lerp ─
  const vuRef        = useRef<HTMLCanvasElement>(null)
  const vuLevels     = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const vuAttacks    = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const waveTargets  = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const waveLevels   = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const rafRef       = useRef(0)

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

  // No label row in either mode — full canvas height used
  const vuCanvasH = Math.max(30, sectionH - 12)
  const vuSegs    = Math.max(5, Math.floor(vuCanvasH / SEG_UNIT))

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

  // ── VU subscription — aggregate pitch-band levels across all non-muted tracks ──
  // Scans every non-muted track's notes at currentTime, maps each sounding note
  // to one of BAND_COUNT pitch bands; both bars and wave targets are updated here.
  useEffect(() => {
    const unsub = useStore.subscribe(state => {
      const { currentTime, playbackState, midi: md, tracks: tks } = state
      if (playbackState !== 'playing' || !md) return

      const targets = new Array(BAND_COUNT).fill(0)

      for (const tr of tks) {
        if (tr.muted) continue
        const pt = md.tracks.find((t: any) => t.index === tr.index)
        if (!pt) continue
        for (const note of pt.notes) {
          if (note.time > currentTime + 0.02) break
          if (currentTime >= note.time && currentTime < note.time + note.duration) {
            const band = Math.min(BAND_COUNT - 1, Math.max(0,
              Math.floor((note.midi - BAND_MIN) / BAND_STEP),
            ))
            if (note.velocity > targets[band]) targets[band] = note.velocity
          }
        }
      }

      for (let i = 0; i < BAND_COUNT; i++) {
        if (targets[i] > vuLevels.current[i]) vuAttacks.current[i] = 1
        if (targets[i] > 0) vuLevels.current[i] = targets[i]
        // Wave targets track peak; rAF decay brings them down gradually
        if (targets[i] > waveTargets.current[i]) waveTargets.current[i] = targets[i]
      }
    })
    return unsub
  }, [])

  // ── rAF loop — decay bars + lerp wave, redraw every frame ─────────────────
  useEffect(() => {
    const loop = () => {
      for (let i = 0; i < BAND_COUNT; i++) {
        // Bars: hard decay
        vuLevels.current[i]    = Math.max(0, vuLevels.current[i]  - 0.013)
        vuAttacks.current[i]   = Math.max(0, vuAttacks.current[i] - 0.06)
        // Wave: decay target, then lerp display level toward target
        waveTargets.current[i] = Math.max(0, waveTargets.current[i] - 0.013)
        waveLevels.current[i] += (waveTargets.current[i] - waveLevels.current[i]) * 0.12
      }
      if (vuRef.current) {
        if (vuDisplayMode === 'wave') {
          drawWave(vuRef.current, waveLevels.current, vuCanvasH, sectionW)
        } else {
          drawBars(vuRef.current, vuLevels.current, vuAttacks.current, vuSegs, vuCanvasH, sectionW)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuDisplayMode, vuSegs, vuCanvasH, sectionW])

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

      {/* ── 2. VU section (flex:1.3, ~127px) ─────────────────────────────── */}
      <div ref={sectionRef} style={{
        flex: 1.3, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 6, paddingBottom: 6,
      }}>
        <canvas ref={vuRef} style={{ display: 'block', imageRendering: 'pixelated', flexShrink: 0 }} />
      </div>

      {/* ── Spacer ────────────────────────────────────────────────────────── */}
      <div style={{ height: 8, flexShrink: 0 }} />

      {/* ── 3. VU display toggle (28px) — BARS / WAVE ─────────────────────── */}
      <div style={{
        height: 28, flexShrink: 0,
        display: 'flex', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center',
        gap: 8,
      }}>
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          color: 'var(--text-amber)', whiteSpace: 'nowrap',
          textTransform: 'uppercase', fontWeight: 700,
        }}>
          {vuDisplayMode === 'wave' ? 'Wave' : 'FFT'}
        </span>
        <div
          onClick={() => setVuDisplayMode(vuDisplayMode === 'bars' ? 'wave' : 'bars')}
          title={vuDisplayMode === 'wave' ? 'Switch to bars/FFT' : 'Switch to wave'}
          style={{
            width: 26, height: 13, borderRadius: 7, flexShrink: 0,
            background: '#303048',
            position: 'relative', cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'absolute', top: 2,
            left: vuDisplayMode === 'wave' ? 13 : 2,
            width: 9, height: 9,
            background: 'var(--text-amber)', borderRadius: '50%',
            transition: 'left 0.15s',
          }} />
        </div>
      </div>

      {/* ── Spacer ────────────────────────────────────────────────────────── */}
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

      {/* ── 8. Master Volume — flex:2 (~195px); knob shifted down via top:30 ── */}
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
