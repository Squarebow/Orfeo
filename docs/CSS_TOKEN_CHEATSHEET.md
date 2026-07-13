# CSS Token Cheatsheet — Orfeo

> Reverse index of every CSS custom property defined in `src/index.css` and where each is used across `src/`.
> Re-generate after adding or renaming tokens.

---

## Backgrounds

### --bg (#121212)
App floor colour.

Used in:
- `src/index.css` : 180 (`.theme-warm` override assigns `--bg: #12100e` at line 177; used in `body`)
- `src/index.css` : 184 (`body { background: var(--bg) }`)
- `src/components/ChordExplorer.tsx` : 757 (selected key tile — `background: isSel ? 'var(--text-amber)' : '…', color: isSel ? 'var(--bg)' : '…'`)

### --bg-warm (#12100e)
Warm-theme variant (pending its own themed rollout). Currently only assigned inside `.theme-warm` in `src/index.css`.

Used in:
- `src/index.css` : 177 (`.theme-warm { --bg: #12100e }` — value assigned here, no component reference yet)

**No direct `var(--bg-warm)` references in src/. Value is injected by overriding `--bg` in `.theme-warm`.**

### --panel (#1e1e1e)
Panel layer.

Used in:
- No direct `var(--panel)` references found in src/. Value is kept in sync with `--bg-panel`.

### --panel-warm (#16120e)
Warm-theme panel variant (pending rollout).

Used in:
- No direct `var(--panel-warm)` references found in src/.

### --bg-panel (#1e1e1e)
Kept in sync with `--panel`.

Used in:
- No direct `var(--bg-panel)` references found in src/.

### --bg-panel2 (#2d2d2d)
Nested surface — cards, tiles inside a panel.

Used in:
- No direct `var(--bg-panel2)` references found in src/.

### --bg-row (#0e0e16)
Recessed row striping — darker than app floor.

Used in:
- `src/components/LoopRegionStrip.tsx` : 484
- `src/components/LoopRegionStrip.tsx` : 521
- `src/components/SettingsPanel/SettingsPanel.tsx` : 46
- `src/components/SettingsPanel/SettingsPanel.tsx` : 372
- `src/components/SettingsPanel/SettingsPanel.tsx` : 464
- `src/components/SettingsPanel/SettingsPanel.tsx` : 508
- `src/components/SettingsPanel/SettingsPanel.tsx` : 514
- `src/components/SettingsPanel/SettingsPanel.tsx` : 810
- `src/components/TrackPanel/TrackPanel.tsx` : 258
- `src/components/MidiEditor/MidiEditor.tsx` : 216

### --bg-input (#58595b)
Interactive surfaces: inputs, toggle pills.

Used in:
- No direct `var(--bg-input)` references found in src/.

### --bg-highlight (#aeb0b5)
Sparing use — small interactive highlight details.

Used in:
- No direct `var(--bg-highlight)` references found in src/.

### --bg-modal (#13131c)
Modal container background (ChordExplorer, ScaleExplorer, etc.).

Used in:
- `src/components/LockedChordModal.tsx` : 99
- `src/components/ScaleExplorer.tsx` : 637
- `src/components/SettingsPanel/SettingsPanel.tsx` : 93
- `src/components/SettingsPanel/SettingsPanel.tsx` : 661
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1127
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1146
- `src/components/TrackPanel/TrackPanel.tsx` : 107
- `src/components/MidiEditor/MidiEditor.tsx` : 194
- `src/components/MidiEditor/MidiEditor.tsx` : 564

### --bg-modal-header (#0d0d12)
Header/footer bars within modals.

Used in:
- `src/components/ScaleExplorer.tsx` : 652
- `src/components/ScaleExplorer.tsx` : 674
- `src/components/ScaleExplorer.tsx` : 897
- `src/components/ScaleExplorer.tsx` : 1040
- `src/components/MidiEditor/MidiEditor.tsx` : 167
- `src/components/MidiEditor/MidiEditor.tsx` : 183
- `src/components/MidiEditor/MidiEditor.tsx` : 355
- `src/components/MidiEditor/MidiEditor.tsx` : 410
- `src/components/MidiEditor/MidiEditor.tsx` : 532
- `src/components/MidiEditor/MidiEditor.tsx` : 535
- `src/components/MidiEditor/MidiEditor.tsx` : 543
- `src/components/MidiEditor/MidiEditor.tsx` : 585
- `src/components/MidiEditor/MidiEditor.tsx` : 593
- `src/components/MidiEditor/MidiEditor.tsx` : 604

### --bg-tile (#1a1a26)
Interactive tile/pill/dropdown surface — pervasive across explorers.

Used in:
- `src/components/LoopRegionStrip.tsx` : 445
- `src/components/ScaleExplorer.tsx` : 826
- `src/components/ScaleExplorer.tsx` : 862
- `src/components/ScaleExplorer.tsx` : 960
- `src/components/ScaleExplorer.tsx` : 1105
- `src/components/SettingsPanel/SettingsPanel.tsx` : 47
- `src/components/SettingsPanel/SettingsPanel.tsx` : 48
- `src/components/SettingsPanel/SettingsPanel.tsx` : 366
- `src/components/SettingsPanel/SettingsPanel.tsx` : 465
- `src/components/SettingsPanel/SettingsPanel.tsx` : 480
- `src/components/SettingsPanel/SettingsPanel.tsx` : 509
- `src/components/SettingsPanel/SettingsPanel.tsx` : 547
- `src/components/SettingsPanel/SettingsPanel.tsx` : 728
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1071
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1093
- `src/components/TrackPanel/TrackPanel.tsx` : 174
- `src/components/TrackPanel/TrackPanel.tsx` : 180
- `src/components/TrackPanel/TrackPanel.tsx` : 259
- `src/components/TrackPanel/TrackPanel.tsx` : 260
- `src/components/TrackPanel/TrackPanel.tsx` : 484
- `src/components/TrackPanel/TrackPanel.tsx` : 509
- `src/components/MidiEditor/MidiEditor.tsx` : 224
- `src/components/MidiEditor/MidiEditor.tsx` : 543
- `src/components/MidiEditor/MidiEditor.tsx` : 585
- `src/components/MidiEditor/MidiEditor.tsx` : 600
- `src/components/MidiEditor/MidiEditor.tsx` : 620

---

## Borders

