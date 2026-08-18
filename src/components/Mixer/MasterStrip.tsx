import { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react'
import { Eye, VolumeX, Volume2 } from 'lucide-react'
import { useStore, DEFAULT_MUTED_GROUPS } from '../../store'
import MixerKnob from './MixerKnob'
import CompressorIcon from '../CompressorIcon'
import Tooltip, { TooltipBox } from '../Tooltip'
import {
  setMasterChorus,
  setMasterReverb,
  setMasterTone,
  setMasterCompressor,
  COMPRESSOR_PRESETS,
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

// Canvas 2D fillStyle/gradient/shadowColor (used below in drawBars/drawWave/segColor)
// cannot resolve CSS var() strings directly, so these are resolved once from index.css's
// --meter-* tokens via getComputedStyle (see resolveMeterColorsFromCSS, called on mount) —
// index.css stays the single source of truth; these are just its canvas-usable cache.
// Defaults here only cover the sliver before the mount effect runs.
let METER_GREEN      = '#7ac040'
let METER_YELLOW     = '#c0a020'
let METER_ORANGE     = '#c07a20'
let METER_RED        = '#c04040'
let METER_GREEN_DARK = '#1a3a12'

function resolveMeterColorsFromCSS() {
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  METER_GREEN      = read('--meter-green',      METER_GREEN)
  METER_YELLOW     = read('--meter-yellow',     METER_YELLOW)
  METER_ORANGE     = read('--meter-orange',     METER_ORANGE)
  METER_RED        = read('--meter-red',        METER_RED)
  METER_GREEN_DARK = read('--meter-green-dark', METER_GREEN_DARK)
}

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
    <svg width="15" height="11" viewBox="0 0 13 9" fill="none">
      <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" vectorEffect="non-scaling-stroke"/>
      <rect x="3" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
      <rect x="6" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
      <rect x="9" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
    </svg>
  )
}

// ── IBtn — icon button matching ChannelStrip's IBtn ───────────────────────────
function IBtn({ children, onClick, active, title, description, activeColor = 'var(--text-amber)' }: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
  description?: string
  activeColor?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  return (
    <button
      ref={ref}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, background: 'transparent',
        border: `1.5px solid ${active ? activeColor : 'var(--border2)'}`,
        cursor: 'pointer', borderRadius: 4, transition: 'color 0.1s, border-color 0.1s',
        color: active ? activeColor : 'var(--text-icon-inactive)', flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-icon-hover)'; setHover(true) }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? activeColor : 'var(--text-icon-inactive)'; setHover(false) }}
    >
      {children}
      {title && (
        <TooltipBox
          anchorRect={hover ? ref.current?.getBoundingClientRect() ?? null : null}
          content={{ title, description }}
          visible={hover}
        />
      )}
    </button>
  )
}

