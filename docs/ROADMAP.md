# Orfeo — Roadmap

---

## ✅ Completed

### Core App & Playback
- [x] Electron + Vite + React + TypeScript scaffold
- [x] Design system — amber `#e8a027` theme, CSS variables, typography
- [x] App layout — topbar, piano roll, keyboard, track panel, drawers
- [x] Global state — Zustand store with full type definitions
- [x] MIDI file open via native dialog
- [x] Falling note piano roll — PixiJS WebGL, 60fps, color per track
- [x] Piano roll key range respects selected keyboard size (61/73/88)
- [x] Piano roll zoom — wired to renderer, real-time seconds display
- [x] Basic playback — play / pause / stop
- [x] Tempo control — BPM ▲/▼ arrows with long-press acceleration, pitch-independent via JZZ speed ratio
- [x] Metronome — full MIDI tempo-map support, phase-aligned to playback position
- [x] Track mute / solo / visible per track
- [x] Track panel — auto-opens on file load; auto-mutes non-keyboard groups
- [x] MIDI device indicator in top bar — shows device name when connected
- [x] **Speed control redesign** — three chevron-arrow buttons (1×/2×/3×) replace SVG track-and-circle selector; active button glows amber

### Keyboard & Audio
- [x] Virtual keyboard — 61 / 73 / 88 keys, proportional height, ResizeObserver
- [x] Keyboard docked mode — notes land on correct keys
- [x] Keyboard floating mode — draggable, width-resizable (650–1200px)
- [x] Click to play — any key produces sound (JZZ, Grand Piano ch14)
- [x] Glissando — drag across keys while mouse button held
- [x] Key lighting — keys light in track color during playback
- [x] GM Synth audio engine — JZZ + jzz-synth-tiny, lazy init
- [x] Samples audio engine — SpessaSynth + GeneralUser GS SF2 (~31MB download on first use)
- [x] Master volume knob — SVG dial in toolbar, persists across sessions
- [x] **Hardware MIDI input (Web MIDI API)** — real hardware keyboards light on-screen keys and play sound with true sustain (press = starts, release = stops immediately); dedicated MIDI channel 15, isolated from file playback

### Chord & Scale Features
- [x] Real-time chord detection during playback and manual key presses
- [x] Chord display above keyboard — slash notation (C/E), inversion labels (1st inv)
- [x] Chord lock — Shift+click to build and lock a chord; opens as a draggable mini modal; clear button no longer dismisses modal (shows `— — —`, re-opens on next Shift+click)
- [x] Shift+Click hint text relocated to main chord display row (next to `SCALES`)
- [x] Chord Explorer — 20 chord types (Common/Extended tiers), root selector, hand/note filters, search, progressions, inversion cycling
- [x] Scale Explorer — Circle of Fifths SVG, 10 scale types, diatonic chord grid, Roman numeral labels, 20 named progressions, inversion cycling
- [x] Scale Explorer — Octave tile (8th tile after 7-degree grid; plays tonic chord +12 semitones; label `{tonic.roman}⁸`; inversion buttons work correctly)
- [x] Inversion display — slash notation everywhere; original chord identity preserved across all cycling; no re-detection on inverted sets
- [x] Major chord suffix `M` removed globally (CM → C)
- [x] Fixed: progression playback used wrong chord quality (ii-V-I now correctly plays Dm7-G7-Cmaj7 regardless of currently selected chord type — quality hardcoded per Roman numeral)
- [x] Fixed: chord name display froze during progression playback (both explorers) — now updates live per step
- [x] Fixed: Samples engine produced no audio during progression playback — routing bug resolved
- [x] Chord Explorer search rewritten with Fuse.js fuzzy matching (single character returns results immediately)
- [x] **Power Chord tier** — full `power` tier mode in Chord Explorer (12 power chord tiles; gates Hand filter, Notes filter, Search, Progressions, Play Inversion footer; clears stale highlights on entry)
- [x] **Genre Voicing System** — 7 styles (Classic, Coltrane, Cinematic, Roadhouse, Ipanema, Carnival, Velvet) for Chord Explorer progression playback; `getGenreVoicing()` in `genreVoicing.ts`; all chord type strings verified against tonal 6.4.3
- [x] Chord Prompter — integrated directly into the chord bar (not a separate modal); toggle in Settings + transport icon; shows past 4 chords / current / next 2 chords in one row; both simple and extended display now read from the same pre-computed chord sequence (fixed jitter in regular display too)
- [x] Chord Transcript PDF — generates a full chord chart (legend with keyboard-diagram thumbnails, bar/beat grid, subtle full-bleed lines) for any file; triggered via icon next to each file in the Library; gated by a Settings toggle (default off); fonts embedded (Inter/JetBrains Mono); legend collapses inversions into one entry per chord; respects active accidentals setting
  - Styling flagged for a future polish pass (noted, not urgent)
