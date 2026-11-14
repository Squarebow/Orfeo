import { Languages, Hash, Radar, ScanEye, Type, ToggleLeft, ToggleRight } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import type { NoteNaming } from '../../../types'
import { getSargamName, resolveSa } from '../../../utils/noteNames'
import { OptionBtn, SettingsDropdown, EyeClosed, PreviewBox, GlanceLine, SubLabel } from '../controls'
import type { SettingDef } from '../types'
import { followNeedsPick } from '../followPick'

// ── GM groups selectable for "Follow → By group" — same group ids
// TrackPanel.tsx/MixerConsole.tsx sort tracks by, minus 'drums'. ─────────
export const CHORD_FOLLOW_GROUPS = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic', 'percussive', 'sfx',
]
export function groupLabel(group: string): string {
  return group.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string }[] = [
  { value: 'english', label: 'UK/US' },
  { value: 'central-european', label: 'EU' },
  { value: 'solfege', label: t`Solfège` },
  { value: 'sargam', label: 'Sargam' },
]

function DisplaySystemControl() {
  const noteNaming = useStore(s => s.noteNaming)
  const setNoteNaming = useStore(s => s.setNoteNaming)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      {NOTE_NAMING_OPTIONS.map(opt => (
        <OptionBtn key={opt.value} active={noteNaming === opt.value} onClick={() => setNoteNaming(opt.value)}>{opt.label}</OptionBtn>
      ))}
      {/* Hide — red when active (hidden is a meaningful state) */}
      <OptionBtn active={noteNaming === 'hidden'} onClick={() => setNoteNaming('hidden')} activeColor="error">
        <EyeClosed size={11} strokeWidth={1.5} />
      </OptionBtn>
    </div>
  )
}
function DisplaySystemGlance() {
  const noteNaming = useStore(s => s.noteNaming)
  return (
    <PreviewBox>
      {noteNaming === 'english'          && 'C  D  E  F  G  A  B'}
      {noteNaming === 'central-european' && 'C  D  E  F  G  A  H'}
      {noteNaming === 'solfege'          && 'Do Re Mi Fa Sol La Si'}
      {noteNaming === 'sargam'           && <SargamPreview />}
      {noteNaming === 'hidden'           && t`— labels hidden —`}
    </PreviewBox>
  )
}

// Sargam: Sa follows the song's key, or sits where the player sets it; Latin or Devanagari.
// Only single notes on the keyboard and piano roll take Sargam names; chords stay Western.
const SA_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
function SargamPreview() {
  const script = useStore(s => s.sargam.script)
  return <>{Array.from({ length: 12 }, (_, i) => getSargamName(i, 0, script)).join('  ')}</>
}
function SargamExtra() {
  const sargam = useStore(s => s.sargam)
  const setSargam = useStore(s => s.setSargam)
  const keySa = useStore(s => resolveSa('auto', s.detectedKey))
  const saValue = sargam.sa === 'auto' ? 'auto' : String(sargam.sa)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', columnGap: 10, rowGap: 8, marginTop: 8 }}>
      <SubLabel>{t`Sa`}</SubLabel>
      <SettingsDropdown value={saValue}
        options={[{ value: 'auto', label: t`Follow the song's key (${SA_NOTES[keySa]})` }, ...SA_NOTES.map((n, i) => ({ value: String(i), label: n }))]}
        onChange={v => setSargam({ sa: v === 'auto' ? 'auto' : Number(v) })} />
      <SubLabel>{t`Script`}</SubLabel>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <OptionBtn active={sargam.script === 'latin'} onClick={() => setSargam({ script: 'latin' })}>Sa Re Ga</OptionBtn>
        <OptionBtn active={sargam.script === 'devanagari'} onClick={() => setSargam({ script: 'devanagari' })}>सा रे ग</OptionBtn>
      </div>
    </div>
  )
}

function AccidentalsControl() {
  const accidentals = useStore(s => s.accidentals)
  const setAccidentals = useStore(s => s.setAccidentals)
  const side = (active: boolean) => ({
    cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 600,
    color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <span onClick={() => setAccidentals('flat')} style={side(accidentals === 'flat')}><span style={{ fontSize: 'calc(var(--text-xs) * 1.5)' }}>♭</span> {t`Flats`}</span>
      <button
        onClick={() => setAccidentals(accidentals === 'flat' ? 'sharp' : 'flat')}
        aria-label={t`Sharps or flats`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: 'var(--text-amber)' }}
      >
        {accidentals === 'flat' ? <ToggleLeft size={16} strokeWidth={1.5} /> : <ToggleRight size={16} strokeWidth={1.5} />}
      </button>
      <span onClick={() => setAccidentals('sharp')} style={side(accidentals === 'sharp')}><span style={{ fontSize: 'calc(var(--text-xs) * 1.5)' }}>♯</span> {t`Sharps`}</span>
    </div>
  )
}
function AccidentalsGlance() {
  const accidentals = useStore(s => s.accidentals)
  return <GlanceLine center>{accidentals === 'flat' ? 'Bb  Eb  Ab  Db  Gb' : 'A#  D#  G#  C#  F#'}</GlanceLine>
}

