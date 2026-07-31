Paste these one at a time, in order, into Claude Code. Each stage assumes prior stages have already landed. Do not skip Stage 0 — everything downstream depends on its findings being accurate, not assumed.

Reference source: "LR Hand Split — Forensic Analysis & Algorithm Design" doc (two real MIDI files forensically analyzed: File A = Bill Evans "My Foolish Heart" head/coda transcription, a clean 2-track pre-split notation export; File B = Bruce Hornsby "The Way It Is," an 11-track GM sequenced arrangement with one single-stream piano track, 12 tempo changes, and a 7-note/4-octave chord at tick 159368 that no human hand can play as one group). Decisions locked in for this batch: both Strict and Faithful crossing modes ship in v1; metadata strategy is both internal sidecar + portable export hint; the two separate playback bugs are included as later stages in this same batch.

---

## Stage 0 — Discovery & Grounding (no code changes)

```
I'm about to rework Orfeo's left/right hand-split, merge, and hand-color-coding features into a single unified engine. Before I write any implementation, I need a grounded picture of what actually exists today — do not assume architecture, inspect the real code.

Investigate and report back (no code changes in this pass):

1. Whatever currently powers "split into two tracks" — find the actual function(s)/file(s), and describe the algorithm it uses today (if any) to decide which notes go to which hand/track.
2. Whatever currently powers "keep one track, hand-colored" rendering — is this the same logic as #1, or separate/duplicated?
3. Whatever currently powers merging multiple tracks into a single hand-split piano part.
4. The existing "beta" left/right hand indicator shown during playback — find its code, and describe exactly what signal it uses in real time (track index? channel? pitch threshold? something else?). Is it doing live inference every frame, or reading a stored tag?
5. The current note/track data shape — does a note object already carry a `track`, `channel`, or `part` field that a new `hand` tag could naturally extend, or would this be an entirely new field? Show the actual type/interface definition.
6. Any existing confidence/quality scoring anywhere in the split/merge/color pipeline (there may be none — say so if so).
7. Any existing undo/history mechanism that split/merge operations currently hook into, since the new engine will need to snapshot state before applying.

Report findings as a structured summary with file paths and relevant code excerpts. Flag anything that looks like dead code, silently-failing logic, or duplicated logic across the three features (split/color/merge) — the goal of the next stage is to collapse these into one engine, so duplication here is exactly what we're hunting for.

Do not propose the new design yet — just report what's actually there.
```

---

## Stage 1 — Core Engine: `assign_hands()`

