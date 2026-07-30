import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { NES } from '../../utils/noteEditorState'
import { confirmDialog } from '../../utils/confirmController'
import {
  ChevronLeft, ChevronDown, ChevronRight, Type, Piano, Palette, ZoomIn, Volume2,
  Music, FolderOpen, RefreshCw, FileMusic, FileCode2, Guitar, BookOpen, Library, Settings, Info,
  Eye,
} from 'lucide-react'
import { useStore } from '../../store'
import type { NoteNaming, KeyboardSize, Accidentals, TranscriptEntry } from '../../types'
import type { AppTheme } from '../../store'
import { initSamplesEngine } from '../../hooks/useSamplesEngine'
import { MarqueeText } from '../MarqueeText'
import { detectForeignFormat } from '../../utils/foreignFormatImport'

// ── EyeClosed — custom icon replacing lucide EyeOff throughout settings ───────
function EyeClosed({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-.722-3.25"/>
      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
      <path d="m20 15-1.726-2.05"/>
      <path d="m4 15 1.726-2.05"/>
      <path d="m9 18 .722-3.25"/>
    </svg>
  )
}

// ── Spin keyframe for transcript loading animation ────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('orfeo-transcript-anim')) {
  const s = document.createElement('style')
  s.id = 'orfeo-transcript-anim'
  s.textContent = '@keyframes orfeo-transcript-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}

// ─── Shared sub-components ──────────────────────────────────────────────────

// ── BETA badge — inline label pill for settings still being refined ──────────
function BetaBadge() {
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, fontFamily: 'Inter',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--status-error)',
      border: '1px solid var(--status-error)',
      borderRadius: 'var(--radius-sm)',
      padding: '1px 4px',
      lineHeight: 1,
      opacity: 0.85,
      flexShrink: 0,
    }}>
      BETA
    </span>
  )
}

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

// ── Option row — labeled setting block with optional hint text and badge ───
// Supports two variants:
//   Standard:   label + children controls + optional hint below
//   Eye-toggle: name + icon share one flex row; description sits below full-width
function OptionRow({ label, children, hint, badge, eyeToggle, eyeValue, onEyeChange, description }: {
  label: string
  children?: React.ReactNode
  hint?: string
  badge?: React.ReactNode
  eyeToggle?: boolean
  eyeValue?: boolean
  onEyeChange?: (val: boolean) => void
  description?: string
}) {
  // ── Eye-toggle variant — name left + icon right on one row, description below ──
  if (eyeToggle) {
    return (
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-row)' }}>
        {/* ── Name + icon row — space-between keeps icon flush to the right edge ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: description ? 4 : 0,
        }}>
          {/* ── Feature name — --text-default (bright) creates hierarchy over dim description ── */}
          <div style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-default)',
            fontWeight: 500, letterSpacing: '0.02em',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {label}
            {badge}
          </div>
          {/* ── Eye icon — same line as name, right-aligned ── */}
          <button
            onClick={() => onEyeChange?.(!eyeValue)}
            title={eyeValue ? 'Click to hide' : 'Click to show'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: eyeValue ? 'var(--status-success)' : 'var(--status-error)',
              display: 'flex', alignItems: 'center', flexShrink: 0,
              transition: 'opacity 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {eyeValue
              ? <Eye    size={14} strokeWidth={1.5} />
              : <EyeClosed size={14} strokeWidth={1.5} />
            }
          </button>
        </div>
        {/* ── Description — --text-xs token (owned here, not by callers) + 85% width clears icon ── */}
        {description && (
          <div style={{
            maxWidth: '85%',
            fontSize: 'var(--text-xs)', color: 'var(--text-dimmest)',
            lineHeight: 1.5, fontFamily: 'Inter',
          }}>
            {description}
          </div>
        )}
      </div>
    )
  }

  // ── Standard variant — label bright, hint dim; same token sizes as eye-toggle ──
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-row)' }}>
      {/* ── Label row — --text-default (bright) to match eye-toggle name hierarchy ── */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', marginBottom: 6, fontWeight: 500, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {badge}
      </div>
      {children}
      {/* ── Hint — --text-xs token + --text-dimmest matches description hierarchy ── */}
      {hint && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dimmest)', marginTop: 5, fontFamily: 'Inter' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── Collapsible section — clickable header row (amber icon + label + chevron) that
// mounts/unmounts children; amber color applied once here, propagates to all 7 groups.
function CollapsibleSection({ icon, label, defaultCollapsed = false, collapsed: controlledCollapsed, onToggle, children }: {
  icon: React.ReactNode
  label: string
  defaultCollapsed?: boolean
  collapsed?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed)
  const isControlled = controlledCollapsed !== undefined
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed
  const toggle = isControlled ? (onToggle ?? (() => {})) : () => setInternalCollapsed(c => !c)

  return (
    <div>
      {/* ── Header row — click anywhere to expand/collapse ── */}
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'var(--bg-row)',
          borderTop: '1px solid var(--bg-tile)',
          borderBottom: '1px solid var(--bg-tile)',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-tile)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)'}
      >
        {/* ── Group icon — amber ── */}
        <span style={{ color: 'var(--text-amber)', display: 'flex', alignItems: 'center' }}>{icon}</span>
        {/* ── Group label — amber uppercase ── */}
        <span style={{
          flex: 1, fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-amber)',
        }}>
          {label}
        </span>
        {/* ── Chevron — amber; down = expanded, right = collapsed ── */}
        {collapsed
          ? <ChevronRight size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
          : <ChevronDown  size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        }
      </div>
      {/* ── Content — unmounted when collapsed ── */}
      {!collapsed && children}
    </div>
  )
}

