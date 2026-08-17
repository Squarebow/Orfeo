import { useRef, useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import { TooltipBox } from './Tooltip'

// ── Bar geometry — signal-strength style: N vertical bars of ascending
// height, dot-sized at the left growing to full height at the right. Bars
// up to the current volume level are filled amber; the rest are dim
// outlines. ────────────────────────────────────────────────────────────────
const BAR_COUNT = 10
const BAR_W     = 3
const BAR_GAP   = 2
const BAR_MIN_H = 3
const BAR_MAX_H = 16
const TRACK_W   = BAR_COUNT * BAR_W + (BAR_COUNT - 1) * BAR_GAP

// ── VolumeKnob — ascending signal-bars slider for master volume control ──────
// (Kept the filename/export name — TopBar.tsx imports it as VolumeKnob and
// this is still the same "master volume control in the header" slot, just
// redrawn to fit the row: first a filled pill, now ascending bars per the
// requested signal-strength look.)
export default function VolumeKnob() {
  const masterVolume    = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)
  const draggingRef     = useRef(false)
  const trackRef        = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  // ── Same "hover OR dragging" combined-visibility pattern as MasterStrip's
  // Master Volume knob tooltip — a separate hover-only Tooltip plus a
  // separate isDragging-only box would show two overlapping readouts at
  // once while actually dragging, since the mouse stays over the track the
  // whole time. One TooltipBox with `visible: hover || isDragging` avoids
  // that entirely. ──────────────────────────────────────────────────────
  const [hover, setHover] = useState(false)

  // ── Convert mouse X to volume via track-relative fraction ────────────────
  const getVolumeFromMouse = useCallback((e: MouseEvent): number => {
    if (!trackRef.current) return masterVolume
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }, [masterVolume])

  // ── Mouse down — snaps volume to click position immediately on press ────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    setIsDragging(true)
    setMasterVolume(getVolumeFromMouse(e.nativeEvent))
  }, [getVolumeFromMouse, setMasterVolume])

  // ── Global mouse tracking while dragging ─────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setMasterVolume(getVolumeFromMouse(e))
    }
    const onUp = () => { draggingRef.current = false; setIsDragging(false) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [getVolumeFromMouse, setMasterVolume])

  const pct = Math.round(masterVolume * 100)
  const activeBars = Math.round(masterVolume * BAR_COUNT)

  return (
    // ── Real-flow column — [bars, label] stacked, same shape as its row
    // siblings (BAR COUNTER/TIME SIGNATURE/METRONOME/MIDI). alignSelf is
    // left to inherit the row's `alignItems:'flex-end'`, so this column's
    // bottom (the label) lines up with theirs exactly like every other
    // column does — no centering override, no absolutely-positioned label
    // trying to fake the same alignment from outside the flow. ───────────
    <div
      className="app-no-drag"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px', flexShrink: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        style={{
          width: TRACK_W, height: BAR_MAX_H,
          display: 'flex', alignItems: 'flex-end', gap: BAR_GAP,
          cursor: 'pointer', flexShrink: 0, position: 'relative',
        }}
      >
        <TooltipBox
          anchorRect={(hover || isDragging) ? trackRef.current?.getBoundingClientRect() ?? null : null}
          content={{ title: 'Volume', description: `${pct}%` }}
          placement="left"
          visible={hover || isDragging}
        />
        {Array.from({ length: BAR_COUNT }, (_, i) => {
          const h      = BAR_MIN_H + (BAR_MAX_H - BAR_MIN_H) * (i / (BAR_COUNT - 1))
          const active = i < activeBars
          return (
            <div key={i} style={{
              width: BAR_W, height: h, borderRadius: BAR_W / 2,
              background: active ? 'var(--text-amber)' : 'var(--state-disabled)',
            }} />
          )
        })}
      </div>
      <span style={{
        color: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1,
        marginTop: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
      }}>
        Volume
      </span>
    </div>
  )
}
