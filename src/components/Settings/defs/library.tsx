import { FolderOpen, FileMusic, MousePointerClick } from 'lucide-react'
import { useStore } from '../../../store'
import { applySkipEmptyBarsChange } from '../../../utils/reloadOpenSong'
import { t } from '../../../utils/i18n'
import { simAvailable } from '../../../utils/midiSimulator'
import { Switch } from '../controls'
import type { SettingDef } from '../types'

// ── Open with Orfeo: how to make Orfeo the app for MIDI files, in this system's words ──
function OpenWithDescription() {
  const ua = navigator.userAgent
  const how = /Mac/i.test(ua)
    ? t`To make Orfeo your default MIDI player, select a file in Finder, choose File › Get Info, pick Orfeo under Open with and click Change All.`
    : /Linux/i.test(ua)
      ? t`To make Orfeo your default MIDI player, right-click a file in your file manager, choose Open With, pick Orfeo and set it as the default.`
      : t`To make Orfeo your default MIDI player, right-click a file, choose Open with › Choose another app, pick Orfeo and click Always.`
  return <>{how}<span style={{ display: 'block', marginTop: 6 }}>{t`Switch on Add to Library on double click to copy the song into your Library, same as when you drop a file onto Orfeo.`}</span></>
}

// A labelled switch under the name: on its own, a switch beside "Open with Orfeo"
// would read as turning double-click opening off
function AddToLibraryRow() {
  const v = useStore(s => s.openWithAddsToLibrary)
  const label = t`Add to Library on double click`
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, minHeight: 22,
      fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: 'var(--text-default)' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <Switch value={v} onChange={x => useStore.getState().setOpenWithAddsToLibrary(x)} label={label} />
    </div>
  )
}

// Dev mode: open a song exactly as a double click in the system would, through the same path
function OpenWithTestPanel() {
  if (!simAvailable) return null
  const pick = async () => {
    const file = await window.electronAPI.openMidiFile()
    if (file?.filePath) await window.electronAPI.simulateOpenWith(file.filePath)
  }
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Double click · test builds only`}</div>
      <button onClick={() => { void pick() }}
        style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-inactive)',
          fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>{t`Open a song as if double-clicked…`}</button>
    </div>
  )
}

export const LIBRARY_DEFS: SettingDef[] = [
  {
    id: 'showDemo', icon: FolderOpen, kind: 'switch',
    Control: () => { const hidden = useStore(s => s.hideDemoFolder); return <Switch value={!hidden} onChange={(v) => useStore.getState().setHideDemoFolder(!v)} label={t`Show demo content`} /> },
    // the line follows the switch, as in the old drawer
    Description: () => {
      const hidden = useStore(s => s.hideDemoFolder)
      return <>{hidden
        ? t`The demo songs that come with Orfeo are hidden from your Library. Turn on to show them again.`
        : t`The demo songs that come with Orfeo are shown in your Library. Turn off to hide them — nothing is deleted.`}</>
    },
  },
  {
    id: 'chordTranscription', icon: FileMusic, kind: 'switch', badge: 'beta',
    Control: () => { const v = useStore(s => s.chordTranscriptionEnabled); return <Switch value={v} onChange={x => { const skipped = useStore.getState().skipEmptyBars; useStore.getState().setChordTranscriptionEnabled(x); if (skipped && !useStore.getState().skipEmptyBars) void applySkipEmptyBarsChange() }} label="Chord Transcription" /> },
  },
  { id: 'openWith', icon: MousePointerClick, kind: 'choice', Control: AddToLibraryRow, Description: OpenWithDescription, Extra: OpenWithTestPanel },
]
