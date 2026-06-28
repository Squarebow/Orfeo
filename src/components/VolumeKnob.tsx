import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store'

const AMBER     = '#e8a027'
const AMBER_DIM = '#e8a02738'
const LABEL_COL = '#707088'

// Knob geometry
const CX = 26, CY = 26                // SVG center
const OUTER_R  = 21                   // radius for surrounding dot ring
const DOT_R    = 3                    // radius of each surrounding dot
const KNOB_R   = 13                   // radius of central amber circle
const NOTCH_R  = 8.5                  // distance of notch indicator from center
const NOTCH_DOT_R = 2.5              // radius of notch indicator dot

// Arc geometry: 7:30 clock = 135° SVG, 4:30 clock = 45° SVG, 270° sweep clockwise
const ARC_START  = 135               // SVG degrees — 7:30 position (minimum)
const ARC_SWEEP  = 270               // total sweep in degrees
const DOT_COUNT  = 7
const DOT_STEP   = ARC_SWEEP / (DOT_COUNT - 1)  // 45° between each dot

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

export default function VolumeKnob() {
  const masterVolume    = useStore((s) => s.masterVolume)
  const setMasterVolume = useStore((s) => s.setMasterVolume)
  const draggingRef     = useRef(false)
  const svgRef          = useRef<SVGSVGElement>(null)

  // ── Precompute dot positions and active states ────────────────────────────
  const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle  = ARC_START + i * DOT_STEP
    const pos    = polarToXY(CX, CY, OUTER_R, angle)
    const active = (i / (DOT_COUNT - 1)) <= masterVolume
    return { ...pos, active }
  })

  // ── Notch indicator position ──────────────────────────────────────────────
  const notchAngle = ARC_START + masterVolume * ARC_SWEEP
  const notchPos   = polarToXY(CX, CY, NOTCH_R, notchAngle)

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
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', flexShrink: 0 }}
      title={`Volume: ${pct}%`}
    >
      <svg
        ref={svgRef}
        width={44} height={44}
        viewBox="0 0 52 52"
        style={{ cursor: 'pointer', flexShrink: 0, display: 'block' }}
        onMouseDown={handleMouseDown}
      >
        {/* Fixed dots around arc — amber when active (≤ level), dim tint for headroom */}
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x} cy={dot.y} r={DOT_R}
            fill={dot.active ? AMBER : AMBER_DIM}
          />
        ))}
        {/* Central amber knob circle */}
        <circle cx={CX} cy={CY} r={KNOB_R} fill={AMBER} />
        {/* Rotating notch indicator — dark dot on knob perimeter */}
        <circle cx={notchPos.x} cy={notchPos.y} r={NOTCH_DOT_R} fill="#111116" />
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
