import { t } from './i18n'
// ── Foreign Format Import ─────────────────────────────────────────────────
// Converts MusicXML, Guitar Pro, and Capella files to Standard MIDI File
// bytes using alphaTab's importer + midi namespaces only (no renderer, no
// audio engine). Loaded lazily via dynamic import() to keep it out of the
// startup bundle.

import { useStore } from '../store';
import { confirmDialog } from './confirmController';

export type ForeignFormat = 'musicxml' | 'guitarpro' | 'capella';

const FORMAT_LABEL: Record<ForeignFormat, string> = {
  musicxml: 'MusicXML',
  guitarpro: 'Guitar Pro',
  capella: 'Capella',
};

// ── Detect format by file extension ──────────────────────────────────────
export function detectForeignFormat(filePath: string): ForeignFormat | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (['musicxml', 'xml', 'mxl'].includes(ext)) return 'musicxml';
  if (['gp', 'gp3', 'gp4', 'gp5', 'gpx'].includes(ext)) return 'guitarpro';
  if (ext === 'cap') return 'capella';
  return null; // .mid, .midi, .kar — no conversion needed
}

// ── GM program ranges that feed Orfeo's hand-assignment pool (mirrors
// GM_GROUPS.piano/organ in gmInstruments.ts and HAND_ASSIGN_GROUPS in
// keyboardGroups.ts) — kept as plain ranges here since this runs against
// alphaTab's own Score model, before any Orfeo track object exists.
const HAND_ASSIGN_PROGRAM_RANGES: [number, number][] = [
  [0, 7],   // piano
  [16, 23], // organ
];

function isHandAssignProgram(program: number): boolean {
  return HAND_ASSIGN_PROGRAM_RANGES.some(([lo, hi]) => program >= lo && program <= hi);
}

// ── Split a multi-staff keyboard track (piano/organ grand staff) into one
// MIDI track per staff, all staying on the track's one original channel —
// mirrors the convention notation software (MuseScore, Finale, …) uses for
// its own native MIDI export: a piano's grand staff always comes out as two
// separate tracks sharing one channel (one instrument, one channel), never
// merged into a single track. (The MultiTrack format set below this
// function's caller is what lets same-channel tracks actually stay separate
// once written to bytes — see the comment there.)
//
// Without this, alphaTab's MidiFileGenerator keeps every staff of a Track on
// that Track's single shared channel AND in the same track — `playbackInfo`
// (program, channel) and `staves` both live once per Track in alphaTab's
// data model — so a grand-staff piano's treble and bass notes land in one
// indistinguishable stream. Orfeo's hand-assignment engine
// (handAssignment.ts, findStavePairs()) specifically looks for two tracks
// that share one channel (or matching RH/LH names) and trusts them as a
// piano's two staves outright — upper = right hand, lower = left, never
// second-guessed — the same convention every notation software's own MIDI
// export already follows. alphaTab never writes a track-name meta event
// (confirmed: IMidiFileHandler has no such method), so the name-based rules
// can never fire for a converted file — the shared channel is the only
// signal available, which is exactly why it has to survive serialisation.
// Restoring that split here, before generation, lets an imported
// MusicXML/Guitar Pro/Capella file get the same reliable result a native
// MIDI export already gets, instead of falling through to the generic
// per-track dividing-line guess — which has no idea which staff the
// original engraving used and disagrees with real hand crossings and
// cross-staff voicing far too often. Scoped to piano/organ programs only
// (same pool `midiParser.ts` hands to the hand-assignment engine) so an
// unrelated multi-staff instrument (e.g. a harp) isn't restructured for no
// benefit.
function splitMultiStaffKeyboardTracks(score: any, at: any): void {
  const newTracks: any[] = [];
  for (const track of score.tracks) {
    const info = track.playbackInfo;
    if (track.staves.length <= 1 || track.isPercussion || !isHandAssignProgram(info.program)) {
      newTracks.push(track);
      continue;
    }

    for (const staff of track.staves) {
      const nt = new at.model.Track();
      nt.name = track.name;
      nt.shortName = track.shortName;
      nt.color = track.color;
      nt.score = track.score;
      nt.playbackInfo.volume = info.volume;
      nt.playbackInfo.balance = info.balance;
      nt.playbackInfo.port = info.port;
      nt.playbackInfo.program = info.program;
      nt.playbackInfo.bank = info.bank;
      nt.playbackInfo.isMute = info.isMute;
      nt.playbackInfo.isSolo = info.isSolo;
      // Same channel as the original, undivided track — findStavePairs()
      // pairs two keyboard tracks on one shared channel as one instrument's
      // staves; a channel of its own would hide this pair from it entirely.
      nt.playbackInfo.primaryChannel = info.primaryChannel;
      nt.playbackInfo.secondaryChannel = info.secondaryChannel;
      staff.index = 0;
      staff.track = nt;
      nt.staves = [staff];
      newTracks.push(nt);
    }
  }
  newTracks.forEach((t, i) => { t.index = i; });
  score.tracks = newTracks;
}

