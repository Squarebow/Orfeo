import type { CSSProperties } from 'react'

// Shared close-button chrome for every floating modal — matches the MIDI
// Note Editor's style (the one the rest of the app's close buttons should
// look like): a visible tiny border at all times, not just on hover.
export const modalCloseButtonStyle: CSSProperties = {
  width: 28, height: 26, padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: '1px solid var(--state-hover-bg)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)', cursor: 'pointer',
  transition: 'color 0.1s', flexShrink: 0,
}

export const modalCloseButtonHoverColor = 'var(--text-amber)'
export const modalCloseButtonIdleColor = 'var(--text-muted)'
