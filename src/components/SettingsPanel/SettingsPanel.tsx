import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from 'react'
import Fuse from 'fuse.js'
import { confirmDiscardDirtyNoteEdits } from '../../utils/noteEditorState'
import { confirmDialog } from '../../utils/confirmController'
import {
  ChevronLeft, ChevronDown, ChevronRight,
  FolderOpen, Folders, RefreshCw, FileMusic, FileCode2, Guitar, BookOpen, Library, Settings, Info,
  Search, X, Undo2, ChevronsDownUp, Settings2,
} from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { TempoWarningDot } from '../Transport/TempoWarning'
import { useTempoTrustScan } from '../../hooks/useTempoTrustScan'
import type { NoteNaming, Accidentals, TranscriptEntry, LibraryFile } from '../../types'
import { MarqueeText } from '../MarqueeText'
import { detectForeignFormat, resolveAndTrackImport, base64ToBytes, confirmPendingImportBeforeSwitch } from '../../utils/foreignFormatImport'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import FileInfoModal from '../FileInfoModal'
import Tooltip, { TooltipBox, useTooltip } from '../Tooltip'
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuLabel } from '../ContextMenu'
import { UpdateButton } from '../Settings/controls'
import QuickSettings from '../Settings/QuickSettings'

// ── Spin keyframe for transcript loading animation ────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('orfeo-transcript-anim')) {
  const s = document.createElement('style')
  s.id = 'orfeo-transcript-anim'
  s.textContent = '@keyframes orfeo-transcript-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}

// ─── Shared sub-components ──────────────────────────────────────────────────


// ── Section header — icon + uppercase group label row ──────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: 'var(--bg-row)',
      borderTop: '1px solid var(--bg-tile)',
      borderBottom: '1px solid var(--bg-tile)',
    }}>
      <span style={{ color: 'var(--text-inactive)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmest)',
      }}>
        {label}
      </span>
    </div>
  )
}







// ─── Transcript icon — sits in the FileMusic slot; manages its own state ───────
function TranscriptIcon({ filePath, noteNaming, accidentals, addTranscriptEntry, isLoaded, onHoverChange }: {
  filePath: string
  noteNaming: NoteNaming
  accidentals: Accidentals
  addTranscriptEntry: (entry: TranscriptEntry) => void
  isLoaded?: boolean
  // Lets a wrapping RowTooltip suppress its own "Right-click for options" tip
  // while the pointer is over this icon — same pattern as FavouriteStar. ──
  onHoverChange?: (hovering: boolean) => void
}) {
  const IDLE_TOOLTIP = 'Click to create a chord transcript PDF in Orfeo folder.'
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [tooltip, setTooltip] = useState(IDLE_TOOLTIP)
  const revertRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (revertRef.current) clearTimeout(revertRef.current) }, [])

  // ── Trigger generation — stops row click propagation ─────────────────────
  const handleClick = async () => {
    if (state === 'loading') return
    setState('loading')
    setTooltip('Generating…')
    if (revertRef.current) clearTimeout(revertRef.current)
    try {
      const result = await window.electronAPI.transcriptGenerate(filePath, noteNaming, accidentals)
      if (result.success && result.path) {
        setState('success')
        const fname = result.path.split(/[\\/]/).pop() ?? result.path
        setTooltip(`✓ Saved — ${fname}`)
        const today = new Date()
        addTranscriptEntry({
          midiPath: filePath,
          transcriptPath: result.path,
          date: `${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`,
        })
      } else {
        setState('error')
        setTooltip(result.error ?? 'PDF generation failed')
      }
    } catch (err: any) {
      setState('error')
      setTooltip(err?.message ?? 'PDF generation failed')
    }
    revertRef.current = setTimeout(() => {
      setState('idle')
      setTooltip(IDLE_TOOLTIP)
    }, 3000)
  }

  const iconColor = state === 'success' ? 'var(--text-amber)' : state === 'error' ? 'var(--status-error)' : 'var(--text-dimmest)'

  return (
    <Tooltip title={tooltip} oneLine placement="right" wrapperStyle={{ flexShrink: 0 }}>
    <div
      onClick={(e) => { e.stopPropagation(); void handleClick() }}
      className={isLoaded && state === 'idle' ? 'loop-nudge-blink' : undefined}
      style={{
        cursor: state === 'loading' ? 'wait' : 'pointer',
        color: iconColor,
        display: 'flex', alignItems: 'center', flexShrink: 0,
        transition: 'color 0.2s',
        animation: state === 'loading' ? 'orfeo-transcript-spin 1s linear infinite' : 'none',
      }}
      onMouseEnter={e => { onHoverChange?.(true); if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { onHoverChange?.(false); if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmest)' }}
    >
      <FileMusic size={11} strokeWidth={1.5} />
    </div>
    </Tooltip>
  )
}

// ── MarqueeFilename — alias for MarqueeText with library-specific font style ──
const FILENAME_SPAN_STYLE: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }
function MarqueeFilename({ name }: { name: string }) {
  return <MarqueeText name={name} spanStyle={FILENAME_SPAN_STYLE} />
}


type RowPlacement = 'top' | 'bottom' | 'left' | 'right'

// ── RowTooltip — wraps a full-width list row (file/folder) with its own
// "Right-click for options"-style tooltip, EXCEPT while a nested interactive
// icon inside the row (star, undo) is itself being hovered and showing its
// own tooltip — without this, hovering the star showed BOTH the row's and
// the star's tooltip stacked on top of each other, since the row's own
// hover state stays true the whole time the pointer is anywhere inside it,
// including over a nested child. `children` gets a `suppress` callback to
// pass down to any nested tooltipped icon (see `FavouriteStar`/
// `RowIconButton` below) — a ref-counter, not a plain boolean, so two
// adjacent suppressing icons (undo + star) can't leave it stuck open if
// their enter/leave events interleave. ─────────────────────────────────────
function RowTooltip({ title, placement = 'right', wrapperStyle, children }: {
  title: string | undefined
  placement?: RowPlacement
  wrapperStyle?: React.CSSProperties
  children: (suppress: (on: boolean) => void) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const suppressCount = useRef(0)
  const [suppressed, setSuppressed] = useState(false)
  const suppress = (on: boolean) => {
    suppressCount.current += on ? 1 : -1
    setSuppressed(suppressCount.current > 0)
  }
  const visible = hover && !suppressed && !!title
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'block', width: '100%', ...wrapperStyle }}
    >
      {children(suppress)}
      <TooltipBox
        anchorRect={visible ? ref.current?.getBoundingClientRect() ?? null : null}
        content={title ? { title } : null}
        visible={visible}
        placement={placement}
        oneLine
      />
    </div>
  )
}

// ── FavouriteStar — the ★ favourite toggle nested inside a RowTooltip row.
// Reports its own hover to the row via `onHoverChange` so the row can
// suppress its own tooltip while this one is showing. ─────────────────────
function FavouriteStar({ starred, title, onClick, onHoverChange, style }: {
  starred: boolean
  title: string
  onClick: (e: React.MouseEvent) => void
  onHoverChange: (hovering: boolean) => void
  style?: React.CSSProperties
}) {
  const tt = useTooltip<HTMLButtonElement>({ title }, { oneLine: true })
  return (
    <>
      <button
        ref={tt.ref}
        onClick={onClick}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: starred ? 'var(--text-amber)' : 'var(--state-disabled)',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          fontSize: 'var(--text-sm)', lineHeight: 1, transition: 'color 0.12s',
          ...style,
        }}
        onMouseEnter={e => { tt.onMouseEnter(); onHoverChange(true); if (!starred) e.currentTarget.style.color = 'var(--state-star-hover)' }}
        onMouseLeave={e => { tt.onMouseLeave(); onHoverChange(false); if (!starred) e.currentTarget.style.color = 'var(--state-disabled)' }}
      >★</button>
      {tt.box}
    </>
  )
}