### --border (#1e1e28)
Used in:
- `src/components/LockedChordModal.tsx` : 118
- `src/components/ChordExplorer.tsx` : 238
- `src/components/ChordExplorer.tsx` : 661
- `src/components/ChordExplorer.tsx` : 818
- `src/components/ChordExplorer.tsx` : 914
- `src/components/ChordExplorer.tsx` : 1055
- `src/components/ScaleExplorer.tsx` : 98
- `src/components/ScaleExplorer.tsx` : 652
- `src/components/ScaleExplorer.tsx` : 674
- `src/components/ScaleExplorer.tsx` : 897
- `src/components/ScaleExplorer.tsx` : 945
- `src/components/ScaleExplorer.tsx` : 1039
- `src/components/Keyboard/Keyboard.tsx` : 249
- `src/components/Keyboard/KeyboardControls.tsx` : 282
- `src/components/Transport/TopBar.tsx` : 301
- `src/components/Transport/TopBar.tsx` : 325
- `src/components/Transport/TopBar.tsx` : 348
- `src/components/Transport/TopBar.tsx` : 368
- `src/components/SettingsPanel/SettingsPanel.tsx` : 510
- `src/components/SettingsPanel/SettingsPanel.tsx` : 740
- `src/components/SettingsPanel/SettingsPanel.tsx` : 948
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1018
- `src/components/TrackPanel/TrackPanel.tsx` : 226
- `src/components/MidiEditor/MidiEditor.tsx` : 203
- `src/components/MidiEditor/MidiEditor.tsx` : 273
- `src/components/MidiEditor/MidiEditor.tsx` : 535
- `src/components/MidiEditor/MidiEditor.tsx` : 593
- `src/components/MidiEditor/MidiEditor.tsx` : 604

### --border2 (#252530)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 167
- `src/components/MidiEditor/MidiEditor.tsx` : 182
- `src/components/MidiEditor/MidiEditor.tsx` : 204
- `src/components/MidiEditor/MidiEditor.tsx` : 283
- `src/components/MidiEditor/MidiEditor.tsx` : 310
- `src/components/MidiEditor/MidiEditor.tsx` : 316
- `src/components/MidiEditor/MidiEditor.tsx` : 355
- `src/components/MidiEditor/MidiEditor.tsx` : 564
- `src/components/MidiEditor/MidiEditor.tsx` : 596
- `src/components/MidiEditor/MidiEditor.tsx` : 600
- `src/components/MidiEditor/MidiEditor.tsx` : 619
- `src/components/SettingsPanel/SettingsPanel.tsx` : 92
- `src/components/SettingsPanel/SettingsPanel.tsx` : 373
- `src/components/SettingsPanel/SettingsPanel.tsx` : 405
- `src/components/SettingsPanel/SettingsPanel.tsx` : 419
- `src/components/SettingsPanel/SettingsPanel.tsx` : 662
- `src/components/SettingsPanel/SettingsPanel.tsx` : 728
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1127
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1145
- `src/components/TrackPanel/TrackPanel.tsx` : 108
- `src/components/TrackPanel/TrackPanel.tsx` : 180

---

## Text Colours

### --text-default (#c6c8c8)
Default UI text.

Used in:
- `src/components/Keyboard/Keyboard.tsx` : 274
- `src/components/Keyboard/Keyboard.tsx` : 290
- `src/components/Keyboard/Keyboard.tsx` : 330
- `src/components/Keyboard/Keyboard.tsx` : 434
- `src/components/Transport/TopBar.tsx` : 19 (colour map constant `C.default`)
- `src/components/Transport/TopBar.tsx` : 457
- `src/components/Transport/TopBar.tsx` : 463

### --text-active (#f2f3f4)
Active/value text.

Used in:
- `src/components/Keyboard/Keyboard.tsx` : 314
- `src/components/Transport/TopBar.tsx` : 20 (colour map constant `C.active`)

### --text-muted (#94979e)
Dim labels.

Used in:
- `src/components/EmptyState.tsx` : 45
- `src/components/Keyboard/Keyboard.tsx` : 377
- `src/components/Keyboard/KeyboardControls.tsx` : 114
- `src/components/Keyboard/KeyboardControls.tsx` : 276
- `src/components/Keyboard/KeyboardControls.tsx` : 293
- `src/components/Keyboard/KeyboardControls.tsx` : 301
- `src/components/Keyboard/FloatingKeyboard.tsx` : 133
- `src/components/Keyboard/FloatingKeyboard.tsx` : 141
- `src/components/Keyboard/FloatingKeyboard.tsx` : 143
- `src/components/Keyboard/FloatingKeyboard.tsx` : 151
- `src/components/Keyboard/FloatingKeyboard.tsx` : 153
- `src/components/Transport/TopBar.tsx` : 21 (colour map constant `C.muted`)
- `src/components/TrackPanel/TrackPanel.tsx` : 282
- `src/components/TrackPanel/TrackPanel.tsx` : 488
- `src/components/SettingsPanel/SettingsPanel.tsx` : 341
- `src/components/SettingsPanel/SettingsPanel.tsx` : 369
- `src/components/SettingsPanel/SettingsPanel.tsx` : 374
- `src/components/SettingsPanel/SettingsPanel.tsx` : 469
- `src/components/SettingsPanel/SettingsPanel.tsx` : 488
- `src/components/SettingsPanel/SettingsPanel.tsx` : 527
- `src/components/SettingsPanel/SettingsPanel.tsx` : 555
- `src/components/SettingsPanel/SettingsPanel.tsx` : 963
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1027
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1037
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1048 (via `orfeo-button:hover` utility class)
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1102
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1106
- `src/components/MidiEditor/MidiEditor.tsx` : 219
- `src/components/MidiEditor/MidiEditor.tsx` : 291
- `src/components/MidiEditor/MidiEditor.tsx` : 292
- `src/components/MidiEditor/MidiEditor.tsx` : 293
- `src/components/MidiEditor/MidiEditor.tsx` : 305
- `src/components/MidiEditor/MidiEditor.tsx` : 324
- `src/components/MidiEditor/MidiEditor.tsx` : 329
- `src/components/MidiEditor/MidiEditor.tsx` : 330
- `src/components/MidiEditor/MidiEditor.tsx` : 410
- `src/components/MidiEditor/MidiEditor.tsx` : 538
- `src/components/MidiEditor/MidiEditor.tsx` : 545
- `src/components/ScaleExplorer.tsx` : 814

### --text-amber (#e8a027)
Accent colour — active states, highlights.

