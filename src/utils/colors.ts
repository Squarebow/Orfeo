// ── Track color palette ───────────────────────────────────────────────────────
// 10 muted/desaturated colors for comfortable legibility on the dark (#0f0f12)
// background. Functional/state colors are intentionally kept outside the CSS
// token system — track colors are standalone, not theme colors.

// Hand LH/RH slots use the literal hex behind --hand-lh/--hand-rh (src/index.css),
// not a var() reference — track.color is also consumed as a numeric hex by
// PixiJS canvases (PianoRoll, ChannelStrip VU) via parseInt(..., 16), which a
// CSS custom-property string can't satisfy.
export const TRACK_COLOR_PALETTE = [
  '#e8a027', // Amber      — 3rd+ Piano-family track
  '#2dd4bf', // Teal
  '#6270A5', // Hand LH blue — 1st Piano-family track
  '#d1667a', // Rose
  '#5b9bd5', // Sky Blue
  '#7fae6f', // Sage Green
  '#e0895f', // Coral
  '#CB636C', // Hand RH pink — 2nd Piano-family track
  '#5b7c99', // Steel Blue
  '#c99a4a', // Warm Gold
] as const
