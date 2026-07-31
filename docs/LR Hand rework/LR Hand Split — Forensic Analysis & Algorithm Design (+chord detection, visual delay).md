# Orfeo: Left/Right Hand Split 

Context for whoever's reading this in the Orfeo project chat: this document was written in a separate chat session, working through two real MIDI files byte by byte to figure out (a) how "good" hand-separated piano MIDI is actually structured, and (b) what that implies for a real hand-assignment engine Orfeo can use for its split/merge/color-coding features. Two unrelated Orfeo UI bugs got surfaced along the way and are called out separately at the end — they are NOT part of the hand-split work, don't conflate them.

---

## 1. Why two reference files, and what each one is for

Two real MIDI files were forensically analyzed at the byte/event level (chunk structure, per-note timing, velocity, pedal, tempo maps — not just "listened to them"). They turned out to represent opposite ends of the difficulty spectrum for hand-splitting, which is exactly what's useful for designing an algorithm that has to work on arbitrary user-uploaded files:

||**File A: Bill Evans — "My Foolish Heart" (Head & Coda Transcription)**|**File B: Bruce Hornsby — "The Way It Is"**|
|---|---|---|
|Origin|Notation-software export (Finale/Sibelius/Dorico-family — see fingerprints below)|Full-band GM sequenced arrangement (11 tracks: piano, bass, guitars, drums)|
|Track layout|2 tracks, already hand-split (Track 0 = RH, Track 1 = LH)|1 relevant piano track (Track 3) among 11 — **not pre-split, single stream**|
|Piano pitch range|RH 56–88, LH 50–68 (overlapping zone 56–68, zero unison collisions)|**36–96**, a full 5-octave span in ONE track|
|Velocity|**Constant per track**: 80 (RH), 64 (LH) — zero expressive variance|Real variance: 69–127, 33 unique values, but 80% of notes at 127|
|Timing quantization|~100% grid-locked to straight-16ths + swing/triplet-8ths|~77% exactly on 16th grid, remaining 23% scattered off-grid (mixed step-entry + human-played passages)|
|Tempo|Single fixed tempo, 60 BPM, zero rubato|**12 tempo changes**, 70–141 BPM, section-level shifts (not per-beat)|
|Sustain pedal|Binary 0/127, 120 events, concentrated entirely on the LH/harmony track|Binary 0/127, 99 events, all on the single piano track|
|Max simultaneous polyphony|11 notes (both hands combined)|7 notes **in one chord**, spanning note 36 to note 86 (C2–D6, ~4 octaves in a single instant)|
|Hand-split difficulty|**Trivial** — already split, just needs labeling|**Hard** — single stream, huge simultaneous span, needs real algorithmic splitting including _within_ individual chords|

**File A is the "detect an already-good split and trust it" case.** **File B is the "real algorithmic splitting is required" case** — this is the one to use as the actual test/benchmark for the hand-assignment engine below, per your request. The 7-note, 4-octave-spanning chord at tick 159368 (notes 36, 55, 60, 62, 67, 84, 86) is a great concrete stress-test moment: no human hand can play that as one group, so the algorithm has to correctly split _within_ a single simultaneous cluster, not just decide hand-per-note-in- isolation.

---

## 2. File A forensic detail (notation-export fingerprints)

Useful to know when detecting "this file is already a clean hand-split, don't bother re-splitting it":

- Both tracks named identically `"Piano\x00"` (null-terminated string — export encoding quirk) — **no metadata anywhere says "left hand"/"right hand."** The split is structurally implicit, never tagged.
- Both tracks use channel 0 only — **channel is not a reliable hand signal.** Track index was the real signal here.
- Redundant `key_signature` and `midi_port` meta events duplicated per track — standard Finale/Sibelius/Dorico export fingerprint.
- Anacrusis (pickup note) handled via a throwaway `time_signature = 1/16` at tick 0, switching to the real `4/4` a few ticks later — standard notation- software pickup-bar trick, worth knowing if Orfeo ever needs to reconstruct barlines from raw MIDI.
- Every note's actual duration ≈ **95% of its notated rhythmic value** (measured across 617 notes, median ratio 0.948, ~79% clustered at 0.94–0.95) — i.e. a uniform, deliberate detachment/articulation gap. This is a good default to replicate on any MIDI Orfeo generates or edits, for a clean non-legato sound without literal note overlap.
- Sustain pedal events are **binary snaps** (values only 0 or 127, never anything in between) and cluster tightly around chord changes — this is a notated pedal marking, not a captured continuous damper-pedal curve.

## 3. File B forensic detail (sequenced-arrangement fingerprints)

