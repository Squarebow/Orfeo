import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { Eye } from 'lucide-react'
import { useStore } from '../../store'
import MixerKnob from './MixerKnob'
import { MarqueeText } from '../MarqueeText'
import {
  setChannelChorus,
  setChannelReverb,
  setChannelPan,
  setChannelVolume,
} from '../../hooks/useSamplesEngine'

// ── VU meter constants ────────────────────────────────────────────────────────
const SEG_H    = 4    // segment height in CSS px
const SEG_GAP  = 2    // gap between segments
const SEG_UNIT = SEG_H + SEG_GAP
const VU_W     = 16   // canvas CSS width in px

// ── Draw VU — segmented bars in track color, no zone gradient ────────────────
// Active segments at full track color; inactive at dim (alpha 0.08).
function drawVU(
  canvas: HTMLCanvasElement,
  level: number,
  color: string,
  segs: number,
  canvasH: number,
) {
  const dpr = window.devicePixelRatio || 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const activeSeg = Math.floor(level * segs)
  const w = VU_W * dpr

  ctx.fillStyle = color
  for (let i = 0; i < segs; i++) {
    const y = (canvasH - (i + 1) * SEG_UNIT) * dpr
    ctx.globalAlpha = i < activeSeg ? 1 : 0.08
    ctx.fillRect(0, y, w, SEG_H * dpr)
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
        width: 26, height: 26, background: 'var(--bg-deep)', border: 'none',
        cursor: 'pointer', borderRadius: 4, transition: 'color 0.1s',
        color: active ? activeColor : 'var(--text-icon-inactive)', flexShrink: 0,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-icon-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? activeColor : 'var(--text-icon-inactive)' }}
    >
      {children}
    </button>
  )
}

// ── Fader constants ───────────────────────────────────────────────────────────
const HANDLE_H = 20
const HANDLE_W = 46

// ── Fader tick marks — alternating major/minor on both sides of the track ────
// Major ticks at every 4th position; minor between them.
const FADER_TICK_COUNT = 13
const FADER_MAJOR_EVERY = 4
// Reserve space at the top of the fader so the dB pill and handle never overlap
const FADER_TOP_PAD = 24

// ── ChannelStrip props ────────────────────────────────────────────────────────
export interface ChannelStripProps {
  trackIndex: number
}