Used in:
- `src/components/LockedChordModal.tsx` : 122
- `src/components/LockedChordModal.tsx` : 129
- `src/components/LockedChordModal.tsx` : 138
- `src/components/LockedChordModal.tsx` : 157
- `src/components/LockedChordModal.tsx` : 167
- `src/components/LockedChordModal.tsx` : 168
- `src/components/LockedChordModal.tsx` : 177
- `src/components/LockedChordModal.tsx` : 187
- `src/components/LoopRegionStrip.tsx` : 408
- `src/components/LoopRegionStrip.tsx` : 427
- `src/components/LoopRegionStrip.tsx` : 494
- `src/components/LoopRegionStrip.tsx` : 500
- `src/components/LoopRegionStrip.tsx` : 531
- `src/components/LoopRegionStrip.tsx` : 537
- `src/components/LoopRegionStrip.tsx` : 549
- `src/components/ChordExplorer.tsx` : 52 (many lines — amber for active tab label)
- `src/components/ChordExplorer.tsx` : 57 (`--text-dimmest` / `--text-amber` toggle)
- `src/components/ChordExplorer.tsx` : 58
- `src/components/ChordExplorer.tsx` : 61
- `src/components/ChordExplorer.tsx` : 62
- `src/components/ChordExplorer.tsx` : 73–109 (multiple progression/key selection states)
- `src/components/ChordExplorer.tsx` : 629
- `src/components/ChordExplorer.tsx` : 670
- `src/components/ChordExplorer.tsx` : 693
- `src/components/ChordExplorer.tsx` : 722
- `src/components/ChordExplorer.tsx` : 730
- `src/components/ChordExplorer.tsx` : 731
- `src/components/ChordExplorer.tsx` : 738
- `src/components/ChordExplorer.tsx` : 757
- `src/components/ChordExplorer.tsx` : 833
- `src/components/ChordExplorer.tsx` : 837
- `src/components/ChordExplorer.tsx` : 838
- `src/components/ChordExplorer.tsx` : 847
- `src/components/ChordExplorer.tsx` : 868
- `src/components/ChordExplorer.tsx` : 869
- `src/components/ChordExplorer.tsx` : 870
- `src/components/ChordExplorer.tsx` : 887–905 (inversion mode buttons)
- `src/components/ChordExplorer.tsx` : 970
- `src/components/ChordExplorer.tsx` : 981
- `src/components/ChordExplorer.tsx` : 1009
- `src/components/ChordExplorer.tsx` : 1021
- `src/components/ChordExplorer.tsx` : 1022
- `src/components/ChordExplorer.tsx` : 1031
- `src/components/ChordExplorer.tsx` : 1068
- `src/components/ChordExplorer.tsx` : 1088
- `src/components/ChordExplorer.tsx` : 1101
- `src/components/ChordExplorer.tsx` : 1116
- `src/components/ChordExplorer.tsx` : 1130
- `src/components/ChordExplorer.tsx` : 1157
- `src/components/ChordExplorer.tsx` : 1172
- `src/components/Keyboard/Keyboard.tsx` : 265
- `src/components/Keyboard/Keyboard.tsx` : 286
- `src/components/Keyboard/Keyboard.tsx` : 304
- `src/components/Keyboard/Keyboard.tsx` : 311
- `src/components/Keyboard/Keyboard.tsx` : 336
- `src/components/Keyboard/Keyboard.tsx` : 353
- `src/components/Keyboard/Keyboard.tsx` : 361
- `src/components/Keyboard/Keyboard.tsx` : 440
- `src/components/Keyboard/KeyboardControls.tsx` : 114
- `src/components/Keyboard/KeyboardControls.tsx` : 300
- `src/components/Keyboard/FloatingKeyboard.tsx` : 142
- `src/components/Transport/TopBar.tsx` : 22 (colour map constant `C.amber`)
- `src/components/Transport/TopBar.tsx` : 416
- `src/components/Transport/TopBar.tsx` : 436
- `src/components/Transport/TopBar.tsx` : 457
- `src/components/Transport/TopBar.tsx` : 462
- `src/components/Transport/TopBar.tsx` : 463
- `src/components/ScaleExplorer.tsx` : 657
- `src/components/ScaleExplorer.tsx` : 665
- `src/components/ScaleExplorer.tsx` : 697
- `src/components/ScaleExplorer.tsx` : 698
- `src/components/ScaleExplorer.tsx` : 718
- `src/components/ScaleExplorer.tsx` : 930
- `src/components/ScaleExplorer.tsx` : 960
- `src/components/ScaleExplorer.tsx` : 970
- `src/components/ScaleExplorer.tsx` : 991
- `src/components/ScaleExplorer.tsx` : 1014
- `src/components/ScaleExplorer.tsx` : 1015
- `src/components/ScaleExplorer.tsx` : 1022
- `src/components/ScaleExplorer.tsx` : 1023
- `src/components/ScaleExplorer.tsx` : 1030
- `src/components/ScaleExplorer.tsx` : 1031
- `src/components/ScaleExplorer.tsx` : 1049
- `src/components/ScaleExplorer.tsx` : 1062
- `src/components/ScaleExplorer.tsx` : 1063
- `src/components/ScaleExplorer.tsx` : 1072
- `src/components/ScaleExplorer.tsx` : 1073
- `src/components/ScaleExplorer.tsx` : 1086
- `src/components/ScaleExplorer.tsx` : 1096
- `src/components/ScaleExplorer.tsx` : 1117
- `src/components/ScaleExplorer.tsx` : 1120
- `src/components/ScaleExplorer.tsx` : 1121
- `src/components/SettingsPanel/SettingsPanel.tsx` : 94
- `src/components/SettingsPanel/SettingsPanel.tsx` : 170
- `src/components/SettingsPanel/SettingsPanel.tsx` : 375
- `src/components/SettingsPanel/SettingsPanel.tsx` : 390
- `src/components/SettingsPanel/SettingsPanel.tsx` : 407
- `src/components/SettingsPanel/SettingsPanel.tsx` : 440
- `src/components/SettingsPanel/SettingsPanel.tsx` : 441
- `src/components/SettingsPanel/SettingsPanel.tsx` : 563
- `src/components/SettingsPanel/SettingsPanel.tsx` : 685
- `src/components/SettingsPanel/SettingsPanel.tsx` : 699
- `src/components/SettingsPanel/SettingsPanel.tsx` : 733
- `src/components/SettingsPanel/SettingsPanel.tsx` : 753
- `src/components/SettingsPanel/SettingsPanel.tsx` : 754
- `src/components/SettingsPanel/SettingsPanel.tsx` : 927
- `src/components/SettingsPanel/SettingsPanel.tsx` : 951
- `src/components/SettingsPanel/SettingsPanel.tsx` : 962
- `src/components/SettingsPanel/SettingsPanel.tsx` : 963
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1020
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1105
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1147
- `src/components/TrackPanel/TrackPanel.tsx` : 132
- `src/components/TrackPanel/TrackPanel.tsx` : 158
- `src/components/TrackPanel/TrackPanel.tsx` : 159
- `src/components/TrackPanel/TrackPanel.tsx` : 186
- `src/components/TrackPanel/TrackPanel.tsx` : 212
- `src/components/TrackPanel/TrackPanel.tsx` : 213
- `src/components/TrackPanel/TrackPanel.tsx` : 356 (default value for `IBtn.activeColor` prop)
- `src/components/MidiEditor/MidiEditor.tsx` : 223
- `src/components/MidiEditor/MidiEditor.tsx` : 280
- `src/components/MidiEditor/MidiEditor.tsx` : 285
- `src/components/MidiEditor/MidiEditor.tsx` : 294
- `src/components/MidiEditor/MidiEditor.tsx` : 315
- `src/components/MidiEditor/MidiEditor.tsx` : 333
- `src/components/MidiEditor/MidiEditor.tsx` : 338
- `src/components/MidiEditor/MidiEditor.tsx` : 537
- `src/components/MidiEditor/MidiEditor.tsx` : 565
- `src/components/MidiEditor/MidiEditor.tsx` : 577
- `src/components/MidiEditor/MidiEditor.tsx` : 620
- `src/index.css` : 159 (`.orfeo-button:hover`)
- `src/index.css` : 162 (`.orfeo-button.active`)

