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

// ── Piano-family default colors — deterministic regardless of track order,
// so the same visual identity (1st = LH blue, 2nd = RH pink, 3rd+ = amber)
// shows up for any file instead of whatever slot a round-robin lands on.
// Shared by midiParser.ts (initial load) and MidiEditor.tsx (live instrument
// reassignment) so both compute the exact same color for the exact same slot.
export const PIANO_FAMILY_COLORS = [TRACK_COLOR_PALETTE[2], TRACK_COLOR_PALETTE[7], TRACK_COLOR_PALETTE[0]]

// ── 4th+ piano-family track color — cycles through the rest of the palette
// instead of repeating the 3rd slot's amber for every track after it. "I
// don't care what color, just different" — not the same amber, and not
// colliding with slots 1-3's blue/pink/amber either. ─────────────────────
const PIANO_EXTRA_COLORS = TRACK_COLOR_PALETTE.filter((_, i) => i !== 0 && i !== 2 && i !== 7)
export function pianoFamilyColor(pianoIndex: number): string {
  if (pianoIndex < PIANO_FAMILY_COLORS.length) return PIANO_FAMILY_COLORS[pianoIndex]
  return PIANO_EXTRA_COLORS[(pianoIndex - PIANO_FAMILY_COLORS.length) % PIANO_EXTRA_COLORS.length]
}
