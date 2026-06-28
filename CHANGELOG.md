# Changelog

## [Unreleased] — dev branch

### 2026-06-28 — Inversion display architecture rework + locked chord seed fix

**`src/store/index.ts`** — new fields:
- `explorerChordDisplay: { name, invCount, noteCount } | null` + setters — single source of truth for chord above keyboard when an explorer is open; replaces the previous pattern where explorers called `setDisplayedChord` on an inverted note set
- `lockedChordNoteCount: number` + setter — enables correct modulo wrapping for locked chord inversion labels; `clearLockedKeys` and `resetAll` reset it

**`src/utils/chordDetection.ts`**:
- `formatInversionDisplay` — added `noteCount` parameter; applies `((invCount % noteCount) + noteCount) % noteCount` so labels loop correctly for all chord sizes (3-note: root→1st→2nd→root…; 4-note: adds 3rd; 5/6+: same logic)
- `stripMajorSuffix` — exported; applied at the end of `localizeChord` as a global safety net so `CM`/`GM` can never reach the UI
- `stripMajorSuffix` now also applied inside the solfege branch of `localizeChord`

**`src/components/Keyboard/Keyboard.tsx`**:
- `handleKeyClick` Shift branch — seeds `lockedInversionCount` from `detectChordWithInversion().ordinal` instead of always 0; locking C-F-A (an F 2nd inv) now immediately shows "F/C 2nd inv" and cycles correctly from that position
- Added `explorerDisplay` useMemo — reads `explorerChordDisplay` from store, calls `formatInversionDisplay` with stored noteCount; renders in chord bar with correct modulo label
- Chord bar priority: locked → explorer → MIDI playback → empty; `Nth inv` ordinal label colour changed from `#c0c0d0` to `#707088` globally
- Detection effect guarded: skips `activeKeys` re-detection while any explorer is open, preventing the active-keys path from overriding `explorerChordDisplay` with a wrong re-detected chord name (e.g. `G6` instead of `Em7/G`)

**`src/components/ChordExplorer.tsx`**:
- Removed local `originalChordName`/`inversionCount` state — replaced by `explorerChordDisplay` in store
- `playChordAt` — calls `setExplorerChordDisplay({ name, invCount: 0, noteCount })` instead of local state
- `handleInversion` — updates `explorerChordDisplay.invCount` in store via `useStore.getState()`
- Footer centre restored to plain grey `PLAY INVERSION` text between two `<Play>` Lucide icons (matching ScaleExplorer); chord display removed from footer entirely

**`src/components/ScaleExplorer.tsx`**:
- Same store migration as ChordExplorer — local `originalChordName`/`inversionCount` removed
- `playDegree`, `handlePrevInversion`, `handleNextInversion`, CoF onClick, RotateCcw, close — all wired to `setExplorerChordDisplay`/`clearExplorerChordDisplay`
- Footer centre restored to same plain grey `PLAY INVERSION` text; added hover states to inversion play buttons

---

### 2026-06-27 — Chord inversion display fix (complete)

Core principle: `Chord.detect()` called once on the root-position note set; original chord identity is preserved across all inversion cycling. Never re-detect on an already-inverted set. `stripMajorSuffix()` applied at every return point — no bare `CM`/`GM` in UI.

**`src/utils/chordDetection.ts`** — rewrote inversion detection and added formatting helpers:
- `detectChordWithInversion(midiNotes)` — always returns root-position name (never slash); inversion number derived from bass pitch class position in `Chord.get().notes` list; returns `{ name, invLabel, ordinal }`
- `formatInversionDisplay(originalChordName, inversionNumber, bassNoteMidi, noteNaming, accidentals, showLabel)` — computes `{ chordLabel, invLabel, ordinal }` from stored original name + count; root position returns empty strings; inverted returns `C/E` slash notation + ordinal number
- `ordinalSuffix(n)` — exported helper returning `'st'`/`'nd'`/`'rd'`/`'th'` for superscript rendering
- `stripMajorSuffix()` applied at every return point in both functions

**`src/store/index.ts`** — added locked-chord identity state:
- `originalLockedChordName: string | null` + `setOriginalLockedChordName`
- `lockedInversionCount: number` + `setLockedInversionCount`
- `clearLockedKeys` resets both; `resetAll` resets both

