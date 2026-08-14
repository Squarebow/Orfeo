import { useRef, useEffect, useCallback } from 'react'

// Knob geometry — viewBox stays 52×52; rendered size controlled by `size` prop.
const CX = 26, CY = 26
const KNOB_R      = 13
const NOTCH_R     = 8.5
const ARC_START   = 135   // SVG degrees — 7:30 position
const ARC_SWEEP   = 270   // total clockwise sweep to 4:30
const DOT_COUNT   = 7     // default tick count

// Tick mark geometry (SVG viewBox units, bottom-aligned):
// All ticks share TICK_INR as their inner (bottom) edge; length varies outward.
// Major ticks extend to TICK_INR + TICK_LONG; minor to TICK_INR + TICK_SHORT.
const TICK_GAP   = 1.5   // gap between knob body edge (KNOB_R) and inner tick edge
const TICK_INR   = KNOB_R + TICK_GAP   // inner radius shared by all ticks (= 14.5)
const TICK_LONG  = 4.0   // major tick length (outward from TICK_INR)
const TICK_SHORT = 1.8   // minor tick length (outward from TICK_INR)
const STROKE_TICK = 0.5  // hairline — length only distinguishes major from minor

// Triangle notch indicator dimensions
const TRI_TIP_R  = NOTCH_R + 3.2   // tip extends this far from center
const TRI_BASE_R = NOTCH_R - 2.8   // base sits this far from center
const TRI_HW     = 2.8              // half-width of triangle base

const DIM_TICK = 'var(--state-disabled)'

// ── Convert polar angle to Cartesian ─────────────────────────────────────────
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = angleDeg * (Math.PI / 180)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ── SVG angle → normalized 0–1 (dead zone clamped) ───────────────────────────
function angleToNorm(deg: number): number {
  if (deg >= ARC_START) return (deg - ARC_START) / ARC_SWEEP
  if (deg <= 45)        return (deg + 225) / ARC_SWEEP
  return deg <= 90 ? 1 : 0
}

export interface MixerKnobProps {
  value: number              // 0–1 for unidirectional; –1…+1 when bipolar=true
  onChange: (v: number) => void
  accentColor: string        // CSS var string or hex
  size?: number              // rendered px square, default 40
  disabled?: boolean
  bipolar?: boolean          // Pan mode: value 0 sits at 12 o'clock
  label?: string
  dotCount?: number          // number of tick marks (default 7)
  tickMajorEvery?: number    // every Nth tick is long; 0 = all same (default)
  tickScale?: number         // scales both tick lengths; 1.0 = default, <1 = shorter
  triScale?: number          // scales triangle indicator; 1.0 = default, <1 = smaller
  title?: string             // hover tooltip on the whole knob+label
}

// ── MixerKnob — tick-arc knob with triangle notch indicator ──────────────────
export default function MixerKnob({
  value, onChange, accentColor, size = 40,
  disabled = false, bipolar = false, label,
  dotCount = DOT_COUNT, tickMajorEvery = 0, tickScale = 1, triScale = 1,
  title,
}: MixerKnobProps) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const norm       = Math.max(0, Math.min(1, bipolar ? (value + 1) / 2 : value))
  const notchAngle = ARC_START + norm * ARC_SWEEP

  // ── Triangle notch indicator — tip points outward in notch direction ──────
  // triScale shrinks the triangle toward NOTCH_R center without moving its axis
  const tipR  = NOTCH_R + (TRI_TIP_R  - NOTCH_R) * triScale
  const baseR = NOTCH_R - (NOTCH_R - TRI_BASE_R) * triScale
  const hw    = TRI_HW * triScale
  const notchRad = notchAngle * (Math.PI / 180)
  const perpRad  = (notchAngle + 90) * (Math.PI / 180)
  const triTip   = { x: CX + tipR  * Math.cos(notchRad), y: CY + tipR  * Math.sin(notchRad) }
  const baseCx   = CX + baseR * Math.cos(notchRad)
  const baseCy   = CY + baseR * Math.sin(notchRad)
  const triL     = { x: baseCx + hw * Math.cos(perpRad), y: baseCy + hw * Math.sin(perpRad) }
  const triR     = { x: baseCx - hw * Math.cos(perpRad), y: baseCy - hw * Math.sin(perpRad) }
  const triPts   = `${triTip.x},${triTip.y} ${triL.x},${triL.y} ${triR.x},${triR.y}`

  // ── Tick marks — bottom-aligned (shared inner edge at TICK_INR) ───────────
  // Major ticks extend farther outward; minor ticks stay shorter.
  // Uniform stroke width — length only distinguishes major from minor.
  const ticks = Array.from({ length: dotCount }, (_, i) => {
    const angle   = ARC_START + i * (ARC_SWEEP / (dotCount - 1))
    const isMajor = tickMajorEvery === 0 || i % tickMajorEvery === 0
    const tickLen = (isMajor ? TICK_LONG : TICK_SHORT) * tickScale
    const inner   = polarToXY(CX, CY, TICK_INR, angle)
    const outer   = polarToXY(CX, CY, TICK_INR + tickLen, angle)
    const active  = (i / (dotCount - 1)) <= norm
    return { inner, outer, active }
  })

  // ── Mouse interaction ─────────────────────────────────────────────────────
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
      return Math.abs(bv) < 0.07 ? 0 : bv
    }
    return n
  }, [value, bipolar])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    onChange(getValueFromMouse(e.nativeEvent))
  }, [disabled, onChange, getValueFromMouse])

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

  // ── Keyboard interaction — arrow keys nudge the value, additive to drag ────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return
    const min = bipolar ? -1 : 0
    const step = (e.shiftKey ? 5 : 1) * (bipolar ? 0.04 : 0.02)
    let delta = 0
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') delta = step
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') delta = -step
    else if (e.key === 'Home') { e.preventDefault(); onChange(min); return }
    else if (e.key === 'End') { e.preventDefault(); onChange(1); return }
    else return
    e.preventDefault()
    onChange(Math.max(min, Math.min(1, value + delta)))
  }, [disabled, bipolar, value, onChange])

  return (
    <div title={title} style={{
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
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={label || title}
        aria-valuemin={bipolar ? -1 : 0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-disabled={disabled}
        onKeyDown={handleKeyDown}
      >
        {/* Tick ring — bottom-aligned, active ticks in accent color */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.inner.x} y1={t.inner.y}
            x2={t.outer.x} y2={t.outer.y}
            strokeWidth={STROKE_TICK}
            strokeLinecap="round"
            style={{ stroke: t.active ? accentColor : DIM_TICK }}
          />
        ))}
        {/* Central knob body */}
        <circle cx={CX} cy={CY} r={KNOB_R} style={{ fill: accentColor }} />
        {/* Triangle notch indicator */}
        <polygon points={triPts} style={{ fill: 'var(--bg-deep)' }} />
      </svg>

      {label && (
        <span style={{
          fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-dimmest)',
          userSelect: 'none', lineHeight: 1,
        }}>
          {label}
        </span>
      )}
    </div>
  )
}
