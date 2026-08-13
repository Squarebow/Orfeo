import { Midi } from '@tonejs/midi'
import type { ParsedMidi, ParsedTrack, ParsedNote } from '../types'
import { getGMName, getGMGroup } from './gmInstruments'
import { restoreHandTagsFromHints } from './handMetadata'
import { assignHands } from './handAssignment'
import { useStore } from '../store'
import { HAND_ASSIGN_GROUPS } from './keyboardGroups'
import { SEMITONE_TO_KEY_NAME } from './keyDetection'
import { TRACK_COLOR_PALETTE, pianoFamilyColor } from './colors'

export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string, filePath = ''): ParsedMidi {
  // FUTURE: KAR lyric events (meta type 0x05 = lyrics, 0x01 = text) could
  // be extracted here for a karaoke display overlay. Not in scope currently.
  // @tonejs/midi v2.x handles these silently via the underlying midi-file parser.
  const midi = new Midi(buffer)

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
  // Full tempo map: [{bpm, time}] sorted by time — for tempo-change support
  const tempoMap = midi.header.tempos
    .map((t: any) => ({ bpm: t.bpm, time: t.time ?? 0 }))
    .sort((a: any, b: any) => a.time - b.time)
  const timeSig = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures[0].timeSignature
    : [4, 4]

  // Extract key signature from MIDI metadata. ORFEO_KEY (see
  // electron/main.ts's tempoKey:save) takes priority over the native
  // key-signature meta event — verified directly that @tonejs/midi's own
  // encoder silently drops that value on any re-save regardless of what's
  // written into it (a pure library bug, unrelated to transpose math), so
  // any file Orfeo has saved through the tempo/key feature needs its own
  // reliable custom meta instead, same pattern as ORFEO_TRACK_NAME/COLOR.
  let keySignature: { key: number | string; scale: string } | null = null
  try {
    for (const meta of (midi.header as any).meta ?? []) {
      if (typeof meta.text !== 'string' || !meta.text.startsWith('ORFEO_KEY:')) continue
      const rest = meta.text.slice('ORFEO_KEY:'.length)
      const [semitoneStr, scale] = rest.split(':')
      const semitone = parseInt(semitoneStr, 10)
      if (!isNaN(semitone) && SEMITONE_TO_KEY_NAME[semitone]) {
        keySignature = { key: SEMITONE_TO_KEY_NAME[semitone], scale: scale === 'minor' ? 'minor' : 'major' }
      }
      break
    }
    if (!keySignature) {
      const ks = (midi.header as any).keySignatures
      if (ks && ks.length > 0) {
        keySignature = { key: ks[0].key ?? 0, scale: ks[0].scale ?? 'major' }
      }
    }
  } catch {}

  const tracks: ParsedTrack[] = []
  let pianoFamilyIndex = 0

  midi.tracks.forEach((track, i) => {
    if (track.notes.length === 0) return
    const isDrum = track.channel === 9
    const program = isDrum ? -1 : (track.instrument?.number ?? 0)
    const gmName = isDrum ? 'Standard Drum Kit' : getGMName(program)
    const group = getGMGroup(program, isDrum)
    // HAND_ASSIGN_GROUPS (piano+organ), not the broader KEYBOARD_GROUPS —
    // a chromatic-percussion track (vibraphone etc, see keyboardGroups.ts)
    // consuming a piano-family slot here shifted the REAL piano track into
    // PIANO_FAMILY_COLORS[1] (#CB636C), which is the exact literal hex
    // behind --hand-rh. That track's own default color then looked
    // identical to "all notes assigned right hand" any time hand-tag data
    // was momentarily absent (e.g. Note Editor open, before its Hand
    // toggle is on) — not a coloring bug at all, just an unlucky palette
    // collision caused by miscounting a mallet instrument as piano-family.
    const color = HAND_ASSIGN_GROUPS.has(group)
      ? pianoFamilyColor(pianoFamilyIndex++)
      : TRACK_COLOR_PALETTE[tracks.length % TRACK_COLOR_PALETTE.length]

    const notes: ParsedNote[] = track.notes.map(n => ({
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      velocity: n.velocity,
      trackIndex: tracks.length,
    }))

    // ── Extract first-occurrence CC values for mixer initialization ───────────
    // @tonejs/midi normalizes CC values to 0–1. CC10 pan: 0.5 = center.
    const parseCC = (n: number): number | undefined => {
      const ccs = (track as any).controlChanges
      if (!ccs) return undefined
      const arr = ccs[n]
      return Array.isArray(arr) && arr.length > 0 ? arr[0].value : undefined
    }

    const parsedTrack: any = {
      index: tracks.length,
      name: track.name || gmName,
      gmName,
      program,
      group,
      isDrum,
      color,
      notes,
      channel: track.channel ?? i,
      _cc7:  parseCC(7),
      _cc10: parseCC(10),
      _cc91: parseCC(91),
      _cc93: parseCC(93),
    }

    tracks.push(parsedTrack)
  })

  let duration = midi.duration
  if (duration <= 0) {
    for (const t of tracks) {
      for (const n of t.notes) {
        const end = n.time + n.duration
        if (end > duration) duration = end
      }
    }
  }

  // ── Precompute bar start times using full tempo map ─────────────────────────
  // Single source of truth consumed by PianoRoll and TopBar via the store.
  const barStarts: number[] = []
  {
    const beatsPerBar = timeSig[0]
    const effectiveTempoMap = tempoMap.length > 0 ? tempoMap : [{ bpm, time: 0 }]
    let bt = 0, bti = 0
    while (bt <= duration + 0.5) {
      barStarts.push(bt)
      while (bti + 1 < effectiveTempoMap.length && effectiveTempoMap[bti + 1].time <= bt) bti++
      bt += (60 / effectiveTempoMap[bti].bpm) * beatsPerBar
    }
  }

  // ── Restore Orfeo custom track names from header text meta-events ────────────
  // Format: ORFEO_TRACK_NAME:N:name — type-0x01 text events injected by editor:save.
  // Only present in files previously saved through Orfeo; ignored for all other files.
  const orfeoTrackNames: Record<number, string> = {}
  for (const meta of (midi.header as any).meta ?? []) {
    if (typeof meta.text === 'string' && meta.text.startsWith('ORFEO_TRACK_NAME:')) {
      const rest = meta.text.slice('ORFEO_TRACK_NAME:'.length)
      const colonIdx = rest.indexOf(':')
      if (colonIdx >= 0) {
        const idx = parseInt(rest.slice(0, colonIdx), 10)
        const name = rest.slice(colonIdx + 1)
        if (!isNaN(idx) && name) orfeoTrackNames[idx] = name
      }
    }
  }

  // ── Restore Orfeo custom track colors from header text meta-events ──────────
  // Format: ORFEO_TRACK_COLOR:N:#hexcolor — same convention as ORFEO_TRACK_NAME.
  // Without this, a color picked in the color popover only ever lived in the
  // Zustand store — any save+reload silently discarded it back to the
  // palette default, since nothing wrote it into the file at all.
  const orfeoTrackColors: Record<number, string> = {}
  for (const meta of (midi.header as any).meta ?? []) {
    if (typeof meta.text === 'string' && meta.text.startsWith('ORFEO_TRACK_COLOR:')) {
      const rest = meta.text.slice('ORFEO_TRACK_COLOR:'.length)
      const colonIdx = rest.indexOf(':')
      if (colonIdx >= 0) {
        const idx = parseInt(rest.slice(0, colonIdx), 10)
        const color = rest.slice(colonIdx + 1)
        if (!isNaN(idx) && /^#[0-9a-fA-F]{6}$/.test(color)) orfeoTrackColors[idx] = color
      }
    }
  }

  // ── Restore Orfeo persisted roll-visibility / keyboard-lit flags ────────────
  // Format: ORFEO_TRACK_VISIBLE:N:0/1 and ORFEO_TRACK_KEYBOARD:N:0/1 — same
  // convention as ORFEO_TRACK_NAME/COLOR. Only the Playback Editor's Save
  // writes these; the TrackPanel's per-track icons are session-only and never
  // touch the file (see MidiEditor.tsx / electron/main.ts editor:save).
  const orfeoTrackVisible: Record<number, boolean> = {}
  const orfeoTrackKeyboard: Record<number, boolean> = {}
  for (const meta of (midi.header as any).meta ?? []) {
    if (typeof meta.text !== 'string') continue
    for (const [prefix, target] of [
      ['ORFEO_TRACK_VISIBLE:', orfeoTrackVisible],
      ['ORFEO_TRACK_KEYBOARD:', orfeoTrackKeyboard],
    ] as const) {
      if (!meta.text.startsWith(prefix)) continue
      const rest = meta.text.slice(prefix.length)
      const colonIdx = rest.indexOf(':')
      if (colonIdx < 0) continue
      const idx = parseInt(rest.slice(0, colonIdx), 10)
      const flag = rest.slice(colonIdx + 1)
      if (!isNaN(idx) && (flag === '0' || flag === '1')) target[idx] = flag === '1'
    }
  }

  // ── Restore hand tags from an Orfeo export hint, if this file has one ───────
  // Track-name " RH"/" LH" suffix or ORFEO_HAND_MAP text meta — see
  // utils/handMetadata.ts. Neither is real MIDI clef data, just a breadcrumb.
  // When this returns false, no hint was found (or it was stale) and the
  // assignment engine still needs to run — that happens where the split/
  // color/merge UI actually calls it, not here in the parser.
  const handTagsRestored = restoreHandTagsFromHints(tracks, (midi.header as any).meta ?? [])

  // ── Tag whatever a hint didn't already cover — same engine as split/merge ──
  // Every keyboard-group track's notes end up carrying a `hand` tag by the
  // time this function returns, either restored above or freshly computed
  // here. This is what lets the keyboard's L/R indicator just read the tag
  // instead of inferring it live every frame (see handBoundaries.ts).
  const kbNotesNeedingAssignment = tracks
    .filter(t => HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum)
    // group stamped per-note (mutates in place, keeps identity) so
    // tryFastPath() can tell "two halves of one split piano" apart from
    // "a piano track and an unrelated organ track" — see handAssignment.ts.
    .flatMap(t => t.notes.map(n => Object.assign(n, { group: t.group })))
    .filter(n => n.hand === undefined)
  if (kbNotesNeedingAssignment.length > 0) {
    const { rhMaxFingers, lhMaxFingers } = useStore.getState()
    const { assignments } = assignHands(kbNotesNeedingAssignment, { rhMaxFingers, lhMaxFingers })
    for (const a of assignments) { a.note.hand = a.hand; a.note.handConfidence = a.confidence }
  }

  const result: any = {
    fileName,
    duration,
    bpm,
    timeSignatureNumerator: timeSig[0],
    timeSignatureDenominator: timeSig[1],
    tracks,
    noteCount: tracks.reduce((sum, t) => sum + t.notes.length, 0),
    _raw: buffer,
    _keySignature: keySignature,
    _filePath: filePath,
    _rawMidiTracks: midi.tracks,
    _tempoMap: tempoMap,
    _barStarts: barStarts,
    _orfeoTrackNames: Object.keys(orfeoTrackNames).length > 0 ? orfeoTrackNames : undefined,
    _orfeoTrackColors: Object.keys(orfeoTrackColors).length > 0 ? orfeoTrackColors : undefined,
    _orfeoTrackVisible: Object.keys(orfeoTrackVisible).length > 0 ? orfeoTrackVisible : undefined,
    _orfeoTrackKeyboard: Object.keys(orfeoTrackKeyboard).length > 0 ? orfeoTrackKeyboard : undefined,
    _handTagsRestored: handTagsRestored,
  }

  return result
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function midiToKeyIndex(midi: number): number {
  return midi - 21
}

export function isBlackKey(midi: number): boolean {
  const note = midi % 12
  return [1, 3, 6, 8, 10].includes(note)
}