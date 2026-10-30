// ── Export to audio window — opened from a Library song's right-click menu ──
// Version (Original / Focus / As I hear it), sound (Studio / Native + sound
// set), format (MP3 / WAV), then a progress bar and Show in folder. The work
// itself is exportToAudio (src/audio/exportAudio.ts).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import OrfeoMark from './OrfeoMark'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import { SettingsDropdown } from './Settings/controls'
import { useSoundfontState, allSoundfonts } from '../hooks/useSoundfonts'
import { exportToAudio, previewExport, isOpenSong, ExportError, type ExportSound, type ExportFormat, type ExportStage } from '../audio/exportAudio'
import type { ExportVersion } from '../audio/exportSong'

const NATIVE_AVAILABLE = navigator.userAgent.includes('Windows')

type Phase = { k: 'choose' } | { k: 'working'; stage: ExportStage; p: number } | { k: 'done'; path: string } | { k: 'error'; message: string }

function Choice({ active, disabled, title, children, onClick }: { active: boolean; disabled?: boolean; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${active ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
        background: active ? 'var(--accent-amber-medium)' : 'var(--bg-modal-header)', opacity: disabled ? 0.45 : 1, fontFamily: 'var(--font-ui)' }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: active ? 'var(--text-amber)' : 'var(--text-default)' }}>{title}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{children}</div>
    </button>
  )
}