- 11 tracks total: melody/piano tracks plus a full GM band (bass on channel 1 program 35/fretless bass, guitars on channels 4–5, and **channel 9 (MIDI channel 10) carrying 2708 "notes" — this is the GM drum channel**, not an actual second piano part, despite its program-change nominally saying "Acoustic Grand Piano." Channel 10 always means percussion in General MIDI regardless of program number — worth hard-coding that exception anywhere Orfeo auto-classifies "which tracks are piano."
- The one real piano track (Track 3, program 1 = Bright Acoustic Piano, channel 2) has 1245 notes spanning nearly the full keyboard.
- Timing is **mixed-precision**: mostly grid-locked but with a real minority of notes off-grid at scattered (non-triplet) offsets — consistent with a sequencer workflow mixing step-entry and live-played passages, not a purely quantized or purely free-timed file.
- Tempo genuinely varies: 12 tempo events across the piece, 70–141 BPM, section-level (avg ~4.4 beats between changes, not per-beat micro-mapping). **This is the opposite of File A and is a legitimate stress test for any playback code that assumes a single fixed tempo** — see Issue B below, which this file structure may be directly relevant to diagnosing.
- Pedal still binary (0/127 only) despite the more human-feeling performance elsewhere — worth noting pedal-as-binary-snap seems to hold across both a notation export and a sequenced arrangement; may be a safe general assumption rather than something specific to one file's origin.

---

## 4. The core design decision: split, merge, and re-color are ONE operation

Don't build three separate features. Build **one hand-assignment engine**:

```
assign_hands(note_stream) -> note_stream, each note tagged hand: L | R
```

Then:

- **"Split into two tracks"** = run the engine, serialize L-tagged notes to Track A and R-tagged notes to Track B.
- **"Keep as one track, hand-colored"** = run the engine, keep everything in one track/serialization, use the tag only for rendering color.
- **Merging N tracks into a hand-split piano part** (e.g. user reassigns a bass track to piano and merges) = collect all notes from all source tracks into one stream, run the _same_ engine, output per whichever mode above the user picked.

This is why File A and File B matter together: the engine needs a fast path for "input is already well-separated, trust it" (File A) and a real algorithm for "input is a single ambiguous stream" (File B) — but it's the same function either way, with a cheap pre-check up front.

### 4.1 Detecting "already well hand-split" (cheap, run first, always)

Score the input before running anything expensive:

- 2 tracks (or 2 channels) both containing notes.
- Near-zero exact-pitch unison collisions between them at the same tick.
- Clear average-pitch gap between the two (higher avg = RH candidate, lower avg = LH candidate).
- Optional reinforcing signal: sustain pedal concentrated on one of the two.

If this scores high (File A does, overwhelmingly), skip the real algorithm — just label track→hand by average pitch and move on. This will correctly and cheaply handle a large fraction of "premium transcription" files that follow notation-software conventions, without ever invoking the expensive path.

### 4.2 The real algorithm (for File-B-style single-stream input)

1. **Cluster by onset time** (small tolerance, a few ticks) so a rolled/near- simultaneous chord is treated as one cluster, not sequential notes.
    
2. **Easy per-cluster cases**: if there's an obvious pitch gap within a cluster (nothing occupying the middle range), split there for free — no ambiguity, no cost function needed.
    
3. **Hard cases — solve globally, not greedily.** A per-note "closest to previous hand position" greedy assignment will oscillate badly on a single wandering melodic line or a dense cluster. Use a **Viterbi-style dynamic-programming** pass over the whole piece: each hand's approximate position is state, and every transition between clusters pays a cost for:
    
    - **distance moved** (big jump = expensive, staying put/stepwise = cheap; this is what keeps one coherent melodic line assigned to one hand instead of flip-flopping note-to-note),
    - **span violation** (penalize/forbid assigning two simultaneous notes to the same hand if they're wider than a configurable max stretch, default ~a 10th — this is what correctly forces File B's 4-octave, 7-note chord to split across both hands instead of being dumped on one),
    - **crossing** (see 4.3 below — this one needs a mode, not a hard rule).
    
    This is standard, well-understood technique (same family used for automatic piano fingering/voice-separation) — not a research problem, and cheap enough to run instantly in-browser on a few thousand notes. Fully deterministic, no ML/external model, debuggable.
    
4. **Confidence tagging.** Mark each passage by how forced the decision was (clean pitch gap = high confidence; DP broke a near-tie = low confidence). This is what makes a "review the split" UI step useful — surface the handful of genuinely ambiguous passages instead of presenting the whole piece as equally authoritative.
    

### 4.3 Crossing: needs to be a mode, not a silent absolute

Two different things "never overlapping" could mean:

1. **Physical impossibility** (span/reach violation) — always enforce, this is just correctness.
2. **Low hand's pitch never exceeds high hand's pitch at the same instant** — a much stronger rule. Real piano music sometimes deliberately breaks this (stride piano, certain Romantic-era passages, jazz voicings where LH reaches up over RH for color). Hard-enforcing this always will occasionally force a musically "wrong" split on a piece that has a genuine intentional crossing.

**Recommendation**: expose **"Strict/Learning Mode"** (never crossing, best for practicing clean hand-separated parts) vs. **"Faithful Mode"** (DP may choose a crossing when the cost function genuinely favors it, matching advanced real repertoire). Default to Strict given Orfeo is a learning tool — just don't make it the only option.

### 4.4 Clef metadata — standard MIDI has no clef field, decide the strategy now

Plain MIDI (SMF) has a **fixed, closed set of meta event types** — track name, copyright, lyric, marker, tempo, time/key signature, etc. There is no clef meta event; clef is a notation concept (MusicXML has it explicitly), because it affects how something is drawn, not how it plays.

Two real, separate implementations, not one "insert clef metadata" step:

- **Orfeo's own internal/sidecar data model** — this is where hand assignment, confidence scores, and split/merge history for undo should actually live. Authoritative source of truth, fast, structured, no MIDI spec hacks required.
- **A portable export hint**, for when a file leaves Orfeo — e.g. renaming `track_name` to `"Piano (RH)"` / `"Piano (LH)"` (human-readable, matches conventions notation software already uses) and/or a short `text` meta event Orfeo recognizes on re-import that any other tool just ignores as harmless text. This is the honest, spec-compatible way to leave a breadcrumb — it is not "real" clef data by the MIDI spec, and shouldn't be described that way in the UI/docs.

Note: clef and hand aren't perfectly identical (advanced scores occasionally have cross-staff notation), but treating **clef = f(hand)** as a derived simplification is reasonable for Orfeo's purposes — just know it's a simplification, not a strict equivalence, in case it matters later.

---

## 5. Proposed one-click UX flow

1. User loads a file → run the cheap "already split?" check (4.1) before ever invoking the real algorithm.
2. If single messy track (or multiple non-piano tracks the user wants collapsed into a piano part) → run the real hand-assignment engine (4.2).
3. Show a **non-destructive preview** on the keyboard/piano-roll, color-coded by hand, with low-confidence passages visually flagged (4.2 step 4).
4. Present exactly two output choices:
    - **Split into two tracks**
    - **Keep one track, hand-colored**
5. Apply → snapshot prior state for undo → write out per chosen mode and whichever clef/metadata strategy (4.4) is active.

Once every note carries a reliable `hand` tag from this engine, the left/right indicator stops needing to infer anything in real time during playback — it just reads the tag. Whatever guessing logic currently powers the existing "beta" indicator can likely be deleted outright rather than patched, once this lands.

---

## 6. Open decisions needed before writing implementation prompts

- **Strict vs. Faithful mode**: both exposed in v1, or Strict-only for now?
- **Metadata strategy** (4.4): internal-only, exported text-hint, or both active simultaneously?
- **Current data shape**: does Orfeo's existing note object already have a `track`/`channel`/`part` field that a `hand` tag can extend, or is this new? (Need to see the actual current split/merge code and whatever drives the existing L/R indicator before writing concrete implementation prompts — architecture should be grounded in what's actually there, the same way the MIDI Meta Editor prompts were grounded in its real app.py/ midi_meta_core.py rather than written generically.)
- **Max hand-span default** for the DP span-violation cost (suggested ~a 10th, but should be tunable/configurable, possibly per-user hand-size setting eventually).