```
Using the Stage 0 findings, build a single unified hand-assignment engine. This replaces the separate/duplicated logic behind split, color-coding, and merge — but in this stage, build it as a standalone, testable function. Do not wire it into the UI yet (that's Stage 3).

Core contract:

  assign_hands(note_stream, options) -> note_stream, each note tagged hand: 'L' | 'R', plus a confidence tag per note or per passage.

Required behavior:

1. Cheap pre-check, run first, always (fast path for already-good input):
   - Score the input: is there a clean 2-track or 2-channel split, near-zero exact-pitch unison collisions between them at the same tick, and a clear average-pitch gap (higher avg = RH candidate, lower avg = LH candidate)?
   - Optional reinforcing signal: sustain pedal concentrated on one of the two.
   - If this scores high, skip the expensive algorithm entirely — just label track→hand by average pitch. This must correctly and cheaply handle notation-software exports (2 tracks, both named identically, e.g. both literally "Piano\0" — track index/avg-pitch is the only real signal, channel is NOT reliable since both tracks may share channel 0).

2. Real algorithm, for single-stream/ambiguous input:
   a. Cluster notes by onset time (small tick tolerance) so a rolled/near-simultaneous chord is one cluster, not sequential notes.
   b. Easy per-cluster case: if there's an obvious pitch gap within a cluster (nothing occupying the middle range), split there directly — no cost function needed.
   c. Hard case — solve globally with a Viterbi-style dynamic-programming pass over the whole piece. State = each hand's approximate pitch position. Transition cost between clusters penalizes:
      - distance moved (big jump = expensive, stepwise/staying put = cheap — this keeps one coherent melodic line in one hand instead of flip-flopping note-to-note)
      - span violation (forbid/heavily penalize assigning two simultaneous notes to the same hand if they're wider than a configurable max stretch — default a 10th, must be tunable/configurable, structured so a per-user hand-size setting could plug in later)
      - crossing cost (see #3 below — mode-dependent, not a hard constant)
   d. This must correctly split a 7-note, ~4-octave simultaneous cluster (e.g. notes spanning C2 to D6 in one instant) across both hands rather than dumping it on one hand — this is the concrete stress-test case to validate against.

3. Crossing modes — implement as an explicit option, not a hard-coded rule:
   - Strict/Learning Mode: hands never cross (low hand's pitch never exceeds high hand's pitch at the same instant). Default mode.
   - Faithful Mode: the DP may choose a crossing when the cost function genuinely favors it (for stride piano, Romantic-era passages, jazz voicings where LH deliberately reaches over RH).
   - Physical span/reach violation (item 2c) is ALWAYS enforced regardless of mode — that's just correctness, not a style choice.

4. Confidence tagging: mark each passage/note by how forced the decision was. A clean pitch gap = high confidence. A DP pass that broke a near-tie = low confidence. This will drive a "review the split" UI affordance later — don't skip it even though there's no UI yet to consume it.

Keep this deterministic, no ML/external model dependency — same algorithmic family as automatic piano fingering/voice-separation DP approaches. Should run instantly in-browser on a few thousand notes.

Write it as a pure, independently testable function/module. Add tests (or a manual test harness if the project has no test suite) against two representative cases:
- A clean already-split 2-track input (should hit the fast path, cheap labeling only).
- A single-stream input with a wide simultaneous chord that must be split across hands, plus at least one melodic passage that should NOT flip-flop hand assignment note-to-note.

Do not touch any existing UI, split button, merge button, or color rendering code in this stage.
```

---

## Stage 2 — Metadata Strategy (Internal Sidecar + Export Hint)

```
Now wire persistence/export for the hand tags produced by assign_hands() (Stage 1). Two separate things to implement, not one:

1. Internal/sidecar data model — this is where hand assignment, confidence scores, and split/merge history for undo actually live going forward. Should be the authoritative source of truth: fast, structured, no MIDI-spec hacks. Base this on the real note/track data shape found in Stage 0 (extend it, don't fork a parallel data structure unless Stage 0 showed there's no reasonable field to extend).

2. Portable export hint, for when a file leaves Orfeo (standard MIDI has no clef meta-event — clef/hand is not something plain SMF can express natively):
   - Rename track_name to something like "Piano (RH)" / "Piano (LH)" on export — human-readable, matches conventions notation software already uses.
   - And/or a short `text` meta event Orfeo recognizes on re-import, which any other MIDI tool will just ignore as harmless text.
   - On re-import, Orfeo should recognize its own hint and restore the hand tags rather than re-running the full algorithm from scratch.

Be explicit in code comments/docs that this exported hint is NOT real MIDI clef data per spec — it's a breadcrumb, and should never be described as "clef metadata" in any UI copy or docs, since clef and hand aren't perfectly identical (cross-staff notation exists in advanced scores). Treating clef = f(hand) is a deliberate, acknowledged simplification for Orfeo's purposes.

Confirm before finishing: what happens on re-import to a file that has valid hand tags in the internal sidecar model vs. one that only has the exported text/track-name hint vs. one with neither (falls back to Stage 1's cheap-check + full algorithm as normal).
```

---

## Stage 3 — Rewire Existing Features Onto the New Engine