- [x] Fixed: EU naming Bb-rooted chord names (e.g. "Bbm") were incorrectly displayed as "Hm" — sequential `.replace()` in `localizeChord()` replaced with single atomic pass; affects chord bar, Locked Chord modal, Chord Explorer, Scale Explorer

### Note Naming & Accidentals
- [x] Note naming systems — UK/US (English), EU (Central European H), Solfège, Hidden
- [x] Accidentals toggle — flats / sharps; single source of truth via `convertAccidentals()`
- [x] Central European: pitch class 10 always displays as `B`, never `A#`

### MIDI Editing & Library
- [x] **MIDI Playback Editor** — rebuilt as floating modal (760×620px, draggable); track include/exclude, instrument reassignment (all 128 GM programs), track merge, track rename, split; saves as `_ORFEO.mid`/`_ORFEO_MERGED.mid`/`_ORFEO_SPLIT.mid`, never modifies originals; unified modal header with click-to-front z-index focus
- [x] Split Track — auto-detects single piano tracks spanning both bass/treble registers, splits into Left Hand / Right Hand tracks; two-step flow (icon → confirmation toolbar) to prevent accidental splits
- [x] Split breakpoint — Single Note mode (adjustable C3–C4) AND Range mode (lower/upper bound, mixed zone), both persistent and user-selectable in Settings
- [x] MIDI file library — folder picker, subfolder scanning, star favourites, one-click load
- [x] **Library amber highlight** — currently loaded file row shows amber background + amber filename + amber icon; comparison normalises Windows backslash/case
- [x] **Right-click "Remove from Library"** — context menu on any library row hides the file from the list (persisted to prefs); `position: fixed` menu escapes panel `overflow: hidden`
- [x] **Drag & drop MIDI files** — drop anywhere on the app to load; if a file is already open a confirm modal appears; external files auto-copied to library via `fs:copyMidiToLibrary` IPC (collision-safe naming)
- [x] **Drag & drop onto Library sidebar** — add-only; amber border overlay while dragging; error toast for non-MIDI or no-folder cases; `dragleave` flickering prevented with `contains(relatedTarget)` guard
- [x] Auto-created `Orfeo/` subfolder — all app-generated files save here automatically, keeping the source library tidy; library displays `.mid` files from it, hides PDFs
- [x] Bundled `Demo/` folder — 5 MIDI files auto-copied on first launch, always sorted to top of library, hideable via Settings toggle
- [x] Settings persistence — note naming, accidentals, library folder, favourites, master volume, audio engine, all new toggles saved to `orfeo-prefs.json`
- [x] **Foreign format import** (29. 7. 2026) — MusicXML (`.musicxml`, `.xml`, `.mxl`), Guitar Pro (`.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`), and karaoke MIDI (`.kar`) files now import directly; alphaTab 1.8.4 converts to SMF bytes at load time; cache stored in `Orfeo/` subfolder with mtime invalidation; KAR pass-through (zero conversion, extension whitelist only); library icons distinguish imported files; user prompted to save on file switch/app close with unsaved converted bytes

