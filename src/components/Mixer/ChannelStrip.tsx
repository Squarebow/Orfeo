import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { Eye } from 'lucide-react'
import { useStore } from '../../store'
import MixerKnob from './MixerKnob'
import { MarqueeText } from '../MarqueeText'

// ── VU meter constants (canvas pixel units) ───────────────────────────────────
// Driven from MIDI velocity data — MIDI-event-driven, NOT audio-FFT-based.
// This is an architectural constraint: canvas can't read CSS vars, so colors
// are hardcoded here to match the --meter-* tokens in index.css exactly.
const SEG_H   = 4    // segment height in CSS px
const SEG_GAP = 2    // gap between segments in CSS px
const SEG_UNIT = SEG_H + SEG_GAP
const VU_W    = 14   // canvas CSS width in px
const METER_GREEN  = '#7ac040'
const METER_YELLOW = '#c0a020'
const METER_ORANGE = '#c07a20'
const METER_RED    = '#c04040'

// ── Segment color by position ─────────────────────────────────────────────────
function segColor(i: number, total: number): string {
  const pct = i / total
  if (pct >= 0.88) return METER_RED
  if (pct >= 0.75) return METER_ORANGE
  if (pct >= 0.60) return METER_YELLOW
  return METER_GREEN
}

// ── Draw VU meter canvas ──────────────────────────────────────────────────────
function drawVU(
  canvas: HTMLCanvasElement,
  level: number,
  attack: number,
  segs: number,
  canvasH: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const activeSeg = Math.floor(level * segs)

  for (let i = 0; i < segs; i++) {
    // Draw bottom-up: segment 0 = bottom, (segs-1) = top
    const y = (canvasH - (i + 1) * SEG_UNIT) * dpr
    const h = SEG_H * dpr
    const w = VU_W * dpr

    if (i < activeSeg) {
      ctx.fillStyle = segColor(i, segs)
      ctx.globalAlpha = 1
    } else if (i === activeSeg && attack > 0) {
      // Attack flash: top active segment briefly flares bright
      const t = attack
      ctx.fillStyle = `rgb(${Math.round(180 + 75 * t)}, ${Math.round(220 + 35 * t)}, ${Math.round(100 + 80 * t)})`
      ctx.globalAlpha = 0.65 + 0.35 * t
    } else {
      // Inactive segment — very dim ghost
      ctx.fillStyle = segColor(i, segs)
      ctx.globalAlpha = 0.08
    }
    ctx.fillRect(0, y, w, h)
  }
  ctx.globalAlpha = 1
}

// ── EyeClosed — copied from TrackPanel (not yet exported from there) ──────────
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

// ── IBtn — icon button, matches TrackPanel's IBtn exactly ────────────────────
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
        width: 20, height: 20, background: 'none', border: 'none',
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

// ── Fader constants ───────────────────────────────────────────────────────────
const HANDLE_H = 20
const HANDLE_W = 42

// ── ChannelStrip props ────────────────────────────────────────────────────────
export interface ChannelStripProps {
  trackName: string
  gmName: string
  color: string        // track color swatch (3px left stripe)
  muted: boolean
  solo: boolean
  visible: boolean
  showOnKeyboard: boolean
  onMute: () => void
  onSolo: () => void
  onVisible: () => void
  onKeyboard: () => void
}