```
Replace the existing split/merge/color logic identified in Stage 0 so all three features call the same assign_hands() engine (Stage 1) instead of whatever separate/duplicated logic currently powers each:

1. "Split into two tracks" — run assign_hands(), serialize L-tagged notes to Track A and R-tagged notes to Track B.
2. "Keep as one track, hand-colored" — run assign_hands(), keep everything in one track/serialization, use the hand tag only for rendering color.
3. Merging N tracks into a hand-split piano part (e.g. user reassigns a bass track to piano and merges) — collect all notes from all source tracks into one stream, run the SAME assign_hands() engine, output per whichever mode the user picked in #1/#2.

Also: the existing "beta" real-time L/R indicator found in Stage 0 should now just read the stored hand tag instead of doing live per-frame inference. If Stage 0 confirmed this indicator's current guessing logic becomes fully redundant once every note carries a reliable hand tag, delete that guessing logic outright rather than leaving it as unused dead code alongside the new path — confirm with me first if it's not obviously safe to remove.

Do not change the UI/UX flow yet (buttons, preview, undo — that's Stage 4). This stage is purely: same three features, new shared engine underneath, old duplicated logic removed.
```

---

## Stage 4 — UX Flow

```
Build the user-facing flow around the now-unified hand-assignment engine:

1. On file load, run the Stage 1 cheap "already split?" pre-check before ever invoking the full algorithm.
2. If the input is a single messy track (or multiple non-piano tracks the user wants collapsed into a piano part), run the full hand-assignment engine.
3. Show a non-destructive preview on the keyboard/piano-roll, color-coded by hand, with low-confidence passages (from Stage 1's confidence tagging) visually flagged/highlighted distinctly from high-confidence passages.
4. Present exactly two output choices to the user:
   - Split into two tracks
   - Keep one track, hand-colored
5. On apply: snapshot prior state for undo (use whatever undo/history mechanism Stage 0 found, or the new one from Stage 2 if that's where it now lives), then write out per the chosen mode and whichever metadata strategy (Stage 2) is active.

Make sure the low-confidence flagging is genuinely visually distinct in the preview — the point is to let the user review only the handful of ambiguous passages, not treat the whole piece as equally authoritative.
```

---

## Stage 5 — Bug Fix: Chord Display Timing/Visibility (separate from hand-split work)

```
Separate, unrelated investigation — NOT connected to the hand-split engine work in prior stages.

Symptom: the chord display in Orfeo is sometimes hard to notice changing at all, and sometimes changes so fast it's illegible. Likely causes to check in the actual chord-detection/display component:
- No floor on minimum display duration before a chord label can be replaced (fast passages flash illegibly).
- No clear "this just changed" visual signal (slow passages don't read as having updated at all, even though they technically did).

Investigate the real component, find the actual root cause (don't assume it's one or the other — check both), and fix it. This may need a minimum-display-duration debounce, a transition/flash-on-change visual cue, or both. Report what you find before or alongside the fix.
```

---

## Stage 6 — Bug Fix: Glissando Blob + Audio/Visual Sync (separate from hand-split work)

```
Separate, unrelated investigation — NOT connected to the hand-split engine work in prior stages. Two distinct symptoms, investigate independently, don't assume one fix covers both:

1. Glissando/fast-chord visual-keyboard rendering: playing a glissando renders as one large amber blob on the virtual keyboard instead of distinct notes, and fast-changing chords aren't visually distinct enough. Likely cause: a minimum note-duration/decay-time floor on the keyboard's visual "light up" state that's too long for rapid consecutive notes to render as visually distinct. Find the actual key-lighting code and check this.

2. Audio/visual sync: visual note lighting on the keyboard lags audio playback by "too long." Check the playback engine's tick→real-time conversion specifically at tempo-change boundaries — confirm whether ms-per-tick is correctly recomputed fresh at every set_tempo meta event (the standard MIDI timing model), or whether it's computed once and reused incorrectly across tempo changes. A MIDI file with multiple tempo changes across the piece (section-level BPM shifts, not per-beat) is the right kind of test case to expose this if it's the root cause — a single fixed-tempo file will not surface this bug even if it exists.

Treat both as leads to investigate and confirm, not confirmed diagnoses — report actual root cause found before/alongside each fix.
```