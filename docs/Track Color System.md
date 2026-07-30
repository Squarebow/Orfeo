# Palette, Custom Picker, Duplicate-Instrument Tinting


---

## Context (paste as-is, both phases)

Orfeo tracks currently have an assigned color used in the track drawer, the piano roll notes, and (per the Mixer Console design brief) the channel strips. This prompt adds full user control over track color, a curated palette, and smarter defaults for duplicate instruments.

Before writing any code: locate the current track color assignment logic (likely in the track slice or a `colors.ts` util) and everywhere it's consumed — track drawer row, PianoRoll note rendering, and the Mixer Console channel strip (if already wired). Read all of it first; this feature extends the existing color pipeline, it doesn't replace it.

**Functional/state colors are excluded from the CSS token system** (per ARCHITECTURE.md) — track colors are already, correctly, outside that token remapping. Keep it that way; this is a standalone track-color system, not a theme color.

---

## Phase 1 — Palette, Default Assignment, and Duplicate-Instrument Tinting

### Curated palette (10 colors)

Add a `TRACK_COLOR_PALETTE` constant (e.g. in `src/utils/colors.ts`):

|Name|Hex|Notes|
|---|---|---|
|Amber|`#e8a027`|Default for Piano family|
|Teal|`#2dd4bf`||
|Slate Violet|`#8b7ec8`||
|Rose|`#d1667a`||
|Sky Blue|`#5b9bd5`||
|Sage Green|`#7fae6f`||
|Coral|`#e0895f`||
|Mauve|`#a56ba0`||
|Steel Blue|`#5b7c99`||
|Warm Gold|`#c99a4a`||

All muted/desaturated to sit comfortably on the `#0f0f12` background — no neon, no rainbow feel when several are visible at once.

### Default assignment logic

On MIDI load, for each track with note data:

1. Detect GM instrument family (reuse the existing family-detection util already backing the GM family pickers in the Playback Editor — 16 families, 128 programs).
2. Map each family to a palette color via a fixed, deterministic lookup table (Piano family → Amber, always). Order the remaining 15 families across the other 9 palette colors deterministically (cycle if needed) so the same MIDI file always gets the same colors on reload.
3. **Duplicate instrument handling:** if two or more tracks resolve to the _same_ GM family (e.g. two Piano tracks), do not give them different hues. Instead, keep the shared base color and generate tint variants by adjusting HSL lightness of that same hue:
    - Track A (first occurrence): base color, unchanged.
    - Track B: lighten by ~18%.
    - Track C (if a third): darken by ~18%.
    - Track D+: lighten by ~32%, then darken by ~32%, alternating outward.
    - Clamp lightness so it never washes out to white or crushes to black — stay legible against the dark background.

### Duplicate-instrument hint badge (passive, informational)

When 2+ tracks share a GM family, show a small inline badge/icon next to each affected track row in the drawer (e.g. a subtle "same instrument" glyph with a tooltip: _"Same instrument as Track {N} — consider merging"_). This is informational only — it does not perform any action itself. It should link/point toward the existing track-merge feature (the `_ORFEO_MERGED` suffix flow in the MIDI Playback Editor) so the user knows where to go, but clicking the badge does not need to auto-open that editor unless it's trivial to wire — a tooltip pointing to it is sufficient for this phase.

### Acceptance criteria

- Loading a MIDI file assigns colors deterministically: same file → same colors every time.
- Two piano tracks get visibly different tints of amber, not two unrelated hues.
- The hint badge appears only when a genuine family duplicate exists, with no false positives on tracks that merely share a similar name.
- No change to how single-instrument-per-family files look today (still one clear, distinct color per track).

---

## Phase 2 — Editable Color Popup (Palette + Custom Picker)

### Trigger

**Implemented (30.7.2026):** The trigger is in the **MIDI Playback Editor** (`MidiEditor.tsx`), not the TrackPanel drawer. Two click targets open the same `ColorPopover`:
1. The 4×32px color bar in the Track cell (Col 2).
2. A dedicated Palette icon button in the COLOR column (Col 3, new 6-column grid).

The popover is a React portal (`createPortal`, `zIndex: 60000`), anchored to the clicked element's `DOMRect`. It auto-flips above the trigger near the bottom viewport edge.

### Popover contents

1. A grid of the 10 palette swatches (click to apply instantly).
2. A "Custom" section below the grid with a hex input field (and, if a lightweight color-picker component is already available in the project's dependencies, a visual picker; otherwise a plain validated hex text input is sufficient — do not add a new dependency just for this).
3. Live preview: the track's swatch, its notes in the piano roll, and its Mixer Console strip (if visible) should update immediately as the user previews/selects, not only after closing the popover.

### State model

Extend the per-track state with:

- `color: string` (hex)
- `colorSource: 'default' | 'palette' | 'custom'` — so future logic (e.g. re-running default assignment on file reload) knows not to clobber a user's manual choice.

### Propagation

Confirm the color updates in all three places from a single source of truth (the track's `color` field) — no duplicated color state in the drawer, PianoRoll, and Mixer Console. If any of these three currently read color from different places, consolidate them to read from the track slice.

### Acceptance criteria

- Clicking a track's color swatch opens the popover anchored to it, flipping position near screen edges same as the help popups.
- Selecting a palette color or entering a valid custom hex updates the drawer swatch, the piano roll notes for that track, and the mixer strip (if present) immediately.
- An invalid hex entry is rejected with inline feedback, not silently applied.
- Manually-set colors persist for the session and are not overwritten if the default-assignment logic re-runs (e.g. on a track re-scan).

---

## Files likely touched (confirm against actual current codebase before editing)

- `src/utils/colors.ts` (or equivalent) — palette constant, tint generation, family→color mapping
- Track Zustand slice — `color` and `colorSource` fields
- Track drawer row component — swatch click handler, badge for duplicates
- New popover component (reuse help-popup portal component/pattern)
- PianoRoll note rendering — confirm it reads color from the single source of truth
- Mixer Console channel strip — same, if already implemented

## Out of scope / do not touch

- The CSS design-token system in `index.css` — track colors stay outside it, as already established
- The existing track-merge implementation itself — this prompt only surfaces a hint pointing at it, not a rebuild of the merge flow
- Any theme-wide accent color changes — this is per-track only