// ── RowIconButton — the Undo-move / Undo-all-moves icon nested inside a
// RowTooltip row. Same suppression-reporting as FavouriteStar. ────────────
function RowIconButton({ tooltip, onClick, onHoverChange, style, children }: {
  tooltip: string
  onClick: (e: React.MouseEvent) => void
  onHoverChange: (hovering: boolean) => void
  style?: React.CSSProperties
  children: ReactNode
}) {
  const tt = useTooltip<HTMLButtonElement>({ title: tooltip }, { oneLine: true })
  return (
    <>
      <button
        ref={tt.ref}
        onClick={onClick}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-inactive)', display: 'flex', alignItems: 'center',
          flexShrink: 0, transition: 'color 0.12s',
          ...style,
        }}
        onMouseEnter={e => { tt.onMouseEnter(); onHoverChange(true); e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { tt.onMouseLeave(); onHoverChange(false); e.currentTarget.style.color = 'var(--text-inactive)' }}
      >{children}</button>
      {tt.box}
    </>
  )
}


// ─── Library Panel ───────────────────────────────────────────────────────────

// ── Filename span styles — active (amber) and default (muted) ─────────────────
const FILENAME_SPAN_DEFAULT: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }
const FILENAME_SPAN_ACTIVE:  React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-amber)', fontWeight: 500, fontFamily: 'var(--font-ui)' }
// Revealed-hidden-file row (showHiddenLibraryFiles on) — dimmest amber shade,
// not a generic gray fade, so it still reads as "library color" not "disabled".
const FILENAME_SPAN_HIDDEN:  React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-amber-dimmest)', fontFamily: 'var(--font-ui)' }

// ── Sticky headers stack: "Folders" section header (top:0) → individual
// folder header (top:FOLDER_HEADER_HEIGHT) → loaded file's row, if visible,
// pins directly beneath whichever headers are above it in its group (0, 1,
// or 2 header-heights) — or the very top, for a loaded root-group file. ─────
const FOLDER_HEADER_HEIGHT = 30