// ── CompressorPresetKnob — the preset-selector knob, no static radial
// labels (those made its footprint wider than a plain knob and threw off
// its right-alignment against Tone). Instead: hovering a tick shows THAT
// preset's info regardless of what's currently selected; hovering the
// knob's own center shows whichever preset actually IS selected. The
// hover math runs on this wrapper div, not on MixerKnob itself — mouse
// events still reach here even when the knob inside is `disabled` (that
// only sets pointer-events:none on the SVG, which makes hit-testing fall
// through to this parent), which is exactly what lets the tooltips stay
// live while `interactive=false` blocks actually dragging the knob. ───────
function CompressorPresetKnob({ presetIndex, onChange, disabled, interactive }: {
  presetIndex: number
  onChange: (v: number) => void
  disabled?: boolean
  interactive: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hoverPreset, setHoverPreset] = useState<number | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
    const dx = e.clientX - cx, dy = e.clientY - cy
    // Center zone (the knob's own body circle, r=13 of the 52px viewBox)
    // → whichever preset is actually selected right now.
    if (Math.sqrt(dx * dx + dy * dy) < rect.width * (13 / 52)) {
      setHoverPreset(presetIndex)
      return
    }
    // Ring zone → nearest tick, same angle math as MixerKnob's own
    // angleToNorm (ARC_START=135°, ARC_SWEEP=270°, dead zone below).
    let deg = Math.atan2(dy, dx) * (180 / Math.PI)
    if (deg < 0) deg += 360
    let norm: number
    if (deg >= 135) norm = (deg - 135) / 270
    else if (deg <= 45) norm = (deg + 225) / 270
    else { setHoverPreset(null); return }
    setHoverPreset(Math.round(Math.max(0, Math.min(1, norm)) * (COMPRESSOR_PRESETS.length - 1)))
  }, [presetIndex])

  const hovered = hoverPreset !== null ? COMPRESSOR_PRESETS[hoverPreset] : null
  // While the engine itself has the compressor unavailable, every tick shows
  // the same "switch engines" explanation instead of its own preset info —
  // there's nothing preset-specific to say if you can't select any of them.
  const content = hoverPreset === null ? null
    : disabled ? { title: 'Compressor', description: 'You must switch to Samples engine to use the Compressor.' }
    : hovered ? { title: hovered.label, description: `${hovered.ratio}:1 ratio, ${hovered.threshold} dB threshold` }
    : null

  return (
    <div
      ref={wrapRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverPreset(null)}
      style={{ position: 'relative' }}
    >
      <MixerKnob
        value={presetIndex / (COMPRESSOR_PRESETS.length - 1)} onChange={onChange}
        accentColor="var(--knob-compressor)" size={52}
        disabled={disabled || !interactive} dotCount={COMPRESSOR_PRESETS.length} tickMajorEvery={0}
      />
      <TooltipBox
        anchorRect={hoverPreset !== null ? wrapRef.current?.getBoundingClientRect() ?? null : null}
        content={content}
        visible={hoverPreset !== null}
      />
    </div>
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

// ── Draw wave VU — bezier fill with glow and idle breathing ──────────────────
// levels: smoothly lerped 0-1 values per band;
// breathOffsets: per-band sine offsets applied when signal is absent.
function drawWave(
  canvas: HTMLCanvasElement,
  levels: number[],
  breathOffsets: number[],
  canvasH: number, canvasW: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const W = canvasW * dpr
  const H = canvasH * dpr
  const N = levels.length

  // Apply per-band breathing offsets to displayed levels
  const display = levels.map((v, i) => Math.min(1, Math.max(0, v + breathOffsets[i])))

  // Map band levels to canvas points — bottom = silence, top = full level
  const pts = display.map((v, i) => ({
    x: (N === 1 ? W / 2 : (i / (N - 1)) * W),
    y: H * (1 - v),
  }))

  // Vertical gradient: red at top, dark green at bottom
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0,    METER_RED)
  grad.addColorStop(0.25, METER_ORANGE)
  grad.addColorStop(0.45, METER_YELLOW)
  grad.addColorStop(1,    METER_GREEN_DARK)

  // Build bezier path
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(pts[0].x, pts[0].y)
  for (let i = 0; i < N - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2
    ctx.bezierCurveTo(mx, pts[i].y, mx, pts[i + 1].y, pts[i + 1].x, pts[i + 1].y)
  }
  ctx.lineTo(W, H)
  ctx.closePath()

  // Glow pass — shadow set before fill, cleared immediately after
  ctx.shadowColor = METER_RED
  ctx.shadowBlur  = 14 * dpr
  ctx.fillStyle   = grad
  ctx.globalAlpha = 0.88
  ctx.fill()
  ctx.shadowBlur  = 0
  ctx.shadowColor = 'transparent'
  ctx.globalAlpha = 1

}