### --text-dimmest (#94979e)
Dimmest text — same numeric value as `--text-muted` by current token set.

Used in:
- `src/index.css` : 138 (`.orfeo-label { color: var(--text-dimmest) }`)
- `src/components/EmptyState.tsx` : 44
- `src/components/LockedChordModal.tsx` : 142
- `src/components/LockedChordModal.tsx` : 156
- `src/components/LockedChordModal.tsx` : 158
- `src/components/LockedChordModal.tsx` : 166
- `src/components/LockedChordModal.tsx` : 168
- `src/components/LockedChordModal.tsx` : 176
- `src/components/LockedChordModal.tsx` : 178
- `src/components/LoopRegionStrip.tsx` : 471
- `src/components/LoopRegionStrip.tsx` : 509
- `src/components/ChordExplorer.tsx` : 228
- `src/components/ChordExplorer.tsx` : 729
- `src/components/ChordExplorer.tsx` : 731
- `src/components/ChordExplorer.tsx` : 1063
- `src/components/ScaleExplorer.tsx` : 91
- `src/components/ScaleExplorer.tsx` : 680
- `src/components/ScaleExplorer.tsx` : 906
- `src/components/ScaleExplorer.tsx` : 934
- `src/components/ScaleExplorer.tsx` : 960
- `src/components/SpeedControl.tsx` : 31
- `src/components/VolumeKnob.tsx` : 6
- `src/components/SettingsPanel/SettingsPanel.tsx` : 53
- `src/components/SettingsPanel/SettingsPanel.tsx` : 68
- `src/components/SettingsPanel/SettingsPanel.tsx` : 157
- `src/components/SettingsPanel/SettingsPanel.tsx` : 171
- `src/components/SettingsPanel/SettingsPanel.tsx` : 338
- `src/components/SettingsPanel/SettingsPanel.tsx` : 681
- `src/components/SettingsPanel/SettingsPanel.tsx` : 686
- `src/components/SettingsPanel/SettingsPanel.tsx` : 695
- `src/components/SettingsPanel/SettingsPanel.tsx` : 700
- `src/components/SettingsPanel/SettingsPanel.tsx` : 729
- `src/components/SettingsPanel/SettingsPanel.tsx` : 734
- `src/components/SettingsPanel/SettingsPanel.tsx` : 892
- `src/components/SettingsPanel/SettingsPanel.tsx` : 902
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1015
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1128
- `src/components/TrackPanel/TrackPanel.tsx` : 128
- `src/components/TrackPanel/TrackPanel.tsx` : 133
- `src/components/TrackPanel/TrackPanel.tsx` : 153
- `src/components/TrackPanel/TrackPanel.tsx` : 159
- `src/components/TrackPanel/TrackPanel.tsx` : 182
- `src/components/TrackPanel/TrackPanel.tsx` : 187
- `src/components/TrackPanel/TrackPanel.tsx` : 207
- `src/components/TrackPanel/TrackPanel.tsx` : 213
- `src/components/TrackPanel/TrackPanel.tsx` : 230
- `src/components/TrackPanel/TrackPanel.tsx` : 270
- `src/components/MidiEditor/MidiEditor.tsx` : 217
- `src/components/MidiEditor/MidiEditor.tsx` : 218
- `src/components/MidiEditor/MidiEditor.tsx` : 223
- `src/components/MidiEditor/MidiEditor.tsx` : 539
- `src/components/MidiEditor/MidiEditor.tsx` : 600

### --text-dim (#b5b7bc)
One step brighter than dimmest — mid-level secondary text.

Used in:
- `src/components/LoopRegionStrip.tsx` : 485
- `src/components/LoopRegionStrip.tsx` : 522
- `src/components/ChordExplorer.tsx` : 719
- `src/components/ChordExplorer.tsx` : 981
- `src/components/ChordExplorer.tsx` : 1022
- `src/components/ScaleExplorer.tsx` : 922
- `src/components/SettingsPanel/SettingsPanel.tsx` : 812
- `src/components/SettingsPanel/SettingsPanel.tsx` : 879
- `src/components/SettingsPanel/SettingsPanel.tsx` : 895
- `src/components/SettingsPanel/SettingsPanel.tsx` : 905
- `src/components/MidiEditor/MidiEditor.tsx` : 567

### --text-standard (#c6c8c8)
Standard body/label text — identical value to `--text-default`.

Used in:
- `src/index.css` : 154 (`.orfeo-button { color: var(--text-standard) }`) — internal reference only

### --text-body (#d7d8d3)
Body text — one step brighter than standard.

Used in:
- No direct `var(--text-body)` references found in src/.

### --text-primary (#f2f3f4)
Primary text — identical value to `--text-active`.

Used in:
- `src/index.css` : 169 (`.orfeo-value { color: var(--text-primary) }`) — internal reference only

### --text-bright (#f8f8ff)
Very bright text — near-white.

Used in:
- No direct `var(--text-bright)` references found in src/.

### --text-white (#fefefa)
Full white text.

Used in:
- No direct `var(--text-white)` references found in src/.

### --text-inactive (#505068)
Inactive icons/buttons — some visibility but less than dimmest label.