function LibraryPanel() {
  useTempoTrustScan()
  const libraryFolder = useStore((s) => s.libraryFolder)
  const libraryFiles = useStore((s) => s.libraryFiles)
  const libraryFavourites = useStore((s) => s.libraryFavourites)
  const setLibraryFiles = useStore((s) => s.setLibraryFiles)
  const setLibraryFolderAndFiles = useStore((s) => s.setLibraryFolderAndFiles)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const hideDemoFolder  = useStore((s) => s.hideDemoFolder)
  const demoFiles       = useStore((s) => s.demoFiles)
  const libraryNeedsRefresh    = useStore((s) => s.libraryNeedsRefresh)
  const setLibraryNeedsRefresh = useStore((s) => s.setLibraryNeedsRefresh)
  const libraryHighlightPath   = useStore((s) => s.libraryHighlightPath)
  // ── Chord Transcription — needed to show per-file transcript icon ─────────
  const chordTranscriptionEnabled = useStore((s) => s.chordTranscriptionEnabled)
  const noteNaming                = useStore((s) => s.noteNaming)
  const accidentals               = useStore((s) => s.accidentals)
  const addTranscriptEntry        = useStore((s) => s.addTranscriptEntry)
  // ── Active-file highlight — reads _filePath private field on parsed midi ──
  const midi              = useStore((s) => s.midi)
  const loadedFilePath    = (midi as any)?._filePath as string | undefined
  // ── Hidden files — client-side exclusion list, no disk change ────────────
  const hiddenLibraryFiles = useStore((s) => s.hiddenLibraryFiles)
  const hideLibraryFile    = useStore((s) => s.hideLibraryFile)
  const unhideLibraryFile  = useStore((s) => s.unhideLibraryFile)
  const showHiddenLibraryFiles    = useStore((s) => s.showHiddenLibraryFiles)
  const setShowHiddenLibraryFiles = useStore((s) => s.setShowHiddenLibraryFiles)
  const remapLibraryPaths  = useStore((s) => s.remapLibraryPaths)
  const setFavourites      = useStore((s) => s.setFavourites)
  const lastFolderOf       = useStore((s) => s.lastFolderOf)
  const setLastFolderOf    = useStore((s) => s.setLastFolderOf)
  const foldersWithUndo    = useStore((s) => s.foldersWithUndo)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  const [librarySearch, setLibrarySearch] = useState('')
  // Folders start expanded (not in collapsed set)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  // Whole "Folders" section (all folder rows, collapsed under one row) — starts expanded
  const [foldersSectionExpanded, setFoldersSectionExpanded] = useState(true)
  // ── Context menu state — file/multi-select menu (path+x+y) or folder menu (folder+x+y) ──
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const [fileInfoTarget, setFileInfoTarget] = useState<{ path: string; name: string } | null>(null)
  const [folderContextMenu, setFolderContextMenu] = useState<{ folder: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)

  // ── Multi-select + folder organization state ──────────────────────────────
  const PROTECTED_FOLDERS = ['demo', 'orfeo']
  const isProtectedFolder = (name: string | null | undefined) => !!name && PROTECTED_FOLDERS.includes(name.toLowerCase())
  // ── Narrower than isProtectedFolder — for FILES, not the folder itself.
  // "Orfeo" isn't one well-known folder: every saved version lands in an
  // "Orfeo" folder next to its source (see electron/main.ts getOrfeoOutputDir),
  // so using the folder-level check here blocked organizing any saved version
  // ever created. Demo is genuinely read-only bundled content and stays
  // blocked; Orfeo is the user's own output and shouldn't be. ────────────────
  const isReadOnlyFolder = (name: string | null | undefined) => !!name && name.toLowerCase() === 'demo'
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [draggingPaths, setDraggingPaths] = useState<string[] | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  // Real subfolder names from disk — includes empty folders, which the file-derived
  // `grouped` list below can't see on its own (it only knows about folders that hold midi files).
  const [libraryFolderNames, setLibraryFolderNames] = useState<string[]>([])
  useEffect(() => {
    if (!libraryFolder) { setLibraryFolderNames([]); return }
    window.electronAPI.listLibraryFolders(libraryFolder).then(setLibraryFolderNames).catch(() => {})
  }, [libraryFolder, libraryFiles])

  // ── Library sidebar drag-and-drop state ───────────────────────────────────
  const [isDragOver, setIsDragOver]   = useState(false)
  const [dropError, setDropError]     = useState<string | null>(null)
  const dropErrorTimer                = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Show a timed error inside the panel, clearing any previous timer ──────
  const showDropError = (msg: string) => {
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
    setDropError(msg)
    dropErrorTimer.current = setTimeout(() => setDropError(null), 2500)
  }

  // ── dragover: prevent browser default + light up the drop zone ────────────
  // Only for real OS file drags (dataTransfer carries a "Files" type) — our own
  // internal row-to-folder drags use "text/plain" and must not trigger this
  // panel-wide overlay, or the whole library flashes an amber border on every
  // internal drag instead of just the target folder.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  // ── dragleave: clear highlight only when pointer leaves the container ──────
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  // ── drop: add file to library — never touches playback state ─────────────
  // Reuses copyMidiToLibrary IPC (collision-safe copy) and getPathForFile
  // from the main-area drop zone implementation. No confirmation modal needed.
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!/\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i.test(file.name)) {
      showDropError('Unsupported file type. Orfeo accepts .mid, .musicxml, .mxl, .gp/.gp5, .cap, and .kar files.')
      return
    }

    const currentLibraryFolder = (useStore.getState() as any).libraryFolder as string | null
    if (!currentLibraryFolder) {
      showDropError('Set a library folder first.')
      return
    }

    const filePath = window.electronAPI.getPathForFile(file)
    const normLib  = currentLibraryFolder.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const normFile = filePath.replace(/\\/g, '/').toLowerCase()
    const isInside = normFile.startsWith(normLib + '/')

    try {
      if (!isInside) {
        await window.electronAPI.copyMidiToLibrary(filePath, currentLibraryFolder)
      }
      const files = await window.electronAPI.scanMidiFolder(currentLibraryFolder)
      setLibraryFiles(files)
    } catch (err) {
      console.error('[Orfeo] library sidebar drop failed:', err)
      showDropError('Could not copy file into library.')
    }
  }

  // ── Close context menu on outside click or Escape ────────────────────────
  useEffect(() => {
    if (!contextMenu && !folderContextMenu) return
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) setFolderContextMenu(null)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setContextMenu(null); setFolderContextMenu(null) }
    }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, folderContextMenu])

  // ── Open context menu at cursor position for a library file row ───────────
  // Right-clicking a file that isn't part of the current selection replaces the
  // selection with just that file (standard Explorer behavior).
  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault()
    setSelectedPaths(prev => prev.has(filePath) ? prev : new Set([filePath]))
    setContextMenu({ path: filePath, x: e.clientX, y: e.clientY })
  }

  const handleFolderContextMenu = (e: React.MouseEvent, folder: string) => {
    e.preventDefault()
    // Protected folders (Orfeo) still get the menu — just Show in explorer,
    // not Rename/Move/Delete (guarded inside the menu render below).
    setFolderContextMenu({ folder, x: e.clientX, y: e.clientY })
  }

  // ── Refresh + remap favourites/hidden after any create/rename/delete/move ──
  const refreshAfterFolderOp = async (pairs?: { oldPath: string; newPath: string }[]) => {
    if (pairs && pairs.length > 0) remapLibraryPaths(pairs)
    if (!libraryFolder) return
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch { /* keep stale list rather than clearing it on a transient scan error */ }
  }

  const handleCreateFolder = async (namePrefill?: string) => {
    if (!libraryFolder) return
    const name = await window.electronAPI.createLibraryFolder(libraryFolder, namePrefill ?? 'New Folder')
    await refreshAfterFolderOp()
    setExpandedFolders(prev => new Set(prev).add(name))
    setRenamingFolder(name)
    setRenameDraft(name)
    return name
  }

  const commitFolderRename = async () => {
    const folder = renamingFolder
    const draft = renameDraft.trim()
    setRenamingFolder(null)
    if (!libraryFolder || !folder || !draft || draft === folder) return
    const result = await window.electronAPI.renameLibraryFolder(libraryFolder, folder, draft)
    if (!result.ok) return
    // Renaming a folder changes every contained file's path — remap lastFolderOf's
    // keys (files that live in it) and values (files elsewhere whose recorded undo
    // destination was this folder) to the new name, same for foldersWithUndo, or a
    // rename silently wipes undo state that should last the whole session.
    const pairs = result.pairs ?? []
    const pathRemap = new Map(pairs.map(p => [p.oldPath, p.newPath]))
    const nextLastFolderOf = new Map<string, string | null>()
    for (const [path, prevFolder] of useStore.getState().lastFolderOf) {
      const newPath = pathRemap.get(path) ?? path
      const newPrevFolder = prevFolder === folder ? result.name ?? draft : prevFolder
      nextLastFolderOf.set(newPath, newPrevFolder)
    }
    useStore.getState().setLastFolderOf(nextLastFolderOf)
    const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
    if (nextFoldersWithUndo.has(folder)) { nextFoldersWithUndo.delete(folder); nextFoldersWithUndo.add(result.name ?? draft) }
    useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
    await refreshAfterFolderOp(pairs)
  }

  const handleDeleteFolder = async (folder: string) => {
    if (!libraryFolder) return
    const result = await window.electronAPI.deleteLibraryFolder(libraryFolder, folder)
    if (!result.ok) return
    // Drop any "undo would send this file back to <folder>" entries — that
    // destination no longer exists, so the undo icon would otherwise keep
    // showing on those (now-root) files for a move that can never succeed.
    const purged = new Map(useStore.getState().lastFolderOf)
    for (const [path, prevFolder] of purged) if (prevFolder === folder) purged.delete(path)
    useStore.getState().setLastFolderOf(purged)
    const purgedFolders = new Set(useStore.getState().foldersWithUndo)
    purgedFolders.delete(folder)
    useStore.getState().setFoldersWithUndo(purgedFolders)
    await refreshAfterFolderOp()
  }

  // ── Move a set of file paths into destFolder (null = library root) ────────
  const moveFilesToFolder = async (paths: string[], destFolder: string | null) => {
    if (!libraryFolder || paths.length === 0) return
    const movable = paths.filter(p => !isReadOnlyFolder(currentFolderOf(p)) && currentFolderOf(p) !== destFolder)
    if (movable.length === 0) return
    const prevFolders = new Map(movable.map(p => [p, currentFolderOf(p)]))
    const pairs = await window.electronAPI.moveLibraryFiles(movable, libraryFolder, destFolder)
    // Read/write via getState() rather than the reactive `lastFolderOf` closure — this
    // function can run several times back-to-back within one handler (folder-level undo),
    // and a stale closure would make each call clobber the previous one's update.
    const nextLastFolderOf = new Map(useStore.getState().lastFolderOf)
    for (const { oldPath, newPath } of pairs) nextLastFolderOf.set(newPath, prevFolders.get(oldPath) ?? null)
    useStore.getState().setLastFolderOf(nextLastFolderOf)
    // ── Folder-level undo flag — tracked directly by name rather than derived by
    // matching file paths against lastFolderOf on every render (which requires the
    // moved file's *new* path to exactly match what the next rescan reports back;
    // this is simpler and can't silently drift out of sync with that). ───────────
    if (destFolder && pairs.length > 0) {
      const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
      nextFoldersWithUndo.add(destFolder)
      useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
    }
    await refreshAfterFolderOp(pairs)
    setSelectedPaths(new Set())
  }

  // ── Undo (or redo, if run twice) the most recent move of a single file ────
  const handleUndoMove = (filePath: string) => {
    const prevFolder = lastFolderOf.get(filePath)
    if (prevFolder === undefined) return
    moveFilesToFolder([filePath], prevFolder)
  }

  // ── Undo every file currently sitting in `folder`, each back to its own
  // recorded previous location (not necessarily all the same place). Falls back
  // to library root for any file missing a specific record — this button only
  // shows when the folder is flagged undo-eligible at all (moved into this
  // session), so every file here got here somehow and root is always a safe,
  // reversible destination even if the exact origin wasn't captured. Grouped by
  // destination and awaited sequentially — moveFilesToFolder reads fresh state
  // via getState() so back-to-back calls don't race each other. ────────────────
  const handleUndoFolder = async (folder: string, filesInFolder: LibraryFile[]) => {
    const byDest = new Map<string | null, string[]>()
    for (const file of filesInFolder) {
      const prevFolder = lastFolderOf.get(file.path) ?? null
      const list = byDest.get(prevFolder) ?? []
      list.push(file.path)
      byDest.set(prevFolder, list)
    }
    for (const [dest, paths] of byDest) await moveFilesToFolder(paths, dest)
    const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
    nextFoldersWithUndo.delete(folder)
    useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
  }

  // ── Bulk-favourite toggle for a folder's contents — stars everything if any
  // file isn't starred yet, otherwise unstars everything (checkbox-style). ───
  const handleToggleFolderFavourites = (filesInFolder: LibraryFile[]) => {
    const paths = filesInFolder.map(f => f.path)
    const allStarred = paths.length > 0 && paths.every(p => libraryFavourites.has(p))
    setFavourites(paths, !allStarred)
  }

  // ── Which library subfolder (name only, null = root) a file path currently lives in ──
  const currentFolderOf = (filePath: string): string | null => {
    if (!libraryFolder) return null
    const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
    const normFile = filePath.replace(/\\/g, '/')
    const rel = normFile.startsWith(normRoot + '/') ? normFile.slice(normRoot.length + 1) : normFile
    const slash = rel.indexOf('/')
    return slash === -1 ? null : rel.slice(0, slash)
  }

  // ── After a save auto-refreshes the library, expand the folder holding the new
  // version. It's almost always a just-created, collapsed Orfeo/ — without this
  // the amber-highlighted file (and its File-info history) is invisible until
  // the user finds and opens that folder by hand. ───────────────────────────
  useEffect(() => {
    if (!libraryHighlightPath) return
    const folder = currentFolderOf(libraryHighlightPath)
    if (folder) setExpandedFolders(prev => (prev.has(folder) ? prev : new Set(prev).add(folder)))
  }, [libraryHighlightPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row click: plain click loads the file (existing behavior, unchanged) and
  // selects only that row; Ctrl/Cmd toggles it in the selection; Shift selects
  // the range from the last anchor. Modifier clicks never load a file. ────────
  const handleRowClick = (e: React.MouseEvent, filePath: string, orderedPaths: string[]) => {
    e.stopPropagation() // don't let the list-background click-to-clear handler fire right after this
    if (e.shiftKey && selectionAnchor) {
      const ai = orderedPaths.indexOf(selectionAnchor)
      const ci = orderedPaths.indexOf(filePath)
      if (ai !== -1 && ci !== -1) {
        const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai]
        setSelectedPaths(new Set(orderedPaths.slice(lo, hi + 1)))
      }
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths(prev => {
        const next = new Set(prev)
        if (next.has(filePath)) next.delete(filePath); else next.add(filePath)
        return next
      })
      setSelectionAnchor(filePath)
      return
    }
    setSelectedPaths(new Set([filePath]))
    setSelectionAnchor(filePath)
    handleLoadFile(filePath)
  }

  const handleFileDragStart = (e: React.DragEvent, filePath: string) => {
    if (isReadOnlyFolder(currentFolderOf(filePath))) { e.preventDefault(); return }
    const paths = selectedPaths.has(filePath) ? Array.from(selectedPaths) : [filePath]
    if (!selectedPaths.has(filePath)) { setSelectedPaths(new Set([filePath])); setSelectionAnchor(filePath) }
    setDraggingPaths(paths)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', filePath) // OS drag needs a payload even though we read draggingPaths directly
  }

  const handleFolderDrop = async (e: React.DragEvent, folder: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
    const paths = draggingPaths
    setDraggingPaths(null)
    if (!paths || paths.length === 0) return
    await moveFilesToFolder(paths, folder)
  }

  // ── Folder picker — opens Electron folder dialog and scans for MIDI files ─
  const handlePickFolder = async () => {
    try {
      const result = await window.electronAPI.openFolder()
      if (!result) return
      setLoading(true)
      const files = await window.electronAPI.scanMidiFolder(result)
      setLibraryFolderAndFiles(result, files)
      setLoading(false)
    } catch (err) {
      console.error('Failed to scan folder:', err)
      setLoading(false)
    }
  }

  // ── Refresh — re-scans the current folder for new or removed MIDI files ──
  const handleRefresh = async () => {
    if (!libraryFolder) return
    setLoading(true)
    setLibraryNeedsRefresh(false)
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch {}
    setLoading(false)
  }

  // ── File loader — reads MIDI from disk and parses into store state ────────
  // loadRequestIdRef guards against overlapping loads: clicking a second library
  // row before the first file's async chain (confirm dialogs, IPC round-trip,
  // parse) has resolved used to let both run concurrently, with whichever
  // resolved last winning setMidi() regardless of click order — visible as the
  // app appearing to hang with the wrong (or seemingly several) file(s) selected.
  const loadRequestIdRef = useRef(0)
  const handleLoadFile = useCallback(async (filePath: string) => {
    const requestId = ++loadRequestIdRef.current
    const canDiscard = await confirmDiscardDirtyNoteEdits('Save changes before opening this file?')
    if (!canDiscard || requestId !== loadRequestIdRef.current) return
    try {
      const proceed = await confirmPendingImportBeforeSwitch(filePath)
      if (!proceed || requestId !== loadRequestIdRef.current) return

      const result = await window.electronAPI.loadMidiFromPath(filePath)
      if (!result || requestId !== loadRequestIdRef.current) return

      let base64    = result.base64
      let resolvedFilePath = filePath
      let parseName = result.fileName
      const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null

      try {
        const resolved = await resolveAndTrackImport(filePath, base64, result.fileName, libraryFolder)
        base64 = resolved.base64
        resolvedFilePath = resolved.filePath
        parseName = resolved.fileName
      } catch (e: any) {
        console.error('[Orfeo] Foreign format conversion failed:', e)
        return
      }
      if (requestId !== loadRequestIdRef.current) return

      const bytes  = base64ToBytes(base64)
      // _filePath = original source, or the on-disk .mid cache once saved (see resolveAndTrackImport)
      const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, resolvedFilePath)
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }, [])

  // ── Fuzzy search — same Fuse.js convention as ChordExplorer (threshold 0.2,
  // ignoreLocation so a match anywhere in the name counts, not just a prefix).
  // Searches by filename only — that's what "artist/song name" resolves to,
  // since library entries don't carry separate metadata.
  const libraryFuse = useMemo(() => new Fuse(libraryFiles, {
    keys: ['name'],
    threshold: 0.2,
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
    useExtendedSearch: false,
  }), [libraryFiles])

  // ── Group files — root files first, then one entry per subfolder ─────────
  // Hidden files are filtered here so the rest of the render sees a clean list.
  // While actively searching, folder grouping is bypassed entirely — a
  // fuzzy match can live in any subfolder, so results render as one flat
  // list instead (this is what "search the whole midi folder" means).
  type FileGroup = { folder: string | null; files: LibraryFile[] }
  const grouped: FileGroup[] = useMemo(() => {
    const hiddenSet = new Set(hiddenLibraryFiles)
    // When revealed, hidden files stay in the list (dimmed at render time) —
    // otherwise they're excluded here so the rest of the render sees a clean list.
    const isExcluded = (f: LibraryFile) => !showHiddenLibraryFiles && hiddenSet.has(f.path)

    if (librarySearch.trim()) {
      const matches = libraryFuse.search(librarySearch.trim())
        .map(r => r.item)
        .filter(f => !isExcluded(f))
      return [{ folder: null, files: matches }]
    }

    // ── Starred filter — flat list across all folders, not grouped by folder.
    // Files stay physically wherever they are on disk; this tab is just a
    // cross-folder view of everything currently favourited. ─────────────────
    if (filter === 'starred') {
      const matches = libraryFiles.filter(f => libraryFavourites.has(f.path) && !isExcluded(f))
      return [{ folder: null, files: matches }]
    }

    // The loaded file additionally gets its own always-visible pinned bar
    // above this list (see render below) — it still renders here too, at its
    // normal alphabetical spot inside its folder, so a folder's contents
    // never look like a file went missing just because it's the loaded one.
    const allFiles = libraryFiles.filter((f: LibraryFile) => !isExcluded(f))

    const rootFiles: LibraryFile[] = []
    const folderMap = new Map<string, LibraryFile[]>()

    for (const file of allFiles) {
      if (!libraryFolder) { rootFiles.push(file); continue }
      const normFile = file.path.replace(/\\/g, '/')
      const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
      const rel = normFile.startsWith(normRoot)
        ? normFile.slice(normRoot.length).replace(/^\//, '')
        : file.name
      const parts = rel.split('/')
      if (parts.length <= 1) {
        rootFiles.push(file)
      } else {
        const folder = parts[0]
        if (!folderMap.has(folder)) folderMap.set(folder, [])
        folderMap.get(folder)!.push(file)
      }
    }

    // ── Include empty folders too (no midi files yet), so a freshly-created or
    // pre-existing-on-disk empty folder still gets a row to drop files into ──
    if (!librarySearch.trim()) {
      for (const name of libraryFolderNames) if (!folderMap.has(name)) folderMap.set(name, [])
    }

    // Folders first, then root files — root stays in natural (alphabetical, since
    // scanMidiFolder already sorts that way) order regardless of favourite status.
    // Starred-first grouping only applies inside the dedicated "starred" filter tab.
    const result: FileGroup[] = []

    // ── Sort folders: Orfeo always topmost, Demo pinned next, rest alphabetical ──
    Array.from(folderMap.entries())
      .sort((a, b) => {
        if (a[0].toLowerCase() === 'orfeo') return -1
        if (b[0].toLowerCase() === 'orfeo') return 1
        if (a[0].toLowerCase() === 'demo') return -1
        if (b[0].toLowerCase() === 'demo') return 1
        return a[0].localeCompare(b[0])
      })
      .forEach(([folder, files]) => result.push({ folder, files }))

    // Root files at the bottom
    result.push({ folder: null, files: rootFiles })

    return result
  }, [libraryFiles, libraryFavourites, libraryFolder, filter, hiddenLibraryFiles, showHiddenLibraryFiles, librarySearch, libraryFuse, libraryFolderNames])

  // ── Flat visible file order (collapsed folders excluded) — anchors Shift-range select ──
  const visibleFilePaths = useMemo(
    () => grouped.flatMap(g => (!g.folder || expandedFolders.has(g.folder)) ? g.files.map(f => f.path) : []),
    [grouped, expandedFolders],
  )

  const realFolders = libraryFolderNames.filter(f => !isProtectedFolder(f)).sort((a, b) => a.localeCompare(b))
  const folderIsEmpty = (folder: string) => (grouped.find(g => g.folder === folder)?.files.length ?? 0) === 0

  // ── The loaded file, pinned in its own bar above the list (see render below)
  // instead of relying on CSS sticky — sticky only holds an element in place
  // while its normal scroll position is still in view; it doesn't pull the
  // element out of a collapsed folder or up from wherever it sorts alphabetically.
  // Pinning is a real reorder: excluded from `grouped` above, shown here instead. ──
  const loadedFile = loadedFilePath
    ? libraryFiles.find(f => f.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/'))
    : undefined
  const loadedFileFolder = loadedFile ? currentFolderOf(loadedFile.path) : null
  // Every other sticky header stacks below the pinned bar when one is showing.
  const pinnedBarOffset = loadedFile ? FOLDER_HEADER_HEIGHT : 0

  const toggleFolder = (folder: string) => setExpandedFolders(prev => {
    const next = new Set(prev)
    if (next.has(folder)) next.delete(folder); else next.add(folder)
    return next
  })

  const starredCount = Array.from(libraryFavourites).filter(p => libraryFiles.some(f => f.path === p)).length
  const hasAnyFiles = grouped.some(g => g.files.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Folder picker row ── */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-tile)', flexShrink: 0 }}>
        {libraryFolder ? (
          <div>
            {/* Current folder display */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px', background: 'var(--bg-row)', borderRadius: 4,
              border: '1px solid var(--border2)', marginBottom: 6,
            }}>
              <Tooltip title="Change library folder" oneLine wrapperStyle={{ flexShrink: 0 }}>
              <button
                onClick={handlePickFolder}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
              >
                <FolderOpen size={11} style={{ color: 'var(--text-amber)' }} />
              </button>
              </Tooltip>
              {/* ── Fuzzy search — any artist/song/filename, across all subfolders ── */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                border: '1px solid var(--border2)', borderRadius: 4,
                padding: '2px 6px', background: 'var(--bg-modal-header)',
                minWidth: 0,
              }}>
                <Search size={10} style={{ color: 'var(--text-inactive)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={librarySearch}
                  onChange={e => setLibrarySearch(e.target.value)}
                  placeholder="Search your library"
                  style={{
                    flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
                    fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                  }}
                />
                {librarySearch && (
                  <Tooltip title="Clear search" oneLine>
                  <button
                    onClick={() => setLibrarySearch('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-inactive)' }}
                  >
                    <X size={10} />
                  </button>
                  </Tooltip>
                )}
              </div>
              <Tooltip title={libraryNeedsRefresh ? 'A file was saved — click to refresh the library' : 'Refresh library'} oneLine>
              <button
                onClick={handleRefresh}
                className={libraryNeedsRefresh ? 'loop-nudge-blink' : undefined}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: libraryNeedsRefresh ? 'var(--text-amber)' : 'var(--text-inactive)', padding: 2, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = libraryNeedsRefresh ? 'var(--text-amber)' : 'var(--text-inactive)'}
              >
                <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              </Tooltip>
            </div>

            {/* Active library path — click opens it in Explorer (shows files; the folder-picker dialog above never does, that's OS-level) */}
            <Tooltip title="Open in Explorer" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
            <div
              onClick={() => libraryFolder && window.electronAPI.openFolderInExplorer(libraryFolder)}
              style={{
                fontSize: 10, lineHeight: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                padding: '4px 2px', marginBottom: 6, cursor: 'pointer',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {libraryFolder}
            </div>
            </Tooltip>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {(['all', 'starred'] as const).map(f => (
                <Tooltip key={f} title={f === 'all' ? 'Show all files' : 'Show favorites only'} oneLine wrapperStyle={{ flex: 1 }}>
                <button
                  onClick={() => setFilter(f)}
                  style={{
                    flex: 1, padding: '3px 2px', borderRadius: 4, fontSize: 10,
                    border: filter === f ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
                    background: filter === f ? 'var(--accent-amber-medium)' : 'transparent',
                    color: filter === f ? 'var(--text-amber)' : 'var(--text-inactive)',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {f === 'all' ? `All (${libraryFiles.length})` : `★ ${starredCount}`}
                </button>
                </Tooltip>
              ))}
              <Tooltip title="New folder" oneLine>
              <button
                onClick={() => handleCreateFolder()}
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 10,
                  border: '1px solid var(--border2)', background: 'transparent',
                  color: 'var(--text-inactive)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
              >
                <Folders size={10} />
              </button>
              </Tooltip>
              <Tooltip title={showHiddenLibraryFiles ? 'Hide hidden files in library' : 'Reveal hidden files in library'} oneLine>
              <button
                onClick={() => setShowHiddenLibraryFiles(!showHiddenLibraryFiles)}
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 10,
                  border: showHiddenLibraryFiles ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
                  background: showHiddenLibraryFiles ? 'var(--accent-amber-medium)' : 'transparent',
                  color: showHiddenLibraryFiles ? 'var(--text-amber)' : 'var(--text-inactive)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!showHiddenLibraryFiles) e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { if (!showHiddenLibraryFiles) e.currentTarget.style.color = 'var(--text-inactive)' }}
              >
                <ChevronsDownUp size={10} />
              </button>
              </Tooltip>
            </div>
          </div>
        ) : (
          <button
            onClick={handlePickFolder}
            className="loop-nudge-blink"
            style={{
              width: '100%', padding: '8px 0', borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--text-amber)', background: 'transparent',
              color: 'var(--text-amber)', fontSize: 'var(--text-xs)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <FolderOpen size={13} />
            Set your MIDI folder
          </button>
        )}
      </div>

      {/* ── File list — also the library drop zone ── */}
      <div
        style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onScroll={() => setContextMenu(null)}
        onClick={() => setSelectedPaths(new Set())}
      >

        {/* ── Drag-over highlight — amber border + tint, pointer-events none ─── */}
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0,
            border: '2px solid var(--text-amber)',
            background: 'var(--accent-amber-tint-bg)',
            pointerEvents: 'none',
            zIndex: 10,
          }} />
        )}

        {/* ── Drop error toast — scoped inside the panel, auto-dismissed ─────── */}
        {dropError && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            background: 'var(--bg-panel2)', border: '1px solid var(--drag-handle-dot)',
            borderRadius: 5, padding: '6px 10px',
            color: 'var(--text-default)', fontSize: 'var(--text-xs)',
            textAlign: 'center', pointerEvents: 'none',
            zIndex: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            {dropError}
          </div>
        )}

        {/* ── Right-click context menu — position:fixed escapes panel overflow ── */}
        {contextMenu && (
          <ContextMenu ref={menuRef} x={contextMenu.x} y={contextMenu.y} ariaLabel="File actions">
            <ContextMenuItem
              onClick={() => { window.electronAPI.showItemInFolder(contextMenu.path); setContextMenu(null) }}
              title="Opens Windows Explorer with this file highlighted"
            >
              Show in folder
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const path = contextMenu.path
                const name = libraryFiles.find(f => f.path === path)?.name ?? path.split(/[\\/]/).pop() ?? path
                setFileInfoTarget({ path, name })
                setContextMenu(null)
              }}
              title="Tempo, key, artist/song, track count, and copyright — read-only"
            >
              File info
            </ContextMenuItem>

            <ContextMenuDivider />

            {hiddenLibraryFiles.includes(contextMenu.path) ? (
              <ContextMenuItem
                onClick={() => { unhideLibraryFile(contextMenu.path); setContextMenu(null) }}
                title="Restores this file to the normal library list"
              >
                Unhide
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onClick={() => { hideLibraryFile(contextMenu.path); setContextMenu(null) }}
                title="Hides this file from the library list — stays on disk, unaffected"
              >
                Hide from library
              </ContextMenuItem>
            )}

            {lastFolderOf.has(contextMenu.path) && (
              <ContextMenuItem
                onClick={() => { const path = contextMenu.path; setContextMenu(null); handleUndoMove(path) }}
                title="Moves this file back to where it was before its last move (this session only)"
              >
                Undo move
              </ContextMenuItem>
            )}

            {/* ── Organize actions — hidden only if EVERY selected file is protected
                (Demo/Orfeo). A mixed selection still shows this: the move backend
                already skips protected-folder files individually (fs:moveLibraryFiles
                in main.ts), so hiding the whole block for one protected file in an
                otherwise-movable multi-select blocked the rest for no reason. ────── */}
            {!Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path]).every(p => isReadOnlyFolder(currentFolderOf(p))) && (
              <>
                <ContextMenuDivider />
                <ContextMenuItem
                  onClick={async () => {
                    const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path])
                    setContextMenu(null)
                    const name = await handleCreateFolder()
                    if (name) await moveFilesToFolder(moveSet, name)
                  }}
                  title="Creates a new folder and moves the selected file(s) into it"
                >
                  New folder from selection
                </ContextMenuItem>
                {realFolders.length > 0 && (
                  <>
                    <ContextMenuLabel>Move to folder</ContextMenuLabel>
                    {realFolders.map(folder => (
                      <ContextMenuItem
                        key={folder}
                        onClick={() => { const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path]); setContextMenu(null); moveFilesToFolder(moveSet, folder) }}
                        title={`Moves the selected file(s) into "${folder}"`}
                      >
                        {folder}
                      </ContextMenuItem>
                    ))}
                    <ContextMenuItem
                      onClick={() => { const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path]); setContextMenu(null); moveFilesToFolder(moveSet, null) }}
                      title="Moves the selected file(s) out of their folder, back to the library root"
                    >
                      Library root
                    </ContextMenuItem>
                  </>
                )}
              </>
            )}
          </ContextMenu>
        )}

        {/* ── Folder right-click menu — Rename / Move selection here / Delete ── */}
        {folderContextMenu && (
          <ContextMenu ref={folderMenuRef} x={folderContextMenu.x} y={folderContextMenu.y} minWidth={180} ariaLabel="Folder actions">
            <ContextMenuItem
              onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); if (libraryFolder) window.electronAPI.openFolderInExplorer(`${libraryFolder}/${folder}`) }}
              title="Opens this folder in File Explorer"
            >
              Show in explorer
            </ContextMenuItem>
            {!isProtectedFolder(folderContextMenu.folder) && (<>
              <ContextMenuItem
                onClick={() => { setRenamingFolder(folderContextMenu.folder); setRenameDraft(folderContextMenu.folder); setFolderContextMenu(null) }}
                title="Renames this folder on disk"
              >
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); moveFilesToFolder(Array.from(selectedPaths), folder) }}
                disabled={selectedPaths.size === 0}
                title={selectedPaths.size === 0 ? 'Select file(s) first' : `Moves the ${selectedPaths.size} selected file(s) into this folder`}
              >
                Move {selectedPaths.size || ''} selected files here
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); handleDeleteFolder(folder) }}
                disabled={!folderIsEmpty(folderContextMenu.folder)}
                danger
                title={!folderIsEmpty(folderContextMenu.folder) ? 'Move files out first' : 'Deletes this empty folder from disk'}
              >
                Delete
              </ContextMenuItem>
            </>)}
          </ContextMenu>
        )}

        {/* ── Pinned active file — always the first thing visible, regardless of
            scroll position or folder expand/collapse. Still renders at its
            normal spot inside its folder too (see `grouped` above) — this is
            an always-visible SUMMARY, not a move, so a folder's contents never
            look incomplete just because one of them is the loaded file.
            Exactly FOLDER_HEADER_HEIGHT tall (single line, no wrapping) so
            every other sticky header's offset math below stays correct — a
            taller pinned bar would visually overlap the header stacked right
            under it. ─────────────────────────────────────────────────────── */}
        {loadedFile && (() => {
          const starred = libraryFavourites.has(loadedFile.path)
          const fmt = detectForeignFormat(loadedFile.path)
          const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
          return (
            <RowTooltip title="Right-click for options" wrapperStyle={{ position: 'sticky', top: 0, zIndex: 5 }}>
              {suppress => (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 10px', minHeight: FOLDER_HEADER_HEIGHT, boxSizing: 'border-box',
                  background: 'var(--panel)',
                  borderBottom: '1px solid var(--accent-amber-strong)',
                }}
                onContextMenu={e => handleContextMenu(e, loadedFile!.path)}
              >
                {chordTranscriptionEnabled ? (
                  <TranscriptIcon filePath={loadedFile.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} onHoverChange={suppress} isLoaded />
                ) : (
                  <RowIcon size={11} strokeWidth={1.5} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <MarqueeText name={loadedFile.name.replace(/\.(mid|midi)$/i, '')} spanStyle={FILENAME_SPAN_ACTIVE} />
                  {loadedFileFolder && (
                    <span style={{ fontSize: 8, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{loadedFileFolder}</span>
                  )}
                </div>
                {lastFolderOf.has(loadedFile.path) && (
                  <RowIconButton
                    tooltip={`Move back to ${lastFolderOf.get(loadedFile.path) ?? 'library root'}`}
                    onClick={e => { e.stopPropagation(); handleUndoMove(loadedFile!.path) }}
                    onHoverChange={suppress}
                    style={{ padding: '2px 3px' }}
                  >
                    <Undo2 size={11} />
                  </RowIconButton>
                )}
                <TempoWarningDot path={loadedFile.path} onHoverChange={suppress} />
                <FavouriteStar
                  starred={starred}
                  title={starred ? 'Remove from favourites' : 'Add to favourites'}
                  onClick={e => { e.stopPropagation(); toggleFavourite(loadedFile!.path) }}
                  onHoverChange={suppress}
                  style={{ padding: '2px 3px' }}
                />
              </div>
              )}
            </RowTooltip>
          )
        })()}

        {/* Empty state */}
        {libraryFolder && !hasAnyFiles && (
          <div style={{ padding: '16px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            {librarySearch.trim()
              ? `No files matching "${librarySearch.trim()}".`
              : filter === 'starred' ? 'No starred files yet.\nStar a file with ★' : 'No MIDI files found.'}
          </div>
        )}

        {/* ── Standalone demo section shown when no library folder is set ─────── */}
        {!libraryFolder && !hideDemoFolder && demoFiles.length > 0 && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', background: 'var(--bg-row)',
              borderBottom: '1px solid var(--bg-tile)',
            }}>
              <FolderOpen size={12} style={{ color: 'var(--accent-amber-icon-dim)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600 }}>Demo</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{demoFiles.length}</span>
            </div>
            {demoFiles.filter((f: { name: string; path: string }) => showHiddenLibraryFiles || !hiddenLibraryFiles.includes(f.path)).map(file => {
              const isLoaded = !!loadedFilePath &&
                file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
              const isHidden = hiddenLibraryFiles.includes(file.path)
              const fmt = detectForeignFormat(file.path)
              const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
              return (
                <RowTooltip key={file.path} title="Right-click for options">
                {suppress => (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 10px 8px 26px', borderBottom: '1px solid var(--border-row)',
                    cursor: 'pointer', transition: 'background 0.08s',
                    background: isLoaded ? 'var(--accent-amber-medium)' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isLoaded ? 'var(--accent-amber-medium)' : 'var(--bg-tile)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isLoaded ? 'var(--accent-amber-medium)' : 'transparent'}
                  onClick={() => handleLoadFile(file.path)}
                  onContextMenu={e => handleContextMenu(e, file.path)}
                >
                  {/* ── Icon doubles as transcript trigger when transcription is on; otherwise shows format-specific icon ── */}
                  {chordTranscriptionEnabled ? (
                    <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} onHoverChange={suppress} isLoaded={isLoaded} />
                  ) : (
                    <RowIcon size={11} strokeWidth={1.5} style={{ color: isHidden ? 'var(--text-amber-dimmest)' : isLoaded ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                  <MarqueeText name={file.name.replace(/\.(mid|midi)$/i, '')} spanStyle={isHidden ? FILENAME_SPAN_HIDDEN : isLoaded ? FILENAME_SPAN_ACTIVE : FILENAME_SPAN_DEFAULT} />
                </div>
                )}
                </RowTooltip>
              )
            })}
          </div>
        )}

        {/* ── "Folders" section — one collapsible row for the whole stack of folder
            groups, so a large library can be collapsed down to just its root files.
            Sticky at the very top; individual folder headers stick right beneath it. ── */}
        {grouped.some(g => g.folder && !(hideDemoFolder && g.folder.toLowerCase() === 'demo')) && (
          <div
            onClick={() => setFoldersSectionExpanded(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', minHeight: FOLDER_HEADER_HEIGHT, boxSizing: 'border-box',
              background: 'var(--bg-row)', borderBottom: '1px solid var(--bg-tile)',
              cursor: 'pointer', userSelect: 'none',
              position: 'sticky', top: pinnedBarOffset, zIndex: 4,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#111120'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)'}
          >
            {foldersSectionExpanded
              ? <ChevronDown size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
              : <ChevronRight size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600 }}>Folders</span>
          </div>
        )}

        {/* ── hideDemoFolder filters the Demo subfolder from display ───────── */}
        {grouped.filter(g => !(hideDemoFolder && g.folder?.toLowerCase() === 'demo')).map((group, gi) => {
          if (group.folder && !foldersSectionExpanded) return null
          const protectedFolder = isProtectedFolder(group.folder)
          const isDropTarget = !!group.folder && !protectedFolder && dragOverFolder === group.folder
          return (
          <div key={group.folder ?? '__root__'}>

            {/* Subfolder header — only for named folders (includes empty ones). Drag/drop
                and the undo/star icons stay live even while renaming — a folder created via
                "New folder"/"New folder from selection" auto-enters rename mode immediately,
                and files dropped or moved into it during that window need to still work and
                still show their undo affordance, not silently no-op behind a bare input. ── */}
            {group.folder && (() => {
                const isRenaming = renamingFolder === group.folder
                const isExpanded = expandedFolders.has(group.folder!)
                const isProtectedHover = protectedFolder && dragOverFolder === group.folder
                const folderHasUndo = foldersWithUndo.has(group.folder!)
                const folderAllStarred = group.files.length > 0 && group.files.every(f => libraryFavourites.has(f.path))
                // Same "Right-click for options" wording/style as file rows — this used
                // to spell out the whole action list ("Expand folder — right-click for
                // rename/delete/move options") in the amber heading, with no description
                // row, which overflowed the tooltip's own maxWidth since a heading is
                // whiteSpace:nowrap by design (meant for short labels, not full sentences).
                const folderRowTitle = isRenaming || protectedFolder ? undefined : 'Right-click for options'
                const folderRow = (suppress: (on: boolean) => void) => (
                <div
                  onClick={e => { e.stopPropagation(); if (!isRenaming) toggleFolder(group.folder!) }}
                  onContextMenu={e => handleFolderContextMenu(e, group.folder!)}
                  onDragOver={e => {
                    setDragOverFolder(group.folder!)
                    if (!protectedFolder) e.preventDefault() // protected: no preventDefault → OS shows its own "no drop" cursor
                  }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolder(null) }}
                  onDrop={e => !protectedFolder && handleFolderDrop(e, group.folder!)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', minHeight: FOLDER_HEADER_HEIGHT, boxSizing: 'border-box',
                    background: isDropTarget ? 'var(--accent-amber-subtle)' : isProtectedHover ? 'var(--status-protected-tint-bg)' : 'var(--bg-row)',
                    outline: isDropTarget ? '1px solid var(--accent-amber-strong)' : isProtectedHover ? '1px solid var(--status-protected)' : 'none',
                    outlineOffset: -1,
                    borderBottom: '1px solid var(--bg-tile)',
                    borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                    cursor: isRenaming ? 'default' : 'pointer', userSelect: 'none',
                  }}
                  onMouseEnter={e => { if (!isDropTarget && !isProtectedHover) (e.currentTarget as HTMLElement).style.background = '#111120' }}
                  onMouseLeave={e => { if (!isDropTarget && !isProtectedHover) (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)' }}
                >
                  {/* ── Expanded indicator — dim chevron, shown only while this folder's
                      files are visible below; collapsed folders show just the plain icon ── */}
                  {isExpanded && (
                    <ChevronDown size={9} style={{ color: 'var(--text-amber-dimmest)', flexShrink: 0 }} />
                  )}
                  <FolderOpen size={12} style={{ color: 'var(--accent-amber-icon-dim)', flexShrink: 0 }} />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setRenameDraft(e.target.value)}
                      onFocus={e => e.currentTarget.select()}
                      onBlur={commitFolderRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenamingFolder(null)
                      }}
                      style={{
                        flex: 1, minWidth: 0, background: 'var(--bg-modal-header)',
                        border: '1px solid var(--accent-amber-strong)', borderRadius: 3,
                        color: 'var(--text-default)', fontSize: 'var(--text-xs)', padding: '2px 5px',
                      }}
                    />
                  ) : (
                    <span style={{
                      flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {group.folder}
                    </span>
                  )}
                  {/* ── Live drag feedback — native title tooltips don't reliably show mid-drag ── */}
                  {isProtectedHover && (
                    <span style={{ fontSize: 9, color: 'var(--status-protected)', flexShrink: 0, whiteSpace: 'nowrap' }}>Can't move to system folder</span>
                  )}
                  {isDropTarget && (
                    <span style={{ fontSize: 9, color: 'var(--text-amber)', flexShrink: 0, whiteSpace: 'nowrap' }}>Move to {group.folder}</span>
                  )}
                  {!protectedFolder && folderHasUndo && (
                    <RowIconButton
                      tooltip="Undo all moves into this folder (this session only)"
                      onClick={e => { e.stopPropagation(); handleUndoFolder(group.folder!, group.files) }}
                      onHoverChange={suppress}
                      style={{ padding: '1px 2px' }}
                    >
                      <Undo2 size={10} />
                    </RowIconButton>
                  )}
                  {!protectedFolder && group.files.length > 0 && (
                    <FavouriteStar
                      starred={folderAllStarred}
                      title={folderAllStarred ? 'Unstar all songs in this folder' : 'Star all songs in this folder'}
                      onClick={e => { e.stopPropagation(); handleToggleFolderFavourites(group.files) }}
                      onHoverChange={suppress}
                      style={{ padding: '1px 2px' }}
                    />
                  )}
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {group.files.length}
                  </span>
                </div>
                )
                return (
                  <RowTooltip
                    title={folderRowTitle}
                    wrapperStyle={{ position: 'sticky', top: pinnedBarOffset + FOLDER_HEADER_HEIGHT, zIndex: 3 }}
                  >
                    {folderRow}
                  </RowTooltip>
                )
              })()}

            {/* ── Divider between the folders' content and the root library files —
                only when the Folders section is actually showing folder rows above,
                so root files don't visually read as trailing off the last folder ── */}
            {!group.folder && foldersSectionExpanded && group.files.length > 0 &&
              grouped.some(g => g.folder && !(hideDemoFolder && g.folder.toLowerCase() === 'demo')) && (
              <div style={{ height: 1, margin: '4px 10px', background: 'var(--text-amber-dimmest)' }} />
            )}

            {/* Files inside this group — hidden when folder is collapsed */}
            {(!group.folder || expandedFolders.has(group.folder)) && group.files.map((file) => {
              const starred   = libraryFavourites.has(file.path)
              const isLoaded  = !!loadedFilePath &&
                file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
              const isSelected = selectedPaths.has(file.path)
              const isHidden  = hiddenLibraryFiles.includes(file.path)
              // ── Briefly amber-highlighted right after an auto-refreshed save (see
              // notifyLibrarySaved in store/index.ts) — clears itself after ~2.5s. ──
              const isJustSaved = !!libraryHighlightPath &&
                file.path.replace(/\\/g, '/') === libraryHighlightPath.replace(/\\/g, '/')
              // ── Cell border+background is reserved for multi-select (2+ files, the
              // drag/create-folder gesture) — a single selected/loaded file only gets
              // its icon+filename highlighted amber, no cell decoration. ─────────────
              const isMultiSelected = isSelected && selectedPaths.size >= 2
              const fmt = detectForeignFormat(file.path)
              const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
              // Loaded row is sticky (see below) so its background must be opaque, not
              // the translucent amber tint — otherwise rows scrolling underneath bleed
              // through. Reads as a plain/unselected row; the amber filename still
              // marks it as loaded. isJustSaved takes priority over both — it's a
              // temporary flash, not a persistent state.
              const rowBg = isJustSaved ? 'var(--accent-amber-subtle)' : isLoaded ? 'var(--panel)' : isMultiSelected ? 'var(--accent-amber-subtle)' : 'transparent'
              // ── Draw one bordered "box" around each contiguous run of selected rows,
              // instead of an outline on every individual row — top/bottom border only
              // where the neighbor in visual order isn't also selected. ────────────────
              const rowIndex = visibleFilePaths.indexOf(file.path)
              const prevSelected = isMultiSelected && rowIndex > 0 && selectedPaths.has(visibleFilePaths[rowIndex - 1])
              const nextSelected = isMultiSelected && rowIndex < visibleFilePaths.length - 1 && selectedPaths.has(visibleFilePaths[rowIndex + 1])
              const selectionBorder = '2px solid var(--accent-amber-strong)'
              return (
                <RowTooltip key={file.path} title="Right-click for options">
                  {suppress => (
                  <div
                    draggable={!protectedFolder}
                    className={isJustSaved ? 'loop-nudge-blink' : undefined}
                    onDragStart={e => handleFileDragStart(e, file.path)}
                    onDragEnd={() => setDraggingPaths(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      // Indent subfolder files slightly
                      padding: group.folder ? '8px 10px 8px 26px' : '8px 10px 8px 12px',
                      cursor: 'pointer', transition: 'background 0.08s',
                      background: rowBg,
                      borderLeft: isMultiSelected ? selectionBorder : 'none',
                      borderRight: isMultiSelected ? selectionBorder : 'none',
                      borderTop: isMultiSelected && !prevSelected ? selectionBorder : 'none',
                      borderBottom: isMultiSelected && !nextSelected ? selectionBorder : '1px solid var(--border-row)',
                      marginTop: isMultiSelected && !prevSelected ? -1 : 0,
                    }}
                    // Hover only repaints plain (unselected, unloaded) rows — selected/loaded rows
                    // keep their amber background on hover instead of flashing to the same gray
                    // used for plain hover, which is what made "selected" read as gray before.
                    onMouseEnter={e => { if (!isLoaded && !isMultiSelected && !isJustSaved) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tile)' }}
                    onMouseLeave={e => { if (!isLoaded && !isMultiSelected && !isJustSaved) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    onClick={e => handleRowClick(e, file.path, visibleFilePaths)}
                    onContextMenu={e => handleContextMenu(e, file.path)}
                  >
                    {/* ── Icon doubles as transcript trigger when transcription is on; otherwise shows format-specific icon ── */}
                    {chordTranscriptionEnabled ? (
                      <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} onHoverChange={suppress} isLoaded={isLoaded || isJustSaved} />
                    ) : (
                      <RowIcon size={11} strokeWidth={1.5} style={{ color: isHidden ? 'var(--text-amber-dimmest)' : isLoaded || isSelected || isJustSaved ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                    <MarqueeText name={file.name.replace(/\.(mid|midi)$/i, '')} spanStyle={isHidden ? FILENAME_SPAN_HIDDEN : isLoaded || isSelected || isJustSaved ? FILENAME_SPAN_ACTIVE : FILENAME_SPAN_DEFAULT} />
                    {lastFolderOf.has(file.path) && (
                      <RowIconButton
                        tooltip={`Move back to ${lastFolderOf.get(file.path) ?? 'library root'}`}
                        onClick={e => { e.stopPropagation(); handleUndoMove(file.path) }}
                        onHoverChange={suppress}
                        style={{ padding: '2px 3px' }}
                      >
                        <Undo2 size={11} />
                      </RowIconButton>
                    )}
                    <TempoWarningDot path={file.path} onHoverChange={suppress} />
                    <FavouriteStar
                      starred={starred}
                      title={starred ? 'Remove from favourites' : 'Add to favourites'}
                      onClick={e => { e.stopPropagation(); toggleFavourite(file.path) }}
                      onHoverChange={suppress}
                      style={{ padding: '2px 3px' }}
                    />
                  </div>
                  )}
                </RowTooltip>
              )
            })}
          </div>
          )
        })}

        {/* ── Library-root drop zone — moves dragged files back to root ─────── */}
        {draggingPaths && (
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverFolder('__root__') }}
            onDragLeave={() => setDragOverFolder(null)}
            onDrop={e => handleFolderDrop(e, null)}
            style={{
              padding: '10px', margin: '6px 10px', borderRadius: 4, textAlign: 'center',
              fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              border: `1px dashed ${dragOverFolder === '__root__' ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
              background: dragOverFolder === '__root__' ? 'var(--accent-amber-subtle)' : 'transparent',
            }}
          >
            Drop here to move to library root
          </div>
        )}
      </div>

      {fileInfoTarget && (
        <FileInfoModal
          filePath={fileInfoTarget.path}
          fileName={fileInfoTarget.name}
          onClose={() => setFileInfoTarget(null)}
          onRenamed={(oldPath, newPath, newName) => {
            setLibraryFiles(libraryFiles.map(f => f.path === oldPath ? { path: newPath, name: newName } : f))
            remapLibraryPaths([{ oldPath, newPath }])
            // Currently-loaded file got renamed underneath it — patch the store's
            // in-memory path/name so a subsequent Playback Editor save resolves
            // against the new location instead of a path that no longer exists.
            if (loadedFilePath && loadedFilePath.replace(/\\/g, '/') === oldPath.replace(/\\/g, '/')) {
              useStore.setState(s => s.midi ? { midi: { ...(s.midi as any), _filePath: newPath, fileName: newName } } : {})
            }
            setFileInfoTarget({ path: newPath, name: newName })
          }}
        />
      )}
    </div>
  )
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

type DrawerTab = 'settings' | 'library'


export default function SettingsPanel() {
  // ── Update check, app zoom, sound sets: shared with the Settings window ──
  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const [activeTab, setActiveTab] = useState<DrawerTab>('library')
  const didInit = useRef(false)
  // ── Init — ensures panel is open on first mount ───────────────────────────
  useEffect(() => {
    if (!didInit.current) { didInit.current = true; if (!settingsPanelOpen) setSettingsPanelOpen(true) }
  }, [])




  return (
    <div style={{
      // Match TrackPanel width exactly: 260px open, 32px collapsed
      width: settingsPanelOpen ? 260 : 32,
      background: 'var(--bg-modal)',
      borderRight: '1px solid var(--border2)',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* ── Closed state: 3-icon column ────────────────────────────────────── */}
      {!settingsPanelOpen && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          height: '100%', paddingTop: 10, paddingBottom: 10,
        }}>
          <Tooltip title="Open Library" description="Browse and load MIDI files from your library folder.">
          <button
            onClick={() => { setActiveTab('library'); setSettingsPanelOpen(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <Library size={18} />
          </button>
          </Tooltip>
          <Tooltip title={t`Open Setup`} description={t`The everyday switches — sound engine, note names, keyboard, piano roll and more.`}>
          <button
            onClick={() => { setActiveTab('settings'); setSettingsPanelOpen(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4, marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <Settings2 size={18} />
          </button>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Tooltip title="Coming soon" oneLine>
          <button
            style={{
              background: 'none', border: 'none', cursor: 'default',
              color: 'var(--text-inactive)', padding: 4, opacity: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Info size={18} />
          </button>
          </Tooltip>
        </div>
      )}

      {settingsPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* ── Collapse button: chevron only, dynamic tooltip ────────────────── */}
          <Tooltip title="Close panel" placement="left" oneLine>
          <button
            onClick={() => setSettingsPanelOpen(false)}
            style={{
              position: 'absolute', top: 10, right: 0, zIndex: 10,
              padding: '4px 5px', borderRadius: '4px 0 0 4px',
              background: 'var(--bg-tile)', border: '1px solid var(--border2)', borderRight: 'none',
              color: 'var(--text-dimmest)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <ChevronLeft size={15} />
          </button>
          </Tooltip>

          {/* ── Tab bar: Library / Settings, left-aligned with content ─────── */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {([
              { id: 'library',  icon: <Library size={16} />,  label: 'Library'  },
              { id: 'settings', icon: <Settings2 size={16} />, label: t`Setup` },
            ] as { id: DrawerTab; icon: React.ReactNode; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, height: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                  paddingLeft: 'var(--space-3)', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid var(--text-amber)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--text-amber)' : 'var(--text-inactive)',
                  fontSize: 12, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  transition: 'color 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Open settings — pinned at the top of Setup, never scrolls away ── */}
          {activeTab === 'settings' && (
            <div style={{ flexShrink: 0, padding: '8px 14px', borderBottom: '1px solid var(--bg-tile)' }}>
              <button onClick={() => useStore.getState().openSettingsWindow()}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '7px 10px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-medium)', color: 'var(--text-amber)',
                  fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}>
                <Settings size={13} strokeWidth={1.5} /> {t`Open settings`}
              </button>
            </div>
          )}

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'library' ? (
              <LibraryPanel />
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

                <QuickSettings />
              </div>
            )}
          </div>

          {/* ── Manual link + update check — always visible at drawer bottom ── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid var(--bg-tile)',
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Tooltip title="Open user manual" oneLine wrapperStyle={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => window.electronAPI.openExternal('https://orfeo.cc/docs')}
              style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '4px 0',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <BookOpen size={11} strokeWidth={1.5} />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>User Manual</span>
            </button>
            </Tooltip>
            <UpdateButton />
          </div>

        </div>
      )}
    </div>
  )
}


