import { useState, type CSSProperties } from 'react'
import { FolderOpen, FileMusic, MousePointerClick, MicVocal, Tags, X, ListOrdered } from 'lucide-react'
import type { QueueEndAction } from '../../../utils/practiceQueue'
import { useStore } from '../../../store'
import { confirmDialog } from '../../../utils/confirmController'
import { MAX_TAG_LENGTH } from '../../../utils/libraryTags'
import { TagPill } from '../../SettingsPanel/LibraryTags'
import Tooltip from '../../Tooltip'
import { applySkipEmptyBarsChange } from '../../../utils/reloadOpenSong'
import { t } from '../../../utils/i18n'
import { simAvailable } from '../../../utils/midiSimulator'
import { Switch, OptionBtn, SubLabel, HelpText } from '../controls'
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

// ── Tags: rename by clicking a tag, delete with ✕ (asked first when songs carry it), add at the end ──
function TagsManager() {
  const tags = useStore(s => s.libraryTags)
  const songTags = useStore(s => s.songTags)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const uses = (tag: string) => Object.values(songTags).filter(list => list.includes(tag)).length
  const commitRename = () => {
    if (editing && draft.trim() && draft.trim() !== editing && !useStore.getState().renameLibraryTag(editing, draft)) {
      setProblem(t`That tag already exists`); return
    }
    setEditing(null); setProblem(null)
  }
  const remove = async (tag: string) => {
    const n = uses(tag)
    if (n > 0) {
      const choice = await confirmDialog({
        message: n === 1 ? t`Delete the tag "${tag}"? It comes off 1 song.` : t`Delete the tag "${tag}"? It comes off ${n} songs.`,
        detail: t`Your files aren't changed.`,
        buttons: [t`Delete tag`, t`Cancel`], destructiveIndex: 0,
      })
      if (choice !== 0) return
    }
    useStore.getState().deleteLibraryTag(tag)
  }
  const add = () => {
    if (!adding.trim()) return
    if (!useStore.getState().addLibraryTag(adding)) { setProblem(t`That tag already exists`); return }
    setAdding(''); setProblem(null)
  }
  const field: CSSProperties = { minWidth: 0, background: 'var(--bg-modal)', border: '1px solid var(--border2)', borderRadius: 4, padding: '3px 6px',
    color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', outline: 'none' }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t`No tags yet`}</span>}
        {tags.map(tag => editing === tag ? (
          <input key={tag} autoFocus value={draft} maxLength={MAX_TAG_LENGTH} aria-label={t`Rename tag`}
            onChange={e => { setDraft(e.target.value); setProblem(null) }}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); setProblem(null) } }}
            style={{ ...field, width: 120 }} />
        ) : (
          <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title={t`Click to rename`} oneLine>
              <span onClick={() => { setEditing(tag); setDraft(tag); setProblem(null) }} style={{ display: 'inline-flex' }}><TagPill label={tag} /></span>
            </Tooltip>
            <button aria-label={t`Delete tag ${tag}`} onClick={() => { void remove(tag) }}
              style={{ display: 'flex', padding: 1, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--status-protected)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 220px) auto', gap: 6, alignItems: 'center' }}>
        <input value={adding} maxLength={MAX_TAG_LENGTH} placeholder={t`New tag…`} aria-label={t`New tag`}
          onChange={e => { setAdding(e.target.value); setProblem(null) }}
          onKeyDown={e => { if (e.key === 'Enter') add() }} style={field} />
        <button onClick={add} disabled={!adding.trim()}
          style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border2)', background: 'transparent', fontSize: 10,
            color: 'var(--text-inactive)', cursor: adding.trim() ? 'pointer' : 'default', opacity: adding.trim() ? 1 : 0.5, fontFamily: 'var(--font-ui)' }}>
          {t`Add`}
        </button>
      </div>
      {problem && <span style={{ fontSize: 10, color: 'var(--status-protected)' }}>{problem}</span>}
    </div>
  )
}

// ── Practice queue: what happens when a queued song plays to its end ──
function QueueEndChoice() {
  const on = useStore(s => s.queueEnabled)
  const action = useStore(s => s.queueEndAction)
  if (!on) return null
  const set = (a: QueueEndAction) => useStore.getState().setQueueEndAction(a)
  const help: Record<QueueEndAction, string> = {
    ask: t`A small card at the bottom offers Again, Next or Stop queue. Ignore it and nothing happens.`,
    next: t`The next song starts after a 3-second countdown, which you can cancel or turn into Again.`,
    repeat: t`The same song plays again, until you move on with Alt + ↓ or the queue's buttons.`,
    stop: t`Nothing happens. Alt + ↓ and Alt + ↑ move on when you're ready.`,
  }
  return (
    <>
      <SubLabel>{t`When a song ends`}</SubLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-1)' }}>
        <OptionBtn active={action === 'ask'} onClick={() => set('ask')}>{t`Ask`}</OptionBtn>
        <OptionBtn active={action === 'next'} onClick={() => set('next')}>{t`Play the next song`}</OptionBtn>
        <OptionBtn active={action === 'repeat'} onClick={() => set('repeat')}>{t`Repeat this song`}</OptionBtn>
        <OptionBtn active={action === 'stop'} onClick={() => set('stop')}>{t`Stop`}</OptionBtn>
      </div>
      <HelpText>{help[action]}</HelpText>
      <QueueTestPanel />
    </>
  )
}

// Dev mode: the end of a song happens on its own, so make it happen now
function QueueTestPanel() {
  if (!simAvailable) return null
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Queue · test builds only`}</div>
      <button onClick={() => { useStore.getState().closeSettingsWindow(); useStore.setState({ songEndedAt: Date.now() }) }}
        style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-inactive)',
          fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>{t`The open song just ended`}</button>
      <div style={{ marginTop: 4, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{t`Works when the open song is the queue's current one.`}</div>
    </div>
  )
}

// Dev mode: check the whole Library again from scratch, and see what was found
function LyricsTestPanel() {
  const found = useStore(s => s.showLyricsMark ? Object.values(s.lyricsIndex).filter(e => e.lyrics).length : null)
  const checked = useStore(s => Object.keys(s.lyricsIndex).length)
  if (!simAvailable) return null
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Lyrics · test builds only`}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => useStore.getState().clearLyricsIndex()}
          style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-inactive)',
            fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>{t`Check the Library again`}</button>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {found === null ? t`switched off` : t`${found} with lyrics of ${checked} checked`}
        </span>
      </div>
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
  { id: 'tags', icon: Tags, kind: 'choice', Control: TagsManager },
  {
    id: 'practiceQueue', icon: ListOrdered, kind: 'switch', Extra: QueueEndChoice,
    Control: () => { const v = useStore(s => s.queueEnabled); return <Switch value={v} onChange={x => useStore.getState().setQueueEnabled(x)} label={t`Practice queue`} /> },
  },
  {
    id: 'showLyrics', icon: MicVocal, kind: 'switch', Extra: LyricsTestPanel,
    Control: () => { const v = useStore(s => s.showLyricsMark); return <Switch value={v} onChange={x => useStore.getState().setShowLyricsMark(x)} label={t`Show files with lyrics`} /> },
  },
]