### Note Editor
- [x] **Note Editor** — in-place MIDI editing directly on the PianoRoll canvas; enabled via Settings → MIDI Files & Library (eye toggle); activated via PencilSparkles icon in TopBar
  - Single-tool interaction model: edge drag = resize; click note = move; Shift+click = selection toggle; Alt+click empty = add note; click empty = marquee select; right-click = delete (new notes) or alt+delete (any note)
  - Axis-free drag — pitch (x) and time (y) update simultaneously; single combined undo command per drag
  - Marquee selection with multi-note group move
  - Full undo/redo history (`NoteEditorToolbar` Undo/Redo buttons)
  - Track solo — clicking a track row in TrackPanel during edit solos it for editing focus; auto-restores on editor close
  - Live hint line below toolbar — context-sensitive text ("Drag to move", "Alt+click to add note", etc.) updates in real time as the cursor moves
  - Instrument audio preview on note click — correct instrument per track (both GM and Samples engines); GM warmup fix for pre-play channel priming
  - Reset button — rebuilds `NES.editMidi` from original file bytes; clears all history/dirty state
  - Velocity editing — placeholder button visible (deferred, not yet implemented)
  - Save flow — versioned `_ORFEO` suffix; `noteEditor:save` IPC; file reloads inline after save
  - Unsaved-changes guard — closing or loading another file when dirty shows Save & Exit / Discard / Cancel strip
  - Tooltip — shows note name when note is too narrow to display inline text; gated on "Note Names" toggle; strips octave digit for compact display
  - Note Editor active state persists correctly on re-entry (NES.reset order fixed)

### Mixer Console
- [x] **Mixer Console** (Ctrl+Shift+M) — full implementation: floating modal with 8 channel strips + 1 master strip
  - `ChannelStrip` — 120×574px; knobs (chorus, reverb, pan) + volume fader + VU meter + M/S/Eye/Kbd controls; displays resolved GM instrument name
  - `MasterStrip` — 160×574px; spectrogram wave-mode VU with glow + idle breathing; master volume knob; FX knobs
  - `MixerKnob` — SVG rotary knob with radial ticks and triangle notch; `tickScale`/`triScale` props for sizing
  - Channel CC wiring — chorus, reverb, pan, volume all wired to Samples engine via `setChannel*` functions exported from `useSamplesEngine.ts`; uses MIDI channel from file (not track index)
  - VU meter — solid-color segmented bars per track; `drawVU(canvas, level, color, segs, canvasH)` with active/inactive segments
  - Click-to-front z-index focus — `bringToFront()` module counter shared with MIDI Editor
  - `stopPropagation` on knob/fader `mousedown` prevents scroll-pan conflicts

### UI & Infrastructure
- [x] Logo click — resets app to initial state, preserves user preferences
- [x] App launches maximized
- [x] Explorer modals open positioned above keyboard by default
- [x] Warm/dark theme toggle
- [x] Windows installer — `electron-builder` + NSIS, `npm run dist`
- [x] Portable build — single `.exe`, no installation required; filename auto-matches `package.json` version + `-portable` suffix; `Orfeo-Data/` folder redirect keeps prefs/samples cache with the exe
- [x] Fixed: Samples engine failing to load in packaged/portable builds
- [x] Fixed: MIDI Playback Editor opening main app/Library instead of the editor in packaged builds
- [x] Fixed: Floating keyboard waterfall/piano-roll misalignment
- [x] User Manual link in left drawer
- [x] **Settings panel redesign** — 7 collapsible sections (MIDI Files & Library, Notation, Keyboard, Playback & Practice, Audio, Piano Roll, Appearance); eye-toggle controls (green = on, red = off); amber section headers; collapse state persisted per group; `OptionBtn` active state uses green for features, red for hide/disable actions
- [x] **Show Octave Labels / Show Note Names on Keyboard** toggles — persisted settings; eye-toggle UI in Settings Keyboard group; take effect immediately
- [x] **Left/Right Hand Labels** — amber lines in keyboard footer marking hand boundary; `detectHandBoundaries()` in `handBoundaries.ts`; single-note and range breakpoint modes; persistent breakpoint settings; Settings integration
- [x] **Selective Tracks Playback** — eye-toggle in Settings Audio group; amber "Selection / All tracks" button in Track Panel header; `setTrackMuteFilter()` batch action mutes/unmutes all non-keyboard GM families in one call; real-time JZZ filter (no player rebuild)
- [x] **Guitar tracks auto-muted** — `'guitar'` (GM programs 24–31) added to `DEFAULT_MUTED_GROUPS`
- [x] **Track Panel full instrument names + marquee** — three-row `TrackRow` layout (name row / controls row / channel+program row); `MarqueeText` shared component (scroll-on-hover via `ResizeObserver`); instrument names show in full, marquee only activates on overflow
- [x] **Loop Region Strip** — 24px canvas strip between scrub bar and song title; note-density tick marks; bar-snapping; bar range popup with long-press chevrons; persisted enable/disable toggle; resets on file load; tick color and remount density fix applied
  - Alt+drag on waterfall — draw loop region directly on the piano roll; amber overlay + handles
  - Draggable boundary handles on waterfall overlay
  - Cursor-following tooltip ("Alt+drag · set loop region", "Right-click · clear")
  - Right-click inside overlay to clear loop region
  - Double-click to reset loop region; free selection in loop strip
  - Activating loop jumps to loop start and begins playback