// ── Option button — green-tinted pill toggle for multi-choice settings rows
// activeColor: 'success' (default, green) | 'error' (red — used for Hide/EyeOff)
// No amber accent token exists for green-tint bg, so rgba fallback is intentional.
function OptionBtn({ active, onClick, children, title, comingSoon, activeColor = 'success' }: {
  active: boolean; onClick: () => void; children: React.ReactNode
  title?: string; comingSoon?: boolean; activeColor?: 'success' | 'error'
}) {
  // ── Active colour tokens — green for selections, red for the Hide exception ──
  const activeBorder = activeColor === 'error' ? 'var(--status-error)' : 'var(--status-success)'
  const activeBg    = activeColor === 'error' ? 'rgba(192, 57, 43, 0.15)' : 'rgba(74, 144, 96, 0.13)'
  const activeText  = activeColor === 'error' ? 'var(--status-error)'    : 'var(--status-success)'

  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      title={title}
      style={{
        flex: 1, padding: '4px 0', borderRadius: 4,
        border: active ? `1px solid ${activeBorder}` : '1px solid var(--border2)',
        background: active ? activeBg : 'var(--bg-modal)',
        color: active ? activeText : 'var(--text-inactive)',
        fontSize: 'var(--text-xs)',
        fontFamily: active ? 'JetBrains Mono' : 'Inter',
        fontWeight: active ? 700 : 400,
        cursor: comingSoon ? 'default' : 'pointer',
        opacity: comingSoon ? 0.4 : 1,
        transition: 'all 0.12s',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { if (!active && !comingSoon) e.currentTarget.style.color = 'var(--text-muted)' }}
      onMouseLeave={e => { if (!active && !comingSoon) e.currentTarget.style.color = 'var(--text-inactive)' }}
    >
      {children}
    </button>
  )
}

// ─── Transcript icon — sits in the FileMusic slot; manages its own state ───────
function TranscriptIcon({ filePath, noteNaming, accidentals, addTranscriptEntry }: {
  filePath: string
  noteNaming: NoteNaming
  accidentals: Accidentals
  addTranscriptEntry: (entry: TranscriptEntry) => void
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

  const iconColor = state === 'success' ? '#4caf50' : state === 'error' ? '#f44336' : 'var(--text-dimmest)'

  return (
    <div
      onClick={(e) => { e.stopPropagation(); void handleClick() }}
      title={tooltip}
      style={{
        cursor: state === 'loading' ? 'wait' : 'pointer',
        color: iconColor,
        display: 'flex', alignItems: 'center', flexShrink: 0,
        transition: 'color 0.2s',
        animation: state === 'loading' ? 'orfeo-transcript-spin 1s linear infinite' : 'none',
      }}
      onMouseEnter={e => { if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmest)' }}
    >
      <FileMusic size={11} strokeWidth={1.5} />
    </div>
  )
}

// ── MarqueeFilename — alias for MarqueeText with library-specific font style ──
const FILENAME_SPAN_STYLE: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }
function MarqueeFilename({ name }: { name: string }) {
  return <MarqueeText name={name} spanStyle={FILENAME_SPAN_STYLE} />
}

// ─── Library Panel ───────────────────────────────────────────────────────────

interface LibraryFile {
  name: string
  path: string
  starred: boolean
}

// ── Filename span styles — active (amber) and default (muted) ─────────────────
const FILENAME_SPAN_DEFAULT: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }
const FILENAME_SPAN_ACTIVE:  React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-amber)', fontWeight: 500 }

