import { useEffect, useState, type ReactNode } from 'react'
import { Volume2, Library, Gauge, Upload, FileAudio } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { OptionBtn, Switch, SettingsDropdown, SoundfontActionLink, HelpText } from '../controls'
import { getSamplesSampleRate, getSamplesBufferSec } from '../../../hooks/useSamplesEngine'
import { MarqueeText } from '../../MarqueeText'
import {
  useSoundfontState, useOutputLatency, chooseSamplesFromQuick, selectSoundfont,
  downloadSoundfont, deleteSoundfont, importSoundfont, allSoundfonts,
} from '../../../hooks/useSoundfonts'
import type { SettingDef } from '../types'
import { useNativeAudio, stopNative } from '../../../audio/nativeClient'
import { setLowLatency } from '../../../audio/useNativeEngine'
import { useMidiSettings } from '../../../store/midiSettings'

// Native engine (beta): Windows only for now
const NATIVE_AVAILABLE = navigator.userAgent.includes('Windows')

function SoundEngineControl() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      <OptionBtn active={audioEngine === 'gm'} title={t`Generic — sounds like a 1996 Nokia phone`} oneLine
        onClick={async () => { if (useStore.getState().audioEngine === 'native') await stopNative(); useStore.getState().setAudioEngine('gm') }}>GM</OptionBtn>
      <OptionBtn active={audioEngine === 'samples'} title={t`Perfect for listening — real recorded instruments`} oneLine onClick={chooseSamplesFromQuick}>{t`Studio`}</OptionBtn>
      {NATIVE_AVAILABLE && <OptionBtn active={audioEngine === 'native'} title={t`Ideal for playing along on a connected keyboard`} oneLine onClick={() => useStore.getState().setAudioEngine('native')}>{t`Native`}</OptionBtn>}
    </div>
  )
}

