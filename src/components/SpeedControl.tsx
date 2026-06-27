// ── SpeedControl ─────────────────────────────────────────────────────────────
// Reusable SVG speed selector with three fixed positions (slow / med / fast).
// Renders a horizontal track with three circle nodes; active node is filled
// amber with a glow filter, inactive nodes are stroke-only.

interface SpeedControlProps {
  value: 'slow' | 'med' | 'fast'
  onChange: (v: 'slow' | 'med' | 'fast') => void
}

const SPEEDS: Array<['slow' | 'med' | 'fast', string]> = [
  ['slow', 'Slow'],
  ['med', 'Medium'],
  ['fast', 'Fast'],
]

// Node x-positions along the 80px-wide track; track spans node-centre to node-centre
const NODE_X = [8, 40, 72]
const NODE_Y = 10
const NODE_R = 5
const AMBER = '#e8a027'
const DIM   = '#e8a02744'

// ── SpeedControl component ────────────────────────────────────────────────────
export default function SpeedControl({ value, onChange }: SpeedControlProps) {
  return (
    // ── Wrapper: label above, SVG below, both centred ─────────────────────────
    // ── alignItems:'flex-end' right-aligns the Speed label above the fast (rightmost) node
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <span style={{
        fontFamily: 'Inter', fontSize: 8, color: '#707088',
        letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none',
      }}>Speed</span>
      {/* ── SVG track + nodes ────────────────────────────────────────────── */}
      <svg width={80} height={20} style={{ overflow: 'visible' }}>
        <defs>
          {/* Amber glow applied to the active node */}
          <filter id="sc-amber-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx={0} dy={0} stdDeviation={2} floodColor={AMBER} floodOpacity={0.9} />
          </filter>
        </defs>
        {/* Two track segments — one per gap between nodes, never crossing a circle.
            mixBlendMode:'lighten' prevents alpha stacking where line meets circle stroke:
            max(amber, amber) = amber, so seams are invisible. */}
        <line
          x1={NODE_X[0] + NODE_R} y1={NODE_Y}
          x2={NODE_X[1] - NODE_R} y2={NODE_Y}
          stroke={DIM} strokeWidth={2}
          style={{ mixBlendMode: 'lighten' }}
        />
        <line
          x1={NODE_X[1] + NODE_R} y1={NODE_Y}
          x2={NODE_X[2] - NODE_R} y2={NODE_Y}
          stroke={DIM} strokeWidth={2}
          style={{ mixBlendMode: 'lighten' }}
        />
        {/* Three nodes — slow (left), med (centre), fast (right).
            fill='transparent' makes the entire disc area hit-testable.
            mixBlendMode:'lighten' ensures circle stroke blends seamlessly with track. */}
        {SPEEDS.map(([v, label], i) => {
          const active = value === v
          return (
            <circle
              key={v}
              cx={NODE_X[i]}
              cy={NODE_Y}
              r={NODE_R}
              fill={active ? AMBER : 'transparent'}
              stroke={active ? AMBER : DIM}
              strokeWidth={1.5}
              filter={active ? 'url(#sc-amber-glow)' : undefined}
              style={{ cursor: 'pointer', mixBlendMode: 'lighten' }}
              onClick={() => onChange(v)}
            >
              <title>{label}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}
