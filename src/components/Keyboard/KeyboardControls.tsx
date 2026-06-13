import { useStore } from '../../store'
import type { KeyboardSize } from '../../types'

const SIZES: KeyboardSize[] = [61, 73, 88]

export default function KeyboardControls() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)

  return (
    <div
      className="flex items-center gap-3 px-3 select-none shrink-0"
      style={{
        height: 34,
        background: '#0f0f14',
        borderTop: '1px solid #1e1e28',
      }}
    >
      {/* Key size selector */}
      <div className="flex items-center gap-1">
        {SIZES.map((size) => (
          <button
            key={size}
            onClick={() => setKeyboardSize(size)}
            className="px-2 py-0.5 rounded text-[11px] font-mono transition-all"
            style={{
              background: keyboardSize === size ? '#e8a02720' : 'transparent',
              color: keyboardSize === size ? '#e8a027' : '#454560',
              border: keyboardSize === size ? '1px solid #e8a02740' : '1px solid transparent',
              fontFamily: 'JetBrains Mono',
            }}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="w-px h-4" style={{ background: '#252530' }} />

      {/* Float toggle */}
      <button
        onClick={() => setKeyboardMode(keyboardMode === 'docked' ? 'floating' : 'docked')}
        className="px-2 py-0.5 rounded text-[11px] transition-all"
        style={{
          background: keyboardMode === 'floating' ? '#e8a02715' : 'transparent',
          color: keyboardMode === 'floating' ? '#e8a027' : '#454560',
          border: keyboardMode === 'floating' ? '1px solid #e8a02730' : '1px solid transparent',
          fontFamily: 'Inter',
        }}
      >
        {keyboardMode === 'docked' ? '⊞ Float' : '⊟ Dock'}
      </button>

      <div className="flex-1" />

      {/* Note count */}
      <NoteCounter />
    </div>
  )
}

function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return (
    <span
      className="text-[10px]"
      style={{ color: '#353545', fontFamily: 'JetBrains Mono' }}
      title="Total notes in file"
    >
      {midi.noteCount.toLocaleString()} notes · {midi.tracks.length} tracks
    </span>
  )
}
