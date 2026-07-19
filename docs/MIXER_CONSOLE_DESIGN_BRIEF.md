# Mixer Console — Complete Design Brief

> Compiled from extensive design discussion. This is the authoritative spec — build against this, not fragments of memory. Note: the color hex values below reflect the ORIGINAL swatch design done before the CSS token rollout — when building, use the CURRENT `index.css` tokens for equivalent roles, don't hardcode these old values. Bring `index.css` into the new chat alongside this file to reconcile.

---

## Approach: prove the pattern on one channel strip first

Build a single channel strip component in isolation first — get the knob reuse, VU meter, and fader all working and looking right on one strip — before assembling the full 8-channel + master modal. Same "small proof before full rollout" discipline used successfully for the Settings redesign and CSS token system.

---

## Modal Dimensions (target: 13" laptop, scales up on larger screens)

```
Total modal:        1120px × 552px  (target size — use relative/proportional CSS
                     units so it scales cleanly on larger screens, not fixed pixels;
                     e.g. modal width as min(90vw, 1400px) with internal elements
                     as proportions, not baked-in fixed pixel values)
Header:              1120px × 40px (full width, top)
Channel strip (×8):  108px × 480px each
Master strip:        160px × 480px
Gap between strips:  8px (8 gaps total between the 9 strips)
Outer padding:       16px (all four sides)
Strip border:        1px, subtle (--border-outer equivalent), all 9 strips + header
```

Math check: 8×108 + 160 + 8×8 = 864 + 160 + 64 = 1088px content row. +32px padding = 1120px total width. Content height 480 + 40 header + 32 padding = 552px total height.

---

## Single Channel Strip — top to bottom layout

1. **Track name label** (e.g. "Acoustic Grand Piano")
2. **Chorus knob** — teal accent, reuses the existing `VolumeKnob.tsx` component pattern (dot-arc + rotating notch indicator), not rebuilt from scratch
3. **Reverb knob** — purple accent, same reused knob pattern
4. **M / S square buttons** — mute/solo, matches existing Track Panel button styling
5. **Eye / keyboard show-hide icons** — reuse the existing show-on-waterfall / show-on-keyboard icons already in the Track Panel
6. **Pan knob** — amber accent, smaller than Chorus/Reverb, same reused knob pattern, centre-detent behavior
7. **"VOLUME" label**
8. **Digital dB readout** — small pill, JetBrains Mono, live value display (this doubles as the "digital display" element — not a separate invented feature)
9. **VU meter** — see dedicated section below
10. **Vertical fader** — see dedicated section below
11. **Instrument name pill** at the very bottom (e.g. "Acoustic Grand Piano" repeated, matches original hardware-strip reference)

---

## VU Meter — MIDI-event-driven, NOT audio-FFT-based

**Critical architectural decision, already reasoned through carefully — do not deviate:**

Orfeo already has exact MIDI event data flowing through the store (`activeKeys`, `activeKeyColors`, per-track note velocity). The VU meter should be driven directly from this data, NOT from an `AnalyserNode`/FFT audio-analysis approach.

- Bar height maps to note velocity (0–127) on that channel
- A brief brighter "attack" flash segment appears on top of the bar when a note fires, then decays into the sustained color
- Bars should look **discrete/angular**, not smooth-continuous — this is honest to the fact that MIDI notes are discrete events, not a continuous audio waveform (deliberately different visual character from a real audio spectrum analyzer)
- Applies identically to both master strip modes (see below) and all 8 channel strips
- Zero new dependencies, zero audio-analysis overhead — this is a genuine simplicity + accuracy win, not a compromise

---

## Master Strip — two display modes with a toggle

The master strip has everything a channel strip has (minus Chorus/Reverb — master only needs a Pan-equivalent if any, primarily just the big volume control) **plus**:

- **Master Volume knob** — same reused `VolumeKnob.tsx` pattern, scaled up 3–4× the radius of the channel strip knobs, the dominant visual anchor of the whole console
- **Display mode toggle** — a tiny pill switch (M / S labels) positioned near the meter, switching between:
  - **Mono meter mode** — single vertical column showing overall master level (mono, not stereo — Orfeo's playback isn't meaningfully stereo-panned, so a stereo pair would be misleading)
  - **Spectrogram mode** — all 8 channels' current levels compressed into thin columns side by side, numbered 1–8, giving an at-a-glance view of what every channel is doing simultaneously
- Both modes still MIDI-event-driven, same principle as channel strips — no exception for master

---

## Fader — simplified, flat, NOT skeuomorphic

Deliberate simplification from the original hardware-photo-inspired sketch: **thin vertical track + single amber capsule/pill handle that slides**. No tick marks, no bevel, no gradient, no 3D hardware look — matches the flat, clean aesthetic used everywhere else in Orfeo. This was an explicit design correction after the first mockup leaned too skeuomorphic.

---

## Muted channel behavior

- Dimmed visual appearance
- Fader visually slides to zero position
- (Not yet implemented — spec only, confirm exact animation/interaction when building)

---

## Track overflow (9+ active channels)

- Max 8 channel strips + master visible at once
- Active/unmuted channels sort to the left
- If more than 8 active channels exist, a horizontal scrollbar appears **at the bottom of the strip row specifically** — not the whole modal

---

## Trigger

Opens from the **Track Panel**, not the TopBar — via the `sliders-vertical` icon already speced in the drawer icon restructuring work (alongside `audio-lines` for Tracks and `pencil-sparkles` for MIDI Editor). If that icon work hasn't been implemented yet, this needs its own trigger point added.

---

## Audio engine scope — GM Synth vs Samples

- **Fader, Mute, Solo** — work identically on both GM Synth and Samples engines
- **Reverb, Chorus, Pan knobs** — only meaningfully functional on the **Samples engine** (SpessaSynth supports real CC messages for these: Volume=CC7, Pan=CC10, Reverb=CC91, Chorus=CC93 via `controllerChange`). These three knobs should appear **greyed out / visually disabled** when GM Synth is the active engine, since GM synth has no real per-channel effects processing to control.

---

## Technical notes

- Any SVG element with a stroke (knob borders, fader track outline) must use `vector-effect="non-scaling-stroke"` — without this, borders visually "blob out" when the component scales to different sizes. This was a real bug encountered and understood during the original channel strip mockup work.
- Colors should reference current `index.css` tokens (bring that file into the new chat) rather than the specific hex values noted in earlier design sketches, since the full app underwent a color scheme update after this mixer design work was originally done.

---

## Not yet decided / open questions for the new session

- Exact muted-fader animation (does it visually slide down over time, or snap to zero instantly?)
- Whether the master strip needs its own Pan control, or just Volume
- Exact spacing/sizing for the display-mode toggle switch on the master strip
