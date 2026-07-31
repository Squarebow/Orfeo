# LR Hand-Split Engine — Implementation Summary & Known Issues

Written 31.7.2026, after Stages 0–4 (grounding → engine → metadata → UI rewire → indicator rewire) plus a bugfix pass driven by testing against `Bruce Hornsby - The Way It Is`. Context for whoever picks this up next, including a future session continuing the ground-truth calibration the user is preparing.

## What exists now

**Engine** — `src/utils/handAssignment.ts`, `assignHands(notes, options)`:
- Fast path: detects an already-split 2-track/2-channel input (avg-pitch gap + unison-collision check), labels by average pitch, skips the DP.
- Real path: clusters notes by onset (`clusterToleranceSec`, default 20ms), then a Viterbi DP over per-cluster L/R partitions. In `strict` crossing mode (default) every partition is a pitch-sorted prefix split — that's what "hands never cross" means structurally. `faithful` mode enumerates full bipartitions for clusters ≤12 notes.
- Cost function, in `src/utils/handAssignment.ts`:
  - `SPAN_WEIGHT` — quadratic penalty per semitone a hand's own span exceeds `maxSpanSemitones` (default 16, ~a 10th).
  - `MOVE_WEIGHT` — linear cost per semitone a hand's center moves between clusters. A hand that's never played yet is charged from the piece-wide mean pitch, not zero — otherwise assigning a note to a never-used hand is free regardless of plausibility (this was bar-25 of the Hornsby file: an isolated arpeggio note wrongly went to an unused "L").
  - `CROSS_PENALTY` — flat cost for a faithful-mode partition that isn't a clean prefix split.
  - `UNNECESSARY_SPLIT_PENALTY` — flat cost for splitting a cluster across both hands when the *whole* cluster already fits in one hand's reach. Without this, a reachable 3-note chord (e.g. Csus2, span a 7th) had zero span cost whichever way it was split, so it could get split for a fractional movement saving.
  - `HAND_SWITCH_PENALTY` — flat cost for switching which hand plays two consecutive *monophonic* (single-note) clusters. Without this, a continuous one-hand line could "discover" the other hand for a single note whenever the melody dipped near wherever the idle hand's last position happened to sit — no polyphony involved, just a cost-symmetry artifact.
  - Confidence per cluster = margin between the DP's best and second-best option at that step, normalized 0–1.

**Metadata / persistence** — `src/utils/handMetadata.ts`:
  - `hand`/`handConfidence` live directly on `ParsedNote` (`src/types/index.ts`) — the in-memory sidecar, authoritative while the file is open.
  - Export hint, for a file leaving Orfeo (never real MIDI clef data, explicitly documented as such): a homogeneous track (split-into-two output) gets a `" (RH)"`/`" (LH)"` name suffix; a mixed track (keep-one-track-colored output) gets an `ORFEO_HAND_MAP:<version>:<trackIndex>:<RLE>` text meta-event.
  - **`HAND_ENGINE_VERSION`** — the hint is versioned. A hint from an older (or version-less) engine is treated as absent and recomputed fresh on reimport. **Bump this every time the cost function changes meaningfully** — this was added after a real bug: a file saved before an algorithm fix kept showing the old, wrong tags forever, since the hint's entire purpose is to skip recomputing. Currently `1`.

**UI wiring** — `electron/main.ts` (`editor:split`, `editor:save`), `src/utils/midiParser.ts` (auto-tags every keyboard-group track on load, restoring from a hint or running `assignHands()` fresh), `src/components/MidiEditor/MidiEditor.tsx` (hand-split preview panel with confidence-flagged timeline, "Split into two tracks" / "Keep one track, hand-colored" — the latter disabled with a tooltip when the Left/Right Hand setting is off), `src/components/PianoRoll/PianoRoll.tsx` (colors notes by `note.hand` when Left/Right Hand is on), `src/components/Keyboard/Keyboard.tsx` (per-active-key hand stripe in Performance mode), `src/components/Keyboard/KeyboardControls.tsx` (Practice mode's moving split line — `computeTaggedBoundaryCurve`, a sliding ~3s window averaged from real tags, not a static whole-file number).

**Undo** — one-slot snapshot-before-apply in `MidiEditor.tsx` (`snapshotCurrentFile`/`handleUndo`); split/merge never touch the original file, so undo just reloads the pre-apply buffer.

## Known issues (need the user's bar-by-bar ground truth to actually fix, not more guessing)

1. **Hand-label identity can swap across a long single-hand passage.** The DP's L/R labels are positions, not persistent identities — nothing stops a passage that was consistently "R" for most of the piece from cheaply relabeling to "L" partway through if the cost ties out that way, even though physically it's still one continuous hand. Reported as "colors switch — RH shows blue, LH shows pink" near the end of the Hornsby file. `HAND_SWITCH_PENALTY` discourages switching between adjacent clusters but doesn't prevent a slow accumulated drift across many clusters. Needs real investigation once ground truth exists for where the swap happens and what's actually being played there.

2. **Practice-mode boundary line lingers into brief single-hand passages.** `CURVE_WINDOW_SEC = 3.0` (in `computeTaggedBoundaryCurve`, `src/utils/handBoundaries.ts`) means a solo/one-hand passage shorter than ~3 seconds still has trailing notes from the other hand inside the window, so the line stays visible (and inaccurate) instead of correctly disappearing. Candidate fix: shorten the window and/or require both hands to have a note within a shorter *recent* sub-window (recency-weighted dominance) rather than a flat 3s lookback — deferred pending ground truth so the window size is tuned against real data, not guessed again.

## Calibration approach going forward

`HAND_SWITCH_PENALTY` was tuned by testing values {2,3,4,6} against two synthetic regression cases (monophonic arpeggio, small reachable chord) plus the real Hornsby file's aggregate L/R ratio and switch-rate — reasonable, but still a judgment call, not verified against real ground truth. The user is preparing bar-by-bar hand annotations for this file and a few similar ones. When that lands: build a proper scored test harness (compare `assignHands()` output against the annotated ground truth per note/bar, not just aggregate ratios or synthetic edge cases) before touching cost weights again — tune against measured accuracy, not vibes.

## Reference files

- `Bruce Hornsby - The Way It Is (1)_ORFEO.mid` — the stress-test file (single ambiguous stream, wide simultaneous chords). Ground truth for this file is in progress.
- `My_Foolish_Heart_–_Bill_Evans_(...).mid` — already hand-split (2 tracks), used to validate the fast path.
- `LR Hand Split — Forensic Analysis & Algorithm Design (...).md` — original design doc (Stage 0 grounding).
- `Hand-Split Engine & Related Fixes - Staged Prompts.md` — the staged prompts that drove Stages 0–4.