// Windows' default output, by name ("Speakers (Realtek(R) Audio)") — what GM and
// Studio play through
function useDefaultOutputName(): string {
  const [name, setName] = useState('')
  useEffect(() => {
    const read = () => navigator.mediaDevices?.enumerateDevices?.().then(list => {
      const d = list.find(x => x.kind === 'audiooutput' && x.deviceId === 'default') ?? list.find(x => x.kind === 'audiooutput')
      // "Default - Speakers (Yeti Stereo Microphone) (b58e:9e84)" → "Speakers (Yeti Stereo Microphone)"
      setName((d?.label ?? '').replace(/^Default - /, '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, ''))
    }).catch(() => {})
    void read()
    navigator.mediaDevices?.addEventListener?.('devicechange', read)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', read)
  }, [])
  return name
}

const rowStyle = { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 10, alignItems: 'baseline', marginTop: 4,
  fontSize: 10, fontFamily: 'var(--font-ui)', lineHeight: 1.4 } as const
// `marquee`: a long name (a sound card's) that scrolls into view on hover when it doesn't fit
// `marquee`: the row's text (for content with styling, also pass it as children) —
// when it doesn't fit, it scrolls into view on hover
function InfoRow({ label, children, marquee }: { label: string; children?: ReactNode; marquee?: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      {marquee !== undefined
        ? <div style={{ display: 'flex', minWidth: 0, textAlign: 'right' }}><MarqueeText name={marquee} spanStyle={{ color: 'var(--text-default)' }}>{children}</MarqueeText></div>
        : <span style={{ color: 'var(--text-default)', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>}
    </div>
  )
}
const amber = (s: ReactNode) => <span style={{ color: 'var(--text-amber)' }}>{s}</span>
const kHz = (rate: number) => `${Math.round(rate / 100) / 10} kHz`
const msOf = (sec: number) => `${Math.round(sec * 1000 * 10) / 10} ms`

// Three rows under the engine buttons, Setup and window: the sound card, how
// Orfeo uses it, and the delay from "play" to "heard"
function SoundEngineGlance() {
  const audioEngine = useStore((s) => s.audioEngine)
  const samplesStatus = useSoundfontState((s) => s.samplesStatus)
  const latencySec = useOutputLatency()
  const defaultName = useDefaultOutputName()
  const gmExternal = useMidiSettings((s) => s.gmOutput)
  const native = useNativeAudio((s) => s.status)
  const phase = useNativeAudio((s) => s.phase)
  const error = useNativeAudio((s) => s.error)
  const wantsExclusive = useMidiSettings((s) => s.nativeExclusive)
  const latency = <InfoRow label={t`Latency`}>{latencySec > 0 ? amber(`${Math.round(latencySec * 1000)} ms`) : '—'}</InfoRow>

  if (audioEngine === 'native') {
    if (phase === 'failed') return <HelpText>{t`Native engine unavailable:`} {error}</HelpText>
    if (phase !== 'running' || !native) return <InfoRow label={t`Sound card`}>{t`starting…`}</InfoRow>
    if (native.mode === 'none') return <InfoRow label={t`Sound card`}>{t`waiting for a sound card…`}</InfoRow>
    return (
      <div style={{ marginTop: 6 }}>
        <InfoRow label={t`Sound card`} marquee={native.deviceName} />
        <InfoRow label={t`Mode`} marquee={`${native.mode} ${native.rate} ${native.bufferFrames}`}>{native.mode === 'exclusive' ? amber(t`Exclusive (low latency)`) : t`Shared`} · {kHz(native.rate)} · {msOf(native.bufferFrames / native.rate)} {t`buffer`}</InfoRow>
        {latency}
        {/* Exclusive asked for, but the card couldn't do it: say why */}
        {wantsExclusive && native.mode === 'shared' && native.fallbackReason && <HelpText>{t`Sharing the sound card instead of Exclusive:`} {native.fallbackReason}.</HelpText>}
      </div>
    )
  }
  const rate = getSamplesSampleRate(), buffer = getSamplesBufferSec()
  return (
    <div style={{ marginTop: 6 }}>
      <InfoRow label={t`Sound card`} marquee={audioEngine === 'gm' && gmExternal ? gmExternal : defaultName || t`Windows' default output`} />
      <InfoRow label={t`Mode`} marquee={`${audioEngine} ${gmExternal} ${samplesStatus} ${rate} ${buffer}`}>{audioEngine === 'gm' && gmExternal ? t`External instrument` : <>{t`Shared`}{audioEngine === 'samples' && samplesStatus === 'ready' && rate > 0 && <> · {kHz(rate)}{buffer > 0 && <> · {msOf(buffer)} {t`buffer`}</>}</>}</>}</InfoRow>
      {latency}
    </div>
  )
}

// What the chosen engine is — only that one
function SoundEngineDescription() {
  const audioEngine = useStore((s) => s.audioEngine)
  if (audioEngine === 'gm') return <>{t`The simple synth built into Orfeo: light, always ready, no sound set needed. It sounds basic — good for slow computers, or for playing through an external instrument (MIDI Keyboard › General MIDI sound).`}</>
  if (audioEngine === 'native') return <>{t`The same sound sets as Studio, played by Orfeo's own engine straight to your sound card: the shortest delay from key to sound. Windows only.`}</>
  return <>{t`Real recorded instruments from a sound set (choose it under Sound Fonts). Plays through Windows' mixer like any other app, with its usual delay.`}</>
}

// Native's Low latency mode: Shared (default) or Exclusive. A keyboard plugged in
// switches to Exclusive by itself unless that's turned off (MIDI Keyboard ›
// Sound & Latency); a choice made here holds until the next keyboard change.
function LowLatencyButtons() {
  const exclusive = useMidiSettings((s) => s.nativeExclusive)
  return (
    <>
      <div style={{ marginTop: 12, marginBottom: 7, fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{t`Low latency mode`}</div>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <OptionBtn active={!exclusive} onClick={() => setLowLatency(false)}>{t`Shared`}</OptionBtn>
        <OptionBtn active={exclusive} onClick={() => setLowLatency(true)}>{t`Exclusive`}</OptionBtn>
      </div>
    </>
  )
}
function LowLatencyMode() {
  const exclusive = useMidiSettings((s) => s.nativeExclusive)
  const autoLow = useMidiSettings((s) => s.autoLowLatency)
  return (
    <>
      <LowLatencyButtons />
      <HelpText>{exclusive
        ? t`Orfeo talks to your sound card directly, past Windows' mixer: the shortest delay from key to sound. Recommended when the delay between pressing a key and hearing it feels uncomfortable.`
        : t`Orfeo shares the sound card with everything else, so you still hear YouTube, video calls and other apps alongside it. Windows adds its usual delay between key and sound.`}</HelpText>
      {exclusive && <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-amber)', lineHeight: 1.5, fontFamily: 'var(--font-ui)' }}>{t`Orfeo takes over the whole sound card: other apps stay silent while Orfeo is open.`}</div>}
      {autoLow && <HelpText>{t`Switches to Exclusive by itself when you plug in a keyboard — change that under MIDI Keyboard › Sound & Latency.`}</HelpText>}
    </>
  )
}

// Window only: loading progress, then Low latency mode (Native)
function SoundEngineExtra() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <>
      <SoundEngineLoading />
      {audioEngine === 'native' && <LowLatencyMode />}
    </>
  )
}
// Setup only: the Low latency mode buttons (Native)
function SoundEngineQuickExtra() {
  const audioEngine = useStore((s) => s.audioEngine)
  return (
    <>
      <SoundEngineLoading />
      {audioEngine === 'native' && <LowLatencyButtons />}
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

// The sound-set library (Samples and Native) — dimmed + inert while General MIDI is active
function SoundFontsControl() {
  const audioEngine = useStore((s) => s.audioEngine)
  const selectedSoundfont = useStore((s) => s.selectedSoundfont)
  const extra = useSoundfontState((s) => s.extra)
  const downloadingId = useSoundfontState((s) => s.downloadingId)
  const downloadProgress = useSoundfontState((s) => s.downloadProgress)
  const error = useSoundfontState((s) => s.error)
  const all = allSoundfonts(extra)
  return (
    <div style={{ opacity: audioEngine !== 'gm' ? 1 : 0.4, pointerEvents: audioEngine !== 'gm' ? 'auto' : 'none', transition: 'opacity 0.15s' }}>
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
            display: 'flex', alignItems: 'center', gap: 6, margin: '14px 0 8px', padding: '6px 8px', width: '100%',
            borderRadius: 4, border: '1px dashed var(--text-muted)', background: 'transparent',
            color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer', justifyContent: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-default)'; e.currentTarget.style.borderColor = 'var(--text-muted)' }}
        >
          <Upload size={11} strokeWidth={1.5} />
          Import your own .sf2/.sf3
        </button>
      <HelpText>Make sure you have the rights to use imported soundfonts.</HelpText>
    </div>
  )
}

export const AUDIO_DEFS: SettingDef[] = [
  { id: 'soundEngine', icon: Volume2, kind: 'choice', layout: 'controlFirst', Description: SoundEngineDescription,
    Control: SoundEngineControl, Glance: SoundEngineGlance, Extra: SoundEngineExtra, QuickExtra: SoundEngineQuickExtra },
  { id: 'soundFonts', icon: Library, kind: 'choice', Control: SoundFontsControl },
  {
    id: 'autoLevel', icon: Gauge, kind: 'switch',
    Control: () => { const v = useStore(s => s.autoLevelOnLoad); return <Switch value={v} onChange={useStore.getState().setAutoLevelOnLoad} label="Auto-Level on Load" /> },
  },
  {
    id: 'exportAudio', icon: FileAudio, kind: 'switch',
    Control: () => { const v = useStore(s => s.exportAudioEnabled); return <Switch value={v} onChange={useStore.getState().setExportAudioEnabled} label={t`Export to audio`} /> },
  },
]
