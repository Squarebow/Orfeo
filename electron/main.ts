import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, basename, dirname, extname } from 'path'
import { readFileSync, writeFileSync, existsSync, readdirSync, createWriteStream } from 'fs'
import { mkdir, access, copyFile, readdir, writeFile } from 'fs/promises'
import { Midi } from '@tonejs/midi'
import { Chord, Note } from 'tonal'
import PDFDocument from 'pdfkit'

// ── Module-level window reference — needed by the close handler and IPC send ──────
let mainWin: BrowserWindow | null = null

// ── Copy bundled demo MIDI files into the user's library on first launch ─────────
// Writes a flag file to userData so this runs exactly once.
// Target: libraryFolder/Demo/ if a library is configured, otherwise userData/Demo/.
// Individual files are skipped if they already exist — no user file is overwritten.
async function ensureDemoFolder(): Promise<void> {
  const flagPath  = join(app.getPath('userData'), '.demo-installed')
  const installed = await access(flagPath).then(() => true).catch(() => false)
  if (installed) return

  const prefs   = loadPrefs()
  const libRoot = prefs.libraryFolder || app.getPath('userData')
  const targetDir = join(libRoot, 'Demo')
  await mkdir(targetDir, { recursive: true })

  // ── Source path: extraResources lands at resources/demo/ in production ───
  const srcDir = app.isPackaged
    ? join(process.resourcesPath, 'demo')
    : join(app.getAppPath(), 'public', 'demo')

  const files = await readdir(srcDir)
  for (const file of files) {
    if (!/\.(mid|midi)$/i.test(file)) continue
    const dest   = join(targetDir, file)
    const exists = await access(dest).then(() => true).catch(() => false)
    if (!exists) await copyFile(join(srcDir, file), dest)
  }

  await writeFile(flagPath, 'true')
}

// ── Resolve (and auto-create) the Orfeo output subfolder for a given source file ──
// If the source is already inside an Orfeo/ subfolder, step up to its parent so
// output always lands in a single Orfeo/ level — never Orfeo/Orfeo/.
async function getOrfeoOutputDir(sourceFilePath: string): Promise<string> {
  const sourceDir = dirname(sourceFilePath)
  const baseDir   = basename(sourceDir).toLowerCase() === 'orfeo' ? dirname(sourceDir) : sourceDir
  const orfeoDir  = join(baseDir, 'Orfeo')
  await mkdir(orfeoDir, { recursive: true })
  return orfeoDir
}

// ── Main window ────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#111116',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#111116', symbolColor: '#e8a027', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
  })
  mainWin = win
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // ── Show maximized once renderer is ready — avoids white flash on launch ───
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  // ── Intercept close to prompt for unsaved note editor edits ────────────────
  win.on('close', async (e) => {
    const dirty = await win.webContents.executeJavaScript('window.__orfeoNoteEditorDirty?.() ?? false').catch(() => false)
    if (!dirty) return
    e.preventDefault()
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0, cancelId: 2,
      message: 'Save unsaved note edits?',
      detail: 'Your note edits will be lost if you close without saving.',
    })
    if (response === 2) return          // Cancel — keep window open
    if (response === 1) { win.destroy(); return }  // Discard
    // Save — tell renderer to run its save flow, then call app:confirm-close when done
    win.webContents.send('app:save-before-close')
  })
}

// ── Prefs ──────────────────────────────────────────────────────────────────
function getPrefsPath() { return join(app.getPath('userData'), 'orfeo-prefs.json') }
function loadPrefs(): Record<string, any> {
  try { const p = getPrefsPath(); if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) } catch {}
  return {}
}
function savePrefs(data: Record<string, any>) {
  try { writeFileSync(getPrefsPath(), JSON.stringify({ ...loadPrefs(), ...data }, null, 2)) } catch {}
}
ipcMain.handle('prefs:get', async () => loadPrefs())
ipcMain.handle('prefs:set', async (_e, data) => savePrefs(data))
// ── Returns path to userData/Demo/ if demo files were installed, else null ───
ipcMain.handle('app:getDemoFolder', async () => {
  const demoPath = join(app.getPath('userData'), 'Demo')
  return existsSync(demoPath) ? demoPath : null
})

// ── Open MIDI file ─────────────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
ipcMain.handle('dialog:openMidi', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open MIDI File',
    filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const filePath = result.filePaths[0]
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  return { fileName, filePath, base64: readFileSync(filePath).toString('base64') }
})

// ── Library folder ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select MIDI Library Folder', properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const folderPath = result.filePaths[0]
  savePrefs({ libraryFolder: folderPath })
  return folderPath
})
ipcMain.handle('fs:scanMidiFolder', async (_e, folderPath: string) => {
  function scanDir(dir: string): { name: string; path: string }[] {
    try {
      const results: { name: string; path: string }[] = []
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory()) {
          results.push(...scanDir(join(dir, e.name)))
        } else if (e.isFile() && /\.(mid|midi)$/i.test(e.name)) {
          results.push({ name: e.name, path: join(dir, e.name) })
        }
      }
      return results
    } catch { return [] }
  }
  return scanDir(folderPath).sort((a, b) => a.name.localeCompare(b.name))
})
ipcMain.handle('fs:loadMidiFromPath', async (_e, filePath: string) => {
  try {
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath
    return { fileName, filePath, base64: readFileSync(filePath).toString('base64') }
  } catch { return null }
})

