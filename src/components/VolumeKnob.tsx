import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'

const AMBER     = '#e8a027'
const LABEL_COL = 'var(--text-dimmest)'
const DIM_TICK  = '#303048'

// Knob geometry — matches MixerKnob exactly
const CX = 26, CY = 26
const KNOB_R    = 13
const NOTCH_R   = 8.5
const ARC_START = 135
const ARC_SWEEP = 270
const DOT_COUNT = 7

// Tick mark geometry (same constants as MixerKnob)
const TICK_GAP   = 1.5
const TICK_INR   = KNOB_R + TICK_GAP   // = 14.5
const TICK_LONG  = 4.0
const STROKE_TICK = 0.5

// Triangle notch (same constants as MixerKnob)
const TRI_TIP_R  = NOTCH_R + 3.2
const TRI_BASE_R = NOTCH_R - 2.8
const TRI_HW     = 2.8

// ── Convert polar (angle in SVG degrees) to Cartesian ────────────────────────
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = angleDeg * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ── Map SVG atan2 angle (0–360) to volume 0–1 ────────────────────────────────
// Valid arc: 135° → 135+270° = 405° (i.e., 45°) going clockwise
// Dead zone: [45°, 135°] (the bottom gap between 4:30 and 7:30)
function angleToVolume(angleDeg: number): number {
  if (angleDeg >= ARC_START) {
    return (angleDeg - ARC_START) / ARC_SWEEP
  }
  if (angleDeg <= 45) {
    return (angleDeg + 225) / ARC_SWEEP
  }
  // Dead zone — clamp to nearest end
  return angleDeg <= 90 ? 1 : 0
}

// ── VolumeKnob — interactive SVG amber knob for master volume control ────────
export default function VolumeKnob() {
  const masterVolume    = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)
  const draggingRef     = useRef(false)
  const svgRef          = useRef<SVGSVGElement>(null)

  // ── Tick marks — active (≤ level) in amber, inactive in dim ─────────────
  const ticks = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle  = ARC_START + i * (ARC_SWEEP / (DOT_COUNT - 1))
    const inner  = polarToXY(CX, CY, TICK_INR, angle)
    const outer  = polarToXY(CX, CY, TICK_INR + TICK_LONG, angle)
    const active = (i / (DOT_COUNT - 1)) <= masterVolume
    return { inner, outer, active }
  })

  // ── Triangle notch indicator ──────────────────────────────────────────────
  const notchAngle = ARC_START + masterVolume * ARC_SWEEP
  const notchRad   = notchAngle * (Math.PI / 180)
  const perpRad    = (notchAngle + 90) * (Math.PI / 180)
  const triTip     = { x: CX + TRI_TIP_R  * Math.cos(notchRad), y: CY + TRI_TIP_R  * Math.sin(notchRad) }
  const baseCx     = CX + TRI_BASE_R * Math.cos(notchRad)
  const baseCy     = CY + TRI_BASE_R * Math.sin(notchRad)
  const triL       = { x: baseCx + TRI_HW * Math.cos(perpRad), y: baseCy + TRI_HW * Math.sin(perpRad) }
  const triR       = { x: baseCx - TRI_HW * Math.cos(perpRad), y: baseCy - TRI_HW * Math.sin(perpRad) }
  const triPts     = `${triTip.x},${triTip.y} ${triL.x},${triL.y} ${triR.x},${triR.y}`

  // ── Convert mouse event to volume via SVG-relative angle ─────────────────
  const getVolumeFromMouse = useCallback((e: MouseEvent): number => {
    if (!svgRef.current) return masterVolume
    const rect  = svgRef.current.getBoundingClientRect()
    const scale = rect.width / 52                    // SVG viewBox is 52 wide
    const dx    = (e.clientX - rect.left) / scale - CX
    const dy    = (e.clientY - rect.top)  / scale - CY
    let deg     = Math.atan2(dy, dx) * (180 / Math.PI)
    if (deg < 0) deg += 360
    return Math.max(0, Math.min(1, angleToVolume(deg)))
  }, [masterVolume])

  // ── Mouse down — snaps volume to click position immediately on press ────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    // Snap immediately on click (not just drag start)
    const v = getVolumeFromMouse(e.nativeEvent)
    setMasterVolume(v)
  }, [getVolumeFromMouse, setMasterVolume])

  // ── Global mouse tracking while dragging ─────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      setMasterVolume(getVolumeFromMouse(e))
    }
    const onUp = () => { draggingRef.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [getVolumeFromMouse, setMasterVolume])

  const pct = Math.round(masterVolume * 100)

  return (
    // ── Mirrors BPM/KEY structure: knob left, label column right ─────────────
    // alignItems:center means the 17px label column centers against the 44px SVG,
    // putting VOLUME at the same baseline as TEMPO / TRANSPOSE to its left.
    <div
      className="app-no-drag"
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 var(--space-3)', flexShrink: 0 }}
      title={`Volume: ${pct}%`}
    >
      <svg
        ref={svgRef}
        width={44} height={44}
        viewBox="0 0 52 52"
        style={{ cursor: 'pointer', flexShrink: 0, display: 'block' }}
        onMouseDown={handleMouseDown}
      >
        {/* Tick ring — active ticks in amber */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.inner.x} y1={t.inner.y}
            x2={t.outer.x} y2={t.outer.y}
            strokeWidth={STROKE_TICK}
            strokeLinecap="round"
            style={{ stroke: t.active ? AMBER : DIM_TICK }}
          />
        ))}
        {/* Central amber knob body */}
        <circle cx={CX} cy={CY} r={KNOB_R} fill={AMBER} />
        {/* Triangle notch indicator */}
        <polygon points={triPts} fill="var(--bg-deep)" />
      </svg>

      {/* Two-row label column: empty top row shifts VOLUME to TEMPO/TRANSPOSE height */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
        <span style={{ fontSize: 8, lineHeight: 1 }}>&nbsp;</span>
        <span style={{
          color: LABEL_COL,
          fontSize: 8,
          fontFamily: 'JetBrains Mono',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          lineHeight: 1,
          userSelect: 'none',
        }}>
          VOLUME
        </span>
      </div>
    </div>
  )
}
