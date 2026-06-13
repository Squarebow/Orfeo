import { useStore } from '@/store'

export default function ChordDisplay() {
  const currentChord = useStore(s => s.currentChord)
  const settings = useStore(s => s.settings)

  if (!settings.showChordDisplay) return null

  return (
    <div style={{
      minWidth: 120,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 12px',
      borderLeft: '1px solid var(--border)',
      borderRight: '1px solid var(--border)',
    }}>
      {currentChord ? (
        <>
          <div style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}>
            {currentChord.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
            {currentChord.quality}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
          — chord —
        </div>
      )}
    </div>
  )
}