Used in:
- `src/components/LockedChordModal.tsx` : 128
- `src/components/LockedChordModal.tsx` : 130
- `src/components/LockedChordModal.tsx` : 166
- `src/components/LockedChordModal.tsx` : 168
- `src/components/LockedChordModal.tsx` : 186
- `src/components/LockedChordModal.tsx` : 188
- `src/components/LoopRegionStrip.tsx` : 408
- `src/components/LoopRegionStrip.tsx` : 412
- `src/components/ScaleExplorer.tsx` : 664
- `src/components/ScaleExplorer.tsx` : 666
- `src/components/ScaleExplorer.tsx` : 722
- `src/components/ScaleExplorer.tsx` : 914
- `src/components/ScaleExplorer.tsx` : 969
- `src/components/ScaleExplorer.tsx` : 971
- `src/components/ScaleExplorer.tsx` : 991
- `src/components/ScaleExplorer.tsx` : 993
- `src/components/ScaleExplorer.tsx` : 1013
- `src/components/ScaleExplorer.tsx` : 1015
- `src/components/ScaleExplorer.tsx` : 1021
- `src/components/ScaleExplorer.tsx` : 1023
- `src/components/ScaleExplorer.tsx` : 1029
- `src/components/ScaleExplorer.tsx` : 1031
- `src/components/ScaleExplorer.tsx` : 1049
- `src/components/ScaleExplorer.tsx` : 1052
- `src/components/ScaleExplorer.tsx` : 1066
- `src/components/ScaleExplorer.tsx` : 1085
- `src/components/ScaleExplorer.tsx` : 1087
- `src/components/ScaleExplorer.tsx` : 1095
- `src/components/ScaleExplorer.tsx` : 1097
- `src/components/SettingsPanel/SettingsPanel.tsx` : 50
- `src/components/SettingsPanel/SettingsPanel.tsx` : 94
- `src/components/SettingsPanel/SettingsPanel.tsx` : 104
- `src/components/SettingsPanel/SettingsPanel.tsx` : 388
- `src/components/SettingsPanel/SettingsPanel.tsx` : 391
- `src/components/SettingsPanel/SettingsPanel.tsx` : 407
- `src/components/SettingsPanel/SettingsPanel.tsx` : 420
- `src/components/SettingsPanel/SettingsPanel.tsx` : 424
- `src/components/SettingsPanel/SettingsPanel.tsx` : 517
- `src/components/SettingsPanel/SettingsPanel.tsx` : 518
- `src/components/SettingsPanel/SettingsPanel.tsx` : 709
- `src/components/SettingsPanel/SettingsPanel.tsx` : 754
- `src/components/SettingsPanel/SettingsPanel.tsx` : 922
- `src/components/SettingsPanel/SettingsPanel.tsx` : 929
- `src/components/SettingsPanel/SettingsPanel.tsx` : 932
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1079
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1147
- `src/components/TrackPanel/TrackPanel.tsx` : 141
- `src/components/TrackPanel/TrackPanel.tsx` : 153
- `src/components/TrackPanel/TrackPanel.tsx` : 159
- `src/components/TrackPanel/TrackPanel.tsx` : 195
- `src/components/TrackPanel/TrackPanel.tsx` : 207
- `src/components/TrackPanel/TrackPanel.tsx` : 213
- `src/components/TrackPanel/TrackPanel.tsx` : 229
- `src/components/TrackPanel/TrackPanel.tsx` : 234
- `src/components/TrackPanel/TrackPanel.tsx` : 264
- `src/components/TrackPanel/TrackPanel.tsx` : 345
- `src/components/MidiEditor/MidiEditor.tsx` : 167
- `src/components/MidiEditor/MidiEditor.tsx` : 188
- `src/components/MidiEditor/MidiEditor.tsx` : 205
- `src/components/MidiEditor/MidiEditor.tsx` : 219
- `src/components/MidiEditor/MidiEditor.tsx` : 337
- `src/components/MidiEditor/MidiEditor.tsx` : 339
- `src/components/MidiEditor/MidiEditor.tsx` : 356
- `src/components/MidiEditor/MidiEditor.tsx` : 568
- `src/components/MidiEditor/MidiEditor.tsx` : 586
- `src/components/MidiEditor/MidiEditor.tsx` : 594
- `src/components/MidiEditor/MidiEditor.tsx` : 605
- `src/components/MidiEditor/MidiEditor.tsx` : 606
- `src/components/MidiEditor/MidiEditor.tsx` : 620
- `src/components/MidiEditor/MidiEditor.tsx` : 631
- `src/components/MidiEditor/MidiEditor.tsx` : 633

---

## Shorthand Colour Aliases

These four variables alias the text tokens above and are intended for use in JS inline styles.

### --c-default → var(--text-default)
- `src/index.css` : 48 (definition — internal reference)
- `src/index.css` : 185 (`body { color: var(--c-default) }`)

Note: `TopBar.tsx` defines a local `C` object mapping to the raw `var(--text-default)` string directly (line 19) rather than through `--c-default`. No component references `var(--c-default)` directly in src/.

### --c-active → var(--text-active)
- `src/index.css` : 49 (definition — internal reference)

No direct `var(--c-active)` references in src/.

### --c-muted → var(--text-muted)
- `src/index.css` : 50 (definition — internal reference)

No direct `var(--c-muted)` references in src/.

### --c-amber → var(--text-amber)
- `src/index.css` : 51 (definition — internal reference)

No direct `var(--c-amber)` references in src/.

---

## Knob Accent Tones

### --knob-chorus (#2dd4bf)
Teal accent for the chorus knob.

Used in:
- No direct `var(--knob-chorus)` references found in src/.

### --knob-reverb (#a78bfa)
Purple accent for the reverb knob.

Used in:
- No direct `var(--knob-reverb)` references found in src/.

---

## VU Meter Levels

### --meter-green (#7ac040)
Used in:
- No direct `var(--meter-green)` references found in src/.

### --meter-yellow (#c0a020)
Used in:
- No direct `var(--meter-yellow)` references found in src/.

### --meter-orange (#c07a20)
Used in:
- No direct `var(--meter-orange)` references found in src/.

### --meter-red (#c04040)
Used in:
- No direct `var(--meter-red)` references found in src/.

---

## Semantic / Status

### --status-success (#4a9060)
Green — ready/ok states.

Used in:
- `src/components/ChordExplorer.tsx` : 868
- `src/components/ChordExplorer.tsx` : 869
- `src/components/ChordExplorer.tsx` : 870
- `src/components/ScaleExplorer.tsx` : 991
- `src/components/ScaleExplorer.tsx` : 992
- `src/components/ScaleExplorer.tsx` : 993
- `src/components/TrackPanel/TrackPanel.tsx` : 356 (passed as `activeColor` prop to `IBtn`)

### --status-error (#c0392b)
Red — stop/error states.

Used in:
- `src/components/ChordExplorer.tsx` : 868
- `src/components/ChordExplorer.tsx` : 869
- `src/components/ChordExplorer.tsx` : 870
- `src/components/ScaleExplorer.tsx` : 991
- `src/components/ScaleExplorer.tsx` : 992
- `src/components/ScaleExplorer.tsx` : 993
- `src/components/SettingsPanel/SettingsPanel.tsx` : 27
- `src/components/SettingsPanel/SettingsPanel.tsx` : 28
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1032
- `src/components/TrackPanel/TrackPanel.tsx` : 356 (passed as `activeColor` to `IBtn` for Mute button)

### --status-error-hover (#e74c3c)
Lighter red for hover states on error/stop elements.

