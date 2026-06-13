// Orfeo track color palette
// Restrained, non-rainbow — works on dark background

export const TRACK_COLORS = [
  '#e8a027', // amber gold (right hand default)
  '#7c6fa0', // slate violet (left hand default)
  '#4a9eba', // steel blue
  '#6db87a', // sage green
  '#c4706a', // muted rose
  '#8fa8c8', // periwinkle
  '#c49a3c', // warm gold
  '#7a9e8a', // eucalyptus
] as const

export type TrackColor = typeof TRACK_COLORS[number]

export const RIGHT_HAND_COLOR = TRACK_COLORS[0]  // amber
export const LEFT_HAND_COLOR  = TRACK_COLORS[1]  // violet

/**
 * Assign a color to a track by index
 * Cycles through palette if more tracks than colors
 */
export function getTrackColor(trackIndex: number): string {
  return TRACK_COLORS[trackIndex % TRACK_COLORS.length]
}

/**
 * Convert hex color to PIXI-compatible number
 */
export function hexToPixi(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

/**
 * Add alpha to a hex color → rgba string
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * Lighten a hex color by a percentage (0–1)
 */
export function lighten(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount))
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount))
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