---

## 7. Separate issue — chord display timing/visibility (NOT part of hand-split work)

Reported symptom: chord display in Orfeo is sometimes hard to notice changing at all, and sometimes changes so fast it's impossible to follow. Likely a minimum-display-duration / debounce problem in whatever renders the current chord label — either no floor on how briefly a chord label can show before being replaced (fast passages flash illegibly), or no clear visual "this just changed" signal (slow passages don't read as having updated at all). Needs its own investigation into the chord-detection/display component specifically; not related to the hand-splitting work above.

## 8. Separate issue — glissando/fast-chord visual-keyboard sync (NOT part of hand-split work)

Reported symptoms: playing a glissando renders as one large amber blob on the virtual keyboard instead of distinct notes; fast-changing chords aren't visually distinct enough; audio and visual playback are not perfectly in sync, with visual note lighting on the keyboard lagging audio by "too long."

Worth noting given File B's structure (Section 3 above): **File B has a real, non-trivial 12-event tempo map with section-level BPM changes (70–141 BPM)**, in contrast to File A's single fixed tempo. If Orfeo's playback/rendering pipeline computes tick→real-time using anything other than a correct piecewise recalculation at every tempo-change event (recomputing the ms-per-tick rate fresh each time a `set_tempo` meta event is hit, per the standard MIDI timing model), a variable-tempo file like this would be exactly the kind of input that exposes drift between audio scheduling and visual keyboard rendering. **This is a hypothesis based on file structure, not a diagnosis of Orfeo's actual code** — worth checking the playback engine's tick→time conversion against this file as a concrete test case, but treat as a lead to investigate, not a confirmed root cause. The glissando/blob rendering issue is more likely a separate problem (probably a minimum note- duration/decay-time floor on the keyboard's visual "light up" state that's too long for rapid consecutive notes to render as visually distinct) — worth diagnosing independently rather than assuming one fix addresses both symptoms.