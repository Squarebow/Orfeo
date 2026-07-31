import type { Hand, ParsedTrack } from '../types'

// ── Hand-tag persistence: internal sidecar + portable export hint ────────────
//
// Two separate mechanisms, not one:
//
// 1. Internal sidecar — `hand`/`handConfidence` live directly on ParsedNote
//    (see types/index.ts). That's the authoritative source of truth for as
//    long as the file stays open in Orfeo. Nothing in this module touches it
//    beyond restoring it from a hint on load.
//
// 2. Portable export hint — for when a file leaves Orfeo. Plain SMF has no
//    clef meta-event (clef is a notation concept; MIDI has no slot for it),
//    so there is no "real" way to write hand/clef into a standard MIDI file.
//    What follows are two breadcrumbs any other tool safely ignores:
//
//    a. Track name suffix " (RH)" / " (LH)" — for a track that is
//       homogeneously one hand (the "split into two tracks" output). Matches
//       the convention notation software already uses.
//    b. `ORFEO_HAND_MAP:<trackIndex>:<RLE>` type-0x01 text meta-event, ticks
//       0 — for a track that mixes both hands note-by-note (the "keep one
//       track, hand-colored" output). Same convention as the existing
//       `ORFEO_TRACK_NAME:N:name` hint in electron/main.ts — a harmless
//       header text event other DAWs skip, that Orfeo recognises on reimport.
//
// IMPORTANT: neither of these is real MIDI clef data per spec, and must never
// be called "clef metadata" in UI copy or docs. Clef and hand aren't perfectly
// equivalent either (cross-staff notation exists in real scores) — treating
// clef ≈ f(hand) here is a deliberate, acknowledged simplification for
// Orfeo's purposes, not a claim of notational accuracy.
//
// Confidence is never exported: it's a re-derivable diagnostic about how
// forced the engine's decision was, not authoritative once a human has
// accepted a split, and standard MIDI has no honest slot for it anyway.

// ── Track-name hint (whole-track hand) ────────────────────────────────────────
const HAND_SUFFIX: Record<Hand, string> = { L: ' (LH)', R: ' (RH)' }
const HAND_SUFFIX_RE = /\s*\((LH|RH)\)\s*$/i

export function stripHandSuffix(name: string): string {
  return name.replace(HAND_SUFFIX_RE, '')
}

export function nameHandFromSuffix(name: string): Hand | null {
  const m = name.match(HAND_SUFFIX_RE)
  if (!m) return null
  return m[1].toUpperCase() === 'LH' ? 'L' : 'R'
}

export function withHandSuffix(baseName: string, hand: Hand): string {
  return `${stripHandSuffix(baseName)}${HAND_SUFFIX[hand]}`
}

// ── Run-length encoding for a mixed-hand track's per-note hand sequence ──────
// Order must match the track's note order as parseMidiBuffer() emits it
// (file/tick order) on both the encode and decode side, or the map is
// meaningless — restoreHandTagsFromHints() guards this with a length check.
export function encodeHandRLE(hands: Hand[]): string {
  if (hands.length === 0) return ''
  let out = ''
  let run = 1
  for (let i = 1; i <= hands.length; i++) {
    if (i < hands.length && hands[i] === hands[i - 1]) { run++; continue }
    out += `${hands[i - 1]}${run}`
    run = 1
  }
  return out
}

export function decodeHandRLE(rle: string): Hand[] {
  const hands: Hand[] = []
  const re = /([LR])(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rle))) {
    const hand = m[1] as Hand
    const count = parseInt(m[2], 10)
    for (let i = 0; i < count; i++) hands.push(hand)
  }
  return hands
}

const HAND_MAP_PREFIX = 'ORFEO_HAND_MAP:'

// Bump whenever handAssignment.ts's cost function changes meaningfully. A
// hint written by an older (or version-less, pre-this-field) engine gets
// treated as absent on reimport and recomputed fresh — otherwise a file
// saved before an algorithm fix would carry the old, wrong tags forever,
// since the whole point of the hint is to *skip* recomputing. Cheap to
// recompute (same single track, no merge), so there's no reason not to.
export const HAND_ENGINE_VERSION = 1

export interface TextMeta {
  type: 'text'
  text: string
  ticks: number
}

export function encodeHandMapMeta(trackIndex: number, hands: Hand[]): TextMeta {
  return { type: 'text', text: `${HAND_MAP_PREFIX}${HAND_ENGINE_VERSION}:${trackIndex}:${encodeHandRLE(hands)}`, ticks: 0 }
}

export function parseHandMapMeta(text: string): { trackIndex: number; hands: Hand[] } | null {
  if (!text.startsWith(HAND_MAP_PREFIX)) return null
  const rest = text.slice(HAND_MAP_PREFIX.length)
  const parts = rest.split(':')
  if (parts.length !== 3) return null // no version field → pre-versioning hint, treat as stale
  const [versionStr, trackIndexStr, rle] = parts
  if (parseInt(versionStr, 10) !== HAND_ENGINE_VERSION) return null
  const trackIndex = parseInt(trackIndexStr, 10)
  if (isNaN(trackIndex)) return null
  return { trackIndex, hands: decodeHandRLE(rle) }
}

// ── Export: decide which hint a track needs from its notes' hand tags ───────
// Homogeneous track (every note the same hand, e.g. split-into-two-tracks
// output) → cheap, human-readable name suffix, no meta-event needed at all.
// Mixed track (hand-colored, single-track output) → RLE text meta.
// Untagged track (no note carries `hand`) → no hint, nothing to restore later.
export function buildHandExportHint(
  trackIndex: number,
  trackName: string,
  notes: { hand?: Hand }[],
): { name: string; meta: TextMeta | null } {
  const hands = notes.map(n => n.hand).filter((h): h is Hand => h !== undefined)
  if (hands.length === 0) return { name: trackName, meta: null }

  const allSame = hands.every(h => h === hands[0])
  if (allSame && hands.length === notes.length) {
    return { name: withHandSuffix(trackName, hands[0]), meta: null }
  }
  return { name: trackName, meta: encodeHandMapMeta(trackIndex, hands) }
}

// ── Reimport: restore sidecar tags from whichever hint is present ───────────
// Mutates ParsedTrack.notes in place. Returns true if at least one track was
// restored from a hint (meaning Stage 3's assignment call can be skipped for
// that track entirely — no re-run of the algorithm needed).
//
// A hint that doesn't line up with the file's actual current notes (RLE
// length mismatch — the file was edited by another tool since export) is
// treated as stale and silently skipped for that track: falls through to
// running assignHands() fresh, same as a file with no hint at all.
export function restoreHandTagsFromHints(
  tracks: ParsedTrack[],
  headerMeta: { text?: string }[],
): boolean {
  let restoredAny = false

  for (const track of tracks) {
    const hand = nameHandFromSuffix(track.name)
    if (!hand) continue
    for (const note of track.notes) { note.hand = hand; note.handConfidence = 1 }
    restoredAny = true
  }

  for (const meta of headerMeta) {
    if (typeof meta.text !== 'string') continue
    const parsed = parseHandMapMeta(meta.text)
    if (!parsed) continue
    const track = tracks.find(t => t.index === parsed.trackIndex)
    if (!track || parsed.hands.length !== track.notes.length) continue
    track.notes.forEach((note, i) => { note.hand = parsed.hands[i]; note.handConfidence = 1 })
    restoredAny = true
  }

  return restoredAny
}