// ── Guitar Pro piano parts: two tracks, one instrument ───────────────────
// Guitar Pro has no grand staff: a transcriber writes a piano as two tracks
// of its own, one per hand, and names them so ("Piano Melody" / "Piano Bass",
// "piano treble" / "piano bass", "Piano (Melody)" / "Piano (Bass)", or
// "Piano" twice). Two neighbouring keyboard tracks whose names are the same
// once the hand words are taken out are one piano: they get one channel
// (arrangeChannels), so Orfeo reads them as a piano's two staves, the upper
// one the right hand, the way a MIDI export from notation software comes.
const HAND_WORD = /\b(melody|treble|upper|right|r\.?h\.?|bass|lower|left|l\.?h\.?|hand)\b/gi
const pairName = (name: string) => name.replace(HAND_WORD, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase()

// ── Channels the way MIDI has them ───────────────────────────────────────
// alphaTab numbers channels the way Guitar Pro does: two ports of 16 (a
// Guitar Pro 3 file with many tracks goes past 15), a pair per track (one for
// notes, one for bends), drums on 9. A MIDI file only has 16, so channel 20
// came out as 4 and shared the piano's channel with the strings, which then
// played the piano part with a string sound. Here every instrument gets a
// channel of its own (a piano's two staves one between them), drums 9, and
// its bends go on that same channel: a second channel per track made MIDI
// readers split each instrument in two, its name left on the empty half.
function arrangeChannels(score: any, midiFile: any, format: ForeignFormat, at: any): void {
  const tracks: any[] = score.tracks
  if (midiFile.tracks.length !== tracks.length) return
  const isDrums = (i: number) => !!(tracks[i].isPercussion || tracks[i].staves?.[0]?.isPercussion || tracks[i].playbackInfo.primaryChannel === 9)
  const keyboard = (i: number) => !isDrums(i) && isHandAssignProgram(tracks[i].playbackInfo.program) && tracks[i].staves.length === 1
  // instruments: a run of tracks that share a channel already (a split grand
  // staff), or a Guitar Pro piano written as two tracks; every other track alone
  const groups: number[][] = []
  for (let i = 0; i < tracks.length; i++) {
    const g = groups[groups.length - 1]
    const prev = g?.[g.length - 1]
    const split = prev !== undefined && keyboard(prev) && keyboard(i) && tracks[prev].playbackInfo.primaryChannel === tracks[i].playbackInfo.primaryChannel
    const gpPiano = format === 'guitarpro' && prev !== undefined && g.length === 1 && keyboard(prev) && keyboard(i)
      && pairName(tracks[prev].name ?? '') === pairName(tracks[i].name ?? '')
    if (split || gpPiano) g.push(i); else groups.push([i])
  }
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]
  let next = 0
  const take = (): number | null => (next < free.length ? free[next++] : null)
  const channel = new Map<number[], number>()
  for (const g of groups) channel.set(g, isDrums(g[0]) ? 9 : take() ?? free[channel.size % free.length])
  for (const g of groups) for (const i of g) {
    const events: any[] = midiFile.tracks[i].events
    for (const e of events) if (typeof e.channel === 'number') e.channel = channel.get(g)!
    // the instrument first: alphaTab sets volume and pan before it, and a MIDI
    // reader takes the track to be a piano until the instrument comes, so the
    // track split in two at its very start (the name on an empty half)
    const pc = events.findIndex(e => e instanceof at.midi.ProgramChangeEvent && e.tick === 0)
    if (pc > 0) events.unshift(...events.splice(pc, 1))
  }
}

