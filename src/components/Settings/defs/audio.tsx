import { Volume2, Library, Gauge, Upload } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { OptionBtn, Switch, SettingsDropdown, SoundfontActionLink, HelpText } from '../controls'
import {
  useSoundfontState, useOutputLatency, chooseSamplesFromQuick, selectSoundfont,
  downloadSoundfont, deleteSoundfont, importSoundfont, allSoundfonts,
} from '../../../hooks/useSoundfonts'
import type { SettingDef } from '../types'

function SoundEngineControl() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      <OptionBtn active={audioEngine === 'gm'} onClick={() => useStore.getState().setAudioEngine('gm')}>General MIDI</OptionBtn>
      <OptionBtn active={audioEngine === 'samples'} onClick={chooseSamplesFromQuick}>Samples</OptionBtn>
    </div>
  )
}

// Output delay + the one-line sound-set status (Quick Settings and window)
function SoundEngineGlance() {
  const audioEngine = useStore((s) => s.audioEngine)
  const selectedSoundfont = useStore((s) => s.selectedSoundfont)
  const samplesStatus = useSoundfontState((s) => s.samplesStatus)
  const extra = useSoundfontState((s) => s.extra)
  const active = allSoundfonts(extra).find(sf => sf.id === selectedSoundfont)
  return (
    <>
      {samplesStatus === 'ready' && (
        <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          {active?.name ?? selectedSoundfont} · {active?.sizeMB ?? '?'} MB · <span style={{ color: audioEngine === 'samples' ? 'var(--text-amber)' : 'inherit' }}>loaded</span>
        </div>
      )}
      {samplesStatus === 'loading' && (
        <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>{t`Loading sounds…`}</div>
      )}
      {samplesStatus === 'error' && (
        <div style={{ marginTop: 5, fontSize: 9, color: 'var(--status-error)', fontFamily: 'var(--font-ui)' }}>Failed to load soundfont — check console</div>
      )}
      {samplesStatus === 'idle' && (
        <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
          {audioEngine === 'gm'
            ? 'GM Synth (jzz-synth-tiny) — ships with app, no internet needed.'
            : `${active?.name ?? selectedSoundfont} · ${active?.sizeMB ?? '?'} MB · click Samples to load`}
        </div>
      )}
    </>
  )
}

// Measured output delay (Samples only): "output delay 32 ms", value in amber
function DelayReadout({ upper }: { upper?: boolean }) {
  const outputLatencySec = useOutputLatency()
  if (outputLatencySec === 0) return <>{t`not measurable for this output`}</>
  return <>{upper ? t`Output delay` : t`output delay`} <span style={{ color: 'var(--text-amber)' }}>{Math.round(outputLatencySec * 1000)} ms</span></>
}

// Setup: at the right end of the "Sound engine" name line
function SoundEngineDelay() {
  const audioEngine = useStore((s) => s.audioEngine)
  if (audioEngine !== 'samples') return null
  return (
    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
      <DelayReadout />
    </span>
  )
}

// Window only: loading progress, then the output delay and what it means
function SoundEngineExtra() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <>
      <SoundEngineLoading />
      {audioEngine === 'samples' && (
        <>
          <div style={{ marginTop: 10, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}><DelayReadout upper /></div>
          <HelpText>{t`The real gap between your sound card being told to play a note and it actually reaching the speakers — every machine answers this differently.`}</HelpText>
        </>
      )}
    </>
  )
}
function SoundEngineLoading() {
  const samplesStatus = useSoundfontState((s) => s.samplesStatus)
  const samplesProgress = useSoundfontState((s) => s.samplesProgress)
  if (samplesStatus !== 'loading') return null
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ fontSize: 9, color: 'var(--text-dimmest)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>
        Loading soundfont… {Math.round(samplesProgress * 100)}%
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--text-amber)', borderRadius: 2, width: `${Math.round(samplesProgress * 100)}%`, transition: 'width 0.1s' }} />
      </div>
    </div>
  )
}

// The sound-set library — dimmed + inert while General MIDI is active
function SoundFontsControl() {
  const audioEngine = useStore((s) => s.audioEngine)
  const selectedSoundfont = useStore((s) => s.selectedSoundfont)
  const extra = useSoundfontState((s) => s.extra)
  const downloadingId = useSoundfontState((s) => s.downloadingId)
  const downloadProgress = useSoundfontState((s) => s.downloadProgress)
  const error = useSoundfontState((s) => s.error)
  const all = allSoundfonts(extra)
  return (
    <div style={{ opacity: audioEngine === 'samples' ? 1 : 0.4, pointerEvents: audioEngine === 'samples' ? 'auto' : 'none', transition: 'opacity 0.15s' }}>
      <SettingsDropdown
        value={selectedSoundfont}
        onChange={(id) => void selectSoundfont(id)}
        options={all.filter(sf => sf.downloaded).map(sf => ({ value: sf.id, label: `${sf.name} — ${sf.sizeMB} MB` }))}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: 'var(--space-2)', rowGap: 5, alignItems: 'center' }}>
        {all.map((sf) => {
          const isActive = selectedSoundfont === sf.id
          return (
            <div key={sf.id} style={{ display: 'contents' }}>
              <span
                title={sf.downloaded ? `Use ${sf.name} for the Samples engine` : `Download ${sf.name} first`}
                style={{
                  fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
                  color: isActive ? 'var(--text-amber)' : 'var(--text-inactive)', fontWeight: isActive ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >• {sf.name}</span>
              <span style={{ fontSize: 9, color: 'var(--text-dimmest)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>{sf.sizeMB} MB</span>
              {sf.id === 'generaluser-gs' ? (
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>bundled</span>
              ) : sf.downloaded ? (
                <SoundfontActionLink label="remove" color="var(--text-dimmest)" tooltip={sf.custom ? 'Remove imported file' : 'Delete downloaded file'} onClick={() => void deleteSoundfont(sf.id)} />
              ) : downloadingId === sf.id ? (
                <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--text-amber)', borderRadius: 2, width: `${Math.round(downloadProgress * 100)}%`, transition: 'width 0.1s' }} />
                </div>
              ) : (
                <SoundfontActionLink label="download" color="var(--text-amber)" tooltip={`Download ${sf.name} (${sf.sizeMB} MB)`} onClick={() => void downloadSoundfont(sf.id)} />
              )}
            </div>
          )
        })}
      </div>
      {error && <div style={{ fontSize: 9, color: 'var(--status-error)', fontFamily: 'var(--font-ui)', marginTop: 5 }}>{error}</div>}
      <button
          onClick={() => void importSoundfont()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '5px 8px', width: '100%',
            borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent',
            color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
        >
          <Upload size={11} strokeWidth={1.5} />
          Import your own .sf2/.sf3
        </button>
      <HelpText>Make sure you have the rights to use imported soundfonts.</HelpText>
    </div>
  )
}

export const AUDIO_DEFS: SettingDef[] = [
  { id: 'soundEngine', icon: Volume2, kind: 'choice',
    Description: () => <>{t`General MIDI uses the simple built-in synth — light and always ready.`}<br /><br />{t`Samples plays real recorded instruments from a sound set (recommended).`}</>,
    Control: SoundEngineControl, Glance: SoundEngineGlance, Extra: SoundEngineExtra, NameRight: SoundEngineDelay },
  { id: 'soundFonts', icon: Library, kind: 'choice', Control: SoundFontsControl },
  {
    id: 'autoLevel', icon: Gauge, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoLevelOnLoad); return <Switch value={v} onChange={useStore.getState().setAutoLevelOnLoad} label="Auto-Level on Load" /> },
  },
]
