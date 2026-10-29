import { handHex, colorDistance, sameHex } from './handPalette'

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

// ── Starmap note colours — one pastel "starlight" colour per note, used for
// the chord shapes in the Scales Explorer's Starmap view. Hue walks the
// circle of fifths (OKLCH L 0.84 C 0.11, hue 110° + 30° per fifth), so notes
// a fifth apart get neighbouring colours. Index = note (0 = C … 11 = B/H).
// Kept clear of brand amber and the two hand colours. ──────────────────────
export const PITCH_CLASS_COLORS = [
  '#cfd17a', // C
  '#ebb3f7', // C♯/D♭
  '#7ae2c0', // D
  '#ffadad', // D♯/E♭
  '#78d8ff', // E
  '#f0c374', // F
  '#c9beff', // F♯/G♭
  '#a4dd98', // G
  '#ffadd5', // G♯/A♭
  '#65e0e7', // A
  '#ffb589', // A♯/B♭
  '#a0ccff', // B/H
] as const

// ── Piano-family default colors — deterministic regardless of track order,
// so the same visual identity (1st = LH blue, 2nd = RH pink, 3rd+ = amber)
// shows up for any file instead of whatever slot a round-robin lands on.
// Shared by midiParser.ts (initial load) and MidiEditor.tsx (live instrument
// reassignment) so both compute the exact same color for the exact same slot.
export const PIANO_FAMILY_COLORS = [TRACK_COLOR_PALETTE[2], TRACK_COLOR_PALETTE[7], TRACK_COLOR_PALETTE[0]]

// ── Starting colours for every other instrument (and a 4th+ piano). Nine muted
// tones, each clearly apart (OKLab ≥ 0.087) from the others, from Orfeo's
// default blue/pink hands and from amber, which stays the tools' colour. The
// user's picker palette above is separate and unchanged. ─────────────────
const AUTO_TRACK_COLORS = [
  '#2dd4bf', // Teal
  '#5b9bd5', // Sky Blue
  '#7fae6f', // Sage Green
  '#a78bfa', // Lavender
  '#b5c45a', // Lime
  '#c47bb8', // Orchid
  '#8f8f6a', // Olive Grey
  '#e8d77a', // Butter
  '#d6b8e8', // Lilac
] as const
// The deck minus anything too close to the user's current hand pair
const NEAR_HAND = 0.1
function autoDeck(): string[] {
  const { lh, rh } = handHex()
  const deck = AUTO_TRACK_COLORS.filter(c => colorDistance(c, lh) >= NEAR_HAND && colorDistance(c, rh) >= NEAR_HAND)
  return deck.length >= 4 ? deck : [...AUTO_TRACK_COLORS]
}

// ── Every other instrument's starting colour — as different as possible from
// the hands and from the colours already given out, so no other instrument
// ever looks like the piano. Same song → same colours (the choice only
// depends on track order). Once every deck colour is in use, the least-used
// one comes back, farthest from the last one given out. ────────────────────
export function distinctTrackColor(used: string[]): string {
  const { lh, rh } = handHex()
  const deck = autoDeck()
  const uses = (c: string) => used.filter(u => sameHex(u, c)).length
  const fewest = Math.min(...deck.map(uses))
  const avoid = [lh, rh, ...used]
  let best: string = deck[0], bestD = -1
  for (const c of deck) {
    if (uses(c) !== fewest) continue
    const d = fewest === 0
      ? Math.min(...avoid.map(u => colorDistance(c, u)))
      : colorDistance(c, used[used.length - 1] ?? lh)
    if (d > bestD) { best = c; bestD = d }
  }
  return best
}

// Slots 1-2 follow the user's hand colours (Settings › Appearance) — a split
// piano still reads as two hands with a custom pair (the store also recolours
// an open song's pianos when the pair changes). A 4th+ piano cycles through
// the starting colours: not amber again, and never near the hands.
export function pianoFamilyColor(pianoIndex: number): string {
  if (pianoIndex === 0) return handHex().lh
  if (pianoIndex === 1) return handHex().rh
  if (pianoIndex < PIANO_FAMILY_COLORS.length) return PIANO_FAMILY_COLORS[pianoIndex]
  const deck = autoDeck()
  return deck[(pianoIndex - PIANO_FAMILY_COLORS.length) % deck.length]
}