- [x] **Drawer restyle** — 3-icon collapsed columns; unified icon set (PencilSparkles, FileMusic, etc.); tab alignment fixes
- [x] **Presentation Mode** (F11) — distraction-free OS-level fullscreen for live playing and screen recording
  - TopBar hover-reveal: 8px invisible strip at top; 400ms debounce hide on mouse leave
  - Hides SettingsPanel, TrackPanel, chord bar, Dock/Float button, hand-label visualization, note counter
  - Keyboard and key-range selector always visible; PM toggle (Expand/Shrink) pinned to right edge
  - F11 toggles; Esc exits; Note Editor dirty-check guard on enter
- [x] Custom `EyeClosed` SVG — replaces Lucide `EyeOff` across Settings panel and Track Panel (5-path inline design)
- [x] **Global CSS variable migration** — all design tokens extracted to `src/index.css :root`; no hex literals remain in DOM/inline-style context; SVG presentation attributes excluded (intentional); new tokens: `--text-dim-control`, `--border-row`, `--bg-deep`, modal surfaces, interaction states, amber alpha tiers, status banners

### Documentation & Tooling
- [x] `CLAUDE.md` — trimmed to essentials, Gotchas section, Versioning rules, automatic changelog/README-split rule on every commit
- [x] Master `CHANGELOG.md` — merged chronologically, newest-first
- [x] `README.md` — badges, feature tables, audio engine comparison, public-facing plain-language changelog
- [x] `CONTRIBUTING.md` — build instructions for Windows/macOS/Linux contributors
- [x] dotclaude skills — `ship`, `catchup`, `claude-md`, `debug-fix`
- [x] `ccstatusline` — live token/session/quota tracking in Claude Code terminal

---

## Known Issues

| # | Issue | Priority |
|---|---|---|
| 2 | TrackPanel SVG — intermittent renderer crash on certain MIDI files; root cause unknown | High |
| 3 | Chord name inconsistency between Chord Explorer tiles and live chord bar display in some edge cases | Medium |
| 7 | CSS Grid migration — replace flexbox in multi-row components (explorers, topbar, mixer, settings, track panel) | Low |
| 8 | Performance mode ribbon rest state — colored fills fade out on silence, dim midline appears, labels dim to 55% opacity at last known cluster positions. Needs visual review once testable on hardware. | Low |
| 9 | Library "Remove from Library" has no undo / "Show hidden files" UI — files hidden via right-click context menu accumulate in prefs with no way to restore them from within the app | Low |

---

## Planned Features

