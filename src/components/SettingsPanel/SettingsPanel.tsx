import { useState, useMemo } from 'react'
import {
  Settings2, ChevronLeft, Type, Piano, Palette, ZoomIn, Volume2,
  Music, FolderOpen, Star, ChevronRight, RefreshCw, FileMusic,
} from 'lucide-react'
import { useStore } from '../../store'
import type { NoteNaming, KeyboardSize, Accidentals } from '../../types'

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
  const setLibraryFolder = useStore((s) => s.setLibraryFolder)
  const setLibraryFiles = useStore((s) => s.setLibraryFiles)
  const setLibraryFolderAndFiles = useStore((s) => s.setLibraryFolderAndFiles)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const loadLibraryFile = useStore((s) => s.loadLibraryFile)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())



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
      // Dynamically import to avoid circular deps
      const { parseMidiBuffer } = await import('../../utils/midiParser')
      const { detectKeyFromTracks, parseKeySignature } = await import('../../utils/keyDetection')
      const { useStore } = await import('../../store')
      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath ?? '')
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
  }

  type FileGroup = { folder: string | null; files: LibraryFile[] }
  const grouped: FileGroup[] = useMemo(() => {
    const allFiles = filter === 'starred'
      ? libraryFiles.filter(f => libraryFavourites.has(f.path))
      : libraryFiles
    const rootFiles: LibraryFile[] = []
    const folderMap = new Map<string, LibraryFile[]>()
    for (const file of allFiles) {
      if (!libraryFolder) { rootFiles.push(file); continue }
      // Normalize to forward slashes for cross-platform comparison
      const normFile = file.path.replace(/\\/g, '/')
      const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
      const rel = normFile.startsWith(normRoot) ? normFile.slice(normRoot.length).replace(/^\//, '') : file.name
      const parts = rel.split('/')
      if (parts.length <= 1) {
        rootFiles.push(file)
      } else {
        const folder = parts[0]
        if (!folderMap.has(folder)) folderMap.set(folder, [])
        folderMap.get(folder)!.push(file)
      }
    }
    const starred = rootFiles.filter(f => libraryFavourites.has(f.path))
    const unstarred = rootFiles.filter(f => !libraryFavourites.has(f.path))
    const result: FileGroup[] = [{ folder: null, files: filter !== 'starred' ? [...starred, ...unstarred] : [...starred, ...unstarred] }]
    Array.from(folderMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([folder, files]) => {
      result.push({ folder, files })
    })
    return result
  }, [libraryFiles, libraryFavourites, libraryFolder, filter])

  const toggleFolder = (folder: string) => setCollapsedFolders(prev => {
    const next = new Set(prev)
    if (next.has(folder)) next.delete(folder); else next.add(folder)
    return next
  })

  const folderName = libraryFolder
    ? libraryFolder.split(/[\\/]/).pop() ?? libraryFolder
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Folder picker row */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a26', flexShrink: 0 }}>
        {libraryFolder ? (
          <div>
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
                  {f === 'all' ? `All (${libraryFiles.length})` : `★ ${Array.from(libraryFavourites).filter(p => libraryFiles.some(f => f.path === p)).length}`}
                </button>
              ))}
              <button
                onClick={handlePickFolder}
                title="Change library folder"
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 10,
                  border: '1px solid #252535', background: 'transparent',
                  color: '#505068', cursor: 'pointer',
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

      {/* File list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {grouped.every(g => g.files.length === 0) && libraryFolder && (
          <div style={{ padding: '16px 14px', fontSize: 11, color: '#404055', textAlign: 'center' }}>
            {filter === 'starred' ? 'No starred files yet. Star a file with ★' : 'No MIDI files found.'}
          </div>
        )}

        {grouped.map((group, gi) => (
          <div key={group.folder ?? '__root__'}>
            {group.folder && (
              <div
                onClick={() => toggleFolder(group.folder!)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px',
                  background: '#0e0e16',
                  borderBottom: '1px solid #1a1a26',
                  borderTop: gi > 0 ? '1px solid #1a1a26' : 'none',
                  cursor: 'pointer', userSelect: 'none',
                }}
              >
                {collapsedFolders.has(group.folder)
                  ? <ChevronRight size={10} style={{ color: '#505068', flexShrink: 0 }} />
                  : <ChevronDown size={10} style={{ color: '#505068', flexShrink: 0 }} />
                }
                <FolderOpen size={11} style={{ color: '#e8a02780', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 10, color: '#707088', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.folder}
                </span>
                <span style={{ fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>
                  {group.files.length}
                </span>
              </div>
            )}
            {(!group.folder || !collapsedFolders.has(group.folder)) && group.files.map((file) => {
              const starred = libraryFavourites.has(file.path)
              return (
                <div
                  key={file.path}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: group.folder ? '6px 10px 6px 22px' : '7px 10px 7px 12px',
                    borderBottom: '1px solid #181822',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1a1a26'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleLoadFile(file.path)}
                >
                  <FileMusic size={11} style={{ color: '#404055', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 11, color: '#9090a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.name}>
                    {file.name.replace(/\.(mid|midi)$/i, '')}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavourite(file.path) }}
                    title={starred ? 'Remove from favourites' : 'Add to favourites'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: starred ? '#e8a027' : '#303045', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0, fontSize: 12, transition: 'color 0.12s' }}
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
  const [activeTab, setActiveTab] = useState<DrawerTab>('settings')

  const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string; hint: string }[] = [
    { value: 'english',          label: 'English',  hint: 'C D E F G A B' },
    { value: 'central-european', label: 'C. Euro',  hint: 'C D E F G A H' },
    { value: 'solfege',          label: 'Solfège',  hint: 'Do Re Mi Fa Sol La Si' },
    { value: 'hidden',           label: 'Hidden',   hint: 'No labels shown' },
  ]

  const KEYBOARD_SIZES: KeyboardSize[] = [61, 73, 88]
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]

  return (
    <div style={{
      width: settingsPanelOpen ? 220 : 32,
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
        title={settingsPanelOpen ? 'Close panel' : 'Open panel'}
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
        {settingsPanelOpen ? <ChevronLeft size={13} /> : <Settings2 size={13} />}
      </button>

      {settingsPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #1e1e2c', flexShrink: 0,
          }}>
            {([
              { id: 'settings', icon: <Settings2 size={13} />, label: 'Settings' },
              { id: 'library',  icon: <Music size={13} />,    label: 'Library'  },
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
                <OptionRow label={`Zoom  —  ${Math.round(zoomLevel * 100)}%`} hint="Vertical space per beat">
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

                {/* ── Audio ── */}
                <SectionHeader icon={<Volume2 size={11} />} label="Audio" />
                <OptionRow label="Sound engine" hint="GeneralUser GS bundled (~31MB). Load your own .sf2 coming soon.">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <OptionBtn active={true} onClick={() => {}} title="Built-in GM synth">GM Synth</OptionBtn>
                    <OptionBtn active={false} onClick={() => {}} title="Coming in Stage 5c" comingSoon>Samples</OptionBtn>
                  </div>
                </OptionRow>

                {/* ── Appearance ── */}
                <SectionHeader icon={<Palette size={11} />} label="Appearance" />
                <OptionRow label="Background" hint="Coming soon">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <AppBgBtn color="#0f0f12" label="Dark" active={true} onClick={() => {}} />
                    <AppBgBtn color="#1a1a1a" label="Warm" active={false} onClick={() => {}} comingSoon />
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
                    <span style={{ color: '#50506a', fontSize: 10, fontFamily: 'JetBrains Mono' }}>Orfeo · v0.3.0</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#35354a', fontFamily: 'JetBrains Mono', lineHeight: 1.5 }}>
                    MIT License · github.com/SquareBow/orfeo
                  </div>
                </div>

              </div>
            )}
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
