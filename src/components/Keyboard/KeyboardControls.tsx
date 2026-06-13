import { useStore } from '@/store'
import type { KeyboardSize } from '@/types'

const SIZES: KeyboardSize[] = [61, 73, 88]

export default function KeyboardControls() {
  const { settings, updateSettings } = useStore()

  return (
    <div style={{
      height: 'var(--bottombar-height)',
      background: 'var(--panel)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '0 16px',
      flexShrink: 0,
    }}>

      {/* Keyboard size selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="text-label">Keys</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {SIZES.map(size => (
            <button
              key={size}
              onClick={() => updateSettings({ keyboardSize: size })}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 4,
                border: '1px solid',
                borderColor: settings.keyboardSize === size ? 'var(--accent)' : 'var(--border)',
                background: settings.keyboardSize === size ? 'var(--active)' : 'transparent',
                color: settings.keyboardSize === size ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Float/dock toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="text-label">Keyboard</span>
        <button
          onClick={() => updateSettings({
            keyboardMode: settings.keyboardMode === 'docked' ? 'float' : 'docked'
          })}
          style={{
            padding: '3px 10px',
            fontSize: 11,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: settings.keyboardMode === 'float' ? 'var(--active)' : 'transparent',
            color: settings.keyboardMode === 'float' ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {settings.keyboardMode === 'docked' ? '📌 Docked' : '🔲 Floating'}
        </button>
      </div>

    </div>
  )
}
