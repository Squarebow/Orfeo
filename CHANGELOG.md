# Changelog

## [Unreleased] — dev branch

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