function ChordTrackingControl() {
  const mode = useStore(s => s.chordTrackingMode)
  const setMode = useStore(s => s.setChordTrackingMode)
  const chooseFollow = () => {
    setMode('follow')
    const s = useStore.getState()
    // Follow does nothing until something is picked — open the full settings to pick it
    if (followNeedsPick(s)) s.openSettingsWindow('notation')
  }
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      <OptionBtn active={mode === 'auto'} onClick={() => setMode('auto')}>{t`Auto`}</OptionBtn>
      <OptionBtn active={mode === 'harmony'} onClick={() => setMode('harmony')}>{t`Harmony`}</OptionBtn>
      <OptionBtn active={mode === 'follow'} onClick={chooseFollow}>{t`Follow`}</OptionBtn>
    </div>
  )
}
function ChordTrackingGlance() {
  const mode = useStore(s => s.chordTrackingMode)
  return (
    <GlanceLine>
      {mode === 'auto' && t`Follows the chord instruments (piano, keys, guitar, strings), ignoring melody and ornament lines. Best for most songs.`}
      {mode === 'harmony' && t`Every non-drum track pooled together, including melody. For dense textures where no one instrument holds the chords.`}
      {mode === 'follow' && t`Scoped to one instrument or group you choose.`}
    </GlanceLine>
  )
}
function ChordTrackingExtra() {
  const mode = useStore(s => s.chordTrackingMode)
  const subMode = useStore(s => s.chordFollowSubMode)
  const setSubMode = useStore(s => s.setChordFollowSubMode)
  const group = useStore(s => s.chordFollowGroup)
  const setGroup = useStore(s => s.setChordFollowGroup)
  const trackIndex = useStore(s => s.chordFollowTrackIndex)
  const setTrackIndex = useStore(s => s.setChordFollowTrackIndex)
  const tracks = useStore(s => s.tracks)
  if (mode !== 'follow') return null
  return (
    <>
      <SubLabel>{t`Follow`}</SubLabel>
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 6 }}>
        <OptionBtn active={subMode === 'group'} onClick={() => setSubMode('group')}>{t`By Group`}</OptionBtn>
        <OptionBtn active={subMode === 'track'} onClick={() => setSubMode('track')}>{t`By Track`}</OptionBtn>
      </div>
      {subMode === 'group' ? (
        <SettingsDropdown
          value={group ?? ''}
          onChange={(v) => setGroup(v || null)}
          options={[{ value: '', label: t`— choose a group —` }, ...CHORD_FOLLOW_GROUPS.map(g => ({ value: g, label: groupLabel(g) }))]}
        />
      ) : tracks.length === 0 ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-inactive)', fontFamily: 'var(--font-ui)', fontStyle: 'italic' }}>{t`No file open`}</div>
      ) : (
        <SettingsDropdown
          value={trackIndex === null ? '' : String(trackIndex)}
          onChange={(v) => setTrackIndex(v === '' ? null : Number(v))}
          options={[{ value: '', label: t`— choose a track —` }, ...tracks.map(tr => ({ value: String(tr.index), label: tr.trackName }))]}
        />
      )}
    </>
  )
}

function ChordReadingControl() {
  const mode = useStore(s => s.chordReadingMode)
  const setMode = useStore(s => s.setChordReadingMode)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      <OptionBtn active={mode === 'safe'} onClick={() => setMode('safe')}>{t`Safe`}</OptionBtn>
      <OptionBtn active={mode === 'progressive'} onClick={() => setMode('progressive')}>{t`Progressive`}</OptionBtn>
    </div>
  )
}
function ChordReadingExtra() {
  const mode = useStore(s => s.chordReadingMode)
  return (
    <GlanceLine>
      {mode === 'safe' && t`Only names a chord's extra notes (like a 7th) once they've rung long enough to be sure. The default.`}
      {mode === 'progressive' && t`Also trusts a clean, real grab — several notes struck together, or rolled quickly — to show that extra note right away, even if it's brief. On a few busy songs, switching to this can take a couple of seconds to catch up.`}
    </GlanceLine>
  )
}

function ChordNamingControl() {
  const style = useStore(s => s.chordNamingStyle)
  const setStyle = useStore(s => s.setChordNamingStyle)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      <OptionBtn active={style === 'abbreviation'} onClick={() => setStyle('abbreviation')}>{t`Abbreviations`}</OptionBtn>
      <OptionBtn active={style === 'symbol'} onClick={() => setStyle('symbol')}>{t`Symbols`}</OptionBtn>
    </div>
  )
}
function ChordNamingExtra() {
  const style = useStore(s => s.chordNamingStyle)
  return <PreviewBox spacing="0.04em">{style === 'abbreviation' ? 'Bb(b5)/D  ·  Cm7  ·  Gaug  ·  Fdim7' : 'Bb(♭5)/D  ·  Cm7  ·  G+  ·  F°7'}</PreviewBox>
}

export const NOTATION_DEFS: SettingDef[] = [
  { id: 'displaySystem', icon: Languages, kind: 'choice', Control: DisplaySystemControl, Glance: DisplaySystemGlance,
    Extra: () => useStore(s => s.noteNaming) === 'sargam' ? <SargamExtra /> : null },
  { id: 'accidentals', icon: Hash, kind: 'choice', Control: AccidentalsControl, Glance: AccidentalsGlance,
    useVisible: () => useStore(s => s.noteNaming) !== 'hidden' },
  { id: 'chordTracking', icon: Radar, kind: 'choice', Control: ChordTrackingControl, Glance: ChordTrackingGlance, Extra: ChordTrackingExtra },
  { id: 'chordReading', icon: ScanEye, kind: 'choice', Control: ChordReadingControl, Extra: ChordReadingExtra },
  { id: 'chordNaming', icon: Type, kind: 'choice', Control: ChordNamingControl, Extra: ChordNamingExtra },
]