Used in:
- No direct `var(--status-error-hover)` references found in src/.

---

## Status Banners

Three-part pattern (bg / border / text), for success and error message banners.

### --status-success-bg (#0a200a)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 609
- `src/components/MidiEditor/MidiEditor.tsx` : 614

### --status-success-border (#2a5a2a)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 609
- `src/components/MidiEditor/MidiEditor.tsx` : 614

### --status-success-text (#60c060)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 609
- `src/components/MidiEditor/MidiEditor.tsx` : 614

### --status-error-banner-bg (#200a0a)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 609
- `src/components/MidiEditor/MidiEditor.tsx` : 614

### --status-error-banner-border (#5a2a2a)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 609
- `src/components/MidiEditor/MidiEditor.tsx` : 614

### --status-error-banner-text (#c06060)
Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 609
- `src/components/MidiEditor/MidiEditor.tsx` : 614

---

## Spacing Scale

### --space-1 (0.25rem / 4px)
Used in:
- `src/index.css` : 132 (`.orfeo-row` — internal reference)
- `src/components/LockedChordModal.tsx` : 151
- `src/components/LockedChordModal.tsx` : 166
- `src/components/ChordExplorer.tsx` : 747
- `src/components/ChordExplorer.tsx` : 764 (within key tiles gap)
- `src/components/ScaleExplorer.tsx` : 817
- `src/components/ScaleExplorer.tsx` : 832
- `src/components/ScaleExplorer.tsx` : 868
- `src/components/ScaleExplorer.tsx` : 905
- `src/components/ScaleExplorer.tsx` : 928
- `src/components/ScaleExplorer.tsx` : 1043
- `src/components/Keyboard/Keyboard.tsx` (not found — space-1 not used)
- `src/components/Keyboard/KeyboardControls.tsx` : 261
- `src/components/Keyboard/FloatingKeyboard.tsx` : 136
- `src/components/SettingsPanel/SettingsPanel.tsx` : 398
- `src/components/SettingsPanel/SettingsPanel.tsx` : 776
- `src/components/SettingsPanel/SettingsPanel.tsx` : 783
- `src/components/SettingsPanel/SettingsPanel.tsx` : 792
- `src/components/SettingsPanel/SettingsPanel.tsx` : 800
- `src/components/SettingsPanel/SettingsPanel.tsx` : 826
- `src/components/SettingsPanel/SettingsPanel.tsx` : 836
- `src/components/SettingsPanel/SettingsPanel.tsx` : 847
- `src/components/SettingsPanel/SettingsPanel.tsx` : 857
- `src/components/SettingsPanel/SettingsPanel.tsx` : 867
- `src/components/SettingsPanel/SettingsPanel.tsx` : 893
- `src/components/SettingsPanel/SettingsPanel.tsx` : 903
- `src/components/SettingsPanel/SettingsPanel.tsx` : 976
- `src/components/SettingsPanel/SettingsPanel.tsx` : 985
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1048
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1055
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1064
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1150
- `src/components/TrackPanel/TrackPanel.tsx` : 355
- `src/components/MidiEditor/MidiEditor.tsx` : 185
- `src/components/MidiEditor/MidiEditor.tsx` : 600

### --space-2 (0.5rem / 8px)
Used in:
- `src/index.css` (internal — `.orfeo-row gap: var(--space-3)` — space-2 not used in row)
- `src/components/LockedChordModal.tsx` : 151
- `src/components/ChordExplorer.tsx` : 776
- `src/components/ScaleExplorer.tsx` : 675
- `src/components/ScaleExplorer.tsx` : 811
- `src/components/ScaleExplorer.tsx` : 829
- `src/components/ScaleExplorer.tsx` : 865
- `src/components/Keyboard/Keyboard.tsx` : 259
- `src/components/Keyboard/Keyboard.tsx` : 329
- `src/components/Keyboard/Keyboard.tsx` : 433
- `src/components/Keyboard/KeyboardControls.tsx` : 268
- `src/components/Keyboard/KeyboardControls.tsx` : 434
- `src/components/Keyboard/KeyboardControls.tsx` : 460
- `src/components/SettingsPanel/SettingsPanel.tsx` : 890
- `src/components/SettingsPanel/SettingsPanel.tsx` : 943
- `src/components/TrackPanel/TrackPanel.tsx` : 227
- `src/components/TrackPanel/TrackPanel.tsx` : 329
- `src/components/MidiEditor/MidiEditor.tsx` : 322
- `src/components/MidiEditor/MidiEditor.tsx` : 585
- `src/components/MidiEditor/MidiEditor.tsx` : 618

### --space-3 (0.75rem / 12px)
Used in:
- `src/index.css` : 132 (`.orfeo-row gap: var(--space-3)`)
- `src/index.css` : 147 (`.orfeo-button padding: 0 var(--space-3)`)
- `src/components/VolumeKnob.tsx` : 105
- `src/components/ChordExplorer.tsx` : 663
- `src/components/ChordExplorer.tsx` : 949
- `src/components/ChordExplorer.tsx` : 1058
- `src/components/ScaleExplorer.tsx` : 651
- `src/components/ScaleExplorer.tsx` : 896
- `src/components/ScaleExplorer.tsx` : 1040
- `src/components/Keyboard/Keyboard.tsx` : 259
- `src/components/Keyboard/KeyboardControls.tsx` : 253
- `src/components/Transport/TopBar.tsx` : 152
- `src/components/Transport/TopBar.tsx` : 171
- `src/components/Transport/TopBar.tsx` : 194
- `src/components/Transport/TopBar.tsx` : 283
- `src/components/SettingsPanel/SettingsPanel.tsx` : 751

### --space-4 (1rem / 16px)
Used in:
- `src/index.css` : 131 (`.orfeo-row padding: 0 var(--space-4)`)
- `src/components/Keyboard/KeyboardControls.tsx` : 252
- `src/components/MidiEditor/MidiEditor.tsx` : 535

### --space-5 (1.25rem / 20px)
Used in:
- No direct `var(--space-5)` references found in src/.

### --space-6 (1.5rem / 24px)
Used in:
- No direct `var(--space-6)` references found in src/.

---

## Typography Scale

### --text-xs (0.6875rem / 11px)
Tiny labels, hints.