// ── Names and the file's origin, written into the MIDI bytes ─────────────
// alphaTab writes no track names, so a converted file lost every name the
// score had ("Piano Bass", "Vocals", "Strings 1"). Each track chunk gets its
// name back, and the first one a mark of where the file came from
// (ORFEO_SOURCE:guitarpro …), which Orfeo's saves keep and the lesson check
// reads: a piano part from Guitar Pro was written out on a guitar's strings.
export const SOURCE_PREFIX = 'ORFEO_SOURCE:'
function withNamesAndSource(smf: Uint8Array, names: string[], format: ForeignFormat): Uint8Array {
  // one byte a character, as MIDI readers (and Orfeo's own saves) read text;
  // a no-break space is a space, anything past Latin-1 a question mark
  const latin1 = (text: string) => Array.from(text.replace(/ /g, ' '), c => (c.charCodeAt(0) <= 0xff ? c.charCodeAt(0) : 0x3f))
  const meta = (type: number, text: string) => {
    const data = latin1(text)
    const len: number[] = []
    let v = data.length
    len.unshift(v & 0x7f)
    while ((v >>= 7)) len.unshift((v & 0x7f) | 0x80)
    return [0x00, 0xff, type, ...len, ...data]   // at the chunk's start (delta 0)
  }
  const out: number[] = Array.from(smf.subarray(0, 14))
  let p = 14, k = 0
  while (p + 8 <= smf.length) {
    const len = ((smf[p + 4] << 24) | (smf[p + 5] << 16) | (smf[p + 6] << 8) | smf[p + 7]) >>> 0
    const isTrack = smf[p] === 0x4d && smf[p + 1] === 0x54 && smf[p + 2] === 0x72 && smf[p + 3] === 0x6b
    const extra: number[] = []
    if (isTrack) {
      const name = (names[k] ?? '').trim()
      if (name) extra.push(...meta(0x03, name))
      if (k === 0) extra.push(...meta(0x01, `${SOURCE_PREFIX}${format}`))
      k++
    }
    const n = len + extra.length
    out.push(smf[p], smf[p + 1], smf[p + 2], smf[p + 3], (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff, ...extra)
    for (let i = p + 8; i < p + 8 + len; i++) out.push(smf[i])
    p += 8 + len
  }
  return Uint8Array.from(out)
}

// ── Convert foreign bytes → Standard MIDI File ArrayBuffer ───────────────
// Throws a descriptive Error on failure (caller is responsible for the
// user-facing error toast).
export async function convertForeignFileToMidiBuffer(
  bytes: Uint8Array,
  format: ForeignFormat
): Promise<ArrayBuffer> {
  // Dynamic import keeps alphaTab out of the startup bundle.
  const at = await import('@coderline/alphatab');

  const settings = new at.Settings();
  // Disable rendering engine — import-only usage.
  if (settings.core) {
    (settings.core as any).engine = 'none';
  }

  let score: any;
  try {
    score = (at as any).importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  } catch (e: any) {
    throw new Error(
      t`Couldn't read this ${FORMAT_LABEL[format]} file — it may be corrupted or use an unsupported feature. (${e?.message ?? e})`
    );
  }

  splitMultiStaffKeyboardTracks(score, at);

  const midiFile = new (at as any).midi.MidiFile();
  // alphaTab defaults to SMF Type 0 (one physical track, channels
  // multiplexed together) — confirmed by inspecting its generated output
  // directly: with the default format, two tracks sharing one channel (the
  // split above) collapse back into a single indistinguishable stream on
  // write, since a Type 0 file has nowhere to keep them apart. Type 1 keeps
  // every track as its own chunk regardless of shared channels, which is
  // what splitMultiStaffKeyboardTracks()'s split actually needs to survive
  // serialisation — and it's a strictly more faithful read of the score
  // either way (a multi-instrument Guitar Pro/Capella file keeps its real
  // per-instrument tracks instead of being collapsed into one).
  midiFile.format = (at as any).midi.MidiFileFormat.MultiTrack;
  const handler  = new (at as any).midi.AlphaSynthMidiFileHandler(midiFile);
  const gen      = new (at as any).midi.MidiFileGenerator(score, settings, handler);
  gen.generate();

  // ── Filter NoteBendEvent (MIDI 2.0 per-note pitch bend) before serialising ─
  // alphaTab 1.8.4 emits a NoteBendEvent per note (neutral center value) even
  // when there is no actual pitch bend. toBinary() throws for these because
  // they cannot be represented in SMF 1.0. The filter is safe: genuine
  // pitch-bend expression from GP files is encoded as PitchBendEvent (SMF 1.0
  // compatible), not NoteBendEvent.
  for (const track of midiFile.tracks) {
    track.events = track.events.filter(
      (e: any) => !(e instanceof (at as any).midi.NoteBendEvent)
    );
  }

  arrangeChannels(score, midiFile, format, at);

  // Serialise to Standard MIDI File bytes.
  // Confirmed in docs/RESEARCH_alphatab-import.md: correct method is toBinary().
  // toUInt8Array() does NOT exist in alphaTab 1.8.4.
  const bytes_out: Uint8Array = withNamesAndSource((midiFile as any).toBinary(), score.tracks.map((t: any) => t.name ?? ''), format);

  if (!bytes_out || bytes_out.length === 0) {
    throw new Error(
      t`alphaTab produced an empty MIDI output for this ${FORMAT_LABEL[format]} file.`
    );
  }

  // .slice() on a TypedArray buffer can return ArrayBuffer | SharedArrayBuffer;
  // cast to ArrayBuffer — in the renderer context it is always a plain ArrayBuffer.
  return bytes_out.buffer.slice(
    bytes_out.byteOffset,
    bytes_out.byteOffset + bytes_out.byteLength
  ) as ArrayBuffer;
}

// ── Small base64 <-> bytes helpers ───────────────────────────────────────
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    result += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(result);
}