// ── MasterStrip — 160×574 ─────────────────────────────────────────────────────
export default function MasterStrip() {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine         = useStore(s => s.audioEngine)
  const masterVolume        = useStore(s => s.masterVolume)
  const setMasterVolume     = useStore(s => s.setMasterVolume)
  const masterCompEnabled   = useStore(s => s.masterCompEnabled)
  const setMasterCompEnabled = useStore(s => s.setMasterCompEnabled)
  const masterCompPreset    = useStore(s => s.masterCompPreset)
  const setMasterCompPreset = useStore(s => s.setMasterCompPreset)
  // ── Signature of the fields these global buttons actually care about —
  // mute/visible/keyboard/drum/group — NOT volume/pan/chorus/reverb. Those
  // four change on every fader/knob mousemove; subscribing to the whole
  // `tracks` array re-rendered MasterStrip (and its heavier siblings) on
  // every tick of any drag, contributing to the playback stutter reported
  // while dragging Console faders. ──────────────────────────────────────────
  const trackSignature = useStore(s =>
    s.tracks.map(t => `${t.index}:${t.muted ? 1 : 0}:${t.visible ? 1 : 0}:${t.showOnKeyboard ? 1 : 0}:${t.isDrum ? 1 : 0}:${t.group ?? ''}`).join('|'))
  const tracks = useMemo(() => useStore.getState().tracks, [trackSignature])
  const updateTrack         = useStore(s => s.updateTrack)
  const autoMuteNonKeyboard = useStore(s => s.autoMuteNonKeyboard)
  const setTrackMuteFilter  = useStore(s => s.setTrackMuteFilter)
  const vuDisplayMode       = useStore(s => s.vuDisplayMode)
  const setVuDisplayMode    = useStore(s => s.setVuDisplayMode)
  // Console stays mounted (display:none) after first open so internal state
  // survives hide/show — gate the VU rAF loop below on this, not just mount.
  const mixerOpen           = useStore(s => s.mixerOpen)

  // ── Resolve meter colors from CSS tokens once on mount — see resolveMeterColorsFromCSS ──
  useEffect(() => { resolveMeterColorsFromCSS() }, [])

  const knobsDisabled = audioEngine === 'gm'

  // ── Knob local state ──────────────────────────────────────────────────────
  const [chorus, setChorusState] = useState(0)
  const [reverb, setReverbState] = useState(0)
  const [tone,   setToneState]   = useState(0)

  // ── Master Volume's live value tooltip — visible on hover OR while
  // actively dragging (MixerKnob's onDragChange), not just hover like the
  // other knobs' static tooltips. Replaces the permanent %-value readout. ──
  const volumeKnobWrapRef = useRef<HTMLDivElement>(null)
  const [volumeHover, setVolumeHover] = useState(false)
  const [volumeDragging, setVolumeDragging] = useState(false)

  // ── VU refs — bars uses hard levels+attacks; wave uses lerped levels+peaks ─
  const vuRef        = useRef<HTMLCanvasElement>(null)
  const vuLevels     = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const vuAttacks    = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const waveTargets  = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const waveLevels   = useRef<number[]>(Array(BAND_COUNT).fill(0))
  const breathPhase  = useRef(0)
  const breathAmp    = useRef(0)
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

  // ── rAF loop — decay bars + lerp wave + peaks, advance breathing, redraw ──
  // Gated on mixerOpen: this component stays mounted (display:none) after
  // first open, and rAF keeps firing regardless of CSS visibility — without
  // this guard the canvas fill-rect loop runs forever after the Mixer closes.
  useEffect(() => {
    if (!mixerOpen) return
    const loop = () => {
      for (let i = 0; i < BAND_COUNT; i++) {
        // Bars: hard decay
        vuLevels.current[i]    = Math.max(0, vuLevels.current[i]  - 0.013)
        vuAttacks.current[i]   = Math.max(0, vuAttacks.current[i] - 0.06)
        // Wave: decay target, lerp display level, slow peak decay
        waveTargets.current[i] = Math.max(0, waveTargets.current[i] - 0.013)
        waveLevels.current[i] += (waveTargets.current[i] - waveLevels.current[i]) * 0.12
      }
      // Idle breathing — amplitude lerps in when all bands silent, out when active
      const maxLevel = Math.max(...waveLevels.current)
      const isIdle   = maxLevel < 0.04
      breathAmp.current   += ((isIdle ? 0.018 : 0) - breathAmp.current) * 0.02
      breathPhase.current += 0.018
      const breathOffsets  = Array.from({ length: BAND_COUNT }, (_, i) =>
        Math.sin(breathPhase.current + i * 0.5) * breathAmp.current,
      )
      if (vuRef.current) {
        if (vuDisplayMode === 'wave') {
          drawWave(vuRef.current, waveLevels.current, breathOffsets, vuCanvasH, sectionW)
        } else {
          drawBars(vuRef.current, vuLevels.current, vuAttacks.current, vuSegs, vuCanvasH, sectionW)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuDisplayMode, vuSegs, vuCanvasH, sectionW, mixerOpen])

  // ── Knob handlers ─────────────────────────────────────────────────────────
  const handleChorus = useCallback((v: number) => { setChorusState(v); setMasterChorus(v) }, [])
  const handleReverb = useCallback((v: number) => { setReverbState(v); setMasterReverb(v) }, [])
  const handleTone   = useCallback((v: number) => { setToneState(v);   setMasterTone(v)   }, [])

  // ── Compressor preset knob — snapped to 5 discrete positions (0-1 knob
  // value quantized to the nearest of COMPRESSOR_PRESETS' 5 indices). ──────
  const handleCompPreset = useCallback((v: number) => {
    const preset = Math.round(v * (COMPRESSOR_PRESETS.length - 1))
    setMasterCompPreset(preset)
    setMasterCompressor(masterCompEnabled, preset)
  }, [masterCompEnabled, setMasterCompPreset])
  const handleCompToggle = useCallback(() => {
    const next = !masterCompEnabled
    setMasterCompEnabled(next)
    setMasterCompressor(next, masterCompPreset)
  }, [masterCompEnabled, masterCompPreset, setMasterCompEnabled])

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
      width: 184, height: 574, flexShrink: 0,
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
          fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.14em',
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

      {/* ── 3. VU display toggle (28px) — BARS / WAVE. marginTop:-24.3 pulls
          this row and the merged icons/mute-filter row (4) up together as
          one block (was -9.3; pulled up another 15px so they sit tighter
          under the meter). A matching 15px spacer after row 4 (below) cancels
          this shift for everything from row 5 on, so FX/Tone/Compressor/
          Volume stay exactly where they were — the net effect is only a
          bigger gap between the icons row and the Chorus/Reverb knobs, not
          the whole strip shifting up. ── */}
      <div style={{
        height: 28, flexShrink: 0,
        display: 'flex', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'center',
        gap: 8,
        marginTop: -24.3,
      }}>
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
          color: 'var(--text-amber)', whiteSpace: 'nowrap',
          textTransform: 'uppercase', fontWeight: 700,
        }}>
          {vuDisplayMode === 'wave' ? 'Wave' : 'Bars/FFT'}
        </span>
        <Tooltip
          title={vuDisplayMode === 'wave' ? 'Switch to Bars/FFT' : 'Switch to Wave'}
          description="Changes how the meter above shows the overall output level"
        >
        <div
          onClick={() => setVuDisplayMode(vuDisplayMode === 'bars' ? 'wave' : 'bars')}
          style={{
            width: 26, height: 13, borderRadius: 7, flexShrink: 0,
            background: 'var(--state-disabled)',
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
        </Tooltip>
      </div>

      {/* ── Spacer ────────────────────────────────────────────────────────── */}
      <div style={{ height: 8, flexShrink: 0 }} />

      {/* ── 4. Global icons + mute-filter button, one row (40px) — merged from
          two separate rows to free up vertical room for the Compressor row
          below without growing the strip; realigned against the channel
          strips' own M/S/eye/kbd row via CDP, not carried over from the old
          two-row offsets (-9.3/+17.3), which were tuned for a layout that no
          longer exists. ── */}
      <div style={{
        height: 40, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IBtn
            onClick={handleMuteAll}
            active={allMuted}
            title={allMuted ? 'Unmute all tracks' : 'Mute all tracks'}
            description={allMuted ? 'Restore every track to its own mute state' : 'Silence every track at once'}
            activeColor="var(--status-error)"
          >
            {allMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </IBtn>
          <IBtn
            onClick={handleVisibleAll}
            active={allVisible}
            title={allVisible ? 'Hide all on the piano roll' : 'Show all on the piano roll'}
            description={allVisible ? 'Hide every track’s falling notes on the Piano Roll' : 'Show every track’s falling notes on the Piano Roll'}
            activeColor="var(--text-amber)"
          >
            {allVisible ? <Eye size={13} /> : <EyeClosed size={13} />}
          </IBtn>
          <IBtn
            onClick={handleKeyboardAll}
            active={allOnKeyboard}
            title={allOnKeyboard ? 'Hide all on keyboard' : 'Show all on keyboard'}
            description={allOnKeyboard ? 'Stop every track lighting up the on-screen keyboard' : 'Every track lights up the on-screen keyboard'}
            activeColor="var(--text-amber)"
          >
            <PianoIcon />
          </IBtn>
        </div>
        {autoMuteNonKeyboard && (
          <Tooltip
            title={isCurrentlyFiltered ? 'Play all tracks' : 'Focus mode'}
            description={isCurrentlyFiltered ? 'Turn off the piano/bass/drums-only filter' : 'Mute everything except piano, bass & drums — good for practicing along'}
          >
          <button
            onClick={() => setTrackMuteFilter(!isCurrentlyFiltered)}
            style={{
              padding: '2px 10px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--text-amber)',
              color: 'var(--text-on-amber)',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-ui)',
              letterSpacing: '0.02em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              lineHeight: '18px',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="6" height="7" viewBox="0 0 6 7" style={{ marginRight: 3, flexShrink: 0 }}>
              <polygon points="0,0 6,3.5 0,7" fill="currentColor"/>
            </svg>
            {isCurrentlyFiltered ? 'Selection' : 'All tracks'}
          </button>
          </Tooltip>
        )}
      </div>

      {/* ── Spacer — cancels row 3's -15px so rows 5+ (FX/Tone/Compressor/
          Volume) stay put; see row 3's comment above. ── */}
      <div style={{ height: 15, flexShrink: 0 }} />

      {/* ── 5. FX row — Chorus + Reverb pushed to the strip's edges (56px).
          "FX" label dropped; space-between + inset padding does the
          separating instead of a fixed gap. ──────────────────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        <MixerKnob
          value={chorus} onChange={handleChorus}
          accentColor="var(--knob-chorus)" size={52}
          disabled={knobsDisabled} label="Chorus" labelOffset={-10}
          title="Chorus" description="Thickens the overall mix by layering slightly detuned copies of it"
          disabledHint="You must switch to Samples engine to use Chorus."
        />
        <MixerKnob
          value={reverb} onChange={handleReverb}
          accentColor="var(--knob-reverb)" size={52}
          disabled={knobsDisabled} label="Reverb" labelOffset={-10}
          title="Reverb" description="Adds room/space ambience to the mix"
          disabledHint="You must switch to Samples engine to use Reverb."
        />
      </div>

      {/* ── 6. Tone + Compressor row (66px) — Tone and the Compressor knob
          pushed to the strip's edges, both plain 52px knobs now (the
          Compressor's radial labels were removed — see CompressorPresetKnob
          below — so it's the same footprint as Tone, which is what actually
          fixed its right-alignment: it was the 80px label wrapper throwing
          it off, not the grid). On/off toggle centered between them via
          real CSS Grid (minmax(0,1fr) auto minmax(0,1fr)) — this repo's own
          CLAUDE.md documents why flex+space-between isn't used for this:
          if the two side columns' content-width ever differ again, a
          flex-centered middle item drifts off true center; Grid centers it
          structurally regardless. ── */}
      <div style={{
        height: 66, flexShrink: 0,
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
        alignItems: 'center',
        padding: '0 16px',
      }}>
        {/* Fixed 52×52 box, label absolutely positioned below (out of flow)
            — same structure as the Compressor column opposite it, so both
            columns report the same height to the grid's alignItems:'center'
            and their knobs land on the same Y, not just the same X. Using
            MixerKnob's own `label` prop here would put "Tone" back in
            normal flow, making this column ~9px taller than Compressor's
            and drifting the two knobs apart vertically despite matching
            horizontally. */}
        <div style={{ justifySelf: 'start', width: 52, position: 'relative', height: 52 }}>
          <MixerKnob
            value={tone} onChange={handleTone}
            accentColor="var(--knob-tone)" size={52}
            disabled={knobsDisabled} bipolar
            title="Tone" description="Tilts the overall EQ darker or brighter"
            disabledHint="You must switch to Samples engine to use Tone."
          />
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            marginTop: -3, fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-dimmest)',
            userSelect: 'none', lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            Tone
          </span>
        </div>

        {/* On/off toggle — bare icon, no button chrome (per feedback: no dark
            square background). Amber when on, white when off — distinct
            from the usual dark/amber IBtn pattern since this needs to read
            clearly against the knob's own pink even at a glance. */}
        <Tooltip
          title={knobsDisabled ? 'Compressor' : masterCompEnabled ? 'Compressor on' : 'Compressor off'}
          description={knobsDisabled
            ? 'You must switch to Samples engine to use the Compressor.'
            : 'Automatically pulls down the loudest peaks so playback stays clear of digital clipping, without a blanket volume cut. Click to toggle.'}
        >
        <button
          onClick={handleCompToggle}
          disabled={knobsDisabled}
          style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', padding: 0,
            cursor: knobsDisabled ? 'default' : 'pointer',
            color: masterCompEnabled ? 'var(--text-amber)' : 'var(--text-white)',
            pointerEvents: knobsDisabled ? 'none' : 'auto',
          }}
        >
          <CompressorIcon size={17} />
        </button>
        </Tooltip>

        {/* Compressor preset knob — same plain 52px knob as Tone; hovering a
            tick shows that preset's info (regardless of what's selected),
            hovering the center shows the currently-selected one. Disabled
            (can't drag) while the compressor itself is off, but hover
            tooltips keep working even then — see CompressorPresetKnob.
            Fixed 52px-wide outer box (not shrink-to-fit) — "COMPRESSOR" is
            wider than the other knobs' labels (~62px at this size vs the
            52px knob), and letting it size the column threw the whole
            column's right edge ~5px left of Reverb's above it, since
            justifySelf:'end' aligns THIS BOX's edge, not the knob's. The
            label is absolutely positioned below instead, free to overflow
            past the fixed-width box without affecting alignment. */}
        <div style={{ justifySelf: 'end', width: 52, position: 'relative', height: 52 }}>
          <CompressorPresetKnob
            presetIndex={masterCompPreset} onChange={handleCompPreset}
            disabled={knobsDisabled} interactive={masterCompEnabled}
          />
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            marginTop: -3, fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-dimmest)',
            userSelect: 'none', lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            Compressor
          </span>
        </div>
      </div>

      {/* ── 7. Master Volume — flex:2 (~195px). Root cause of every fight so
          far: the knob was bigger than this section's own actual height, so
          it was ALWAYS fighting `overflow:hidden` no matter how it was
          anchored. `justifyContent:'flex-end'` anchors knob+value+label to
          this strip's bottom edge — same edge the channel strips' own
          VOLUME/TRACK-N labels sit flush against — so the two align without
          pixel-guessing; any overflow from the knob being taller than the
          section clips off its top ticks instead, which is cosmetic. ── */}
      <div style={{
        flex: 2, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        overflow: 'hidden',
      }}>
        {/* Visual-only offset on the knob alone — position:relative doesn't
            affect the flow of the value/label siblings below it. Tick
            stroke halved (tickStrokeScale=0.5) on this knob only — every
            other knob stays at MixerKnob's own app-wide default; this one's
            just dense enough (36 ticks) that full thickness looked heavy.
            The live %-value readout that used to sit here permanently is
            now a hover/drag tooltip instead — see the wrapping div below. */}
        <div
          ref={volumeKnobWrapRef}
          onMouseEnter={() => setVolumeHover(true)}
          onMouseLeave={() => setVolumeHover(false)}
          style={{ position: 'relative', top: 40 }}
        >
          <MixerKnob
            value={masterVolume} onChange={setMasterVolume}
            accentColor="var(--text-amber)" size={202.5}
            dotCount={36} tickMajorEvery={6} tickScale={0.5} tickStrokeScale={0.5} triScale={0.5}
            onDragChange={setVolumeDragging}
          />
          <TooltipBox
            anchorRect={(volumeHover || volumeDragging) ? volumeKnobWrapRef.current?.getBoundingClientRect() ?? null : null}
            content={{ title: 'Master Volume', description: `${Math.round(masterVolume * 100)}%` }}
            placement="left"
            visible={volumeHover || volumeDragging}
          />
        </div>
        {/* dB readout — centered, directly above the VOLUME label below (both
            26px-tall centered rows, same width, so they share one axis). */}
        <div style={{
          height: 20, width: 120, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 2,
        }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dimmest)' }}>
            {masterVolume === 0 ? '−∞ dB' : `${(20 * Math.log10(masterVolume)).toFixed(1)} dB`}
          </span>
        </div>
        {/* ── "Volume" label — wrapped in the exact same 26px centered row as
            ChannelStrip's Track-N pill (its last child too), so both cards'
            bottom label sits the same distance above the shared card edge
            instead of one being flush at 0 and the other centered in 26px. ── */}
        <div style={{
          height: 26, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-dimmest)',
          }}>
            Volume
          </span>
        </div>
      </div>

    </div>
  )
}
