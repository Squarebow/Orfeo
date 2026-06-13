import { useStore } from '@/store'

export default function BarRuler() {
  const { midiFile, position } = useStore()

  const totalBars = midiFile?.totalBars ?? 16
  const currentBar = position.bar

  return (
    <div style={{
      width: 'var(--ruler-width)',
      background: 'var(--panel)',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
      flexShrink: 0,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {Array.from({ length: Math.min(totalBars, 100) }, (_, i) => {
          const bar = i + 1
          const isActive = bar === currentBar
          return (
            <div key={bar} style={{
              position: 'absolute',
              top: `${(i / totalBars) * 100}%`,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 6,
              height: 20,
            }}>
              <span style={{
                fontSize: 9,
                fontFamily: 'JetBrains Mono, monospace',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: isActive ? 600 : 400,
              }}>
                {bar}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