### Near Term
- [ ] **Note Editor velocity editing** — per-note velocity bars at the bottom of the edit canvas; drag to adjust; placeholder button already visible in toolbar
- [ ] **Note Editor walkthrough overlay** — first-time tooltip sequence; `noteEditorWalkthroughSeen` store flag already wired
- [ ] Settings panel remaining items — CSS Grid layout, MIDI output device selector, key highlight color picker, count-in bars, auto-scroll, default keyboard size/mode on launch, reopen-last-file-on-launch, window position memory, welcome screen on/off, UI density toggle
- [ ] Finger numbers on keyboard — display suggested fingering on lit keys during chord/inversion display: 1-3-5 (major/minor/diminished triads), 1-2-3-5 / 1-2-4-5 (seventh-chord inversions); inversion-aware
- [ ] Onboarding / Welcome screen — shown on first launch only, toggleable from Settings; placeholder icon in drawer spec
- [ ] **Adding additional sample libraries** App ships with tested and in-built support for Timbres of Heaven (429 MB) and Arachno Soundfont (155 MB), user choses what to download and install. Brief instructuctions how/where to install & test. Settings > Audio
- [ ] **Track Color System** - Editable only in Playback editor! Orfeo tracks currently have an assigned color used in the track drawer, the piano roll notes, keyboard (???),Console and the channel strips. This feature adds full user control over track color, a curated palette, and smarter defaults for duplicate instruments.
- [ ] **Playbar Toggle & Visual Effects** - Phase 1 — Hidable Playbar, Phase 2 — Note-Hit Visual Effects

### More testing, polish and improvements needed
- [ ] Chord Transcript styling polish pass (flagged as deferred during initial implementation)
- [ ] Beta label on Chord Transcript and Hand Labels settings - the functionality itself needs more testing and polish
- [ ] Progressions fix in Chord and Scale explorer (now they play chords up and go back instead of always up, inversions not used)
- [ ] Left/Right hand indicator and logic in the footer
- [ ] Restyling Chords and Scale explorer

### Larger Features (after initial launch)
- [ ] **Play-Along "Wait Mode"** — unblocked since Hardware MIDI Input is complete. Pauses playback at each note/chord group; compares live hardware input against required notes; advances only when matched. Needs: matching strictness rules (exact vs subset), per-hand independent gating (using existing hand-detection infrastructure), timing tolerance window for near-simultaneous notes.
  - [ ] Prerequisite fix — file playback vs hardware input color conflict: `activeKeys`/`activeKeyColors` currently receives writes from both MIDI file playback and live hardware input simultaneously with no coordination, causing key-color overwrites when both are active at once. Must be resolved before Play-Along can distinguish "notes from the file" vs "notes the user just played"
- [ ] **Arpeggiator** — rhythmic preset patterns (Alberti bass, ascending/descending, octave jump, syncopated) as step sequences with note duration and rest slots; BPM-configurable; lights keys in real time - Hooked into chords and scales explorer
- [ ] Help window — separate Electron BrowserWindow loading `public/help/index.html`; triggered by info icon; full HTML/CSS layout with images/video; content editable without touching React code
Performance Recording
- [ ] **Performance recording** - Record a live performance from a connected hardware MIDI keyboard (and optionally the on-screen virtual keyboard) and export it as a standalone `.mid` file.

### Infrastructure
- [ ] GitHub Actions — automated multi-platform builds (Windows/macOS/Linux) on release tag push, auto-attached to GitHub Releases
- [ ] macOS .dmg build (contributor or CI)
- [ ] Linux .AppImage build (contributor or CI)
- [ ] CSS Grid migration (see Known Issues #7)

---

## Future / Phase 3

- [ ] VST3 plugin — separate JUCE/C++ project; same visual engine; DAW integration (Reaper, Cubase, Studio One)
- [ ] Playlist — save and recall collections of MIDI files with settings
- [ ] Key signature display — treble clef with sharps/flats in topbar
- [ ] In-app music notation rendering (VexFlow) or MusicXML export — under consideration, no implementation decision made

---

## Explicitly Parked (do not revisit without a strong reason)

- Web app / PWA version — desktop-only focus confirmed
- Full MIDI step sequencer / grid-based pattern editor with import-export
- Commercial licensing system (Keygen.sh/WooCommerce) and free/paid feature gating — Orfeo is fully open source, no licensing layer planned
