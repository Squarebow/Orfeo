import { t } from '../utils/i18n'

// ── Exports (after 2.0): one way out for everything Orfeo can save ───────────
// Every export is a format (what it is, its file ending, ready yet or not) and
// a job (a name, and how to build the file's contents). runExport() asks where
// to save it, starting in the Library's Exports folder with a free name, and
// writes it. A new export adds a format here and builds its contents; the
// naming, the folder and the dialog stay in one place.
//
// Exports to audio of a whole song (Export to audio, 1.6) keeps its own path
// for now: it renders in the background and saves without a dialog.

export type ExportId = 'take-midi' | 'numbers-csv' | 'session-wav' | 'session-mp3' | 'numbers-pdf' | 'score-musicxml' | 'score-pdf'

export interface ExportFormat {
  id: ExportId
  name: string               // in the dialog's file type list
  ext: string
  ready: boolean             // false: planned, not built yet
}

export const EXPORT_FORMATS: Record<ExportId, ExportFormat> = {
  'take-midi':      { id: 'take-midi', name: t`MIDI file`, ext: 'mid', ready: true },
  'numbers-csv':    { id: 'numbers-csv', name: t`Spreadsheet (CSV)`, ext: 'csv', ready: true },
  'session-wav':    { id: 'session-wav', name: t`WAV audio`, ext: 'wav', ready: false },
  'session-mp3':    { id: 'session-mp3', name: t`MP3 audio`, ext: 'mp3', ready: false },
  'numbers-pdf':    { id: 'numbers-pdf', name: t`PDF`, ext: 'pdf', ready: false },
  'score-musicxml': { id: 'score-musicxml', name: t`MusicXML score`, ext: 'musicxml', ready: false },
  'score-pdf':      { id: 'score-pdf', name: t`PDF score`, ext: 'pdf', ready: false },
}

export interface ExportJob {
  format: ExportId
  baseName: string           // e.g. the song's name; the ending is added here
  build: () => Uint8Array | string | Promise<Uint8Array | string>
}

// Characters a file name can't carry on Windows (and control characters);
// main checks again, this keeps the name in the dialog tidy
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g

/** The file's name: the base name made safe, with the format's ending once */
export function exportFileName(baseName: string, format: ExportId): string {
  const { ext } = EXPORT_FORMATS[format]
  const base = baseName.replace(ILLEGAL, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
    .replace(new RegExp(`\\.${ext}$`, 'i'), '') || t`Orfeo export`
  return `${base}.${ext}`
}

/** A take's name: the song (or "Recording") and when it began, sortable */
export function takeBaseName(song: string | null, startedAt: number): string {
  const d = new Date(startedAt)
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`
  return `${song ? song.replace(/\.(mid|midi)$/i, '') : t`Recording`} ${stamp}`
}

/** Build and save; the path it was saved to, or null if you cancelled */
export async function runExport(job: ExportJob, libraryFolder: string | null): Promise<string | null> {
  const f = EXPORT_FORMATS[job.format]
  if (!f.ready) throw new Error(`export ${f.id} isn't built yet`)
  const data = await job.build()
  return window.electronAPI.exportSaveAs({ fileName: exportFileName(job.baseName, job.format), filterName: f.name, ext: f.ext, libraryFolder, data })
}
