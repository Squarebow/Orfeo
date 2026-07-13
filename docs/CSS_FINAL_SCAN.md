# CSS Final Scan — Cross-File Hardcoded Hex Report

> Generated at the close of the staged CSS token rollout. Read-only report — findings below, no changes applied automatically.

---

## Exclusions applied

- All PixiJS `0x...` integer fills, Canvas2D `ctx.fillStyle`/`ctx.font` drawing calls
- SVG presentation attributes (`fill="#..."`, `stroke="#..."` on JSX elements)
- Functional/state visualization: piano key colors, track swatches, per-note highlight colors, hand boundary colors, loop overlay, playhead, Circle of Fifths wedge fills, VU meter levels
- All `#e8a027xx` amber alpha variants (intentional one-offs)
- Values already resolved to a token

---

## Rollout debt — tokens that exist but aren't applied everywhere yet

These are NOT missing tokens — just literals in specific files that never got swept during their batch.

| Hex value | Token | Files still using the literal |
|---|---|---|
| `#2a2a3a` | `--state-hover-bg` | ChordExplorer.tsx, FloatingKeyboard.tsx, ScaleExplorer.tsx (18 occurrences) |
| `#1a1a26` | `--bg-tile` | ChordExplorer.tsx, TopBar.tsx (12 occurrences) |
| `#13131c` | `--bg-modal` | ChordExplorer.tsx |
| `#404055` | previously `--text-muted` (value changed to `#94979e`) | ChordExplorer.tsx, KeyboardControls.tsx (5 occurrences — now orphaned from the token) |

**Quick wins** — `#2a2a3a` and `#1a1a26` alone account for 30 literal occurrences of tokens that already exist. Worth a short, targeted "apply existing tokens" pass before adding anything new.

---

## Section 1 — New token candidates (3+ files, no existing token)

| Hex value | Files | Occurrences | Suggested role |
|---|---|---|---|
| `#9090a8` | ChordExplorer, Keyboard, LoopRegionStrip, MidiEditor, ScaleExplorer, SettingsPanel, TrackPanel | 29 | `--text-subdued` — mid-dim UI text; very close to `--text-muted` (#94979e, Δ3–4/channel) — **strong candidate for consolidation rather than a new token** |
| `#606078` | ChordExplorer, MidiEditor, SettingsPanel | 7 | `--text-dim-control` — inactive button/cancel text, slightly brighter than `--text-inactive` |
| `#181822` | MidiEditor, SettingsPanel, TrackPanel | 5 | `--border-row` — 1px row divider inside panel lists |
| `#111116` | Keyboard, TopBar, VolumeKnob | 3 | `--bg-deep` — very dark near-black surface, header bars and knob notch fill |

**Highest priority:** `#9090a8` — 29 occurrences across 7 files, no token, and close enough to `--text-muted` that this is likely a consolidation opportunity rather than a genuinely new color.

---

## Section 2 — Confirmed one-offs (1–2 files, no action recommended)

**Background surfaces:** `#2e2e3c` (App.tsx separator), `#2e2e42` (LoopRegionStrip inputs/popup), `#2a2a35` (Keyboard chord bar borderTop), `#30304a` (TopBar BPM dropdown divider), `#111118` (FloatingKeyboard header), `#111120` (SettingsPanel row hover), `#1e1e2a` (ChordExplorer/FloatingKeyboard unselected chip), `#0a0a10` (MidiEditor input well)

**Text/dim labels:** `#222235` (Keyboard MIDI number), `#2a2a38` (EmptyState "Ctrl+O" hint), `#35354a` (SettingsPanel/TrackPanel metadata), `#40404e` (TrackPanel program number), `#404058` (TrackPanel inactive icon), `#454560` (TrackPanel micro-labels), `#606075` (TopBar nudge-button), `#808098` (TrackPanel hover), `#8080a0` (ChordExplorer/SettingsPanel file labels), `#0a0a0a` (MidiEditor Save button text)

**Hover/interaction transitions:** `#c0c0d0` (KeyboardControls), `#c0c0d4` (ChordExplorer), `#c0c0d8` (ScaleExplorer) — all hover-lightened button text variants, each single-file · `#c05050` (FloatingKeyboard close hover) · `#707060` (SettingsPanel star hover)

**Border/selection one-offs:** `#3a3a4a` (ChordExplorer progression tile hover) · `#3a3a5a` (ScaleExplorer scale tile hover, bluer variant)

**Status/functional (ambiguous, no action):** `#4caf50`/`#f44336` (SettingsPanel clipboard icon tint — lighter than status tokens, one-off) · `#e0e0e0` (ScaleExplorer selected tile text) · `#8080cc` (MidiEditor "merged" badge — functional state)

---

## Key takeaways

1. **Strongest new token opportunity:** `#9090a8` (29 occurrences, 7 files) — evaluate consolidating with `--text-muted` rather than adding a parallel token
2. **Largest rollout debt:** `#2a2a3a` and `#1a1a26` — tokens already exist, just need applying across the remaining files that missed their batch
3. **Clean candidates for future token definition:** `#181822` (row dividers) and `#111116` (deep header bg) — single-purpose, low-risk additions whenever a follow-up pass happens

## Status

This scan is a snapshot at the close of the initial staged rollout. The remaining items above are minor and low-risk — none represent visible inconsistency serious enough to block a release. Address opportunistically (rollout debt first, as those are literally free wins) rather than as a blocking task.