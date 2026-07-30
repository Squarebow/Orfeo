// ── Track color palette ───────────────────────────────────────────────────────
// 10 muted/desaturated colors for comfortable legibility on the dark (#0f0f12)
// background. Functional/state colors are intentionally kept outside the CSS
// token system — track colors are standalone, not theme colors.

export const TRACK_COLOR_PALETTE = [
  '#e8a027', // Amber       — default for Piano family
  '#2dd4bf', // Teal
  '#8b7ec8', // Slate Violet
  '#d1667a', // Rose
  '#5b9bd5', // Sky Blue
  '#7fae6f', // Sage Green
  '#e0895f', // Coral
  '#a56ba0', // Mauve
  '#5b7c99', // Steel Blue
  '#c99a4a', // Warm Gold
] as const
