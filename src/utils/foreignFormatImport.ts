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
      `Couldn't read this ${FORMAT_LABEL[format]} file — it may be corrupted or use an unsupported feature. (${e?.message ?? e})`
    );
  }

  const midiFile = new (at as any).midi.MidiFile();
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

  // Serialise to Standard MIDI File bytes.
  // Confirmed in docs/RESEARCH_alphatab-import.md: correct method is toBinary().
  // toUInt8Array() does NOT exist in alphaTab 1.8.4.
  const bytes_out: Uint8Array = (midiFile as any).toBinary();

  if (!bytes_out || bytes_out.length === 0) {
    throw new Error(
      `alphaTab produced an empty MIDI output for this ${FORMAT_LABEL[format]} file.`
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
    message: `Save "${fileName}" as a MIDI file?`,
    detail: `This saves a copy at:\n${cachePath}\n\nThe original ${fileName} is never modified. You can save it later too — via the Library refresh icon.`,
    buttons: ['Save as MID', "Don't Save"],
  });
  if (choice === 0) {
    await (window.electronAPI as any).writeCachedImport(cachePath, resolved.base64);
    useStore.getState().setPendingImportedFile(null);
    useStore.getState().setLibraryNeedsRefresh(true);
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
    message: `Save imported file "${pendingImportedFile.fileName}" as a MIDI file?`,
    detail: `This saves a copy at:\n${cachePath}\n\nThe original ${pendingImportedFile.fileName} is never modified.`,
    buttons: ['Save as MID', "Don't Save", 'Cancel'],
  });

  if (choice === 2) return false; // Cancel

  if (choice === 0) {
    // Save as MID — write cache to disk via IPC
    await (window.electronAPI as any).writeCachedImport(cachePath, pendingImportedFile.midiBase64);
    useStore.getState().setLibraryNeedsRefresh(true);
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
    message: `Save "${pendingImportedFile.fileName}" as a MIDI file before editing?`,
    detail: `Orfeo's editing tools only work on real .mid files. This saves a copy at:\n${cachePath}\n\nThe original ${pendingImportedFile.fileName} is never modified.`,
    buttons: ['Save as MID', 'Cancel'],
  });

  if (choice !== 0) return false; // Cancel

  await (window.electronAPI as any).writeCachedImport(cachePath, pendingImportedFile.midiBase64);
  setPendingImportedFile(null);
  useStore.getState().setLibraryNeedsRefresh(true);
  if (midi) useStore.setState({ midi: { ...(midi as any), _filePath: cachePath, fileName: baseName(cachePath) } as any });
  return true;
}
