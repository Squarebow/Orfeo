import { useStore } from '../../store'
import type { KeyboardSize } from '../../types'

const SIZES: KeyboardSize[] = [61, 73, 88]

export default function KeyboardControls() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)

  const isDocked = keyboardMode === 'docked'

  return (
    <div
      style={{
        height: 34,
        background: '#0d0d12',
        borderTop: '1px solid #1a1a24',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Key size selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {SIZES.map((size) => (
          <button
            key={size}
            onClick={() => setKeyboardSize(size)}
            style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'transparent',
              color: keyboardSize === size ? '#e8a027' : '#707088',
              border: 'none',
              fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'color 0.1s',
            }}
          >
            {size}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 14, background: '#1e1e28' }} />

      {/* Dock / Float toggle with icons */}
      <button
        onClick={() => setKeyboardMode(isDocked ? 'floating' : 'docked')}
        title={isDocked ? 'Float keyboard (detach)' : 'Dock keyboard (attach to bottom)'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: isDocked ? '#707088' : '#e8a027',
          fontSize: 11, fontFamily: 'Inter',
          padding: '2px 6px', borderRadius: 4,
          transition: 'color 0.1s',
        }}
      >
        {isDocked ? (
          /* Pin icon = docked */
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
          </svg>
        ) : (
          /* Move/float icon */
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
            <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
          </svg>
        )}
        {isDocked ? 'Docked' : 'Floating'}
      </button>

      <div style={{ flex: 1 }} />

      {/* Note counter */}
      <NoteCounter />
    </div>
  )
}

function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return (
    <span style={{ color: '#404055', fontSize: 10, fontFamily: 'JetBrains Mono' }} title="Total notes in file">
      {midi.noteCount.toLocaleString()} notes · {midi.tracks.length} tracks
    </span>
  )
}
