import { useRef, useEffect, useCallback } from 'react'

// Knob geometry — matches VolumeKnob.tsx exactly; viewBox stays 52×52,
// rendered size is controlled by the `size` prop.
const CX = 26, CY = 26
const OUTER_R      = 21
const DOT_R        = 2.5
const KNOB_R       = 13
const NOTCH_R      = 8.5
const NOTCH_DOT_R  = 2.5
const ARC_START    = 135    // SVG degrees — 7:30 position
const ARC_SWEEP    = 270    // total clockwise sweep to 4:30
const DOT_COUNT    = 7
const DOT_STEP     = ARC_SWEEP / (DOT_COUNT - 1)

// Inactive dot color — neutral dark, works against any accent color
const DIM_DOT = '#303048'

// ── Convert polar angle to Cartesian ─────────────────────────────────────────
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = angleDeg * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ── SVG angle → normalized 0–1 (dead zone clamped) ───────────────────────────
function angleToNorm(deg: number): number {
  if (deg >= ARC_START) return (deg - ARC_START) / ARC_SWEEP
  if (deg <= 45)        return (deg + 225) / ARC_SWEEP
  return deg <= 90 ? 1 : 0   // dead zone — clamp to nearest end
}

export interface MixerKnobProps {
  value: number              // 0–1 for unidirectional; –1…+1 when bipolar=true
  onChange: (v: number) => void
  accentColor: string        // CSS var string or hex — used as SVG fill via style prop
  size?: number              // rendered px square, default 40
  disabled?: boolean         // greyed out; interaction blocked (GM engine)
  bipolar?: boolean          // Pan mode: value 0 sits at 12 o'clock
  label?: string             // small uppercase label rendered below knob
}

// ── MixerKnob — generic dot-arc + notch knob for mixer channel strips ────────
export default function MixerKnob({
  value, onChange, accentColor, size = 40,
  disabled = false, bipolar = false, label,
}: MixerKnobProps) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  // Normalize to 0–1 arc position regardless of value domain
  const norm        = Math.max(0, Math.min(1, bipolar ? (value + 1) / 2 : value))
  const notchAngle  = ARC_START + norm * ARC_SWEEP
  const notchPos    = polarToXY(CX, CY, NOTCH_R, notchAngle)

  // ── Dot ring positions + active state ────────────────────────────────────
  const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle = ARC_START + i * DOT_STEP
    const pos   = polarToXY(CX, CY, OUTER_R, angle)
    return { ...pos, active: (i / (DOT_COUNT - 1)) <= norm }
  })

  // ── Convert mouse position to knob value ──────────────────────────────────
  const getValueFromMouse = useCallback((e: MouseEvent): number => {
    if (!svgRef.current) return value
    const rect  = svgRef.current.getBoundingClientRect()
    const scale = rect.width / 52
    const dx    = (e.clientX - rect.left) / scale - CX
    const dy    = (e.clientY - rect.top)  / scale - CY
    let deg     = Math.atan2(dy, dx) * (180 / Math.PI)
    if (deg < 0) deg += 360
    const n = Math.max(0, Math.min(1, angleToNorm(deg)))
    if (bipolar) {
      const bv = n * 2 - 1
      // Centre detent snap: within ±7% of centre, lock to exactly 0
      return Math.abs(bv) < 0.07 ? 0 : bv
    }
    return n
  }, [value, bipolar])

  // ── Mouse down — snap + begin drag ───────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    dragging.current = true
    onChange(getValueFromMouse(e.nativeEvent))
  }, [disabled, onChange, getValueFromMouse])

  // ── Global mouse tracking while dragging ──────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (dragging.current) onChange(getValueFromMouse(e)) }
    const onUp   = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [onChange, getValueFromMouse])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      opacity: disabled ? 0.3 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
    }}>
      <svg
        ref={svgRef}
        width={size} height={size}
        viewBox="0 0 52 52"
        style={{ cursor: 'pointer', display: 'block', flexShrink: 0 }}
        onMouseDown={handleMouseDown}
      >
        {/* Dot arc ring — active dots use accent color, inactive are dim */}
        {dots.map((d, i) => (
          <circle
            key={i} cx={d.x} cy={d.y} r={DOT_R}
            style={{ fill: d.active ? accentColor : DIM_DOT }}
          />
        ))}
        {/* Central knob body */}
        <circle cx={CX} cy={CY} r={KNOB_R} style={{ fill: accentColor }} />
        {/* Rotating notch indicator — dark dot on knob perimeter */}
        <circle cx={notchPos.x} cy={notchPos.y} r={NOTCH_DOT_R} style={{ fill: 'var(--bg-deep)' }} />
      </svg>

      {label && (
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-dimmest)',
          userSelect: 'none', lineHeight: 1,
        }}>
          {label}
        </span>
      )}
    </div>
  )
}