// ── Compute cache path inside the library's Orfeo/ subfolder ─────────────
// Falls back to a sibling path only if no library folder is configured.
export function getCachePath(sourcePath: string, libraryFolder: string | null): string {
  const fileName = sourcePath.replace(/\\/g, '/').split('/').pop()!;
  const lastDot  = fileName.lastIndexOf('.');
  const stem     = lastDot > -1 ? fileName.slice(0, lastDot) : fileName;

  if (libraryFolder) {
    return `${libraryFolder.replace(/\\/g, '/')}/Orfeo/${stem}_ORFEO_IMPORTED.mid`;
  }
  // Fallback: write beside the source (rare — user hasn't configured a library folder).
  const dir = sourcePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
  return `${dir}/${stem}_ORFEO_IMPORTED.mid`;
}

// ── Resolve source file to playable MIDI base64 ───────────────────────────
// Native MIDI/KAR: pass through unchanged, isPendingSave = false.
// Foreign format with valid on-disk cache: load it, isPendingSave = false.
// Foreign format with no cache: convert in memory only, isPendingSave = true.
// Caller is responsible for setting pendingImportedFile in the store when
// isPendingSave is true. This function does NOT write to disk.
export async function resolveToMidiBase64(
  filePath: string,
  originalBase64: string,
  libraryFolder: string | null
): Promise<{ base64: string; resolvedPath: string; isPendingSave: boolean }> {
  const format = detectForeignFormat(filePath);
  if (!format) {
    return { base64: originalBase64, resolvedPath: filePath, isPendingSave: false };
  }

  const cachePath = getCachePath(filePath, libraryFolder);
  // getCachedImport and writeCachedImport are wired in Task 5.
  // Cast via any to avoid type errors in this task.
  const cached = await (window.electronAPI as any).getCachedImport(filePath, cachePath);
  if (cached) {
    return { base64: cached, resolvedPath: cachePath, isPendingSave: false };
  }

  const srcBytes   = base64ToBytes(originalBase64);
  const midiBuf    = await convertForeignFileToMidiBuffer(srcBytes, format);
  const midiBase64 = bytesToBase64(new Uint8Array(midiBuf));

  return { base64: midiBase64, resolvedPath: filePath, isPendingSave: true };
}