const label: CSSProperties = { fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '12px 0 6px', fontFamily: 'var(--font-ui)' }
const button = (primary: boolean): CSSProperties => ({
  padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 600,
  border: `1px solid ${primary ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
  background: primary ? 'var(--text-amber)' : 'transparent', color: primary ? 'var(--text-on-amber)' : 'var(--text-muted)',
})

export default function ExportAudioDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const audioEngine = useStore(s => s.audioEngine)
  const selectedSoundfont = useStore(s => s.selectedSoundfont)
  const extra = useSoundfontState(s => s.extra)
  const sets = allSoundfonts(extra).filter(sf => sf.downloaded)
  const open = isOpenSong(path)

  const [version, setVersion] = useState<ExportVersion>('original')
  const [sound, setSound] = useState<ExportSound>(audioEngine === 'native' && NATIVE_AVAILABLE ? 'native' : 'studio')
  const [soundfont, setSoundfont] = useState(selectedSoundfont)
  const [format, setFormat] = useState<ExportFormat>('mp3')
  const [phase, setPhase] = useState<Phase>({ k: 'choose' })
  const [note, setNote] = useState<string | null>(null)
  const cancelled = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, true)

  // What the chosen version holds: no keys part (Focus), or no notes at all
  useEffect(() => {
    let live = true
    setNote(null)
    previewExport(path, version).then(s => {
      if (!live) return
      if (!s.events.some(e => (e.status & 0xf0) === 0x90)) setNote(t`Nothing to export — the chosen version has no notes.`)
      else if (version === 'focus' && !s.hasKeys) setNote(t`This song has no keys part — Focus exports bass and drums only.`)
    }).catch(() => { if (live) setNote(t`Couldn't read this song.`) })
    return () => { live = false }
  }, [path, version])

  const close = () => { cancelled.current = true; onClose() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const start = async () => {
    cancelled.current = false
    setPhase({ k: 'working', stage: 'render', p: 0 })
    try {
      const saved = await exportToAudio({ songPath: path, songName: name, version, sound, soundfont, format },
        (stage, p) => setPhase({ k: 'working', stage, p }), () => cancelled.current)
      if (saved) setPhase({ k: 'done', path: saved })
      else setPhase({ k: 'choose' })
    } catch (e: any) {
      const message = e instanceof ExportError && e.kind === 'unreadable' ? t`Couldn't read this song.`
        : e instanceof ExportError && e.kind === 'empty' ? t`Nothing to export — the chosen version has no notes.`
        : t`Export failed: ${String(e?.message ?? e)}`
      setPhase({ k: 'error', message })
    }
  }

  const working = phase.k === 'working'
  const stageText = working ? (phase.stage === 'render' ? t`Playing the song…` : phase.stage === 'encode' ? t`Encoding…` : t`Saving…`) : ''
  const blocked = !!note && note !== t`This song has no keys part — Focus exports bass and drums only.`

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget && !working) close() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t`Export to audio`} className="orfeo-modal-glow app-no-drag"
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '16px 18px', width: 400,
          '--_modal-shadow': 'var(--elevation-modal)' } as CSSProperties}
        onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 6 }}>
          <OrfeoMark height={22} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t`Export to audio`}</span>
          <button type="button" onClick={close} aria-label={t`Close`} style={modalCloseButtonStyle}
            onMouseEnter={e => { e.currentTarget.style.color = modalCloseButtonHoverColor }}
            onMouseLeave={e => { e.currentTarget.style.color = modalCloseButtonIdleColor }}><X size={14} /></button>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', margin: '6px 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)' }}>{name}</div>

        <fieldset disabled={working || phase.k === 'done'} style={{ border: 'none', padding: 0, margin: 0 }}>
          <div style={label}>{t`Version`}</div>
          <div style={{ display: 'grid', gap: 5 }}>
            <Choice active={version === 'original'} title={t`Original`} onClick={() => setVersion('original')}>{t`The song as written: every instrument, its own tempo and key.`}</Choice>
            <Choice active={version === 'focus'} title={t`Focus`} onClick={() => setVersion('focus')}>{t`Keys, bass and drums only.`}</Choice>
            <Choice active={version === 'heard'} disabled={!open} title={t`As I hear it`} onClick={() => setVersion('heard')}>
              {open ? t`Everything you've changed: tempo, key, muted parts, Mixer, loop.` : t`Open this song in Orfeo first.`}
            </Choice>
          </div>
          {note && <div style={{ fontSize: 10, color: 'var(--text-amber)', marginTop: 6, fontFamily: 'var(--font-ui)' }}>{note}</div>}

          <div style={label}>{t`Sound`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: NATIVE_AVAILABLE ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 5, marginBottom: 6 }}>
            <Choice active={sound === 'studio'} title={t`Studio`} onClick={() => setSound('studio')}>{t`Real recorded instruments, as Studio plays them.`}</Choice>
            {NATIVE_AVAILABLE && <Choice active={sound === 'native'} title={t`Native`} onClick={() => setSound('native')}>{t`The same sound sets, as Native plays them.`}</Choice>}
          </div>
          <SettingsDropdown value={soundfont} onChange={setSoundfont} options={sets.map(sf => ({ value: sf.id, label: sf.name }))} />

          <div style={label}>{t`Format`}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5 }}>
            <Choice active={format === 'mp3'} title={t`MP3`} onClick={() => setFormat('mp3')}>{t`320 kbps, 44.1 kHz stereo. Small files for phone, car and any player.`}</Choice>
            <Choice active={format === 'wav'} title={t`WAV`} onClick={() => setFormat('wav')}>{t`44.1 kHz, 16-bit stereo, uncompressed (CD quality). For editing in other audio software.`}</Choice>
          </div>
        </fieldset>

        {working && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, fontFamily: 'var(--font-ui)' }}>{stageText}</div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-tile)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(phase.p * 100)}%`, background: 'var(--text-amber)', transition: 'width 0.15s' }} />
            </div>
          </div>
        )}
        {phase.k === 'done' && <div style={{ marginTop: 14, fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontFamily: 'var(--font-ui)' }}>{t`Saved to Exports.`}</div>}
        {phase.k === 'error' && <div style={{ marginTop: 14, fontSize: 'var(--text-xs)', color: 'var(--status-error)', fontFamily: 'var(--font-ui)' }}>{phase.message}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {phase.k === 'done' ? (
            <>
              <button type="button" style={button(false)} onClick={() => void window.electronAPI.showItemInFolder(phase.path)}>{t`Show in folder`}</button>
              <button type="button" style={button(true)} onClick={close}>{t`Close`}</button>
            </>
          ) : working ? (
            <button type="button" style={button(false)} onClick={() => { cancelled.current = true }}>{t`Cancel`}</button>
          ) : (
            <>
              <button type="button" style={button(false)} onClick={close}>{t`Cancel`}</button>
              <button type="button" style={{ ...button(true), opacity: blocked ? 0.5 : 1 }} disabled={blocked} onClick={() => void start()}>{t`Export`}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
