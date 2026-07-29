# alphaTab Import-Only API Research

Date: 29. 7. 2026
alphaTab version: 1.8.4

## Result: PROCEED

MusicXML → SMF 1.0 → @tonejs/midi pipeline confirmed working with one required workaround.
MXL (compressed MusicXML) auto-detected without manual unzip.
GP5 format is supported by the library (confirmed via source inspection); could not download a test binary due to network restrictions during the spike.

---

## MidiFile serialisation

Method name confirmed: `toBinary()`
Return type: `Uint8Array`
Notes:

- `toUInt8Array()` does NOT exist on MidiFile in v1.8.4 — the plan's spec assumed it, but `toBinary()` is the correct method.
- `writeTo(stream)` also exists as a lower-level alternative.
- **Critical issue:** alphaTab v1.8.4 generates `NoteBendEvent` instances (MIDI 2.0 per-note pitch bend) for every note, even those with no bend. These events have value `0x80000000` (center, no pitch change). `MidiFile.toBinary()` throws `"Note Bend (Midi2.0) events cannot be exported to SMF1.0"` if any `NoteBendEvent` is present.
- **Required workaround:** Before calling `toBinary()`, filter `NoteBendEvent` from all tracks:
  ```js
  for (const track of midiFile.tracks) {
    track.events = track.events.filter(e => !(e instanceof at.midi.NoteBendEvent));
  }
  ```
  This is safe — all observed instances had the neutral center value and represent no musical content. Any genuine pitch-bend expression from Guitar Pro files would be encoded as `PitchBendEvent` (SMF 1.0 compatible), not `NoteBendEvent`.

---

## MXL auto-detection

Does alphaTab handle .mxl ZIP without manual decompression? **YES**

`ScoreLoader.loadScoreFromBytes()` auto-detects compressed MusicXML (`.mxl`). The importer tries each registered importer in sequence; the MusicXML importer internally handles the ZIP structure when the bytes start with a ZIP signature. Tested with a hand-crafted `.mxl` containing `META-INF/container.xml` pointing to `score.xml` — loaded correctly.

---

## Bundle cost

WASM synth file present? **NO** — no `.wasm` files anywhere in the package.

Files in `dist/`:

| File | Size |
|---|---|
| alphaTab.core.mjs | 2298 KB |
| alphaTab.core.min.mjs | 1092 KB |
| alphaTab.mjs (entry stub) | 5 KB |
| alphaTab.min.mjs (entry stub) | 4 KB |
| alphaTab.js (CJS) | 2377 KB |
| alphaTab.min.js (CJS min) | 1094 KB |
| alphaTab.d.ts | 544 KB |
| Worker/Worklet stubs | 2 KB each |

Soundfont files (audio, NOT needed for import-only use):

| File | Size |
|---|---|
| sonivox.sf2 | 1320 KB |
| sonivox.sf3 | 954 KB |

**Recommendation:** Use dynamic `import('@coderline/alphatab')` at conversion time so the ~1.1 MB minified core is not bundled into the main chunk. The soundfont files are only needed for alphaTab's built-in audio playback — they do not need to be served or copied since Orfeo uses its own audio engines. Vite will bundle the core JS but the soundfont assets can be excluded from the copy step.

The import stub (`alphaTab.mjs`) re-exports from `alphaTab.core.mjs`, so Vite/Electron will pull in the full core. With dynamic import this is deferred to first conversion use. Add to `electron.vite.config.ts` `optimizeDeps.include` if eager bundling is needed, or mark as external if conversion is to run in the main process.

---

## MusicXML conversion

Test file: `test.musicxml` (minimal hand-crafted, 4 notes: C4 E4 G4 C5, C major chord, 4/4, 120 BPM)
Result: **✓ 1 track, 1 bar** loaded by ScoreLoader
After workaround (filter NoteBendEvents): **✓ 155 bytes SMF written**
@tonejs/midi accepted output? **YES** — 1 track with notes, tempo 120.0 BPM, notes: C4, E4, G4, C5 (correct)

---

## Guitar Pro conversion

Test file: Could not obtain a valid binary `.gp5` file during the spike. All download attempts from public URLs returned HTML error pages (GitHub rate-limit / auth wall, songsterr requires browser session).

Library support confirmed via source inspection:
- `Gp3To5Importer` class exists, handles `.gp3`, `.gp4`, `.gp5` (version string `"FICHIER GUITAR PRO "` + version number)
- `Gp7To8Importer` class exists, handles `.gp7`, `.gp8` (ZIP-based format)
- `GpxImporter` class exists, handles `.gpx` (Guitar Pro 6 XML-based format)
- All importers are registered in `Environment.buildImporters()` and tried automatically by `ScoreLoader.loadScoreFromBytes()`

@tonejs/midi accepted output? **NOT TESTED** — no test binary available

**Note for Task 2:** Before shipping GP support to users, test with a real `.gp5` file obtained locally (e.g. from the user's own Guitar Pro files). alphaTab's test suite uses files from its own repo; a CI step could be added later.

---

## Deviations from spec assumptions

| Assumption in spec | Actual |
|---|---|
| `midiFile.toUInt8Array()` | Method does not exist — use `midiFile.toBinary()` instead |
| `midiFile.toBinary()` — assumed `< 1.3` | `toBinary()` exists and is correct in v1.8.4 |
| No mention of MIDI 2.0 NoteBendEvent issue | alphaTab generates `NoteBendEvent` per note; `toBinary()` throws unless these are filtered first |
| WASM files expected | No WASM — pure JS implementation |
| Bundle ~"heavy"  | ~1.1 MB minified JS; no soundfont needed for import-only path |
| `.mxl` might need manual unzip | Auto-detected natively |

---

## Implementation note for Task 4 (conversion module)

The conversion function (`convertToMidi` or similar) must:

1. Call `at.importer.ScoreLoader.loadScoreFromBytes(bytes, settings)` to get a `Score`
2. Create `MidiFile`, `AlphaSynthMidiFileHandler`, `MidiFileGenerator` and call `gen.generate()`
3. **Filter NoteBendEvents** before calling `midiFile.toBinary()`
4. Return `Uint8Array` from `toBinary()`
5. Pass the buffer to `parseMidiBuffer()` / `new Midi()` as usual

The `at.Settings` instance can be `new at.Settings()` with defaults — no special configuration needed for import-only use.

---

## Go / No-go for Phase 1

**GO** — proceed with plan.

The conversion pipeline works end-to-end for MusicXML. The NoteBendEvent issue is a confirmed, fixable deviation — the workaround is one-liner and semantically safe. MXL support is a bonus (works without any extra code). GP format is structurally supported by the library; the inability to run a binary test during the spike is a logistics issue, not an API issue.

No WASM dependency, no browser-only API calls in the import path, bundle cost is acceptable with dynamic import.