**`src/components/Keyboard/Keyboard.tsx`** — chord bar inversion display:
- `lockedDisplay` useMemo calls `formatInversionDisplay` with `originalLockedChordName` + `lockedInversionCount` + live bass MIDI
- Chord bar renders: amber `chordLabel` (slash notation when inverted) + ordinal superscript + `inv` label
- `handleKeyClick` Shift branch stores `localizeChord(info.name)` as `originalLockedChordName` and resets `lockedInversionCount` to 0
- Playback `displayedChord` (no inversion count known): root amber 14px + `/bass` lighter 11px, no ordinal

**`src/components/Keyboard/KeyboardControls.tsx`** — inversion count tracking:
- `applyInversion` callback updates `lockedInversionCount` in store (`+1` for next, `-1` for prev) after each voicing rotation

**`src/components/ChordExplorer.tsx`** — inversion display in footer:
- Local `originalChordName` + `inversionCount` state; set when a chord tile is clicked (`playChordAt`), reset on close/RotateCcw
- `handleInversion` increments/decrements `inversionCount` by direction
- Footer centre: `formatInversionDisplay` renders chord/bass label + ordinal superscript + `inv`; falls back to "Play Inversion" text when no chord is active

**`src/components/ScaleExplorer.tsx`** — same inversion display pattern as ChordExplorer:
- Local `originalChordName` + `inversionCount` state
- `playDegree` stores `chord.chordName` as `originalChordName` and resets count to 0
- CoF outer and inner ring onClick handlers reset both on key change
- `handlePrevInversion` decrements count; `handleNextInversion` increments count
- RotateCcw handler resets both alongside all other state
- Footer "PLAY INVERSION" static span replaced with `formatInversionDisplay` dynamic rendering — shows slash notation + ordinal superscript when inverted, falls back to static label otherwise

---

### 2026-06-27 — Manual chord lock mode redesign

**`src/components/Keyboard/Keyboard.tsx`**
- Chord bar now shows the locked chord name + inversion label when a manual lock is active — computed via `detectChordWithInversion` + `useMemo` directly in the component; takes priority over `displayedChord` from playback

**`src/components/Keyboard/KeyboardControls.tsx`**
- Removed chord name / inversion display from the bottom row (moved to chord bar above)
- Bottom row locked state restructured: `LOCKED CHORD` dim label left, then `[◂ Play] [PLAY outlined amber] [Play ▸]` inversion player, then `RotateCcw` clear — styled to match ScaleExplorer footer
- Removed `detectChordWithInversion`, `localizeChord`, `ChevronLeft`, `ChevronRight` imports; added `RotateCcw`

**`src/components/ChordExplorer.tsx`**
- Removed `setKeyboardSize(61)` and prevSizeRef restore — ChordExplorer no longer forces 61-key (61-key is ScaleExplorer-only; default stays at 73)
- RotateCcw reset button now also calls `clearLockedKeys()` when a chord is locked

**`src/components/ScaleExplorer.tsx`**
- RotateCcw reset button now also calls `clearLockedKeys()` when a chord is locked

---

### 2026-06-27 — ScaleExplorer bug fixes

**`src/components/ScaleExplorer.tsx`**