// ── ChannelStrip — single 108×480 mixer channel strip ────────────────────────
export default function ChannelStrip({ trackIndex }: ChannelStripProps) {

  // ── Store reads ───────────────────────────────────────────────────────────
  const audioEngine  = useStore(s => s.audioEngine)
  const tracks       = useStore(s => s.tracks)
  const updateTrack  = useStore(s => s.updateTrack)
  const midi         = useStore(s => s.midi)

  const track       = tracks.find(t => t.index === trackIndex)
  const parsedTrack = midi?.tracks.find((t: any) => t.index === trackIndex)

  const knobsDisabled = audioEngine === 'gm'

  // ── Fallback track color — resolved from var(--track-color-fallback) once on mount ───
  // Canvas 2D fillStyle (VU meter, below) can't consume a var() string directly, so this
  // ref caches the resolved value; index.css stays the single source of truth for it.
  const fallbackColorRef = useRef('#808080')
  useEffect(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--track-color-fallback').trim()
    if (v) fallbackColorRef.current = v
  }, [])

  // ── Derived display data ──────────────────────────────────────────────────
  const trackName   = track?.trackName ?? track?.gmName ?? (parsedTrack as any)?.name ?? ''
  // Fallback color for tracks with no assigned color — also feeds the Canvas VU-meter
  // fillStyle below, and Canvas 2D can't resolve a var() string, so fallbackColorRef
  // resolves var(--track-color-fallback) from index.css once on mount (see below);
  // '#808080' here only covers the sliver of first render before that effect runs.
  const trackColor  = (track as any)?.color   ?? (parsedTrack as any)?.color   ?? fallbackColorRef.current
  // MIDI channel from the file (0-based) — NOT the same as trackIndex
  const midiChannel = (parsedTrack as any)?.channel ?? 0

  const muted        = track?.muted        ?? false
  const solo         = track?.solo         ?? false
  const visible      = track?.visible      ?? true
  const showOnKeyboard = track?.showOnKeyboard ?? false

  // ── Knob/fader state — lives in store (per-track), seeded from CC data on
  // file load — lets MixerConsole diff against mixerBaseline on close to
  // detect unsaved changes and offer to persist them back into the file. ──
  const [dragging, setDragging] = useState(false)
  const chorus = track?.chorus ?? 0
  const reverb = track?.reverb ?? 0
  const pan    = track?.pan    ?? 0
  const volume = track?.volume ?? 1

  // ── Knob handlers — update store and send CC to the Samples engine ───────
  const handleChorus = useCallback((v: number) => { updateTrack(trackIndex, { chorus: v }); setChannelChorus(midiChannel, v) }, [trackIndex, midiChannel, updateTrack])
  const handleReverb = useCallback((v: number) => { updateTrack(trackIndex, { reverb: v }); setChannelReverb(midiChannel, v) }, [trackIndex, midiChannel, updateTrack])
  const handlePan    = useCallback((v: number) => { updateTrack(trackIndex, { pan: v });    setChannelPan(midiChannel, v)    }, [trackIndex, midiChannel, updateTrack])

  // ── VU meter — refs avoid re-renders in the rAF loop ─────────────────────
  const vuRef    = useRef<HTMLCanvasElement>(null)
  const vuLevel  = useRef(0)
  const colorRef = useRef(trackColor)
  const rafRef   = useRef(0)

  // ── Keep colorRef current so rAF closure always sees the latest track color ─
  useEffect(() => { colorRef.current = trackColor }, [trackColor])

  // ── VU+Fader section height — measured via ResizeObserver ─────────────────
  const sectionRef = useRef<HTMLDivElement>(null)
  const [sectionH, setSectionH] = useState(250)

  useLayoutEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSectionH(e.contentRect.height))
    ro.observe(el)
    setSectionH(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [])

  // Derived VU canvas height from section height (8px top padding, 0px bottom)
  const vuCanvasH = Math.max(30, sectionH - 8)
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

  // ── VU subscription — watches currentTime to scan active notes by velocity ─
  // Uses useStore.subscribe (not useStore hook) so velocity updates don't cause
  // re-renders; the rAF loop picks up the ref values each frame instead.
  useEffect(() => {
    const unsub = useStore.subscribe(state => {
      const { currentTime, playbackState, midi: md, tracks: tks } = state
      if (playbackState !== 'playing' || !md) return
      const tr = tks.find(t => t.index === trackIndex)
      if (!tr || tr.muted) return
      const pt = md.tracks.find((t: any) => t.index === trackIndex)
      if (!pt) return

      let maxVel = 0
      for (const note of pt.notes) {
        // Notes are sorted by time — skip once past current window
        if (note.time > currentTime + 0.02) break
        if (currentTime < note.time + note.duration && note.velocity > maxVel)
          maxVel = note.velocity
      }
      if (maxVel > 0) vuLevel.current = maxVel
    })
    return unsub
  }, [trackIndex])

  // ── rAF decay loop — decays level each frame, redraws segmented bars ────────
  useEffect(() => {
    const loop = () => {
      vuLevel.current = Math.max(0, vuLevel.current - 0.013)
      if (vuRef.current) {
        drawVU(vuRef.current, vuLevel.current, colorRef.current, vuSegs, vuCanvasH)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [vuSegs, vuCanvasH])

  // ── Fader drag ────────────────────────────────────────────────────────────
  const handleFaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (muted) return
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
    const startY   = e.clientY
    const startVol = volume
    const travel   = sectionH - 8 - HANDLE_H - FADER_TOP_PAD

    const onMove = (me: MouseEvent) => {
      const v = Math.max(0, Math.min(1, startVol + -(me.clientY - startY) / travel))
      updateTrack(trackIndex, { volume: v })
      setChannelVolume(midiChannel, v)
    }
    const onUp = () => {
      setDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [muted, volume, sectionH, trackIndex, midiChannel, updateTrack])

  // Muted → fader slides gracefully to bottom (0) in 150ms ease-out
  const visualVolume = muted ? 0 : volume
  const handleTop    = FADER_TOP_PAD + (1 - visualVolume) * (sectionH - 8 - HANDLE_H - FADER_TOP_PAD)

  // dB readout: standard unity mapping (volume 1 = 0 dB, 0 = −∞)
  const dbText = volume === 0 ? '−∞' : (20 * Math.log10(volume)).toFixed(1)

  return (
    <div style={{
      width: 120, height: 574, flexShrink: 0,
      background: 'var(--bg-tile)',
      border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-md)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
      position: 'relative',
    }}>

      {/* ── Track name bar ────────────────────────────────────────────────── */}
      <div style={{
        height: 30, flexShrink: 0, display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--border)', overflow: 'hidden',
      }}>
        <div style={{ width: 3, alignSelf: 'stretch', background: trackColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 6, paddingRight: 4 }}>
          <MarqueeText
            name={trackName}
            spanStyle={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', fontWeight: 500 }}
          />
        </div>
      </div>

      {/* ── Chorus knob ───────────────────────────────────────────────────── */}
      <div style={{
        height: 66, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <MixerKnob
          value={chorus} onChange={handleChorus}
          accentColor="var(--knob-chorus)" size={52}
          disabled={knobsDisabled} label="Chorus"
        />
      </div>

      {/* ── Reverb knob ───────────────────────────────────────────────────── */}
      <div style={{
        height: 66, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <MixerKnob
          value={reverb} onChange={handleReverb}
          accentColor="var(--knob-reverb)" size={52}
          disabled={knobsDisabled} label="Reverb"
        />
      </div>

      {/* ── Pan knob — L/R flanking labels ───────────────────────────────── */}
      <div style={{
        height: 66, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        gap: 6,
      }}>
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.06em',
          color: 'var(--text-dimmest)', fontWeight: 700, lineHeight: 1,
          marginBottom: 14,
        }}>L</span>
        <MixerKnob
          value={pan} onChange={handlePan}
          accentColor="var(--text-amber)" size={52}
          disabled={knobsDisabled} bipolar label="Pan"
        />
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.06em',
          color: 'var(--text-dimmest)', fontWeight: 700, lineHeight: 1,
          marginBottom: 14,
        }}>R</span>
      </div>

      {/* ── Mute overlay — grey wash over entire strip; M button sits above it ── */}
      {muted && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          borderRadius: 'var(--radius-md)',
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      )}

      {/* ── M / S / Eye / Keyboard buttons ───────────────────────────────── */}
      <div style={{
        height: 46, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 3, padding: 0,
        position: 'relative', zIndex: 2,
      }}>
        <IBtn
          onClick={() => updateTrack(trackIndex, { muted: !muted })}
          active={muted} title={muted ? 'Unmute' : 'Mute'}
          activeColor="var(--status-error)"
        >
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>M</span>
        </IBtn>
        <IBtn
          onClick={() => updateTrack(trackIndex, { solo: !solo })}
          active={solo} title={solo ? 'Unsolo' : 'Solo'}
          activeColor="var(--text-amber)"
        >
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>S</span>
        </IBtn>
        <IBtn
          onClick={() => updateTrack(trackIndex, { visible: !visible })}
          active={true} title={visible ? 'Hide in roll' : 'Show in roll'}
          activeColor={visible ? 'var(--text-amber)' : 'var(--status-error)'}
        >
          {visible ? <Eye size={14} /> : <EyeClosed size={14} />}
        </IBtn>
        <IBtn
          onClick={() => updateTrack(trackIndex, { showOnKeyboard: !showOnKeyboard })}
          active={showOnKeyboard} title={showOnKeyboard ? 'Lit on keyboard' : 'Not lit on keyboard'}
          activeColor="var(--text-amber)"
        >
          {/* Mini piano SVG — vectorEffect non-scaling-stroke preserved at all sizes;
              one black key fewer, scaled down to match the M/S/Eye icons beside it ── */}
          <svg width="15" height="11" viewBox="0 0 13 9" fill="none">
            <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9" vectorEffect="non-scaling-stroke"/>
            <rect x="3" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="6" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="9" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
          </svg>
        </IBtn>
      </div>

      {/* ── VU meter + Fader (flex-grow, fills remaining height) ──────────── */}
      <div ref={sectionRef} style={{
        flex: 1, minHeight: 0,
        display: 'flex', gap: 6,
        padding: '8px 8px 0',
      }}>

        {/* VU meter — driven by MIDI velocity via useStore.subscribe */}
        <div style={{ display: 'flex', alignItems: 'flex-end', flexShrink: 0 }}>
          <canvas ref={vuRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
        </div>

        {/* ── Fader ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', cursor: muted ? 'not-allowed' : 'default' }}>

          {/* Fader tick marks — major every 4th, minor between, on both sides */}
          {Array.from({ length: FADER_TICK_COUNT }, (_, i) => {
            const travel   = sectionH - 8 - HANDLE_H - FADER_TOP_PAD
            const y        = FADER_TOP_PAD + HANDLE_H / 2 + i * (travel / (FADER_TICK_COUNT - 1))
            const isMajor  = i % FADER_MAJOR_EVERY === 0
            const tickW    = isMajor ? 7 : 4
            const tickH    = 1
            const color    = isMajor ? 'var(--fader-tick-major)' : 'var(--fader-tick-minor)'
            return (
              <div key={i}>
                {/* Left tick */}
                <div style={{
                  position: 'absolute',
                  right: `calc(50% + 3.5px)`,
                  top: y - tickH / 2,
                  width: tickW, height: tickH,
                  background: color, borderRadius: 1,
                }} />
                {/* Right tick */}
                <div style={{
                  position: 'absolute',
                  left: `calc(50% + 3.5px)`,
                  top: y - tickH / 2,
                  width: tickW, height: tickH,
                  background: color, borderRadius: 1,
                }} />
              </div>
            )
          })}

          {/* Fader track — thin vertical line, centered */}
          <div style={{
            position: 'absolute',
            left: '50%', transform: 'translateX(-50%)',
            width: 3, borderRadius: 2,
            top: FADER_TOP_PAD + HANDLE_H / 2, bottom: HANDLE_H / 2,
            background: 'var(--border2)',
          }} />

          {/* Fader handle — amber pill with score lines; slides on mute */}
          <div
            onMouseDown={handleFaderMouseDown}
            style={{
              position: 'absolute',
              left: '50%', transform: 'translateX(-50%)',
              top: handleTop,
              width: HANDLE_W, height: HANDLE_H,
              borderRadius: HANDLE_H / 2,
              background: muted ? 'var(--state-disabled)' : 'var(--text-amber)',
              boxShadow: muted ? 'none' : '0 1px 5px var(--accent-amber-shadow)',
              cursor: muted ? 'not-allowed' : 'grab',
              zIndex: 2,
              transition: dragging
                ? 'background 150ms ease-out, box-shadow 150ms ease-out'
                : 'top 150ms ease-out, background 150ms ease-out, box-shadow 150ms ease-out',
            }}
          >
            {/* Grip score lines */}
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                position: 'absolute',
                left: 9, right: 9,
                top: Math.round(5 + i * 4),
                height: 1,
                background: muted ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.18)',
                borderRadius: 1,
              }} />
            ))}
          </div>

          {/* dB readout — absolute, top of fader area, centered on line */}
          <div style={{
            position: 'absolute',
            left: '50%', transform: 'translateX(-50%)',
            top: 0, zIndex: 1,
            fontSize: 'var(--text-xs)', fontFamily: 'JetBrains Mono',
            color: 'var(--text-dim)',
            background: 'var(--bg-tile)', borderRadius: 'var(--radius-sm)',
            padding: '1px 5px', letterSpacing: '0.02em',
            whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>
            {dbText} dB
          </div>

        </div>
      </div>

      {/* ── VOLUME label — mirrors fader row structure so text centers on fader track ── */}
      <div style={{
        height: 24, flexShrink: 0,
        display: 'flex', padding: '0 8px', gap: 6,
      }}>
        {/* Spacer matching VU canvas width — shifts content right to fader zone */}
        <div style={{ width: VU_W, flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
          <span style={{
            fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--text-dimmest)',
          }}>
            Volume
          </span>
        </div>
      </div>

      {/* ── Track identifier pill ─────────────────────────────────────────── */}
      <div style={{
        height: 26, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 6px',
      }}>
        <span style={{
          fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          color: 'var(--text-dimmest)',
          textTransform: 'uppercase',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '100%', textAlign: 'center',
        }}>
          Track {trackIndex + 1}
        </span>
      </div>
    </div>
  )
}