function LibraryPanel() {
  const libraryFolder = useStore((s) => s.libraryFolder)
  const libraryFiles = useStore((s) => s.libraryFiles)
  const libraryFavourites = useStore((s) => s.libraryFavourites)
  const setLibraryFiles = useStore((s) => s.setLibraryFiles)
  const setLibraryFolderAndFiles = useStore((s) => s.setLibraryFolderAndFiles)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const hideDemoFolder  = useStore((s) => s.hideDemoFolder)
  const demoFiles       = useStore((s) => s.demoFiles)
  // ── Chord Transcription — needed to show per-file transcript icon ─────────
  const chordTranscriptionEnabled = useStore((s) => s.chordTranscriptionEnabled)
  const noteNaming                = useStore((s) => s.noteNaming)
  const accidentals               = useStore((s) => s.accidentals)
  const addTranscriptEntry        = useStore((s) => s.addTranscriptEntry)
  // ── Active-file highlight — reads _filePath private field on parsed midi ──
  const midi              = useStore((s) => s.midi)
  const loadedFilePath    = (midi as any)?._filePath as string | undefined
  // ── Hidden files — client-side exclusion list, no disk change ────────────
  const hiddenLibraryFiles = useStore((s) => (s as any).hiddenLibraryFiles as string[])
  const hideLibraryFile    = useStore((s) => (s as any).hideLibraryFile as (path: string) => void)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  // Folders start expanded (not in collapsed set)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  // ── Context menu state — position + target path ───────────────────────────
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  // ── dragleave: clear highlight only when pointer leaves the container ──────
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  // ── drop: add file to library — never touches playback state ─────────────
  // Reuses copyMidiToLibrary IPC (collision-safe copy) and getPathForFile
  // from the main-area drop zone implementation. No confirmation modal needed.
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!/\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx)$/i.test(file.name)) {
      showDropError('Unsupported file type. Orfeo accepts .mid, .musicxml, .mxl, .gp/.gp5, and .kar files.')
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
    if (!contextMenu) return
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  // ── Open context menu at cursor position for a library file row ───────────
  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault()
    setContextMenu({ path: filePath, x: e.clientX, y: e.clientY })
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
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch {}
    setLoading(false)
  }

  // ── File loader — reads MIDI from disk and parses into store state ────────
  const handleLoadFile = useCallback(async (filePath: string) => {
    // Guard: prompt if there are unsaved note editor edits
    if (NES.dirty) {
      const choice = await confirmDialog({
        title: 'Unsaved Changes',
        message: 'Save changes before opening this file?',
        detail: 'Your note edits will be lost if you discard.',
        buttons: ['Save', 'Discard', 'Cancel'],
      })
      if (choice === 2) return  // Cancel — do nothing
      if (choice === 0) {       // Save — trigger toolbar save flow
        const ok = await NES.onSaveRequest?.()
        if (!ok) return           // Save was cancelled or failed — abort load
      }
      // Discard (choice === 1) — fall through
      NES.dirty = false
    }
    try {
      const { confirmPendingImportBeforeSwitch } = await import('../../utils/foreignFormatImport')
      const proceed = await confirmPendingImportBeforeSwitch(filePath)
      if (!proceed) return

      const result = await window.electronAPI.loadMidiFromPath(filePath)
      if (!result) return

      let base64    = result.base64
      const parseName = result.fileName
      const { useStore: storeModule } = await import('../../store')
      const libraryFolder = (storeModule.getState() as any).libraryFolder as string | null ?? null

      const { resolveToMidiBase64, detectForeignFormat, base64ToBytes } =
        await import('../../utils/foreignFormatImport')

      try {
        const resolved = await resolveToMidiBase64(filePath, base64, libraryFolder)
        base64 = resolved.base64

        if (resolved.isPendingSave) {
          storeModule.getState().setPendingImportedFile({
            sourcePath: filePath,
            format: detectForeignFormat(filePath)!,
            midiBase64: base64,
            fileName: result.fileName,
          })
        } else {
          storeModule.getState().setPendingImportedFile(null)
        }
      } catch (e: any) {
        console.error('[Orfeo] Foreign format conversion failed:', e)
        return
      }

      const { parseMidiBuffer } = await import('../../utils/midiParser')
      const { detectKeyFromTracks, parseKeySignature } = await import('../../utils/keyDetection')
      const bytes  = base64ToBytes(base64)
      const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, filePath) // _filePath = original source
      storeModule.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        storeModule.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        storeModule.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }, [])

  // ── Group files — root files first, then one entry per subfolder ─────────
  // Hidden files are filtered here so the rest of the render sees a clean list.
  type FileGroup = { folder: string | null; files: LibraryFile[] }
  const grouped: FileGroup[] = useMemo(() => {
    const hiddenSet = new Set(hiddenLibraryFiles)
    const allFiles = (filter === 'starred'
      ? libraryFiles.filter((f: LibraryFile) => libraryFavourites.has(f.path))
      : libraryFiles as LibraryFile[]
    ).filter((f: LibraryFile) => !hiddenSet.has(f.path))

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

    // Folders first, then root files
    const starred = rootFiles.filter(f => libraryFavourites.has(f.path))
    const unstarred = rootFiles.filter(f => !libraryFavourites.has(f.path))
    const result: FileGroup[] = []

    // ── Sort folders: Demo pinned first, rest alphabetical ───────────────────
    Array.from(folderMap.entries())
      .sort((a, b) => {
        if (a[0].toLowerCase() === 'demo') return -1
        if (b[0].toLowerCase() === 'demo') return 1
        return a[0].localeCompare(b[0])
      })
      .forEach(([folder, files]) => result.push({ folder, files }))

    // Root files at the bottom
    result.push({ folder: null, files: [...starred, ...unstarred] })

    return result
  }, [libraryFiles, libraryFavourites, libraryFolder, filter, hiddenLibraryFiles])

  const toggleFolder = (folder: string) => setExpandedFolders(prev => {
    const next = new Set(prev)
    if (next.has(folder)) next.delete(folder); else next.add(folder)
    return next
  })

  const folderName = libraryFolder
    ? libraryFolder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? libraryFolder
    : null

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
              <FolderOpen size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 10, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'JetBrains Mono',
              }} title={libraryFolder}>
                {folderName}
              </span>
              <button
                onClick={handleRefresh}
                title="Refresh folder"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-inactive)', padding: 2, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
              >
                <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {(['all', 'starred'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    flex: 1, padding: '3px 0', borderRadius: 4, fontSize: 10,
                    border: filter === f ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
                    background: filter === f ? 'var(--accent-amber-medium)' : 'transparent',
                    color: filter === f ? 'var(--text-amber)' : 'var(--text-inactive)',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {f === 'all' ? `All (${libraryFiles.length})` : `★ ${starredCount}`}
                </button>
              ))}
              <button
                onClick={handlePickFolder}
                title="Change library folder"
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 10,
                  border: '1px solid var(--border2)', background: 'transparent',
                  color: 'var(--text-inactive)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-muted)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
              >
                <FolderOpen size={10} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handlePickFolder}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--state-disabled)', background: 'transparent',
              color: 'var(--text-dim-control)', fontSize: 'var(--text-xs)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-amber)'; e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--state-disabled)'; e.currentTarget.style.color = 'var(--text-dim-control)' }}
          >
            <FolderOpen size={13} />
            Set MIDI folder
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
      >

        {/* ── Drag-over highlight — amber border + tint, pointer-events none ─── */}
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0,
            border: '2px solid var(--text-amber)',
            background: 'rgba(232, 160, 39, 0.06)',
            pointerEvents: 'none',
            zIndex: 10,
          }} />
        )}

        {/* ── Drop error toast — scoped inside the panel, auto-dismissed ─────── */}
        {dropError && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            background: '#2d2d2d', border: '1px solid #404055',
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
          <div
            ref={menuRef}
            style={{
              position: 'fixed', top: contextMenu.y, left: contextMenu.x,
              background: 'var(--panel)', border: '1px solid #404055',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
              zIndex: 9500, minWidth: 160, overflow: 'hidden',
            }}
          >
            <button
              onClick={() => { hideLibraryFile(contextMenu.path); setContextMenu(null) }}
              style={{
                width: '100%', padding: '8px 14px',
                background: 'none', border: 'none',
                color: 'var(--text-default)', fontSize: 'var(--text-xs)',
                textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tile)'; e.currentTarget.style.color = 'var(--text-amber)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none';           e.currentTarget.style.color = 'var(--text-default)' }}
            >
              Remove from Library
            </button>
          </div>
        )}

        {/* Empty state */}
        {libraryFolder && !hasAnyFiles && (
          <div style={{ padding: '16px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            {filter === 'starred' ? 'No starred files yet.\nStar a file with ★' : 'No MIDI files found.'}
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
              <FolderOpen size={12} style={{ color: '#e8a02770', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: '#8080a0', fontWeight: 600 }}>Demo</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>{demoFiles.length}</span>
            </div>
            {demoFiles.filter((f: { name: string; path: string }) => !hiddenLibraryFiles.includes(f.path)).map(file => {
              const isLoaded = !!loadedFilePath &&
                file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
              const fmt = detectForeignFormat(file.path)
              const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
              const rowTitle = fmt === 'musicxml'  ? `${file.name} (MusicXML — imported)`
                             : fmt === 'guitarpro' ? `${file.name} (Guitar Pro — imported)`
                             : file.name
              return (
                <div
                  key={file.path}
                  title={rowTitle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 10px 7px 26px', borderBottom: '1px solid var(--border-row)',
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
                    <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} />
                  ) : (
                    <RowIcon size={11} strokeWidth={1.5} style={{ color: isLoaded ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                  <MarqueeText name={file.name.replace(/\.(mid|midi)$/i, '')} spanStyle={isLoaded ? FILENAME_SPAN_ACTIVE : FILENAME_SPAN_DEFAULT} />
                </div>
              )
            })}
          </div>
        )}

        {/* ── hideDemoFolder filters the Demo subfolder from display ───────── */}
        {grouped.filter(g => !(hideDemoFolder && g.folder?.toLowerCase() === 'demo')).map((group, gi) => (
          <div key={group.folder ?? '__root__'}>

            {/* Subfolder header — only for named folders */}
            {group.folder && group.files.length > 0 && (
              <div
                onClick={() => toggleFolder(group.folder!)}
                title={expandedFolders.has(group.folder!) ? 'Collapse folder' : 'Expand folder'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px',
                  background: 'var(--bg-row)',
                  borderBottom: '1px solid var(--bg-tile)',
                  borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#111120'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)'}
              >
                {expandedFolders.has(group.folder!)
                  ? <ChevronDown size={11} style={{ color: 'var(--text-inactive)', flexShrink: 0 }} />
                  : <ChevronRight size={11} style={{ color: 'var(--text-inactive)', flexShrink: 0 }} />
                }
                <FolderOpen size={12} style={{ color: '#e8a02770', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 'var(--text-xs)', color: '#8080a0', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {group.folder}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                  {group.files.length}
                </span>
              </div>
            )}

            {/* Files inside this group — hidden when folder is collapsed */}
            {(!group.folder || expandedFolders.has(group.folder)) && group.files.map((file) => {
              const starred   = libraryFavourites.has(file.path)
              const isLoaded  = !!loadedFilePath &&
                file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
              const fmt = detectForeignFormat(file.path)
              const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
              const rowTitle = fmt === 'musicxml'  ? `${file.name} (MusicXML — imported)`
                             : fmt === 'guitarpro' ? `${file.name} (Guitar Pro — imported)`
                             : file.name
              return (
                <div
                  key={file.path}
                  title={rowTitle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    // Indent subfolder files slightly
                    padding: group.folder ? '7px 10px 7px 26px' : '7px 10px 7px 12px',
                    borderBottom: '1px solid var(--border-row)',
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
                    <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} />
                  ) : (
                    <RowIcon size={11} strokeWidth={1.5} style={{ color: isLoaded ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                  <MarqueeText name={file.name.replace(/\.(mid|midi)$/i, '')} spanStyle={isLoaded ? FILENAME_SPAN_ACTIVE : FILENAME_SPAN_DEFAULT} />
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavourite(file.path) }}
                    title={starred ? 'Remove from favourites' : 'Add to favourites'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: starred ? 'var(--text-amber)' : 'var(--state-disabled)',
                      padding: '2px 3px', display: 'flex', alignItems: 'center',
                      flexShrink: 0, fontSize: 'var(--text-sm)', lineHeight: 1,
                      transition: 'color 0.12s',
                    }}
                    onMouseEnter={e => { if (!starred) e.currentTarget.style.color = '#707060' }}
                    onMouseLeave={e => { if (!starred) e.currentTarget.style.color = 'var(--state-disabled)' }}
                  >★</button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Split breakpoint note name helper ───────────────────────────────────────
const SPLIT_NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// ─── Settings Panel ──────────────────────────────────────────────────────────

type DrawerTab = 'settings' | 'library'

export default function SettingsPanel() {
  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const noteNaming = useStore((s) => s.noteNaming)
  const setNoteNaming = useStore((s) => s.setNoteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const setAccidentals = useStore((s) => s.setAccidentals)
  const keyboardSize = useStore((s) => s.keyboardSize)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)
  const showBarNumbers = useStore((s) => s.showBarNumbers)
  const setShowBarNumbers = useStore((s) => s.setShowBarNumbers)
  const appTheme = useStore((s) => s.appTheme)
  const setAppTheme = useStore((s) => s.setAppTheme)
  const audioEngine = useStore((s) => s.audioEngine)
  const setAudioEngine = useStore((s) => s.setAudioEngine)
  const chordPrompterEnabled = useStore((s) => s.chordPrompterEnabled)
  const setChordPrompterEnabled = useStore((s) => s.setChordPrompterEnabled)
  const loopRegionEnabled    = useStore((s) => s.loopRegionEnabled)
  const setLoopRegionEnabled = useStore((s) => s.setLoopRegionEnabled)
  const noteEditorEnabled    = useStore((s) => s.noteEditorEnabled)
  const setNoteEditorEnabled = useStore((s) => s.setNoteEditorEnabled)
  const chordTranscriptionEnabled = useStore((s) => s.chordTranscriptionEnabled)
  const setChordTranscriptionEnabled = useStore((s) => s.setChordTranscriptionEnabled)
  const hideDemoFolder           = useStore((s) => s.hideDemoFolder)
  const setHideDemoFolder        = useStore((s) => s.setHideDemoFolder)
  const splitBreakpointType          = useStore((s) => s.splitBreakpointType)
  const setSplitBreakpointType       = useStore((s) => s.setSplitBreakpointType)
  const splitBreakpointNote          = useStore((s) => s.splitBreakpointNote)
  const setSplitBreakpointNote       = useStore((s) => s.setSplitBreakpointNote)
  const splitBreakpointRangeStart    = useStore((s) => s.splitBreakpointRangeStart)
  const setSplitBreakpointRangeStart = useStore((s) => s.setSplitBreakpointRangeStart)
  const splitBreakpointRangeEnd      = useStore((s) => s.splitBreakpointRangeEnd)
  const setSplitBreakpointRangeEnd   = useStore((s) => s.setSplitBreakpointRangeEnd)
  const showHandLabels               = useStore((s) => s.showHandLabels)
  const setShowHandLabels            = useStore((s) => s.setShowHandLabels)
  const showOctaveLabels             = useStore((s) => s.showOctaveLabels)
  const setShowOctaveLabels          = useStore((s) => s.setShowOctaveLabels)
  const showNoteNamesOnKeyboard      = useStore((s) => s.showNoteNamesOnKeyboard)
  const setShowNoteNamesOnKeyboard   = useStore((s) => s.setShowNoteNamesOnKeyboard)
  const handLabelMode                        = useStore((s) => s.handLabelMode)
  const setHandLabelMode                     = useStore((s) => s.setHandLabelMode)
  const performanceSplitSensitivity          = useStore((s) => s.performanceSplitSensitivity)
  const setPerformanceSplitSensitivity       = useStore((s) => s.setPerformanceSplitSensitivity)
  const autoMuteNonKeyboard         = useStore((s) => s.autoMuteNonKeyboard)
  const setAutoMuteNonKeyboard      = useStore((s) => s.setAutoMuteNonKeyboard)
  const settingsGroupsCollapsed     = useStore((s) => s.settingsGroupsCollapsed)
  const setSettingsGroupCollapsed   = useStore((s) => s.setSettingsGroupCollapsed)
  // ── Samples engine loading state ─────────────────────────────────────────
  const [samplesStatus, setSamplesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [samplesProgress, setSamplesProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<DrawerTab>('library')
  const didInit = useRef(false)
  // ── Init — ensures panel is open on first mount ───────────────────────────
  useEffect(() => {
    if (!didInit.current) { didInit.current = true; if (!settingsPanelOpen) setSettingsPanelOpen(true) }
  }, [])

  // ── Auto-init samples engine when prefs restore sets audioEngine='samples'
  useEffect(() => {
    if (audioEngine !== 'samples') return
    if (samplesStatus !== 'idle') return
    setSamplesStatus('loading'); setSamplesProgress(0)
    initSamplesEngine((p) => setSamplesProgress(p))
      .then(() => setSamplesStatus('ready'))
      .catch(() => setSamplesStatus('error'))
  }, [audioEngine])

  const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string; hint: string }[] = [
    { value: 'english',          label: 'UK/US',  hint: 'C D E F G A B' },
    { value: 'central-european', label: 'EU',        hint: 'C D E F G A H (B = B♭)' },
    { value: 'solfege',          label: 'Solfège',  hint: 'Do Re Mi Fa Sol La Si' },
    { value: 'hidden',           label: 'Hide',     hint: 'No labels shown' },
  ]

  const KEYBOARD_SIZES: KeyboardSize[] = [61, 73, 88]
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]

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
          <button
            onClick={() => { setActiveTab('library'); setSettingsPanelOpen(true) }}
            title="Open Library"
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
          <button
            onClick={() => { setActiveTab('settings'); setSettingsPanelOpen(true) }}
            title="Open Settings"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4, marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <Settings size={18} />
          </button>
          <div style={{ flex: 1 }} />
          <button
            title="Coming soon"
            style={{
              background: 'none', border: 'none', cursor: 'default',
              color: 'var(--text-inactive)', padding: 4, opacity: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Info size={18} />
          </button>
        </div>
      )}

      {settingsPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* ── Collapse button: chevron only, dynamic tooltip ────────────────── */}
          <button
            onClick={() => setSettingsPanelOpen(false)}
            title={activeTab === 'library' ? 'Close Library' : 'Close Settings'}
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

          {/* ── Tab bar: Library / Settings, left-aligned with content ─────── */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {([
              { id: 'library',  icon: <Library size={13} />,  label: 'Library'  },
              { id: 'settings', icon: <Settings size={13} />, label: 'Settings' },
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
                  fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  transition: 'color 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'library' ? (
              <LibraryPanel />
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

                {/* ── 1. MIDI FILES & LIBRARY ────────────────────────────────────── */}
                <CollapsibleSection icon={<BookOpen size={11} />} label="MIDI Files & Library"
                  collapsed={settingsGroupsCollapsed['midi-files-library']}
                  onToggle={() => setSettingsGroupCollapsed('midi-files-library', !settingsGroupsCollapsed['midi-files-library'])}
                >
                  {/* ── Demo folder — eye-toggle: Eye=show, EyeOff=hidden ────────── */}
                  <OptionRow
                    label="Demo folder"
                    eyeToggle
                    eyeValue={!hideDemoFolder}
                    onEyeChange={(val) => setHideDemoFolder(!val)}
                    description="Hides bundled demo songs from library view. Files are not deleted."
                  />
                  {/* ── Chord Transcription — eye-toggle with BETA badge ──────────── */}
                  <OptionRow
                    label="Chord Transcription"
                    badge={<BetaBadge />}
                    eyeToggle
                    eyeValue={chordTranscriptionEnabled}
                    onEyeChange={setChordTranscriptionEnabled}
                    description="Adds a transcript icon to every file in your library — click to generate a chord chart PDF."
                  />
                  {/* ── Note Editor — eye-toggle: unlocks pencil icon in TopBar ──── */}
                  <OptionRow
                    label="Note Editor"
                    eyeToggle
                    eyeValue={noteEditorEnabled}
                    onEyeChange={setNoteEditorEnabled}
                    description="Show a pencil icon in the top bar to enter note-editing mode directly on the waterfall."
                  />
                </CollapsibleSection>

                {/* ── 2. NOTATION ────────────────────────────────────────────────── */}
                <CollapsibleSection icon={<Type size={11} />} label="Notation"
                  collapsed={settingsGroupsCollapsed['notation']}
                  onToggle={() => setSettingsGroupCollapsed('notation', !settingsGroupsCollapsed['notation'])}
                >
                  {/* ── Display system — single 4-button row; Hide uses EyeOff icon ── */}
                  <OptionRow label="Display system">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      {NOTE_NAMING_OPTIONS.slice(0, 3).map(opt => (
                        <OptionBtn key={opt.value} active={noteNaming === opt.value}
                          onClick={() => setNoteNaming(opt.value)} title={opt.hint}>
                          {opt.label}
                        </OptionBtn>
                      ))}
                      {/* ── Hide — EyeOff icon; red when active (hidden is a meaningful state) ── */}
                      <OptionBtn
                        active={noteNaming === 'hidden'}
                        onClick={() => setNoteNaming('hidden')}
                        activeColor="error"
                        title="Hide note labels"
                      >
                        <EyeClosed size={11} strokeWidth={1.5} />
                      </OptionBtn>
                    </div>
                    {/* ── Note name preview — value display, JetBrains Mono intentional ── */}
                    <div style={{
                      marginTop: 6, padding: '4px 8px',
                      background: 'var(--bg-row)', borderRadius: 4,
                      fontSize: 10, fontFamily: 'JetBrains Mono',
                      color: 'var(--text-dim)', letterSpacing: '0.08em', textAlign: 'center',
                    }}>
                      {noteNaming === 'english'          && 'C  D  E  F  G  A  B'}
                      {noteNaming === 'central-european' && 'C  D  E  F  G  A  H'}
                      {noteNaming === 'solfege'          && 'Do Re Mi Fa Sol La Si'}
                      {noteNaming === 'hidden'           && '— labels hidden —'}
                    </div>
                  </OptionRow>
                  {/* ── Accidentals — only shown when note names are visible ───────── */}
                  {noteNaming !== 'hidden' && (
                    <OptionRow
                      label="Accidentals"
                      hint={accidentals === 'flat' ? 'e.g.  Bb  Eb  Ab  Db  Gb' : 'e.g.  A#  D#  G#  C#  F#'}
                    >
                      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                        <OptionBtn active={accidentals === 'flat'}  onClick={() => setAccidentals('flat')}  title="Flat names">♭ Flats</OptionBtn>
                        <OptionBtn active={accidentals === 'sharp'} onClick={() => setAccidentals('sharp')} title="Sharp names">♯ Sharps</OptionBtn>
                      </div>
                    </OptionRow>
                  )}
                </CollapsibleSection>

                {/* ── 3. KEYBOARD ────────────────────────────────────────────────── */}
                <CollapsibleSection icon={<Piano size={11} />} label="Keyboard"
                  collapsed={settingsGroupsCollapsed['keyboard']}
                  onToggle={() => setSettingsGroupCollapsed('keyboard', !settingsGroupsCollapsed['keyboard'])}
                >
                  {/* ── Key range — multi-choice selector, unchanged structure ───── */}
                  <OptionRow label="Key range" hint="Number of keys on the virtual keyboard">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      {KEYBOARD_SIZES.map(size => (
                        <OptionBtn key={size} active={keyboardSize === size}
                          onClick={() => setKeyboardSize(size)} title={`${size}-key keyboard`}>
                          {size}
                        </OptionBtn>
                      ))}
                    </div>
                  </OptionRow>
                  {/* ── Labels sub-divider — thin uppercase label within the group ── */}
                  <div style={{
                    padding: '5px 14px 3px',
                    fontSize: 9, color: 'var(--text-muted)', fontWeight: 600,
                    letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'Inter',
                    borderTop: '1px solid var(--border-row)',
                  }}>
                    Labels
                  </div>
                  {/* ── Octave labels — show/hide octave numbers on virtual keyboard ─ */}
                  <OptionRow
                    label="Show octaves"
                    eyeToggle
                    eyeValue={showOctaveLabels}
                    onEyeChange={setShowOctaveLabels}
                  />
                  {/* ── Note name labels — show/hide note names on virtual keyboard ── */}
                  <OptionRow
                    label="Show note names"
                    eyeToggle
                    eyeValue={showNoteNamesOnKeyboard}
                    onEyeChange={setShowNoteNamesOnKeyboard}
                  />
                  {/* ── Left/Right Hand BETA — eye-toggle; sub-controls unchanged ─── */}
                  <OptionRow
                    label="Left/Right Hand"
                    badge={<BetaBadge />}
                    eyeToggle
                    eyeValue={showHandLabels}
                    onEyeChange={setShowHandLabels}
                    description="Shows amber hand boundary lines and labels in the keyboard footer."
                  />
                  {/* ── Mode + split zone — only visible when hand labels are on ──── */}
                  {showHandLabels && (
                    <>
                      {/* ── Practice / Performance mode selector ──────────────────── */}
                      <OptionRow label="Mode" hint="Practice shows a fixed split zone. Performance tracks hand position live from the MIDI file or hardware keyboard.">
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                          <OptionBtn active={handLabelMode === 'practice'}    onClick={() => setHandLabelMode('practice')}>Practice</OptionBtn>
                          <OptionBtn active={handLabelMode === 'performance'} onClick={() => setHandLabelMode('performance')}>Performance</OptionBtn>
                        </div>
                      </OptionRow>
                      {/* ── Practice: manual split zone controls ───────────────────── */}
                      {handLabelMode === 'practice' && (
                        <>
                          <OptionRow label="Split zone" hint="Defines the boundary between Left Hand and Right Hand shown on the keyboard.">
                            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                              <OptionBtn active={splitBreakpointType === 'single'} onClick={() => setSplitBreakpointType('single')}>Single</OptionBtn>
                              <OptionBtn active={splitBreakpointType === 'range'}  onClick={() => setSplitBreakpointType('range')}>Range</OptionBtn>
                            </div>
                          </OptionRow>
                          {splitBreakpointType === 'single' ? (
                            <OptionRow
                              label={`Split note — ${SPLIT_NOTE_NAMES[splitBreakpointNote % 12]}${Math.floor(splitBreakpointNote / 12) - 1}`}
                              hint="Notes below this pitch → Left Hand, notes above → Right Hand."
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ZoomStepBtn disabled={splitBreakpointNote <= 48} onClick={() => setSplitBreakpointNote(splitBreakpointNote - 1)}>−</ZoomStepBtn>
                                <div style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-base)', color: 'var(--text-dim)' }}>
                                  {SPLIT_NOTE_NAMES[splitBreakpointNote % 12]}{Math.floor(splitBreakpointNote / 12) - 1}
                                </div>
                                <ZoomStepBtn disabled={splitBreakpointNote >= 60} onClick={() => setSplitBreakpointNote(splitBreakpointNote + 1)}>+</ZoomStepBtn>
                              </div>
                            </OptionRow>
                          ) : (
                            <OptionRow
                              label={`Split zone — ${SPLIT_NOTE_NAMES[splitBreakpointRangeStart % 12]}${Math.floor(splitBreakpointRangeStart / 12) - 1} to ${SPLIT_NOTE_NAMES[splitBreakpointRangeEnd % 12]}${Math.floor(splitBreakpointRangeEnd / 12) - 1}`}
                              hint="Notes inside the shaded zone may come from either hand. Notes below the lower bound → Left Hand, above the upper bound → Right Hand."
                            >
                              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 9, color: 'var(--text-dimmest)', marginBottom: 4, fontFamily: 'Inter' }}>Lower</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                    <ZoomStepBtn disabled={splitBreakpointRangeStart <= 48} onClick={() => setSplitBreakpointRangeStart(splitBreakpointRangeStart - 1)}>−</ZoomStepBtn>
                                    <div style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
                                      {SPLIT_NOTE_NAMES[splitBreakpointRangeStart % 12]}{Math.floor(splitBreakpointRangeStart / 12) - 1}
                                    </div>
                                    <ZoomStepBtn disabled={splitBreakpointRangeStart >= splitBreakpointRangeEnd - 1} onClick={() => setSplitBreakpointRangeStart(splitBreakpointRangeStart + 1)}>+</ZoomStepBtn>
                                  </div>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 9, color: 'var(--text-dimmest)', marginBottom: 4, fontFamily: 'Inter' }}>Upper</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                    <ZoomStepBtn disabled={splitBreakpointRangeEnd <= splitBreakpointRangeStart + 1} onClick={() => setSplitBreakpointRangeEnd(splitBreakpointRangeEnd - 1)}>−</ZoomStepBtn>
                                    <div style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
                                      {SPLIT_NOTE_NAMES[splitBreakpointRangeEnd % 12]}{Math.floor(splitBreakpointRangeEnd / 12) - 1}
                                    </div>
                                    <ZoomStepBtn disabled={splitBreakpointRangeEnd >= 60} onClick={() => setSplitBreakpointRangeEnd(splitBreakpointRangeEnd + 1)}>+</ZoomStepBtn>
                                  </div>
                                </div>
                              </div>
                            </OptionRow>
                          )}
                        </>
                      )}
                      {/* ── Performance: sensitivity slider + description ────────────── */}
                      {handLabelMode === 'performance' && (
                        <>
                          <OptionRow label={`Split Sensitivity — ${performanceSplitSensitivity} semitones`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>2</span>
                              <input
                                type="range" min={2} max={16} step={1}
                                value={performanceSplitSensitivity}
                                onChange={e => setPerformanceSplitSensitivity(Number(e.target.value))}
                                style={{ flex: 1, accentColor: 'var(--text-amber)', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>16</span>
                            </div>
                          </OptionRow>
                          <div style={{ padding: '2px 12px 6px', color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'Inter', lineHeight: 1.5 }}>
                            Lower values split hands more readily on moderate spreads. Higher values only split on very wide separations.
                          </div>
                        </>
                      )}
                    </>
                  )}
                </CollapsibleSection>

                {/* ── 4. PLAYBACK & PRACTICE ─────────────────────────────────────── */}
                <CollapsibleSection icon={<Music size={11} />} label="Playback & Practice"
                  collapsed={settingsGroupsCollapsed['playback-practice']}
                  onToggle={() => setSettingsGroupCollapsed('playback-practice', !settingsGroupsCollapsed['playback-practice'])}
                >
                  {/* ── Chord Prompter — eye-toggle ───────────────────────────────── */}
                  <OptionRow
                    label="Chord Prompter"
                    eyeToggle
                    eyeValue={chordPrompterEnabled}
                    onEyeChange={setChordPrompterEnabled}
                    description="Shows chord names during playback — past, current and upcoming chords."
                  />
                  {/* ── Loop region — eye-toggle ──────────────────────────────────── */}
                  <OptionRow
                    label="Loop region"
                    eyeToggle
                    eyeValue={loopRegionEnabled}
                    onEyeChange={setLoopRegionEnabled}
                    description="Show a strip above the song title to select and loop a section of the MIDI file."
                  />
                </CollapsibleSection>

                {/* ── 5. AUDIO ───────────────────────────────────────────────────── */}
                <CollapsibleSection icon={<Volume2 size={11} />} label="Audio"
                  collapsed={settingsGroupsCollapsed['audio']}
                  onToggle={() => setSettingsGroupCollapsed('audio', !settingsGroupsCollapsed['audio'])}
                >
                  <OptionRow label="Sound engine">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      {/* ── GM Synth — always available, switches back from Samples instantly ── */}
                      <OptionBtn
                        active={audioEngine === 'gm'}
                        onClick={() => setAudioEngine('gm')}
                        title="Built-in GM synthesiser (jzz-synth-tiny) — always available offline"
                      >GM Synth</OptionBtn>
                      {/* ── Samples — loads GeneralUser GS SF2 via spessasynth_lib on first click ── */}
                      <OptionBtn
                        active={audioEngine === 'samples'}
                        onClick={async () => {
                          if (audioEngine === 'samples') return
                          if (samplesStatus === 'ready') { setAudioEngine('samples'); return }
                          if (samplesStatus === 'loading') return
                          setSamplesStatus('loading'); setSamplesProgress(0)
                          try {
                            await initSamplesEngine((p) => setSamplesProgress(p))
                            setSamplesStatus('ready')
                            setAudioEngine('samples')
                          } catch (e) {
                            console.error('[Orfeo Samples] init failed:', e)
                            setSamplesStatus('error')
                          }
                        }}
                        title="GeneralUser GS soundfont via spessasynth_lib — richer sound, loads once"
                      >Samples</OptionBtn>
                    </div>
                    {/* ── Loading progress / status block ──────────────────────────── */}
                    {samplesStatus === 'loading' && (
                      <div style={{ marginTop: 7 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-dimmest)', fontFamily: 'Inter', marginBottom: 4 }}>
                          Loading soundfont… {Math.round(samplesProgress * 100)}%
                        </div>
                        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', background: 'var(--text-amber)', borderRadius: 2,
                            width: `${Math.round(samplesProgress * 100)}%`, transition: 'width 0.1s',
                          }} />
                        </div>
                      </div>
                    )}
                    {samplesStatus === 'ready' && (
                      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Inter' }}>
                        {/* ── "loaded" goes green when Samples is the active engine ── */}
                        GeneralUser-GS.sf2 · 30.8 MB · <span style={{ color: audioEngine === 'samples' ? 'var(--status-success)' : 'inherit' }}>loaded</span>
                      </div>
                    )}
                    {samplesStatus === 'error' && (
                      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--status-error)', fontFamily: 'Inter' }}>
                        Failed to load soundfont — check console
                      </div>
                    )}
                    {samplesStatus === 'idle' && (
                      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'Inter' }}>
                        {audioEngine === 'gm'
                          ? 'GM Synth (jzz-synth-tiny) — ships with app, no internet needed.'
                          : 'GeneralUser-GS.sf2 · 30.8 MB · click Samples to load'}
                      </div>
                    )}
                  </OptionRow>
                  {/* ── Selective Tracks Playback — eye-toggle; shows/hides quick-toggle button in Track Panel ─ */}
                  <OptionRow
                    label="Selective Tracks Playback"
                    eyeToggle
                    eyeValue={autoMuteNonKeyboard}
                    onEyeChange={setAutoMuteNonKeyboard}
                    description="When active, select if you want to hear all MIDI tracks or only Piano, Bass & Drums. Can be overridden manually."
                  />
                </CollapsibleSection>

                {/* ── 6. PIANO ROLL ──────────────────────────────────────────────── */}
                <CollapsibleSection icon={<ZoomIn size={11} />} label="Piano Roll"
                  collapsed={settingsGroupsCollapsed['piano-roll']}
                  onToggle={() => setSettingsGroupCollapsed('piano-roll', !settingsGroupsCollapsed['piano-roll'])}
                >
                  {/* ── Zoom slider — unchanged ───────────────────────────────────── */}
                  <OptionRow label={`Zoom  —  ${Math.round(zoomLevel * 100)}%`} hint={`${Math.round(6 / zoomLevel * 10) / 10}s visible · higher = notes appear larger`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <ZoomStepBtn
                        disabled={zoomLevel <= ZOOM_STEPS[0]}
                        onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i > 0) setZoomLevel(ZOOM_STEPS[i - 1]) }}
                      >−</ZoomStepBtn>
                      <div style={{ flex: 1, position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                          background: 'var(--text-amber)',
                          width: `${(ZOOM_STEPS.indexOf(zoomLevel) / (ZOOM_STEPS.length - 1)) * 100}%`,
                          transition: 'width 0.12s',
                        }} />
                        {ZOOM_STEPS.map((step, i) => (
                          <button key={step} onClick={() => setZoomLevel(step)} title={`${Math.round(step * 100)}%`}
                            style={{
                              position: 'absolute',
                              left: `${(i / (ZOOM_STEPS.length - 1)) * 100}%`,
                              top: '50%', transform: 'translate(-50%, -50%)',
                              width: 10, height: 10, borderRadius: '50%',
                              background: zoomLevel === step ? 'var(--text-amber)' : 'var(--state-hover-bg)',
                              border: `1.5px solid ${zoomLevel === step ? 'var(--text-amber)' : 'var(--text-muted)'}`,
                              cursor: 'pointer', padding: 0, transition: 'all 0.12s',
                            }} />
                        ))}
                      </div>
                      <ZoomStepBtn
                        disabled={zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                        onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i < ZOOM_STEPS.length - 1) setZoomLevel(ZOOM_STEPS[i + 1]) }}
                      >+</ZoomStepBtn>
                    </div>
                  </OptionRow>
                  {/* ── Bar numbers & grid lines — eye-toggle, no description ─────── */}
                  <OptionRow
                    label="Bar numbers & grid lines"
                    eyeToggle
                    eyeValue={showBarNumbers}
                    onEyeChange={setShowBarNumbers}
                  />
                </CollapsibleSection>

                {/* ── 7. APPEARANCE — no content changes ─────────────────────────── */}
                <CollapsibleSection icon={<Palette size={11} />} label="Appearance"
                  collapsed={settingsGroupsCollapsed['appearance']}
                  onToggle={() => setSettingsGroupCollapsed('appearance', !settingsGroupsCollapsed['appearance'])}
                >
                  <OptionRow label="Background">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <AppBgBtn color="#0f0f12" label="Dark" active={appTheme === 'dark'} onClick={() => setAppTheme('dark')} />
                      <AppBgBtn color="#12100e" label="Warm" active={appTheme === 'warm'} onClick={() => setAppTheme('warm')} />
                    </div>
                  </OptionRow>
                </CollapsibleSection>

                {/* ── About ──────────────────────────────────────────────────────── */}
                <div style={{ padding: '14px 14px 10px', borderTop: '1px solid var(--bg-tile)', marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
                      <circle cx="50" cy="50" r="44" stroke="#e8a027" strokeWidth="8"/>
                      <line x1="22" y1="38" x2="78" y2="38" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                      <line x1="22" y1="50" x2="78" y2="50" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                      <line x1="22" y1="62" x2="78" y2="62" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                    </svg>
                    <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'JetBrains Mono' }}>Orfeo · v0.13.0</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#35354a', fontFamily: 'Inter', lineHeight: 1.5 }}>
                    MIT License · github.com/SquareBow/orfeo
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* ── Manual link — always visible at drawer bottom ── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid var(--bg-tile)',
            padding: '8px 14px',
          }}>
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/SquareBow/orfeo/blob/main/docs/HOW_TO_USE.md')}
              title="Open user manual on GitHub"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '4px 0',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <BookOpen size={11} strokeWidth={1.5} />
              <span style={{ fontSize: 10, fontFamily: 'Inter', letterSpacing: '0.02em' }}>User Manual</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'JetBrains Mono', opacity: 0.5 }}>↗</span>
            </button>
          </div>

        </div>
      )}
    </div>
  )
}