Used in:
- `src/index.css` : 137 (`.orfeo-label { font-size: var(--text-xs) }`)
- `src/components/EmptyState.tsx` : 70
- `src/components/ChordExplorer.tsx` : 759
- `src/components/Keyboard/Keyboard.tsx` : 377
- `src/components/Keyboard/Keyboard.tsx` : 396
- `src/components/Keyboard/Keyboard.tsx` : 421
- `src/components/Keyboard/KeyboardControls.tsx` : 294
- `src/components/Transport/TopBar.tsx` : 268
- `src/components/LoopRegionStrip.tsx` : 550
- `src/components/SettingsPanel/SettingsPanel.tsx` : 68
- `src/components/SettingsPanel/SettingsPanel.tsx` : 95
- `src/components/SettingsPanel/SettingsPanel.tsx` : 212
- `src/components/SettingsPanel/SettingsPanel.tsx` : 341 (implied by text-xs reference)
- `src/components/SettingsPanel/SettingsPanel.tsx` : 369 (text-xs colour group)
- `src/components/SettingsPanel/SettingsPanel.tsx` : 434
- `src/components/SettingsPanel/SettingsPanel.tsx` : 436
- `src/components/SettingsPanel/SettingsPanel.tsx` : 454
- `src/components/SettingsPanel/SettingsPanel.tsx` : 468
- `src/components/SettingsPanel/SettingsPanel.tsx` : 522
- `src/components/SettingsPanel/SettingsPanel.tsx` : 577
- `src/components/SettingsPanel/SettingsPanel.tsx` : 895
- `src/components/SettingsPanel/SettingsPanel.tsx` : 905
- `src/components/TrackPanel/TrackPanel.tsx` : 230
- `src/components/TrackPanel/TrackPanel.tsx` : 234
- `src/components/TrackPanel/TrackPanel.tsx` : 357
- `src/components/MidiEditor/MidiEditor.tsx` : 539
- `src/components/MidiEditor/MidiEditor.tsx` : 567
- `src/components/MidiEditor/MidiEditor.tsx` : 577

### --text-sm (0.75rem / 12px)
Standard small UI text.

Used in:
- `src/index.css` : 150 (`.orfeo-button { font-size: var(--text-sm) }`)
- `src/components/EmptyState.tsx` : 45
- `src/components/LoopRegionStrip.tsx` : 486
- `src/components/LoopRegionStrip.tsx` : 523
- `src/components/ChordExplorer.tsx` : 981
- `src/components/ChordExplorer.tsx` : 1021
- `src/components/Keyboard/KeyboardControls.tsx` : 272
- `src/components/Transport/TopBar.tsx` : 290
- `src/components/Transport/TopBar.tsx` : 293
- `src/components/ScaleExplorer.tsx` : 930
- `src/components/SettingsPanel/SettingsPanel.tsx` : 565
- `src/components/TrackPanel/TrackPanel.tsx` : 341
- `src/components/TrackPanel/TrackPanel.tsx` : 357 (IBtn internal font)
- `src/components/MidiEditor/MidiEditor.tsx` : 297
- `src/components/MidiEditor/MidiEditor.tsx` : 537
- `src/components/MidiEditor/MidiEditor.tsx` : 619
- `src/components/MidiEditor/MidiEditor.tsx` : 620

### --text-base (0.8125rem / 13px)
Default body/label size.

Used in:
- `src/index.css` : 168 (`.orfeo-value { font-size: var(--text-base) }`)
- `src/components/EmptyState.tsx` : 57
- `src/components/ScaleExplorer.tsx` : 838
- `src/components/ScaleExplorer.tsx` : 874
- `src/components/Transport/TopBar.tsx` : 311
- `src/components/Transport/TopBar.tsx` : 315
- `src/components/SettingsPanel/SettingsPanel.tsx` : 879

### --text-md (0.875rem / 14px)
Slightly emphasised text.

Used in:
- `src/components/Keyboard/Keyboard.tsx` : 286
- `src/components/Keyboard/Keyboard.tsx` : 304
- `src/components/Keyboard/Keyboard.tsx` : 311
- `src/components/Keyboard/Keyboard.tsx` : 404
- `src/components/Keyboard/Keyboard.tsx` : 414

### --text-lg (1rem / 16px)
Headings, chord names.

Used in:
- `src/components/ChordExplorer.tsx` : 737
- `src/components/ChordExplorer.tsx` : 1069
- `src/components/ScaleExplorer.tsx` : 922
- `src/components/ScaleExplorer.tsx` : 1048
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1129

---

## Border Radius Scale

### --radius-sm (3px)
Used in:
- `src/components/LockedChordModal.tsx` : 166
- `src/components/ChordExplorer.tsx` : 627
- `src/components/ChordExplorer.tsx` : 691
- `src/components/Keyboard/FloatingKeyboard.tsx` : 141
- `src/components/Keyboard/FloatingKeyboard.tsx` : 151
- `src/components/SettingsPanel/SettingsPanel.tsx` : 29
- `src/components/MidiEditor/MidiEditor.tsx` : 301
- `src/components/MidiEditor/MidiEditor.tsx` : 310
- `src/components/MidiEditor/MidiEditor.tsx` : 631

### --radius-md (5px)
Used in:
- `src/index.css` : 148 (`.orfeo-button { border-radius: var(--radius-md) }`)
- `src/components/Transport/TopBar.tsx` : 160
- `src/components/Transport/TopBar.tsx` : 410
- `src/components/Transport/TopBar.tsx` : 430
- `src/components/SettingsPanel/SettingsPanel.tsx` : 434
- `src/components/MidiEditor/MidiEditor.tsx` : 619
- `src/components/MidiEditor/MidiEditor.tsx` : 620

### --radius-lg (8px)
Used in:
- `src/components/LockedChordModal.tsx` : 101

---

## Layout — Row and Button Heights

### --row-height (44px)
Standard control row height.

Used in:
- `src/index.css` : 130 (`.orfeo-row { height: var(--row-height) }`)
- `src/components/ChordExplorer.tsx` : 745
- `src/components/ChordExplorer.tsx` : 774
- `src/components/ChordExplorer.tsx` : 822
- `src/components/ChordExplorer.tsx` : 1054
- `src/components/ScaleExplorer.tsx` : 811
- `src/components/ScaleExplorer.tsx` : 895
- `src/components/ScaleExplorer.tsx` : 945
- `src/components/ScaleExplorer.tsx` : 1038
- `src/components/Transport/TopBar.tsx` : 368

### --button-height (28px)
Standard button height.

Used in:
- `src/index.css` : 146 (`.orfeo-button { height: var(--button-height) }`)
- `src/components/Transport/TopBar.tsx` : 160
- `src/components/Transport/TopBar.tsx` : 301
- `src/components/Transport/TopBar.tsx` : 325
- `src/components/Transport/TopBar.tsx` : 348

---

## Interaction States

### --state-hover-bg (#2a2a3a)
Hover background for tiles/pills. Also used as `--state-active-bg` (same value).