// ── ChannelStrip — single 108×480 mixer channel strip ────────────────────────
export default function ChannelStrip({
  trackName, gmName, color,
  muted, solo, visible, showOnKeyboard,
  onMute, onSolo, onVisible, onKeyboard,
}: ChannelStripProps) {

  // ── GM engine check — disables Chorus/Reverb/Pan knobs ───────────────────
  const audioEngine   = useStore(s => s.audioEngine)
  const knobsDisabled = audioEngine === 'gm'

  // ── Local knob/fader state (store wiring comes in a later stage) ──────────
  const [chorus, setChorus] = useState(0.3)
  const [reverb, setReverb] = useState(0.3)
  const [pan,    setPan]    = useState(0)
  const [volume, setVolume] = useState(0.8)

  // ── VU meter — refs avoid re-renders in the rAF loop ─────────────────────
  const vuRef     = useRef<HTMLCanvasElement>(null)
  const vuLevel   = useRef(0)
  const vuAttack  = useRef(0)
  const rafRef    = useRef(0)

  // ── VU+Fader section height — measured via ResizeObserver ─────────────────
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionH, setSectionH] = useState(130)

  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSectionH(e.contentRect.height))
    ro.observe(el)
    setSectionH(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])

  // Derived VU canvas dimensions from section height (8px padding on each side)
  const vuCanvasH = Math.max(30, sectionH - 16)
  const vuSegs    = Math.max(5, Math.floor(vuCanvasH / SEG_UNIT))

  // ── Resize canvas when section height changes ──────────────────────────────
  useLayoutEffect(() => {
    const canvas = vuRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = VU_W * dpr
    canvas.height = vuCanvasH * dpr
    canvas.style.width  = VU_W + 'px'
    canvas.style.height = vuCanvasH + 'px'
  }, [vuCanvasH])

  // ── PLACEHOLDER: simulated velocity pulses for visual testing ─────────────
  // Replace with: per-track activeKeys velocity subscription from store.
  // Real implementation: subscribe to store tracks, find this track's notes
  // in activeKeys by MIDI channel, read velocity from note-on events.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const pulse = () => {
      vuLevel.current  = 0.25 + Math.random() * 0.70
      vuAttack.current = 1
      timer = setTimeout(pulse, 350 + Math.random() * 550)
    }
    timer = setTimeout(pulse, 200 + Math.random() * 400)
    return () => clearTimeout(timer)
  }, [])

  // ── rAF decay loop — decays level + attack, redraws every frame ───────────
  useEffect(() => {
    const loop = () => {
      vuLevel.current  = Math.max(0, vuLevel.current  - 0.013)
      vuAttack.current = Math.max(0, vuAttack.current - 0.06)
      if (vuRef.current) drawVU(vuRef.current, vuLevel.current, vuAttack.current, vuSegs, vuCanvasH)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuSegs, vuCanvasH])

  // ── Fader drag ────────────────────────────────────────────────────────────
  const handleFaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (muted) return
    e.preventDefault()
    const startY   = e.clientY
    const startVol = volume
    const travel   = sectionH - 16 - HANDLE_H  // px of fader travel (minus padding)

    const onMove = (me: MouseEvent) => {
      const delta = -(me.clientY - startY) / travel
      setVolume(Math.max(0, Math.min(1, startVol + delta)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [muted, volume, sectionH])

  // Muted → fader slides gracefully to bottom (0) in 150ms ease-out
  const visualVolume = muted ? 0 : volume
  const handleTop    = (1 - visualVolume) * (sectionH - 16 - HANDLE_H)

  // dB readout: standard unity mapping (volume 1 = 0 dB, 0 = −∞)
  const dbText = volume === 0 ? '−∞' : (20 * Math.log10(volume)).toFixed(1)

  return (
    <div style={{
      width: 108, height: 480, flexShrink: 0,
      background: 'var(--bg-tile)',
      border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>

      {/* ── Track name bar ────────────────────────────────────────────────── */}
      <div style={{
        height: 30, flexShrink: 0, display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <div style={{ width: 3, alignSelf: 'stretch', background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 6, paddingRight: 4 }}>
          <MarqueeText
            name={trackName}
            spanStyle={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', fontWeight: 500 }}
          />
        </div>
      </div>

      {/* ── Chorus knob ───────────────────────────────────────────────────── */}
      <div style={{
        height: 60, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <MixerKnob
          value={chorus} onChange={setChorus}
          accentColor="var(--knob-chorus)" size={36}
          disabled={knobsDisabled} label="Chorus"
        />
      </div>

      {/* ── Reverb knob ───────────────────────────────────────────────────── */}
      <div style={{
        height: 60, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <MixerKnob
          value={reverb} onChange={setReverb}
          accentColor="var(--knob-reverb)" size={36}
          disabled={knobsDisabled} label="Reverb"
        />
      </div>

      {/* ── M / S / Eye / Keyboard buttons ───────────────────────────────── */}
      <div style={{
        height: 32, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-evenly',
        paddingLeft: 4, paddingRight: 4,
        borderBottom: '1px solid var(--border)',
      }}>
        <IBtn onClick={onMute} active={muted} title={muted ? 'Unmute' : 'Mute'} activeColor="var(--status-error)">
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>M</span>
        </IBtn>
        <IBtn onClick={onSolo} active={solo} title={solo ? 'Unsolo' : 'Solo'} activeColor="var(--text-amber)">
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>S</span>
        </IBtn>
        <IBtn onClick={onVisible} active={!visible} title={visible ? 'Hide in roll' : 'Show in roll'} activeColor="#6080c0">
          {visible ? <Eye size={11} /> : <EyeClosed size={11} />}
        </IBtn>
        <IBtn onClick={onKeyboard} active={showOnKeyboard} title={showOnKeyboard ? 'Lit on keyboard' : 'Not lit on keyboard'} activeColor="var(--text-amber)">
          {/* Mini piano SVG — matches TrackPanel exactly */}
          <svg width="13" height="9" viewBox="0 0 13 9" fill="none">
            <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" vectorEffect="non-scaling-stroke"/>
            <rect x="2.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="5"   y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="7.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="10"  y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
          </svg>
        </IBtn>
      </div>

      {/* ── Pan knob ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 52, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <MixerKnob
          value={pan} onChange={setPan}
          accentColor="var(--text-amber)" size={30}
          disabled={knobsDisabled} bipolar label="Pan"
        />
      </div>

      {/* ── Volume label + dB readout ──────────────────────────────────────── */}
      <div style={{
        height: 38, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 4,
      }}>
        <span style={{
          fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-dimmest)',
        }}>
          Volume
        </span>
        <span style={{
          fontSize: 'var(--text-xs)', fontFamily: 'JetBrains Mono',
          color: 'var(--text-dim)',
          background: 'var(--bg-modal)', borderRadius: 'var(--radius-sm)',
          padding: '1px 6px', letterSpacing: '0.02em',
          minWidth: 52, textAlign: 'center',
        }}>
          {dbText} dB
        </span>
      </div>

      {/* ── VU meter + Fader (flex-grow, fills remaining height) ──────────── */}
      <div ref={sectionRef} style={{
        flex: 1, minHeight: 0,
        display: 'flex', gap: 6,
        padding: '8px 8px',
      }}>

        {/* VU meter — MIDI-velocity-driven; see PLACEHOLDER comment above */}
        <div style={{ display: 'flex', alignItems: 'flex-end', flexShrink: 0 }}>
          <canvas ref={vuRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        </div>

        {/* ── Fader ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', cursor: muted ? 'not-allowed' : 'default' }}>
          {/* Fader track — thin vertical line, centered */}
          <div style={{
            position: 'absolute',
            left: '50%', transform: 'translateX(-50%)',
            width: 3, borderRadius: 2,
            top: HANDLE_H / 2, bottom: HANDLE_H / 2,
            background: 'var(--border2)',
          }} />

          {/* Fader handle — amber pill, slides on mute via CSS transition */}
          <div
            onMouseDown={handleFaderMouseDown}
            style={{
              position: 'absolute',
              left: '50%', transform: 'translateX(-50%)',
              top: handleTop,
              width: HANDLE_W, height: HANDLE_H,
              borderRadius: HANDLE_H / 2,
              background: muted ? 'var(--state-disabled)' : 'var(--text-amber)',
              boxShadow: muted ? 'none' : '0 1px 5px rgba(232,160,39,0.4)',
              cursor: muted ? 'not-allowed' : 'grab',
              // Graceful mute slide: 150ms ease-out as specified
              transition: 'top 150ms ease-out, background 150ms ease-out, box-shadow 150ms ease-out',
            }}
          />
        </div>
      </div>

      {/* ── Instrument name pill ──────────────────────────────────────────── */}
      <div style={{
        height: 26, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderTop: '1px solid var(--border)', padding: '0 6px',
      }}>
        <span style={{
          fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.04em',
          color: 'var(--text-dimmest)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '100%', textAlign: 'center',
        }}>
          {gmName}
        </span>
      </div>
    </div>
  )
}