// ── Zoom step button — small +/− stepper for discrete-increment controls ──
function ZoomStepBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 22, height: 22, borderRadius: 4,
      background: 'var(--bg-modal)', border: '1px solid var(--border2)',
      color: disabled ? 'var(--state-disabled)' : 'var(--text-dimmest)',
      fontSize: 'var(--text-lg)', lineHeight: 1,
      cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  )
}

// ── App background button — color swatch + label toggle for theme selection
function AppBgBtn({ color, label, active, onClick, comingSoon }: {
  color: string; label: string; active: boolean; onClick: () => void; comingSoon?: boolean
}) {
  return (
    <button onClick={comingSoon ? undefined : onClick} style={{
      flex: 1, padding: '6px 4px', borderRadius: 4,
      border: active ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
      background: active ? 'var(--accent-amber-medium)' : 'var(--bg-modal)',
      color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
      fontSize: 10, cursor: comingSoon ? 'default' : 'pointer',
      opacity: comingSoon ? 0.4 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)',
      transition: 'all 0.12s',
    }}>
      <div style={{ width: 28, height: 14, borderRadius: 'var(--radius-sm)', background: color, border: '1px solid var(--state-disabled)' }} />
      <span style={{ fontFamily: 'Inter', fontSize: 10 }}>{label}</span>
    </button>
  )
}
