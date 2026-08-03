import type { CSSProperties } from 'react'

// Byte-identical minimize-button style shared by ChordExplorer and ScaleExplorer
// (both bottom-align a Minus icon so the dash sits level with the close "×").
export const MINIMIZE_BUTTON_STYLE: CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)',
  lineHeight: 1, padding: '0 4px 2px', display: 'flex', alignItems: 'flex-end',
  transition: 'color 0.15s',
}