// ── Copy a MIDI file into the library folder with collision-safe renaming ──────
// Never moves or overwrites — source file is always left intact.
// Returns the final destination path so the renderer can load it directly.
ipcMain.handle('fs:copyMidiToLibrary', async (_e, sourcePath: string, libraryFolder: string) => {
  const origName = basename(sourcePath)
  const ext      = extname(origName)                     // '.mid' / '.midi'
  const stem     = origName.slice(0, origName.length - ext.length)

  let destName   = origName
  let destPath   = join(libraryFolder, destName)
  let counter    = 2
  while (await access(destPath).then(() => true).catch(() => false)) {
    destName = `${stem} (${counter})${ext}`
    destPath = join(libraryFolder, destName)
    counter++
  }

  await copyFile(sourcePath, destPath)
  return destPath
})

ipcMain.handle('dialog:saveFile', async (_e, opts: { defaultPath: string; filters: any[] }) => {
  const result = await dialog.showSaveDialog({ defaultPath: opts.defaultPath, filters: opts.filters })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('editor:save', async (_e, payload: {
  filePath: string
  outputPath: string
  includedTracks: { index: number; newProgram: number }[]
  mergeGroups: number[][]
  trackNames?: Record<number, string>
}) => {
  try {
    if (!payload.filePath) return { ok: false, message: 'No source file loaded' }
    const midi = new Midi(readFileSync(payload.filePath))

    // ── Resolve output path into Orfeo/ subfolder ─────────────────────────────
    // Strip any existing _ORFEO / _ORFEO_MERGED suffix before appending a new one
    // so re-saving an already-generated file overwrites cleanly instead of doubling up.
    const orfeoDir   = await getOrfeoOutputDir(payload.filePath)
    const rawBase    = basename(payload.filePath).replace(/\.midi?$/i, '')
    const baseName   = rawBase.replace(/_(ORFEO_MERGED|ORFEO)$/i, '')
    const hasMerge   = (payload.mergeGroups ?? []).some(g => g.length >= 2)
    const outputPath = join(orfeoDir, `${baseName}${hasMerge ? '_ORFEO_MERGED' : '_ORFEO'}.mid`)

    const noteTrackIndices: number[] = []
    midi.tracks.forEach((t, i) => { if (t.notes.length > 0) noteTrackIndices.push(i) })

    const includedSet = new Set(
      payload.includedTracks.map(it => noteTrackIndices[it.index] ?? -1).filter(i => i >= 0)
    )

    // Instrument reassignment
    for (const it of payload.includedTracks) {
      const orig = noteTrackIndices[it.index]
      if (orig === undefined) continue
      const track = midi.tracks[orig]
      if (track && it.newProgram >= 0 && (track as any).channel !== 9) {
        track.instrument.number = it.newProgram
      }
    }

    // Merge
    for (const group of (payload.mergeGroups ?? [])) {
      if (group.length < 2) continue
      const idxs = group.map(i => noteTrackIndices[i]).filter((i): i is number => i !== undefined && includedSet.has(i))
      if (idxs.length < 2) continue
      const base = midi.tracks[idxs[0]]
      for (let i = 1; i < idxs.length; i++) {
        base.notes.push(...midi.tracks[idxs[i]].notes)
        base.notes.sort((a: any, b: any) => a.time - b.time)
        includedSet.delete(idxs[i])
      }
    }

    // ── Inject ORFEO_TRACK_NAME text meta-events for each output track ────────
    // Build rawIdx → name from payload.trackNames (keyed by editor index)
    if (payload.trackNames && Object.keys(payload.trackNames).length > 0) {
      const rawIdxToName: Record<number, string> = {}
      for (const [edIdxStr, name] of Object.entries(payload.trackNames)) {
        const rawIdx = noteTrackIndices[parseInt(edIdxStr, 10)]
        if (rawIdx !== undefined) rawIdxToName[rawIdx] = name
      }
      // Surviving output tracks in file order
      const includedInOrder = noteTrackIndices.filter(i => includedSet.has(i))
      // Strip any existing ORFEO_TRACK_NAME entries then push fresh ones
      const existingMeta = (midi.header as any).meta ?? []
      ;(midi.header as any).meta = existingMeta.filter(
        (m: any) => !(typeof m.text === 'string' && m.text.startsWith('ORFEO_TRACK_NAME:'))
      )
      includedInOrder.forEach((rawIdx, outIdx) => {
        const name = rawIdxToName[rawIdx]
        if (name) (midi.header as any).meta.push({ type: 'text', text: `ORFEO_TRACK_NAME:${outIdx}:${name}`, ticks: 0 })
      })
    }

    // Remove excluded
    noteTrackIndices.filter(i => !includedSet.has(i)).sort((a, b) => b - a).forEach(i => midi.tracks.splice(i, 1))

    const outBuf = Buffer.from(midi.toArray())
    writeFileSync(outputPath, outBuf)

    // ── Return file data so the renderer can reload inline ────────────────────
    const fileName = outputPath.split(/[\\/]/).pop() ?? outputPath
    return { ok: true, message: `Saved: ${fileName}`, filePath: outputPath, fileName, base64: outBuf.toString('base64') }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Save failed' }
  }
})

// ── Split a single track into Left Hand / Right Hand by MIDI note breakpoint ──
ipcMain.handle('editor:split', async (_e, payload: {
  filePath: string
  trackIndex: number
  breakpointType: 'single' | 'range'
  breakpoint: number
  rangeStart: number
  rangeEnd: number
}) => {
  try {
    if (!payload.filePath) return { ok: false, message: 'No source file loaded' }
    const midi = new Midi(readFileSync(payload.filePath))

    const noteTrackIndices: number[] = []
    midi.tracks.forEach((t, i) => { if (t.notes.length > 0) noteTrackIndices.push(i) })

    const origIdx = noteTrackIndices[payload.trackIndex ?? 0]
    if (origIdx === undefined) return { ok: false, message: 'Track not found' }

    const srcTrack = midi.tracks[origIdx]
    const allNotes = [...srcTrack.notes]

    if (allNotes.length === 0) return { ok: false, message: 'Track has no notes' }

    // ── Assign notes to LH / RH based on breakpoint type ─────────────────────
    let lhNotes: typeof allNotes
    let rhNotes: typeof allNotes
    if (payload.breakpointType === 'range') {
      // Notes below rangeStart → LH; above rangeEnd → RH;
      // inside the zone → closer bound wins (ties go to LH)
      lhNotes = allNotes.filter(n => {
        if (n.midi < payload.rangeStart) return true
        if (n.midi > payload.rangeEnd)   return false
        return Math.abs(n.midi - payload.rangeStart) <= Math.abs(n.midi - payload.rangeEnd)
      })
      rhNotes = allNotes.filter(n => !lhNotes.includes(n))
    } else {
      lhNotes = allNotes.filter(n => n.midi < payload.breakpoint)
      rhNotes = allNotes.filter(n => n.midi >= payload.breakpoint)
    }
    const lhPct = lhNotes.length / allNotes.length
    const rhPct = rhNotes.length / allNotes.length

    if (lhPct < 0.15 || rhPct < 0.15) {
      return {
        ok: false,
        message: `Not enough notes in both registers (${Math.round(lhPct * 100)}% below / ${Math.round(rhPct * 100)}% above breakpoint)`,
      }
    }

    // ── Rebuild source track as Left Hand (notes below breakpoint) ────────────
    srcTrack.notes.splice(0)
    srcTrack.name = 'Left Hand'
    lhNotes.forEach(n => srcTrack.notes.push(n))

    // ── Add Right Hand track (notes at or above breakpoint) ───────────────────
    const rhTrack = midi.addTrack()
    rhTrack.name = 'Right Hand'
    rhTrack.instrument.number = srcTrack.instrument.number
    rhNotes.forEach(n => rhTrack.notes.push(n))

    // ── Resolve output path — strip existing ORFEO suffixes before appending ──
    const orfeoDir    = await getOrfeoOutputDir(payload.filePath)
    const rawBase     = basename(payload.filePath).replace(/\.midi?$/i, '')
    const baseNameStr = rawBase.replace(/_(ORFEO_MERGED|ORFEO_SPLIT|ORFEO)$/i, '')
    const outputPath  = join(orfeoDir, `${baseNameStr}_ORFEO_SPLIT.mid`)

    const outBuf = Buffer.from(midi.toArray())
    writeFileSync(outputPath, outBuf)

    // ── Return file data so the renderer can reload inline ────────────────────
    const fileName = outputPath.split(/[\\/]/).pop() ?? outputPath
    return { ok: true, message: `Saved: ${fileName}`, filePath: outputPath, fileName, base64: outBuf.toString('base64') }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Split failed' }
  }
})

// ── Chord Transcript PDF generation ───────────────────────────────────────────

// ── Strip trailing M from plain major chord names (CM → C, GM → G) ───────────
function pdfStripMajor(chord: string): string {
  return chord.replace(/^([A-G][b#]?)M$/, '$1')
}

// ── Legend dedup key — strip inversion and trailing M ────────────────────────
// C/E → C,  GM/D → G,  Cm/Eb → Cm.  Used both for legend dedup and
// for consecutive-identical dedup in the bar progression.
function pdfLegendKey(chord: string): string {
  return pdfStripMajor(chord.split('/')[0])
}

// ── Penalise noisy/exotic chord names — mirrors renderer's scoreChord() ──────
const PDF_WEIRD = ['m#5', 'aug', 'No5', 'sus2add', 'add#11', 'add#', 'no5', '#5', 'b6']
function pdfScoreChord(name: string): number {
  let score = name.length
  if (PDF_WEIRD.some(w => name.includes(w))) score += 20
  if (name.includes('/')) score += 5
  return score
}

// ── Pick best root-position chord using WEIRD-penalised scoring ───────────────
function pdfPickBest(matches: string[]): string | null {
  const roots = matches.filter(m => !m.includes('/'))
  const pool = roots.length > 0 ? roots : matches
  return pool.sort((a, b) => pdfScoreChord(a) - pdfScoreChord(b))[0] ?? null
}

// ── Pitch-class names for power chord root identification ─────────────────────
const PDF_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// ── Detect chord from a MIDI note cluster ─────────────────────────────────────
// Deduplicates to pitch classes first.
// Power chords (exactly 2 PCs, interval 7) → "{root}5".
// All other 2-PC combinations → null (ambiguous interval).
// 3+ distinct PCs → Chord.detect() with WEIRD-penalised scoring.
function pdfDetectChord(midiNotes: number[]): string | null {
  if (midiNotes.length < 2) return null
  const sorted = [...midiNotes].sort((a, b) => a - b)
  const pcs = [...new Set(sorted.map(m => m % 12))].sort((a, b) => a - b)

  if (pcs.length === 2) {
    const interval = (pcs[1] - pcs[0] + 12) % 12
    if (interval === 7) return `${PDF_PC[pcs[0]]}5`
    return null
  }
  if (pcs.length < 3) return null

  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  let matches = Chord.detect(noteNames)
  if (matches.length === 0 && noteNames.length > 3) matches = Chord.detect(noteNames.slice(0, -1))
  if (matches.length === 0) {
    const pcNames = pcs.map(pc => PDF_PC[pc])
    matches = Chord.detect(pcNames)
  }
  if (matches.length === 0) return null
  const best = pdfPickBest(matches)
  return best ? pdfStripMajor(best) : null
}

// ── Convert accidentals in a chord/note name string ───────────────────────────
// flat mode: no-op (tonal already returns flats, Bb always stays Bb per PC10 rule)
// sharp mode: Db→C#, Eb→D#, Gb→F#, Ab→G# — Bb is never converted (PC10 rule)
function pdfConvertAccidentals(text: string, accidentals: string): string {
  if (accidentals !== 'sharp') return text
  return text
    .replace(/Db/g, 'C#')
    .replace(/Eb/g, 'D#')
    .replace(/Gb/g, 'F#')
    .replace(/Ab/g, 'G#')
}

// ── Localize a chord/note name to the user's naming system ───────────────────
// Cannot import renderer's localizeChord — minimal duplicate here.
const PDF_SOLFEGE: Record<string, string> = {
  'C#': 'Do#', 'Db': 'Reb', 'D#': 'Re#', 'Eb': 'Mib',
  'F#': 'Fa#', 'Gb': 'Solb', 'G#': 'Sol#', 'Ab': 'Lab', 'Bb': 'Sib',
  'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si',
}
const PDF_SOLFEGE_KEYS = Object.keys(PDF_SOLFEGE).sort((a, b) => b.length - a.length)

function pdfLocalizeChord(chord: string, noteNaming: string, accidentals: string): string {
  if (!chord) return chord
  let r = pdfConvertAccidentals(chord, accidentals)
  if (noteNaming === 'central-european') {
    r = r.replace(/Bb/g, 'B').replace(/B(?!b)/g, 'H')
    return r
  }
  if (noteNaming === 'solfege') {
    for (const k of PDF_SOLFEGE_KEYS) {
      if (r.startsWith(k)) return PDF_SOLFEGE[k] + r.slice(k.length)
    }
  }
  return r
}

// ── Draw one-octave (C–B) keyboard thumbnail; chord tones filled amber ────────
// englishChordName must be root-position (no slash) for Chord.get() to work.
// Black keys: fixed 4.5pt wide × 11pt tall per spec, no stroke.
// White keys: fill #efefef, stroke #c0c0c0 at 0.2pt.
function drawKeyboardThumbnail(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  englishChordName: string,
  thumbW: number,
  thumbH: number,
) {
  const WHITE_PCS      = [0, 2, 4, 5, 7, 9, 11]
  const BLACK_PCS      = [1, 3, 6, 8, 10]
  const BLACK_X_FRACS  = [1 / 7, 2 / 7, 4 / 7, 5 / 7, 6 / 7]
  const wKeyW          = thumbW / 7
  const B_KEY_W        = 4.5
  const B_KEY_H        = 11

  const chordInfo = Chord.get(englishChordName)
  const chordPCs  = new Set(
    (chordInfo.notes ?? []).map((n: string) => ((Note.midi(n + '4') ?? 60) % 12))
  )

  // ── White keys ──────────────────────────────────────────────────────────────
  doc.lineWidth(0.2)
  WHITE_PCS.forEach((pc, i) => {
    const lit = chordPCs.has(pc)
    doc.rect(x + i * wKeyW, y, wKeyW - 0.5, thumbH)
      .fillAndStroke(lit ? '#e8a027' : '#efefef', '#c0c0c0')
  })

  // ── Black keys (no stroke — fill only) ──────────────────────────────────────
  BLACK_PCS.forEach((pc, i) => {
    const lit = chordPCs.has(pc)
    const bx  = x + BLACK_X_FRACS[i] * thumbW - B_KEY_W / 2
    doc.rect(bx, y, B_KEY_W, B_KEY_H)
      .fill(lit ? '#e8a027' : '#2a2a2a')
  })
}

// ── transcript:generate IPC handler ──────────────────────────────────────────
ipcMain.handle('transcript:generate', async (_e, midiFilePath: string, noteNaming: string, accidentals: string) => {
  try {
    // ── 1. Parse MIDI ──────────────────────────────────────────────────────────
    const buf = readFileSync(midiFilePath)
    const midi = new Midi(buf)
    const tempos = midi.header.tempos.length > 0
      ? midi.header.tempos
      : [{ ticks: 0, bpm: 120 }]
    const timeSigs = midi.header.timeSignatures.length > 0
      ? midi.header.timeSignatures
      : [{ ticks: 0, timeSignature: [4, 4] }]

    const bpm        = tempos[0].bpm
    const [tsNum, tsDen] = timeSigs[0].timeSignature as [number, number]
    const secPerBeat = 60 / bpm
    const secPerBar  = secPerBeat * tsNum

    const keySigs  = (midi.header as any).keySignatures ?? []
    const keyLabel = keySigs.length > 0
      ? `${keySigs[0].key ?? ''} ${keySigs[0].scale ?? ''}`.trim()
      : ''

    // noteNaming 'hidden' falls back to english for PDF display
    const effectiveNaming = noteNaming === 'hidden' ? 'english' : noteNaming

    // ── 2. Collect notes from all non-percussion tracks ────────────────────────
    const allNotes: { midi: number; time: number; duration: number }[] = []
    for (const track of midi.tracks) {
      if ((track.instrument as any).percussion) continue
      for (const note of track.notes) {
        allNotes.push({ midi: note.midi, time: note.time, duration: note.duration })
      }
    }
    allNotes.sort((a, b) => a.time - b.time)

    // ── 3. Cluster notes within 150ms; require ≥150ms max note duration ────────
    // 150ms window groups arpeggiated chords; duration gate filters melodic runs.
    interface RawCluster { time: number; notes: number[]; maxDuration: number }
    const rawClusters: RawCluster[] = []
    for (const note of allNotes) {
      const last = rawClusters[rawClusters.length - 1]
      if (last && note.time - last.time <= 0.150) {
        last.notes.push(note.midi)
        if (note.duration > last.maxDuration) last.maxDuration = note.duration
      } else {
        rawClusters.push({ time: note.time, notes: [note.midi], maxDuration: note.duration })
      }
    }

    // ── 4. Detect chords; filter passing tones and unrecognised clusters ───────
    interface DetectedChord { time: number; chord: string }
    const rawDetected: DetectedChord[] = rawClusters
      .filter(cl => cl.maxDuration >= 0.150)
      .map(cl => ({ time: cl.time, chord: pdfDetectChord(cl.notes) ?? '' }))
      .filter(cl => cl.chord !== '')

    // ── 5. Global dedup — consecutive same root+quality, ignoring inversions ───
    // C → C/E → C/G all collapse to the first C; inversion changes are noise here.
    const deduped: DetectedChord[] = []
    for (const cl of rawDetected) {
      const prevKey = deduped.length > 0 ? pdfLegendKey(deduped[deduped.length - 1].chord) : ''
      if (pdfLegendKey(cl.chord) !== prevKey) deduped.push(cl)
    }

    // ── 6. Compute bar/beat position; localize chord names ────────────────────
    interface GridChord {
      bar:     number  // 1-based
      beatCol: number  // 0-based beat index within bar
      xFrac:   number  // 0–1 proportional position within beat cell
      chord:   string  // localized display name (may include inversion slash)
      chordEn: string  // English root-position key (for Chord.get() in thumbnail)
    }
    const gridChords: GridChord[] = deduped.map(cl => {
      const bar       = Math.floor(cl.time / secPerBar) + 1
      const timeInBar = cl.time - (bar - 1) * secPerBar
      const beatInBar = timeInBar / secPerBeat
      const beatCol   = Math.min(Math.floor(beatInBar), tsNum - 1)
      const xFrac     = Math.max(0, Math.min(1, beatInBar - beatCol))
      return {
        bar, beatCol, xFrac,
        chord:   pdfLocalizeChord(cl.chord, effectiveNaming, accidentals),
        chordEn: pdfLegendKey(cl.chord),
      }
    })

    // ── 7. Build bar→beat map for grid rendering ──────────────────────────────
    const barBeatMap = new Map<number, { beatCol: number; xFrac: number; chord: string }[]>()
    for (const gc of gridChords) {
      if (!barBeatMap.has(gc.bar)) barBeatMap.set(gc.bar, [])
      barBeatMap.get(gc.bar)!.push({ beatCol: gc.beatCol, xFrac: gc.xFrac, chord: gc.chord })
    }

    const totalBars = Math.max(
      barBeatMap.size > 0 ? Math.max(...barBeatMap.keys()) : 1,
      Math.ceil(midi.duration / secPerBar),
    )

    // ── 8. Collect unique legend chords — strip inversion + trailing M, dedup ──
    // Normalize explicitly here: split on '/' (strip inversion), then strip
    // trailing M — e.g. C/E → C, GM/D → G, Hmb6b9/C → Hmb6b9.
    // Keep only first occurrence; thumbnails use the root-position English name.
    const legendKeySet = new Set<string>()
    const legendEn: string[] = []
    for (const gc of gridChords) {
      const base = pdfStripMajor(gc.chordEn.split('/')[0])
      if (!legendKeySet.has(base)) { legendKeySet.add(base); legendEn.push(base) }
    }

    // ── 9. Generate PDF ────────────────────────────────────────────────────────
    const orfeoDir   = await getOrfeoOutputDir(midiFilePath)
    const songName   = basename(midiFilePath).replace(/\.midi?$/i, '')
    const outputPath = join(orfeoDir, `${songName}_CHORD_TRANSCRIPT.pdf`)

    // ── Font directory: project root in dev, resources/ in packaged app ────────
    const fontsDir = app.isPackaged
      ? join(process.resourcesPath, 'fonts')
      : join(app.getAppPath(), 'public', 'fonts')

    await new Promise<void>((resolve, reject) => {
      // ── Page + color constants ───────────────────────────────────────────────
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true })
      const stream = createWriteStream(outputPath)
      doc.pipe(stream)

      const pageW    = doc.page.width    // 595.28
      const pageH    = doc.page.height   // 841.89
      const margin   = 42.52             // 15mm
      const contentW = pageW - margin * 2

      const C_LINE  = '#d0d0dc'   // grid lines, rules, bar/beat labels
      const C_DIM   = '#707088'   // secondary labels, note names, footer
      const C_TEXT  = '#1a1a2a'   // chord names in grid
      const C_HEAD  = '#0f0f12'   // title
      const C_INFO  = '#909090'   // header info line

      // ── Register embedded fonts ──────────────────────────────────────────────
      doc.registerFont('Inter',        join(fontsDir, 'Inter-Regular.ttf'))
      doc.registerFont('Inter-Bold',   join(fontsDir, 'Inter-Bold.ttf'))
      doc.registerFont('Inter-Italic', join(fontsDir, 'Inter-Italic.ttf'))
      doc.registerFont('Mono',         join(fontsDir, 'JetBrainsMono-Regular.ttf'))

      // ── Section 1 — Header ───────────────────────────────────────────────────
      doc.font('Inter-Bold').fontSize(13).fillColor(C_HEAD)
        .text(songName, margin, margin, { width: contentW })

      doc.font('Inter-Italic').fontSize(8).fillColor(C_DIM)
        .text('Orfeo Chord Transcript', margin, doc.y + 3, { width: contentW })

      const infoLine = [
        `Tempo: ${Math.round(bpm)} BPM`,
        keyLabel ? `Key: ${keyLabel}` : null,
        `Time: ${tsNum}/${tsDen}`,
        `${totalBars} bars`,
        `${legendEn.length} unique chords`,
      ].filter(Boolean).join('  ·  ')

      doc.font('Inter').fontSize(7).fillColor(C_INFO)
        .text(infoLine, margin, doc.y + 3, { width: contentW })

      let curY = doc.y + 6
      doc.moveTo(margin, curY).lineTo(margin + contentW, curY)
        .strokeColor(C_LINE).lineWidth(0.3).stroke()
      curY += 8

      // ── Section 2 — Chord Legend ─────────────────────────────────────────────
      doc.font('Inter').fontSize(7).fillColor(C_DIM)
        .text('CHORDS USED IN SONG', margin, curY, { characterSpacing: 0.8 })
      curY = doc.y + 4

      const THUMB_W     = 49.5
      const THUMB_H     = 17.4
      const THUMB_GAP_H = 6
      const THUMB_GAP_V = 8
      const LEG_COLS    = 10
      const LEG_ROW_H   = THUMB_H + 15 + THUMB_GAP_V  // thumbnail + name line + notes line + gap
      const LEG_CELL_W  = THUMB_W + THUMB_GAP_H

      let legRowY = curY

      legendEn.forEach((chordEn, i) => {
        const col = i % LEG_COLS

        // ── Advance to next legend row; page-break if needed ─────────────────
        if (col === 0 && i > 0) {
          legRowY += LEG_ROW_H
          if (legRowY + LEG_ROW_H > pageH - margin - 20) {
            doc.addPage()
            legRowY = margin
          }
        }

        const cx        = margin + col * LEG_CELL_W
        const localName = pdfLocalizeChord(chordEn, effectiveNaming, accidentals)

        drawKeyboardThumbnail(doc, cx, legRowY, chordEn, THUMB_W, THUMB_H)

        // ── Chord name in Mono below thumbnail ──────────────────────────────
        doc.font('Inter-Bold').fontSize(7).fillColor(C_TEXT)
          .text(localName, cx, legRowY + THUMB_H + 2, { width: THUMB_W, align: 'center', lineBreak: false })

        // ── Note names in Inter below chord name ────────────────────────────
        const notesEn    = (Chord.get(chordEn).notes ?? []) as string[]
        const notesLocal = notesEn.map(n => pdfLocalizeChord(n, effectiveNaming, accidentals)).join(' ')
        doc.font('Inter').fontSize(6).fillColor(C_DIM)
          .text(notesLocal, cx, legRowY + THUMB_H + 10, { width: THUMB_W, align: 'center', lineBreak: false })
      })

      curY = legRowY + LEG_ROW_H + 4
      doc.moveTo(margin, curY).lineTo(margin + contentW, curY)
        .strokeColor(C_LINE).lineWidth(0.2).stroke()
      curY += 8

      // ── Section 3 — Bar Grid ─────────────────────────────────────────────────
      const BAR_NUM_W  = 20
      const BEAT_COL_W = (contentW - BAR_NUM_W) / tsNum
      const BEAT_HDR_H = 10

      // ── Draw beat-number header row at a given Y ─────────────────────────────
      function drawBeatHeader(y: number) {
        for (let b = 0; b < tsNum; b++) {
          const bx = margin + BAR_NUM_W + b * BEAT_COL_W
          doc.font('Inter').fontSize(6).fillColor(C_LINE)
            .text(`${b + 1}`, bx, y + 2, { width: BEAT_COL_W, align: 'center', lineBreak: false })
        }
      }

      drawBeatHeader(curY)
      let barRowY = curY + BEAT_HDR_H

      // ── Render each bar row with dynamic height ──────────────────────────────
      for (let bar = 1; bar <= totalBars; bar++) {
        const barChords  = barBeatMap.get(bar) ?? []
        const rowH       = Math.max(20, barChords.length * 11)

        // ── Page break before this row if it won't fit ───────────────────────
        if (barRowY + rowH > pageH - margin - 20) {
          doc.addPage()
          barRowY = margin
          drawBeatHeader(barRowY)
          barRowY += BEAT_HDR_H
        }

        // ── Bar number column separator ──────────────────────────────────────
        doc.moveTo(margin + BAR_NUM_W, barRowY)
          .lineTo(margin + BAR_NUM_W, barRowY + rowH)
          .strokeColor(C_LINE).lineWidth(0.2).stroke()

        // ── Bar number: Mono 7pt, right-aligned, vertically centred ─────────
        doc.font('Mono').fontSize(7).fillColor(C_LINE)
          .text(`${bar}`, margin + 1, barRowY + rowH / 2 - 4,
            { width: BAR_NUM_W - 3, align: 'right', lineBreak: false })

        // ── Beat column separators ───────────────────────────────────────────
        for (let b = 1; b < tsNum; b++) {
          const bx = margin + BAR_NUM_W + b * BEAT_COL_W
          doc.moveTo(bx, barRowY).lineTo(bx, barRowY + rowH)
            .strokeColor(C_LINE).lineWidth(0.2).stroke()
        }

        // ── Place chord names in beat cells ───────────────────────────────────
        // Group chords by beat column for per-cell stacking logic.
        const beatGroups = new Map<number, { xFrac: number; chord: string }[]>()
        for (const bc of barChords) {
          if (!beatGroups.has(bc.beatCol)) beatGroups.set(bc.beatCol, [])
          beatGroups.get(bc.beatCol)!.push({ xFrac: bc.xFrac, chord: bc.chord })
        }

        for (const [beatIdx, cellChords] of beatGroups.entries()) {
          const cellLeft  = margin + BAR_NUM_W + beatIdx * BEAT_COL_W
          const cellRight = cellLeft + BEAT_COL_W
          const midY      = barRowY + rowH / 2 - 4

          // ── Sort left-to-right so overlap check is order-stable ───────────
          const sorted = [...cellChords].sort((a, b) => a.xFrac - b.xFrac)

          // ── Adaptive stacking step: fits all chords in cell height ─────────
          const n    = sorted.length
          const step = n > 1 ? Math.min(9, (rowH - 6 - 8) / (n - 1)) : 0

          // ── Track previous chord's x and text-width for overlap detection ──
          let prevDrawX = Number.NEGATIVE_INFINITY
          let prevTW    = 0

          sorted.forEach((c, ci) => {
            // ── Font size: shrink until chord name fits within beat cell ──────
            let fontSize = 8
            doc.font('Mono').fontSize(fontSize)
            let tw = doc.widthOfString(c.chord)
            if (tw > BEAT_COL_W - 4) { fontSize = 7; doc.fontSize(fontSize); tw = doc.widthOfString(c.chord) }
            if (tw > BEAT_COL_W - 4) { fontSize = 6; doc.fontSize(fontSize); tw = doc.widthOfString(c.chord) }

            // ── Horizontal position: proportional x, clamped to cell ─────────
            const rawX = cellLeft + 2 + c.xFrac * (BEAT_COL_W - 4)
            let drawX  = Math.max(cellLeft + 2, Math.min(rawX, cellRight - tw - 2))

            // ── Anti-overlap: push right if too close to previous chord ───────
            let forceStack = false
            if (ci > 0 && drawX < prevDrawX + prevTW + 3) {
              drawX = Math.min(prevDrawX + prevTW + 3, cellRight - tw - 2)
              // Still overlaps after clamping — apply diagonal stack offset
              if (drawX < prevDrawX + prevTW) {
                forceStack = true
                drawX = Math.min(prevDrawX + 5, cellRight - tw - 2)
              }
            }

            prevDrawX = drawX
            prevTW    = tw

            // ── Vertical position: centre, stack for 3+, or force-stack ──────
            let drawY: number
            if (n > 2 || forceStack) {
              drawY = midY - ci * (forceStack ? 9 : step)
              drawY = Math.max(barRowY + 3, Math.min(barRowY + rowH - 3 - fontSize, drawY))
            } else {
              drawY = midY
            }

            // ── Render with hard right boundary — no overflow ─────────────────
            doc.font('Mono').fontSize(fontSize).fillColor(C_TEXT)
              .text(c.chord, drawX, drawY,
                { width: cellRight - drawX - 1, lineBreak: false })
          })
        }

        // ── Between-row separator — full-bleed, omit after last bar ────────────
        if (bar < totalBars) {
          doc.moveTo(0, barRowY + rowH).lineTo(pageW, barRowY + rowH)
            .strokeColor('#c8c8d8').lineWidth(0.15).stroke()
        }

        barRowY += rowH
      }

      // ── Footer (last page only) ──────────────────────────────────────────────
      const footerY = pageH - margin - 14
      doc.moveTo(margin, footerY - 6).lineTo(margin + contentW, footerY - 6)
        .strokeColor(C_LINE).lineWidth(0.2).stroke()
      doc.font('Inter').fontSize(7).fillColor(C_INFO)
        .text('Created by Orfeo  ·  github.com/SquareBow/orfeo',
          margin, footerY, { width: contentW, align: 'center', lineBreak: false })

      stream.on('finish', () => resolve())
      stream.on('error', reject)
      doc.end()
    })

    return { success: true, path: outputPath }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'PDF generation failed' }
  }
})

// ── Note Editor save — write a MIDI buffer to the chosen output path ──────────
ipcMain.handle('noteEditor:save', async (_e, payload: { outputPath: string; base64: string }) => {
  try {
    const buf = Buffer.from(payload.base64, 'base64')
    await mkdir(dirname(payload.outputPath), { recursive: true })
    writeFileSync(payload.outputPath, buf)
    const fileName = payload.outputPath.split(/[\\/]/).pop() ?? ''
    return { ok: true, filePath: payload.outputPath, fileName, base64: buf.toString('base64') }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Save failed' }
  }
})

// ── Native message-box dialog — wraps dialog.showMessageBox for renderer use ──
ipcMain.handle('dialog:messageBox', async (_e, opts: {
  type?: string; buttons: string[]; defaultId?: number; cancelId?: number; message: string; detail?: string
}) => {
  const win = mainWin
  if (!win) return { response: opts.cancelId ?? opts.buttons.length - 1 }
  return dialog.showMessageBox(win, opts as any)
})

// ── App force-close — called by renderer after completing a save-before-close ─
ipcMain.handle('app:confirm-close', () => {
  mainWin?.destroy()
})

// ── Portable mode: redirect userData to a folder next to the exe ─────────────
// PORTABLE_EXECUTABLE_DIR is injected by electron-builder when running as a
// portable exe. Storing prefs and cache there lets the user copy the exe +
// Orfeo-Data/ folder to any machine and keep their settings intact.
// Must be called before app.whenReady() so getPrefsPath() sees the correct path.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', join(process.env.PORTABLE_EXECUTABLE_DIR, 'Orfeo-Data'))
}

// ── Launch: copy demo files on first run, then open main window ───────────────
app.whenReady().then(async () => {
  try { await ensureDemoFolder() } catch (e) { console.error('[Orfeo] ensureDemoFolder failed:', e) }
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