- **Chord keyboard range** — `buildDiatonicChord` octave preference order changed from `[4,3,5,2]` to `[3,4,2,5]`; chord roots now land in C3–B3 (MIDI 48–59) by default, keeping full triads within the C3–C5 range instead of starting at C4 and climbing higher
- **Inversion player** — removed `inversionStep` state and `playInversion` callback; `handlePrevInversion` / `handleNextInversion` now read live `explorerKeys` from the Zustand store and rotate in-place using `prevInversionSet` / `nextInversionSet` module helpers (identical pattern to ChordExplorer's `handleInversion`); voicings now traverse the full keyboard range in both directions indefinitely instead of wrapping after N chord tones

---

### 2026-06-27 — Progressions row redesign + SpeedControl

**New component: `src/components/SpeedControl.tsx`**
- SVG speed selector with three fixed nodes (slow / med / fast)
- Active node: amber fill + drop-shadow glow filter; inactive: stroke-only with `fill="transparent"` for full-disc click area
- Two track segments (slow→med, med→fast) so no line crosses the middle node
- `mix-blend-mode: lighten` on all elements prevents alpha seam at node/track junctions
- "Speed" label right-aligned above the fast node

**ScaleExplorer + ChordExplorer — progressions row (`src/components/ScaleExplorer.tsx`, `src/components/ChordExplorer.tsx`)**
- Three-column layout: left (PROGRESSIONS label + dropdown), centre absolute (PLAY/STOP + SpeedControl), right (INVERSIONS label + icon buttons)
- PLAY/STOP button: outlined style — amber border + glow at rest, red border + glow during playback; `<Play>`/`<Square>` Lucide icons; tooltip "Pick a pattern to play a progression" when disabled
- Inversion mode buttons: `<CircleOff>` / `<ListOrdered>` / `<Shuffle>` icons replace Off/Sequential/Random text buttons
- Chord Quality info row (ScaleExplorer): all progression steps shown as roman numerals on one line; active step amber/bold 12px, inactive dim 11px
- Progressions dropdown: two-column layout — name (minWidth 90px) + roman numerals (JetBrains Mono 9px, opacity 0.65); container minWidth 260px

**ScaleExplorer footer**
- `‹` / `›` chevrons replaced with `<Play size={14}>` / `<Play size={14} scaleX(-1)>` Lucide icons
- RotateCcw reset button: `title="Clear & reset"` tooltip added
- "Chord Explorer" link: uppercased + `<ArrowUpRight>` icon replaces `→`

---

### 2026-06-26 — Scale Explorer layout polish (round 3–4)

All changes in `src/components/ScaleExplorer.tsx`:

- **Guideline text always visible** — removed `selectedRoot === null` condition; the hint text ("Click a key on the circle…") now shows at all times, including when a key is selected alongside the info box
- **CoF section height +30px** — increased bottom padding from 16px to 46px; the "CHORDS IN THE SCALE" label and bottom-circle accidentals are no longer cramped; all four bottom rows shift down
- **Scale column vertical alignment** — added `marginTop: 20` to correct a systematic 20px offset between the scale buttons midpoint and the CoF circle centre (caused by SVG geometry: CY + viewBox offset = 230px vs `alignSelf:center` = 210px in a 420px flex line)
- **Accidental gap uniformity** — replaced uniform-multiplier sigR with a font-size-scaling formula: font shrinks for longer strings (1–3 chars → fs 11, 4–5 → fs 9, 6–7 → fs 8) with matching char-half-width so the inner text edge stays ~8–9px from the ring for all 12 positions; sigR range narrows from 185–215 to 187–201

---

### 2026-06-25 — Scale Explorer layout polish (rounds 1–2)

All changes in `src/components/ScaleExplorer.tsx`:

- Info box moved to absolute overlay (top: 0, centered on CoF axis) — no longer a flex sibling that compressed the SVG wrapper
- Guideline text repositioned to absolute top-left of CoF section
- CoF section changed to `position: relative` to anchor both overlays
- Scale buttons column set to `alignSelf: center`
- "CHORDS IN THE SCALE" label moved to absolute bottom of CoF section
- Chord button padding increased to 8px top/bottom
- Bottom 4 rows reordered: chord tiles → chord/inversion info → progressions/inversions → SHOW AS footer
- All 4 bottom rows: `minHeight: 44`
- Play/Stop button: always red (`#c0392b` bg, `#e74c3c` hover)
- SVG viewBox extended to `"0 -40 380 420"` so top accidentals render fully

---

### 2026-06-24 — Scale Explorer (initial implementation)

- New modal: `src/components/ScaleExplorer.tsx` (~970 lines)
- Zustand store: `scaleExplorerOpen` / `setScaleExplorerOpen`
- Circle of Fifths SVG (12 wedges, outer = major, inner = minor)
- 10 scale types with diatonic chord grid, Roman numeral progressions, inversion cycling
- Footer ‹ PLAY INVERSION › pattern (same as ChordExplorer)
- ChordExplorer ↔ ScaleExplorer switching buttons
- Both explorers force 61-key layout; Keyboard.tsx font conditions updated

---

### 2026-06-23 — Chord Explorer enhancements

- Progressions, inversion modes, layout polish
- `displayedChord` added to Zustand store
- ChordExplorer search (known issue: unreliable across naming systems)
