// ── SpeedControl ─────────────────────────────────────────────────────────────
// Three chevron-arrow speed buttons (1×, 2×, 3×) from Slow/Medium/Fast.svg.
// All viewBoxes share height=26; rendered at H=16px so line weight is uniform.

interface SpeedControlProps {
  value: 'slow' | 'med' | 'fast'
  onChange: (v: 'slow' | 'med' | 'fast') => void
}

const AMBER = '#e8a027'
const MUTED = '#606070'
const H     = 13

// Slow.svg — single chevron, viewBox 0 0 17 26
const IconSlow = () => (
  <svg viewBox="0 0 17 26" width={Math.round(H * 17 / 26)} height={H} fill="none" aria-hidden="true">
    <path
      d="M1,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

// Medium.svg — double chevron, viewBox 0 0 32 26
const IconMedium = () => (
  <svg viewBox="0 0 32 26" width={Math.round(H * 32 / 26)} height={H} fill="none" aria-hidden="true">
    <path
      d="M16,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
    <path
      d="M1,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

// Fast.svg — triple chevron, viewBox 0 0 47 26
const IconFast = () => (
  <svg viewBox="0 0 47 26" width={Math.round(H * 47 / 26)} height={H} fill="none" aria-hidden="true">
    <path
      d="M16,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
    <path
      d="M1,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
    <path
      d="M31,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
)

const ICONS = { slow: IconSlow, med: IconMedium, fast: IconFast }
const SPEEDS: Array<['slow' | 'med' | 'fast', string]> = [
  ['slow', 'Slow'],
  ['med',  'Medium'],
  ['fast', 'Fast'],
]

// ── SpeedControl component ────────────────────────────────────────────────────
export default function SpeedControl({ value, onChange }: SpeedControlProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {SPEEDS.map(([v, label]) => {
        const active = value === v
        const Icon   = ICONS[v]
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            style={{
              background: 'none',
              border:     'none',
              padding:    0,
              cursor:     'pointer',
              color:      active ? AMBER : MUTED,
              display:    'flex',
              alignItems: 'center',
              filter:     active ? `drop-shadow(0 0 2px ${AMBER}99)` : 'none',
              transition: 'color 0.15s, filter 0.15s',
              opacity:    active ? 1 : 0.65,
            }}
          >
            <Icon />
          </button>
        )
      })}
    </div>
  )
}
