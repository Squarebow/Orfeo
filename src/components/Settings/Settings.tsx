import { X } from 'lucide-react'
import { useStore } from '@/store'
import type { NoteNamingSystem, KeyboardSize } from '@/types'

const NOTE_NAMING_OPTIONS: { value: NoteNamingSystem; label: string; example: string }[] = [
  { value: 'english',          label: 'English',          example: 'C D E F G A B' },
  { value: 'central-european', label: 'Central European', example: 'C D E F G A H  (B = B♭)' },
  { value: 'solfege',          label: 'Solfège',          example: 'Do Re Mi Fa Sol La Si' },
  { value: 'hidden',           label: 'Hide labels',      example: '—' },
]

export default function Settings() {
  const { settings, updateSettings, toggleSettings } = useStore()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={toggleSettings}>
      <div style={{
        width: 480,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Settings</span>
          <button className="btn-icon" onClick={toggleSettings}><X size={16} /></button>
        </div>

        {/* Content */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Note naming */}
          <section>
            <div className="text-label" style={{ marginBottom: 10 }}>Note Names</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {NOTE_NAMING_OPTIONS.map(opt => (
                <label key={opt.value} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: settings.noteNaming === opt.value ? 'var(--accent)' : 'var(--border)',
                  background: settings.noteNaming === opt.value ? 'var(--active)' : 'transparent',
                  cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="noteNaming"
                    value={opt.value}
                    checked={settings.noteNaming === opt.value}
                    onChange={() => updateSettings({ noteNaming: opt.value })}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500,
                                  color: settings.noteNaming === opt.value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)',
                                  fontFamily: 'JetBrains Mono, monospace' }}>
                      {opt.example}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Display options */}
          <section>
            <div className="text-label" style={{ marginBottom: 10 }}>Display</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { key: 'showChordDisplay', label: 'Show chord name' },
                { key: 'showBarRuler',     label: 'Show bar ruler' },
                { key: 'showKeySignature', label: 'Show key signature' },
              ].map(({ key, label }) => (
                <label key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={settings[key as keyof typeof settings] as boolean}
                    onChange={e => updateSettings({ [key]: e.target.checked })}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
                </label>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