// ── Resolve a freshly-loaded file's bytes to playable MIDI, tracking + immediately
// prompting to save any freshly-converted foreign format ("on load", not deferred
// to the next file switch). Every load entry point (Ctrl+O / EmptyState open dialog,
// drag-drop, library click) must route through this single function so the
// save-as-midi prompt behaves identically everywhere. ─────────────────────────────
export async function resolveAndTrackImport(
  filePath: string,
  originalBase64: string,
  fileName: string,
  libraryFolder: string | null,
): Promise<{ base64: string; filePath: string; fileName: string }> {
  const resolved = await resolveToMidiBase64(filePath, originalBase64, libraryFolder);

  if (!resolved.isPendingSave) {
    useStore.getState().setPendingImportedFile(null);
    // resolvedPath is either the original (native MIDI/KAR) or an existing on-disk cache .mid —
    // when it's the cache, the display name must follow it too, or the player keeps showing the
    // foreign source's name (e.g. "song.gp4") forever even though it's really the cached .mid.
    const resolvedName = resolved.resolvedPath === filePath ? fileName : baseName(resolved.resolvedPath);
    return { base64: resolved.base64, filePath: resolved.resolvedPath, fileName: resolvedName };
  }

  useStore.getState().setPendingImportedFile({
    sourcePath: filePath,
    format: detectForeignFormat(filePath)!,
    midiBase64: resolved.base64,
    fileName,
  });

  const cachePath = getCachePath(filePath, libraryFolder);
  const choice = await confirmDialog({
    message: t`Save "${fileName}" as a MIDI file?`,
    detail: t`This saves a copy at:\n${cachePath}\n\nThe original ${fileName} is never modified. You can save it later too — via the Library refresh icon.`,
    buttons: [t`Save as MID`, t`Don't Save`],
  });
  if (choice === 0) {
    await (window.electronAPI as any).writeCachedImport(cachePath, resolved.base64);
    useStore.getState().setPendingImportedFile(null);
    useStore.getState().notifyLibrarySaved(cachePath);
    // Saved to disk — track the real .mid cache path and name from here on, not the foreign source.
    return { base64: resolved.base64, filePath: cachePath, fileName: baseName(cachePath) };
  }

  // "Don't Save" — still only in memory, _filePath stays the foreign source
  // (pendingImportedFile stays set; confirmPendingImportBeforeEdit patches it later).
  return { base64: resolved.base64, filePath, fileName };
}

function baseName(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

// ── Prompt to save pending imported file before switching to another file ─
// Returns true if the caller should proceed with the load, false if the
// user hit Cancel (abort the switch entirely).
export async function confirmPendingImportBeforeSwitch(
  newFilePath: string
): Promise<boolean> {
  const { pendingImportedFile, setPendingImportedFile } = useStore.getState();
  const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null;

  if (!pendingImportedFile) return true;
  if (pendingImportedFile.sourcePath === newFilePath) return true; // same-file reload — no prompt

  const cachePath = getCachePath(pendingImportedFile.sourcePath, libraryFolder);

  const choice = await confirmDialog({
    message: t`Save imported file "${pendingImportedFile.fileName}" as a MIDI file?`,
    detail: t`This saves a copy at:\n${cachePath}\n\nThe original ${pendingImportedFile.fileName} is never modified.`,
    buttons: [t`Save as MID`, t`Don't Save`, t`Cancel`],
  });

  if (choice === 2) return false; // Cancel

  if (choice === 0) {
    // Save as MID — write cache to disk via IPC
    await (window.electronAPI as any).writeCachedImport(cachePath, pendingImportedFile.midiBase64);
    useStore.getState().notifyLibrarySaved(cachePath);
  }
  // Don't Save (choice === 1) — discard, fall through

  setPendingImportedFile(null);
  return true;
}

// ── Gate before opening any Orfeo editing tool (MIDI Playback Editor, Note
// Editor) on the currently loaded file — editing an imported foreign-format
// file that only exists in memory has nowhere real to save its _ORFEO_v1,
// so it must be written to disk as an actual .mid first. Unlike
// confirmPendingImportBeforeSwitch, "Don't Save" isn't offered here — there's
// no sensible "edit but don't save the base file" option. Returns true (and
// patches the store's midi._filePath to the new on-disk cache path, so save
// operations compute their suffix from a real .mid name) if the caller
// should proceed, false if the user cancelled. ─────────────────────────────
export async function confirmPendingImportBeforeEdit(): Promise<boolean> {
  const { pendingImportedFile, setPendingImportedFile, midi } = useStore.getState();
  if (!pendingImportedFile) return true;

  const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null;
  const cachePath = getCachePath(pendingImportedFile.sourcePath, libraryFolder);

  const choice = await confirmDialog({
    message: t`Save "${pendingImportedFile.fileName}" as a MIDI file before editing?`,
    detail: t`Orfeo's editing tools only work on real .mid files. This saves a copy at:\n${cachePath}\n\nThe original ${pendingImportedFile.fileName} is never modified.`,
    buttons: [t`Save as MID`, t`Cancel`],
  });

  if (choice !== 0) return false; // Cancel

  await (window.electronAPI as any).writeCachedImport(cachePath, pendingImportedFile.midiBase64);
  setPendingImportedFile(null);
  useStore.getState().notifyLibrarySaved(cachePath);
  if (midi) useStore.setState({ midi: { ...(midi as any), _filePath: cachePath, fileName: baseName(cachePath) } as any });
  return true;
}
