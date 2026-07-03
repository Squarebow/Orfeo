import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Settings2, ChevronLeft, ChevronDown, ChevronRight, Type, Piano, Palette, ZoomIn, Volume2,
  Music, FolderOpen, RefreshCw, FileMusic, BookOpen, ListMusic, Scissors,
} from 'lucide-react'
import { useStore } from '../../store'
import type { NoteNaming, KeyboardSize, Accidentals, TranscriptEntry } from '../../types'
import type { AppTheme } from '../../store'
import { initSamplesEngine } from '../../hooks/useSamplesEngine'

// ── Spin keyframe for transcript loading animation ────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('orfeo-transcript-anim')) {
  const s = document.createElement('style')
  s.id = 'orfeo-transcript-anim'
  s.textContent = '@keyframes orfeo-transcript-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: '#0e0e16',
      borderTop: '1px solid #1a1a26',
      borderBottom: '1px solid #1a1a26',
    }}>
      <span style={{ color: '#50506a', display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em', color: '#707088',
      }}>
        {label}
      </span>
    </div>
  )
}

function OptionRow({ label, children, hint }: {
  label: string; children: React.ReactNode; hint?: string
}) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #181822' }}>
      <div style={{ fontSize: 11, color: '#707088', marginBottom: 6, fontWeight: 500, letterSpacing: '0.02em' }}>
        {label}
      </div>
      {children}
      {hint && (
        <div style={{ fontSize: 9, color: '#404055', marginTop: 5, fontFamily: 'JetBrains Mono' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function OptionBtn({ active, onClick, children, title, comingSoon }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title?: string; comingSoon?: boolean
}) {
  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      title={title}
      style={{
        flex: 1, padding: '4px 0', borderRadius: 4,
        border: active ? '1px solid #e8a02755' : '1px solid #252535',
        background: active ? '#e8a02714' : '#131320',
        color: active ? '#e8a027' : '#505068',
        fontSize: 11,
        fontFamily: active ? 'JetBrains Mono' : 'Inter',
        fontWeight: active ? 700 : 400,
        cursor: comingSoon ? 'default' : 'pointer',
        opacity: comingSoon ? 0.4 : 1,
        transition: 'all 0.12s',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}
      onMouseEnter={e => { if (!active && !comingSoon) e.currentTarget.style.color = '#9090a8' }}
      onMouseLeave={e => { if (!active && !comingSoon) e.currentTarget.style.color = '#505068' }}
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

  const iconColor = state === 'success' ? '#4caf50' : state === 'error' ? '#f44336' : '#707088'

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
      onMouseEnter={e => { if (state === 'idle') (e.currentTarget as HTMLElement).style.color = '#e8a027' }}
      onMouseLeave={e => { if (state === 'idle') (e.currentTarget as HTMLElement).style.color = '#707088' }}
    >
      <FileMusic size={11} strokeWidth={1.5} />
    </div>
  )
}

// ─── Filename that scrolls left on hover when truncated ──────────────────────
function MarqueeFilename({ name }: { name: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [scrollAmt, setScrollAmt] = useState(0)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    // ── Measure overflow and watch for resize ─────────────────────────────
    const measure = () => {
      const outer = outerRef.current
      const inner = innerRef.current
      if (!outer || !inner) return
      setScrollAmt(Math.max(0, inner.scrollWidth - outer.clientWidth))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (outerRef.current) ro.observe(outerRef.current)
    return () => ro.disconnect()
  }, [name])

  const duration = Math.max(1.5, scrollAmt / 40)

  return (
    <div
      ref={outerRef}
      style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        ref={innerRef}
        style={{
          display: 'inline-block',
          fontSize: 11, color: '#9090a8', whiteSpace: 'nowrap',
          transition: hovered && scrollAmt > 0
            ? `transform ${duration}s 0.5s linear`
            : 'transform 0.2s ease',
          transform: hovered && scrollAmt > 0 ? `translateX(-${scrollAmt}px)` : 'translateX(0)',
        }}
      >
        {name}
      </span>
    </div>
  )
}

// ─── Library Panel ───────────────────────────────────────────────────────────

interface LibraryFile {
  name: string
  path: string
  starred: boolean
}

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
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  // Folders start expanded (not in collapsed set)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

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

  const handleRefresh = async () => {
    if (!libraryFolder) return
    setLoading(true)
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch {}
    setLoading(false)
  }

  const handleLoadFile = async (filePath: string) => {
    try {
      const result = await window.electronAPI.loadMidiFromPath(filePath)
      if (!result) return
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const { parseMidiBuffer } = await import('../../utils/midiParser')
      const { detectKeyFromTracks, parseKeySignature } = await import('../../utils/keyDetection')
      const { useStore: store } = await import('../../store')
      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath ?? '')
      store.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        store.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        store.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }

  // Group files: root files first, then one entry per subfolder
  type FileGroup = { folder: string | null; files: LibraryFile[] }
  const grouped: FileGroup[] = useMemo(() => {
    const allFiles = filter === 'starred'
      ? libraryFiles.filter(f => libraryFavourites.has(f.path))
      : libraryFiles

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
  }, [libraryFiles, libraryFavourites, libraryFolder, filter])

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
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a26', flexShrink: 0 }}>
        {libraryFolder ? (
          <div>
            {/* Current folder display */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px', background: '#0e0e16', borderRadius: 4,
              border: '1px solid #252535', marginBottom: 6,
            }}>
              <FolderOpen size={11} style={{ color: '#e8a027', flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 10, color: '#9090a8',
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
                  color: '#505068', padding: 2, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
                onMouseLeave={e => e.currentTarget.style.color = '#505068'}
              >
                <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'starred'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    flex: 1, padding: '3px 0', borderRadius: 4, fontSize: 10,
                    border: filter === f ? '1px solid #e8a02755' : '1px solid #252535',
                    background: filter === f ? '#e8a02714' : 'transparent',
                    color: filter === f ? '#e8a027' : '#505068',
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
                  border: '1px solid #252535', background: 'transparent',
                  color: '#505068', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#9090a8'}
                onMouseLeave={e => e.currentTarget.style.color = '#505068'}
              >
                <FolderOpen size={10} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handlePickFolder}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 5,
              border: '1px dashed #303045', background: 'transparent',
              color: '#606078', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8a027'; e.currentTarget.style.color = '#e8a027' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#303045'; e.currentTarget.style.color = '#606078' }}
          >
            <FolderOpen size={13} />
            Set MIDI folder
          </button>
        )}
      </div>

      {/* ── File list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Empty state */}
        {libraryFolder && !hasAnyFiles && (
          <div style={{ padding: '16px 14px', fontSize: 11, color: '#404055', textAlign: 'center' }}>
            {filter === 'starred' ? 'No starred files yet.\nStar a file with ★' : 'No MIDI files found.'}
          </div>
        )}

        {/* ── Standalone demo section shown when no library folder is set ─────── */}
        {!libraryFolder && !hideDemoFolder && demoFiles.length > 0 && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', background: '#0e0e16',
              borderBottom: '1px solid #1a1a26',
            }}>
              <FolderOpen size={12} style={{ color: '#e8a02770', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, color: '#8080a0', fontWeight: 600 }}>Demo</span>
              <span style={{ fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>{demoFiles.length}</span>
            </div>
            {demoFiles.map(file => (
              <div
                key={file.path}
                title={file.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 10px 7px 26px', borderBottom: '1px solid #181822',
                  cursor: 'pointer', transition: 'background 0.08s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1a1a28'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                onClick={() => handleLoadFile(file.path)}
              >
                {/* ── FileMusic doubles as transcript trigger when feature is on ── */}
                {chordTranscriptionEnabled ? (
                  <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} />
                ) : (
                  <FileMusic size={11} style={{ color: '#404055', flexShrink: 0 }} />
                )}
                <MarqueeFilename name={file.name.replace(/\.(mid|midi)$/i, '')} />
              </div>
            ))}
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
                  background: '#0e0e16',
                  borderBottom: '1px solid #1a1a26',
                  borderTop: gi > 0 ? '1px solid #1e1e2a' : 'none',
                  cursor: 'pointer', userSelect: 'none',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#111120'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#0e0e16'}
              >
                {expandedFolders.has(group.folder!)
                  ? <ChevronDown size={11} style={{ color: '#505068', flexShrink: 0 }} />
                  : <ChevronRight size={11} style={{ color: '#505068', flexShrink: 0 }} />
                }
                <FolderOpen size={12} style={{ color: '#e8a02770', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 11, color: '#8080a0', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {group.folder}
                </span>
                <span style={{ fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                  {group.files.length}
                </span>
              </div>
            )}

            {/* Files inside this group — hidden when folder is collapsed */}
            {(!group.folder || expandedFolders.has(group.folder)) && group.files.map((file) => {
              const starred = libraryFavourites.has(file.path)
              return (
                <div
                  key={file.path}
                  title={file.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    // Indent subfolder files slightly
                    padding: group.folder ? '7px 10px 7px 26px' : '7px 10px 7px 12px',
                    borderBottom: '1px solid #181822',
                    cursor: 'pointer', transition: 'background 0.08s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1a1a28'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  onClick={() => handleLoadFile(file.path)}
                >
                  {/* ── FileMusic doubles as transcript trigger when feature is on ── */}
                  {chordTranscriptionEnabled ? (
                    <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} />
                  ) : (
                    <FileMusic size={11} style={{ color: '#404055', flexShrink: 0 }} />
                  )}
                  <MarqueeFilename name={file.name.replace(/\.(mid|midi)$/i, '')} />
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavourite(file.path) }}
                    title={starred ? 'Remove from favourites' : 'Add to favourites'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: starred ? '#e8a027' : '#303045',
                      padding: '2px 3px', display: 'flex', alignItems: 'center',
                      flexShrink: 0, fontSize: 12, lineHeight: 1,
                      transition: 'color 0.12s',
                    }}
                    onMouseEnter={e => { if (!starred) e.currentTarget.style.color = '#707060' }}
                    onMouseLeave={e => { if (!starred) e.currentTarget.style.color = '#303045' }}
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
  // ── Samples engine loading state ─────────────────────────────────────────
  const [samplesStatus, setSamplesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [samplesProgress, setSamplesProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<DrawerTab>('library')
  const didInit = useRef(false)
  useEffect(() => {
    if (!didInit.current) { didInit.current = true; if (!settingsPanelOpen) setSettingsPanelOpen(true) }
  }, [])

  // ── Auto-init samples engine when prefs restore sets audioEngine='samples' ──
  useEffect(() => {
    if (audioEngine !== 'samples') return
    if (samplesStatus !== 'idle') return
    setSamplesStatus('loading'); setSamplesProgress(0)
    initSamplesEngine((p) => setSamplesProgress(p))
      .then(() => setSamplesStatus('ready'))
      .catch(() => setSamplesStatus('error'))
  }, [audioEngine])

  const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string; hint: string }[] = [
    { value: 'english',          label: 'UK / US',  hint: 'C D E F G A B' },
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
      background: '#13131a',
      borderRight: '1px solid #222230',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Collapse toggle */}
      <button
        onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
        title={settingsPanelOpen ? 'Close Library & Settings' : 'Open Library & Settings'}
        style={{
          position: 'absolute', top: 10, right: 0, zIndex: 10,
          padding: '4px 5px', borderRadius: '4px 0 0 4px',
          background: '#1a1a24', border: '1px solid #252535', borderRight: 'none',
          color: '#707088', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
        onMouseLeave={e => e.currentTarget.style.color = '#707088'}
      >
        {settingsPanelOpen ? <ChevronLeft size={15} /> : <ListMusic size={18} />}
      </button>

      {settingsPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1e1e2c', flexShrink: 0 }}>
            {([
              { id: 'library',  icon: <Music size={13} />,    label: 'Library'  },
              { id: 'settings', icon: <Settings2 size={13} />, label: 'Settings' },
            ] as { id: DrawerTab; icon: React.ReactNode; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, height: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid #e8a027' : '2px solid transparent',
                  color: activeTab === tab.id ? '#e8a027' : '#505068',
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

                {/* ── Library ── */}
                <SectionHeader icon={<BookOpen size={11} />} label="Library" />
                <OptionRow label="Demo folder" hint="Removes bundled demo songs from library view. Files are not deleted.">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <OptionBtn active={!hideDemoFolder} onClick={() => setHideDemoFolder(false)}>Show</OptionBtn>
                    <OptionBtn active={hideDemoFolder}  onClick={() => setHideDemoFolder(true)}>Hide</OptionBtn>
                  </div>
                </OptionRow>
                {/* ── Chord Transcription toggle ────────────────────────────────── */}
                <OptionRow label="Chord Transcription" hint="Adds a transcript icon to every file in your library — click to generate a chord chart PDF.">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <OptionBtn active={chordTranscriptionEnabled} onClick={() => setChordTranscriptionEnabled(true)}>On</OptionBtn>
                    <OptionBtn active={!chordTranscriptionEnabled} onClick={() => setChordTranscriptionEnabled(false)}>Off</OptionBtn>
                  </div>
                </OptionRow>

                {/* ── Note Names ── */}
                <SectionHeader icon={<Type size={11} />} label="Note Names" />
                <OptionRow label="Display system">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {NOTE_NAMING_OPTIONS.slice(0, 2).map(opt => (
                      <OptionBtn key={opt.value} active={noteNaming === opt.value}
                        onClick={() => setNoteNaming(opt.value)} title={opt.hint}>
                        {opt.label}
                      </OptionBtn>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {NOTE_NAMING_OPTIONS.slice(2, 4).map(opt => (
                      <OptionBtn key={opt.value} active={noteNaming === opt.value}
                        onClick={() => setNoteNaming(opt.value)} title={opt.hint}>
                        {opt.label}
                      </OptionBtn>
                    ))}
                  </div>
                  <div style={{
                    marginTop: 6, padding: '4px 8px',
                    background: '#0e0e16', borderRadius: 4,
                    fontSize: 10, fontFamily: 'JetBrains Mono',
                    color: '#b0b0cc', letterSpacing: '0.08em', textAlign: 'center',
                  }}>
                    {noteNaming === 'english'          && 'C  D  E  F  G  A  B'}
                    {noteNaming === 'central-european' && 'C  D  E  F  G  A  H'}
                    {noteNaming === 'solfege'          && 'Do Re Mi Fa Sol La Si'}
                    {noteNaming === 'hidden'           && '— labels hidden —'}
                  </div>
                </OptionRow>

                {noteNaming !== 'hidden' && (
                  <OptionRow
                    label="Accidentals"
                    hint={accidentals === 'flat' ? 'e.g.  Bb  Eb  Ab  Db  Gb' : 'e.g.  A#  D#  G#  C#  F#'}
                  >
                    <div style={{ display: 'flex', gap: 4 }}>
                      <OptionBtn active={accidentals === 'flat'} onClick={() => setAccidentals('flat')} title="Flat names">♭ Flats</OptionBtn>
                      <OptionBtn active={accidentals === 'sharp'} onClick={() => setAccidentals('sharp')} title="Sharp names">♯ Sharps</OptionBtn>
                    </div>
                  </OptionRow>
                )}

                {/* ── Keyboard ── */}
                <SectionHeader icon={<Piano size={11} />} label="Keyboard" />
                <OptionRow label="Key range" hint="Number of keys on the virtual keyboard">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {KEYBOARD_SIZES.map(size => (
                      <OptionBtn key={size} active={keyboardSize === size}
                        onClick={() => setKeyboardSize(size)} title={`${size}-key keyboard`}>
                        {size}
                      </OptionBtn>
                    ))}
                  </div>
                </OptionRow>

                {/* ── Piano Roll ── */}
                <SectionHeader icon={<ZoomIn size={11} />} label="Piano Roll" />
                <OptionRow label={`Zoom  —  ${Math.round(zoomLevel * 100)}%`} hint={`${Math.round(6 / zoomLevel * 10) / 10}s visible · higher = notes appear larger`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ZoomStepBtn
                      disabled={zoomLevel <= ZOOM_STEPS[0]}
                      onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i > 0) setZoomLevel(ZOOM_STEPS[i - 1]) }}
                    >−</ZoomStepBtn>
                    <div style={{ flex: 1, position: 'relative', height: 4, background: '#1e1e2c', borderRadius: 2 }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                        background: '#e8a027',
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
                            background: zoomLevel === step ? '#e8a027' : '#2a2a3a',
                            border: `1.5px solid ${zoomLevel === step ? '#e8a027' : '#404055'}`,
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

                <OptionRow label="Bar numbers & grid lines">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <OptionBtn active={showBarNumbers} onClick={() => setShowBarNumbers(true)}>Show</OptionBtn>
                    <OptionBtn active={!showBarNumbers} onClick={() => setShowBarNumbers(false)}>Hide</OptionBtn>
                  </div>
                </OptionRow>

                {/* ── Audio ── */}
                <SectionHeader icon={<Volume2 size={11} />} label="Audio" />
                <OptionRow label="Sound engine">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {/* GM Synth — always available, switches back from Samples instantly */}
                    <OptionBtn
                      active={audioEngine === 'gm'}
                      onClick={() => setAudioEngine('gm')}
                      title="Built-in GM synthesiser (jzz-synth-tiny) — always available offline"
                    >GM Synth</OptionBtn>
                    {/* Samples — loads GeneralUser GS SF2 via spessasynth_lib on first click */}
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
                  {/* Loading progress / status block */}
                  {samplesStatus === 'loading' && (
                    <div style={{ marginTop: 7 }}>
                      <div style={{ fontSize: 9, color: '#707088', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>
                        Loading soundfont… {Math.round(samplesProgress * 100)}%
                      </div>
                      <div style={{ height: 3, background: '#1e1e2c', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', background: '#e8a027', borderRadius: 2,
                          width: `${Math.round(samplesProgress * 100)}%`, transition: 'width 0.1s',
                        }} />
                      </div>
                    </div>
                  )}
                  {samplesStatus === 'ready' && (
                    <div style={{ marginTop: 5, fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>
                      GeneralUser-GS.sf2 · 30.8 MB · loaded
                    </div>
                  )}
                  {samplesStatus === 'error' && (
                    <div style={{ marginTop: 5, fontSize: 9, color: '#c0392b', fontFamily: 'JetBrains Mono' }}>
                      Failed to load soundfont — check console
                    </div>
                  )}
                  {samplesStatus === 'idle' && (
                    <div style={{ marginTop: 5, fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>
                      {audioEngine === 'gm'
                        ? 'GM Synth (jzz-synth-tiny) — ships with app, no internet needed.'
                        : 'GeneralUser-GS.sf2 · 30.8 MB · click Samples to load'}
                    </div>
                  )}
                </OptionRow>

                {/* ── Playback ── */}
                <SectionHeader icon={<Music size={11} />} label="Playback" />
                <OptionRow label="Chord Prompter" hint="Shows chord names during playback — past, current and upcoming chords.">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <OptionBtn active={chordPrompterEnabled} onClick={() => setChordPrompterEnabled(true)}>On</OptionBtn>
                    <OptionBtn active={!chordPrompterEnabled} onClick={() => setChordPrompterEnabled(false)}>Off</OptionBtn>
                  </div>
                </OptionRow>

                {/* ── MIDI Editor ── */}
                <SectionHeader icon={<Scissors size={11} />} label="MIDI Editor" />
                {/* ── Split mode toggle ────────────────────────────────────────── */}
                <OptionRow label="Split mode" hint="Piano/organ tracks with ≥15% notes in each register show a Split button in the editor.">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <OptionBtn active={splitBreakpointType === 'single'} onClick={() => setSplitBreakpointType('single')}>Single</OptionBtn>
                    <OptionBtn active={splitBreakpointType === 'range'}  onClick={() => setSplitBreakpointType('range')}>Range</OptionBtn>
                  </div>
                </OptionRow>
                {/* ── Single: one note stepper ─────────────────────────────────── */}
                {splitBreakpointType === 'single' ? (
                  <OptionRow
                    label={`Split note — ${SPLIT_NOTE_NAMES[splitBreakpointNote % 12]}${Math.floor(splitBreakpointNote / 12) - 1}`}
                    hint="Notes below this pitch → LH, notes above → RH."
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ZoomStepBtn disabled={splitBreakpointNote <= 48} onClick={() => setSplitBreakpointNote(splitBreakpointNote - 1)}>−</ZoomStepBtn>
                      <div style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 13, color: '#b0b0cc' }}>
                        {SPLIT_NOTE_NAMES[splitBreakpointNote % 12]}{Math.floor(splitBreakpointNote / 12) - 1}
                      </div>
                      <ZoomStepBtn disabled={splitBreakpointNote >= 60} onClick={() => setSplitBreakpointNote(splitBreakpointNote + 1)}>+</ZoomStepBtn>
                    </div>
                  </OptionRow>
                ) : (
                  /* ── Range: lower + upper steppers side-by-side ─────────────── */
                  <OptionRow
                    label={`Split zone — ${SPLIT_NOTE_NAMES[splitBreakpointRangeStart % 12]}${Math.floor(splitBreakpointRangeStart / 12) - 1} to ${SPLIT_NOTE_NAMES[splitBreakpointRangeEnd % 12]}${Math.floor(splitBreakpointRangeEnd / 12) - 1}`}
                    hint="Notes inside the zone are assigned by proximity — closer to lower bound → LH, closer to upper → RH."
                  >
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#707088', marginBottom: 4, fontFamily: 'Inter' }}>Lower</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ZoomStepBtn disabled={splitBreakpointRangeStart <= 48} onClick={() => setSplitBreakpointRangeStart(splitBreakpointRangeStart - 1)}>−</ZoomStepBtn>
                          <div style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#b0b0cc' }}>
                            {SPLIT_NOTE_NAMES[splitBreakpointRangeStart % 12]}{Math.floor(splitBreakpointRangeStart / 12) - 1}
                          </div>
                          <ZoomStepBtn disabled={splitBreakpointRangeStart >= splitBreakpointRangeEnd - 1} onClick={() => setSplitBreakpointRangeStart(splitBreakpointRangeStart + 1)}>+</ZoomStepBtn>
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#707088', marginBottom: 4, fontFamily: 'Inter' }}>Upper</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ZoomStepBtn disabled={splitBreakpointRangeEnd <= splitBreakpointRangeStart + 1} onClick={() => setSplitBreakpointRangeEnd(splitBreakpointRangeEnd - 1)}>−</ZoomStepBtn>
                          <div style={{ flex: 1, textAlign: 'center', fontFamily: 'JetBrains Mono', fontSize: 11, color: '#b0b0cc' }}>
                            {SPLIT_NOTE_NAMES[splitBreakpointRangeEnd % 12]}{Math.floor(splitBreakpointRangeEnd / 12) - 1}
                          </div>
                          <ZoomStepBtn disabled={splitBreakpointRangeEnd >= 60} onClick={() => setSplitBreakpointRangeEnd(splitBreakpointRangeEnd + 1)}>+</ZoomStepBtn>
                        </div>
                      </div>
                    </div>
                  </OptionRow>
                )}

                {/* ── Appearance ── */}
                <SectionHeader icon={<Palette size={11} />} label="Appearance" />
                <OptionRow label="Background">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <AppBgBtn color="#0f0f12" label="Dark" active={appTheme === 'dark'} onClick={() => setAppTheme('dark')} />
                    <AppBgBtn color="#12100e" label="Warm" active={appTheme === 'warm'} onClick={() => setAppTheme('warm')} />
                  </div>
                </OptionRow>

                {/* About */}
                <div style={{ padding: '14px 14px 10px', borderTop: '1px solid #1a1a26', marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <svg width="16" height="16" viewBox="0 0 100 100" fill="none">
                      <circle cx="50" cy="50" r="44" stroke="#e8a027" strokeWidth="8"/>
                      <line x1="22" y1="38" x2="78" y2="38" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                      <line x1="22" y1="50" x2="78" y2="50" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                      <line x1="22" y1="62" x2="78" y2="62" stroke="#e8a027" strokeWidth="7" strokeLinecap="round"/>
                    </svg>
                    <span style={{ color: '#50506a', fontSize: 10, fontFamily: 'JetBrains Mono' }}>Orfeo · v0.7.0</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#35354a', fontFamily: 'JetBrains Mono', lineHeight: 1.5 }}>
                    MIT License · github.com/SquareBow/orfeo
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* ── Manual link — always visible at drawer bottom ── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid #1a1a26',
            padding: '8px 14px',
          }}>
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/SquareBow/orfeo/blob/main/docs/HOW_TO_USE.md')}
              title="Open user manual on GitHub"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 7,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: '#404055', padding: '4px 0',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#404055'}
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

function ZoomStepBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 22, height: 22, borderRadius: 4,
      background: '#131320', border: '1px solid #252535',
      color: disabled ? '#303040' : '#707088',
      fontSize: 16, lineHeight: 1,
      cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  )
}

function AppBgBtn({ color, label, active, onClick, comingSoon }: {
  color: string; label: string; active: boolean; onClick: () => void; comingSoon?: boolean
}) {
  return (
    <button onClick={comingSoon ? undefined : onClick} style={{
      flex: 1, padding: '6px 4px', borderRadius: 4,
      border: active ? '1px solid #e8a02755' : '1px solid #252535',
      background: active ? '#e8a02714' : '#131320',
      color: active ? '#e8a027' : '#505068',
      fontSize: 10, cursor: comingSoon ? 'default' : 'pointer',
      opacity: comingSoon ? 0.4 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      transition: 'all 0.12s',
    }}>
      <div style={{ width: 28, height: 14, borderRadius: 3, background: color, border: '1px solid #303040' }} />
      <span style={{ fontFamily: 'Inter', fontSize: 10 }}>{label}</span>
    </button>
  )
}