Used in:
- `src/components/LockedChordModal.tsx` : 100
- `src/components/ScaleExplorer.tsx` : 638
- `src/components/ScaleExplorer.tsx` : 827
- `src/components/ScaleExplorer.tsx` : 835
- `src/components/ScaleExplorer.tsx` : 863
- `src/components/ScaleExplorer.tsx` : 871
- `src/components/ScaleExplorer.tsx` : 961
- `src/components/ScaleExplorer.tsx` : 1105
- `src/components/ScaleExplorer.tsx` : 1115
- `src/components/ScaleExplorer.tsx` : 1120
- `src/components/ScaleExplorer.tsx` : 1121
- `src/components/MidiEditor/MidiEditor.tsx` : 194
- `src/components/SettingsPanel/SettingsPanel.tsx` : 962
- `src/components/SettingsPanel/SettingsPanel.tsx` : 963 (border colour on hover)

### --state-hover-border (#3a3a4a)
Hover border.

Used in:
- No direct `var(--state-hover-border)` references found in src/.

### --state-active-bg (#2a2a3a)
Active/pressed background. Same value as `--state-hover-bg`.

Used in:
- No direct `var(--state-active-bg)` references found in src/.

### --state-selected-bg (#1f1a0e)
Amber-tinted selected tile background.

Used in:
- No direct `var(--state-selected-bg)` references found in src/.

### --state-disabled (#303048)
Disabled control colour.

Used in:
- `src/components/ScaleExplorer.tsx` : 940
- `src/components/ScaleExplorer.tsx` : 1061
- `src/components/ScaleExplorer.tsx` : 1063
- `src/components/ScaleExplorer.tsx` : 1071
- `src/components/ScaleExplorer.tsx` : 1073
- `src/components/SettingsPanel/SettingsPanel.tsx` : 435
- `src/components/SettingsPanel/SettingsPanel.tsx` : 441
- `src/components/SettingsPanel/SettingsPanel.tsx` : 563
- `src/components/SettingsPanel/SettingsPanel.tsx` : 569
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1128
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1153
- `src/components/TrackPanel/TrackPanel.tsx` : 153
- `src/components/TrackPanel/TrackPanel.tsx` : 159
- `src/components/TrackPanel/TrackPanel.tsx` : 207
- `src/components/TrackPanel/TrackPanel.tsx` : 213

---

## Amber Accents (Alpha Tiers)

### --accent-amber-strong (#e8a02755, ~33%)
Borders, glows, strong emphasis.

Used in:
- `src/components/LoopRegionStrip.tsx` : 548
- `src/components/SettingsPanel/SettingsPanel.tsx` : 92
- `src/components/SettingsPanel/SettingsPanel.tsx` : 341 (implied — component row)
- `src/components/SettingsPanel/SettingsPanel.tsx` : 405
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1145
- `src/components/MidiEditor/MidiEditor.tsx` : 182
- `src/components/MidiEditor/MidiEditor.tsx` : 283
- `src/components/MidiEditor/MidiEditor.tsx` : 315
- `src/components/MidiEditor/MidiEditor.tsx` : 576

### --accent-amber-medium (#e8a02722, ~13%)
Selected/active tinted backgrounds.

Used in:
- `src/components/SettingsPanel/SettingsPanel.tsx` : 93
- `src/components/SettingsPanel/SettingsPanel.tsx` : 406
- `src/components/SettingsPanel/SettingsPanel.tsx` : 1146
- `src/components/MidiEditor/MidiEditor.tsx` : 284
- `src/components/MidiEditor/MidiEditor.tsx` : 576

### --accent-amber-subtle (#e8a02708, ~3%)
Very light hover/open-state tints.

Used in:
- `src/components/MidiEditor/MidiEditor.tsx` : 183
- `src/components/MidiEditor/MidiEditor.tsx` : 223

### --accent-amber-hover (#ffb84d)
Lighter amber for hover states on amber elements.

Used in:
- `src/components/ScaleExplorer.tsx` : 1062
- `src/components/ScaleExplorer.tsx` : 1072

---

## Utility Classes (defined in src/index.css)

The following tokens are referenced within `src/index.css` utility class definitions. They appear in component code via `className` rather than `var()` calls.

### .orfeo-row
Tokens used internally: `var(--row-height)`, `var(--space-4)`, `var(--space-3)`
- `src/index.css` : 127–133 (definition)
- Used as `className="orfeo-row"` — no token references from component code itself

### .orfeo-label
Tokens used internally: `var(--text-xs)`, `var(--text-dimmest)`
- `src/index.css` : 136–142 (definition)

### .orfeo-button
Tokens used internally: `var(--button-height)`, `var(--space-3)`, `var(--radius-md)`, `var(--text-sm)`, `var(--text-standard)`, `var(--text-amber)`
- `src/index.css` : 145–163 (definition)

### .orfeo-value
Tokens used internally: `var(--text-base)`, `var(--text-primary)`
- `src/index.css` : 166–171 (definition)

---

## Unused Tokens

The following tokens are defined in `src/index.css` but have zero direct `var(--token-name)` references in `src/` component or utility files. They may be reserved for future use or used only through the utility class system.

- `--bg-warm` (#12100e) — warm-theme variant; value injected by overriding `--bg` in `.theme-warm`, never referenced directly
- `--panel` (#1e1e1e) — panel layer; mirrored by `--bg-panel`, neither referenced directly in components
- `--panel-warm` (#16120e) — warm panel variant; no references
- `--bg-panel` (#1e1e1e) — alias for `--panel`; no direct references in src/
- `--bg-panel2` (#2d2d2d) — nested surface; no direct references in src/
- `--bg-input` (#58595b) — interactive inputs/pills; no references yet
- `--bg-highlight` (#aeb0b5) — small interactive highlights; no references yet
- `--c-default` (→ `--text-default`) — used only in `body {}` in index.css; no component references
- `--c-active` (→ `--text-active`) — shorthand; no component references
- `--c-muted` (→ `--text-muted`) — shorthand; no component references
- `--c-amber` (→ `--text-amber`) — shorthand; no component references
- `--knob-chorus` (#2dd4bf) — teal knob accent; no references in src/
- `--knob-reverb` (#a78bfa) — purple knob accent; no references in src/
- `--meter-green` (#7ac040) — no references in src/
- `--meter-yellow` (#c0a020) — no references in src/
- `--meter-orange` (#c07a20) — no references in src/
- `--meter-red` (#c04040) — no references in src/
- `--status-error-hover` (#e74c3c) — no references in src/
- `--state-hover-border` (#3a3a4a) — no references in src/
- `--state-active-bg` (#2a2a3a) — same value as `--state-hover-bg`; no direct references
- `--state-selected-bg` (#1f1a0e) — amber-tinted selected; no references in src/
- `--text-body` (#d7d8d3) — no references in src/
- `--text-bright` (#f8f8ff) — no references in src/
- `--text-white` (#fefefa) — no references in src/
- `--space-5` (1.25rem / 20px) — no references in src/
- `--space-6` (1.5rem / 24px) — no references in src/
