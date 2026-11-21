import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Play, Pause, SkipBack, Repeat, Minus, Plus, SlidersHorizontal, Volume2, VolumeX, Hand, LogOut, ChevronDown } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { formatTime } from '../../utils/midiParser'
import { transposeDetectedKey } from '../../utils/keyDetection'
import { isCountingIn, cancelCountIn } from '../../utils/countInRunner'
import { useMenuDismiss } from '../ContextMenu'
import { t } from '../../utils/i18n'
import { useWaiting } from '../../practice/listen'
import { endHold } from '../../practice/waiting'
import Tooltip from '../Tooltip'
import { QueueButton } from '../Transport/QueueButton'
import { NES } from '../../utils/noteEditorState'
import {
  usePractice, leavePractice, setBand, setHearMine, tempoLimits, metronomeAllowed, speedPercent, setSpeedPercent, practisedHand, fixHandsFromPractice,
} from '../../practice/practiceMode'

// ── Practice mode's top bar ──────────────────────────────────────────────────
// Narrow, everything in one place (no side panels): queue, tracks, key and
// tempo on the left; only the playback you need in the middle; volume, time,
// metronome, Fix hands and Exit on the right. While the song plays only Pause
// and the time stay: the rest fades away (and keeps its place, so nothing
// jumps). The window's own buttons sit in the top-right corner (Windows,
// Linux) or top-left (macOS), so the bar leaves room for them.
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const BAR_H = 40

const iconBtn = (on = false, disabled = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 28, minWidth: 28, padding: '0 6px', border: 'none', borderRadius: 'var(--radius-md)',
  background: on ? 'var(--bg-panel2)' : 'transparent',
  color: disabled ? 'var(--state-disabled)' : on ? 'var(--text-amber)' : 'var(--text-default)',
  cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
})
const cap: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const val: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-active)' }
const popStyle = (align: 'left' | 'right'): CSSProperties => ({
  position: 'absolute', top: 36, [align]: 0, zIndex: 9500, width: 320, padding: 10, boxSizing: 'border-box',
  maxHeight: 'calc(100vh - 140px)', overflowY: 'auto',
  background: 'var(--bg-panel)', border: '1px solid var(--bg-panel2)', borderRadius: 'var(--radius-lg)',
  boxShadow: '0 12px 32px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', gap: 6,
})

function Pop({ open, onClose, align = 'left', children }: { open: boolean; onClose: () => void; align?: 'left' | 'right'; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useMenuDismiss(open, ref, onClose)
  if (!open) return null
  return <div ref={ref} className="app-no-drag" style={popStyle(align)}>{children}</div>
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{ position: 'relative', display: 'inline-block', width: 28, height: 16, borderRadius: 8, flex: 'none', background: on ? 'var(--text-amber)' : 'var(--bg-input)' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: on ? 'var(--text-on-amber)' : 'var(--text-default)', transition: 'left .15s' }} />
    </span>
  )
}

const rowBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-md)',
  background: 'transparent', color: 'var(--text-body)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: 13,
}

export default function PracticeTopBar() {
  const midi = useStore(s => s.midi)
  const tracks = useStore(s => s.tracks)
  const playbackState = useStore(s => s.playbackState)
  const currentTime = useStore(s => s.currentTime)
  const barStarts = useStore(s => s.barStarts)
  const bpm = useStore(s => s.bpm)
  const detectedKey = useStore(s => s.detectedKey)
  const masterVolume = useStore(s => s.masterVolume)
  const metronomeEnabled = useStore(s => s.metronomeEnabled)
  const metronomeVolume = useStore(s => s.metronomeVolume)
  const loopStart = useStore(s => s.loopStart)
  const loopEnd = useStore(s => s.loopEnd)
  const loopActive = useStore(s => s.loopRegionActive)
  const way = usePractice(s => s.way)
  const level = usePractice(s => s.level)
  const hearMine = usePractice(s => s.hearMine)
  usePractice(s => s.hand)   // the hand rows follow your choice
  const { play, pause, seek, seekAndPlay } = usePlayback()
  const [open, setOpen] = useState<'' | 'tracks' | 'tempo' | 'metro'>('')
  const toggle = (name: typeof open) => setOpen(o => (o === name ? '' : name))

  // the song waiting for your notes is still the song playing, to you
  const holding = useWaiting(s => s.holding)
  const playing = playbackState === 'playing' || holding
  // while playing, everything but Pause and the time fades away
  const fade: CSSProperties = playing
    ? { opacity: 0, pointerEvents: 'none', transition: 'opacity .35s' }
    : { opacity: 1, transition: 'opacity .2s' }

  const band = tracks.filter(tr => !tr.practicePart)
  const hands = tracks.filter(tr => tr.practicePart).sort((a, b) => (a.practiceHand === 'L' ? -1 : 1) - (b.practiceHand === 'L' ? -1 : 1))
  const practised = practisedHand()
  const mine = (tr: { practiceHand?: 'L' | 'R' }) => practised === 'B' || tr.practiceHand === practised
  const bandIn = band.some(tr => !tr.muted)
  const pct = speedPercent()
  // the tempo where you are in the song (it may change along the way), at your speed — as in the normal top bar
  const tempoMap = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
  const fileBpm = tempoMap?.length ? tempoMap.reduce((acc, e) => (e.time <= currentTime ? e.bpm : acc), tempoMap[0].bpm) : bpm
  const liveBpm = Math.round(fileBpm * pct / 100)
  const lim = tempoLimits()
  const metroOk = metronomeAllowed()
  const transpose = detectedKey?.transpose ?? 0
  let bar = 1
  for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= currentTime + 1e-6) bar = i + 1; else break }
  const hasLoop = loopStart !== null && loopEnd !== null && loopEnd > loopStart

  const playPause = () => {
    if (isCountingIn()) { cancelCountIn(); return }
    if (holding) { endHold(false); return }
    if (playing) pause(); else play()
  }
  const back = () => {
    const to = hasLoop && loopActive ? loopStart! : 0
    if (playing) seekAndPlay(to); else seek(to)
  }
  const fixHands = fixHandsFromPractice

  const levelRule = way === 'wait'
    ? t`Wait for me always uses the song's own tempo: the waiting takes care of your pace.`
    : way === 'perform' && level === 3 ? t`Level 3 plays at the song's own tempo.`
    : way === 'perform' && level === 2 ? t`Level 2: at most 20 % slower than the song.`
    : t`Any tempo you like.`

  return (
    <div className="app-drag-region" style={{
      height: BAR_H, flexShrink: 0, position: 'relative', zIndex: 20,
      display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center',
      padding: isMac ? '0 10px 0 84px' : '0 150px 0 10px', boxSizing: 'border-box',
      background: 'var(--bg-deep)', borderBottom: '1px solid var(--state-hover-bg)',
    }}>
      {/* ── Left: queue, tracks, key, tempo ── */}
      <div style={{ ...fade, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <div className="app-no-drag" style={{ minWidth: 0 }}><QueueButton /></div>
        <span style={{ ...val, fontFamily: 'var(--font-ui)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
          {midi?.fileName.replace(/\.(mid|midi)$/i, '')}
        </span>

        <div style={{ position: 'relative' }}>
          {/* no tooltip while its pop-out is open: it would sit over the pop-out's heading */}
          <Tooltip title={t`Tracks`} description={t`Bring the band in, or mute any track.`} disabled={open === 'tracks'}>
            <button className="app-no-drag" onClick={() => toggle('tracks')} style={iconBtn(open === 'tracks')} aria-label={t`Tracks`}>
              <SlidersHorizontal size={15} /> {bandIn ? t`Band in` : t`Piano only`}
            </button>
          </Tooltip>
          <Pop open={open === 'tracks'} onClose={() => setOpen('')}>
            <div style={{ ...cap, color: 'var(--text-amber)', padding: '2px 8px 4px' }}>{t`Tracks`}</div>
            {hands.map(tr => (
              <div key={tr.index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, flex: 'none', background: tr.practiceHand === 'L' ? 'var(--hand-lh)' : 'var(--hand-rh)' }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-active)', whiteSpace: 'nowrap' }}>{tr.practiceHand === 'L' ? t`Left hand` : t`Right hand`}</span>
                <span style={cap}>{mine(tr) ? (tr.muted ? t`Silent, you play it` : t`You play it, heard`) : t`Plays along`}</span>
              </div>
            ))}
            {way === 'practise' && (
              <button className="app-no-drag" style={rowBtn} onClick={() => setHearMine(!hearMine)}>
                <span style={{ flex: 1 }}>{t`Hear my part too`}</span><Toggle on={hearMine} />
              </button>
            )}
            {band.length > 0 ? (
              <>
                <button className="app-no-drag" onClick={() => setBand(!bandIn)}
                  style={{ ...rowBtn, justifyContent: 'center', margin: '4px 0', background: 'var(--bg-panel2)', color: 'var(--text-amber)', fontWeight: 600 }}>
                  {bandIn ? t`Piano only` : t`Bring the band in`}
                </button>
                {band.map(tr => (
                  <button key={tr.index} className="app-no-drag" style={rowBtn} onClick={() => useStore.getState().setTrackMuted(tr.index, !tr.muted)}
                    aria-label={tr.muted ? t`Unmute ${tr.trackName}` : t`Mute ${tr.trackName}`}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, flex: 'none', background: tr.color, opacity: tr.muted ? 0.35 : 1 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tr.muted ? 'var(--text-muted)' : 'var(--text-active)' }}>{tr.trackName}</span>
                    {tr.muted ? <VolumeX size={14} color="var(--text-muted)" /> : <Volume2 size={14} color="var(--text-amber)" />}
                  </button>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 8px' }}>{t`Just the piano in this song.`}</div>
            )}
          </Pop>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px' }}>
          <span style={{ ...cap, marginRight: 4 }}>{t`Key`}</span>
          <button className="app-no-drag" disabled={!detectedKey || transpose <= -12} aria-label={t`Transpose down`}
            onClick={() => detectedKey && useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, -1) })}
            style={{ ...iconBtn(false, !detectedKey || transpose <= -12), minWidth: 22, height: 22, padding: 0 }}><Minus size={12} /></button>
          <span style={{ ...val, minWidth: 26, textAlign: 'center', color: transpose ? 'var(--text-amber)' : 'var(--text-active)' }}>{transpose > 0 ? `+${transpose}` : transpose}</span>
          <button className="app-no-drag" disabled={!detectedKey || transpose >= 12} aria-label={t`Transpose up`}
            onClick={() => detectedKey && useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, 1) })}
            style={{ ...iconBtn(false, !detectedKey || transpose >= 12), minWidth: 22, height: 22, padding: 0 }}><Plus size={12} /></button>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ ...cap, marginRight: 4 }}>{t`Tempo`}</span>
          <button className="app-no-drag" disabled={pct <= lim.min} aria-label={t`Slower`} onClick={() => setSpeedPercent(pct - 5)}
            style={{ ...iconBtn(false, pct <= lim.min), minWidth: 22, height: 22, padding: 0 }}><Minus size={12} /></button>
          <button className="app-no-drag" onClick={() => toggle('tempo')} aria-label={t`Tempo`}
            style={{ ...iconBtn(open === 'tempo'), flexDirection: 'column', gap: 2, height: 32, padding: '0 4px', textTransform: 'none', letterSpacing: 0 }}>
            <span style={val}>{pct} %</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>{liveBpm} BPM</span>
          </button>
          <button className="app-no-drag" disabled={pct >= lim.max} aria-label={t`Faster`} onClick={() => setSpeedPercent(pct + 5)}
            style={{ ...iconBtn(false, pct >= lim.max), minWidth: 22, height: 22, padding: 0 }}><Plus size={12} /></button>
          <Pop open={open === 'tempo'} onClose={() => setOpen('')}>
            <div style={{ ...cap, color: 'var(--text-amber)' }}>{t`Tempo`}</div>
            <div style={{ fontSize: 13, color: 'var(--text-body)' }}>{t`The song's tempo is ${Math.round(useStore.getState().originalBpm)} BPM; now ${pct} %.`}</div>
            <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-dim)' }}>{levelRule}</div>
          </Pop>
        </div>
      </div>

      {/* ── Centre: back, play / pause, loop ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span style={fade}>
          <Tooltip title={hasLoop && loopActive ? t`Back to the loop's start` : t`Back to the start`} oneLine>
            <button className="app-no-drag" onClick={back} style={iconBtn()} aria-label={t`Back`}><SkipBack size={15} /></button>
          </Tooltip>
        </span>
        <button className="app-no-drag" onClick={playPause} aria-label={playing ? t`Pause` : t`Play`}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--text-amber)', color: 'var(--text-on-amber)', cursor: 'pointer' }}>
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <span style={fade}>
          <Tooltip title={t`Loop`} description={hasLoop ? t`Play the loop round after round.` : t`Set a loop first: Alt + drag on the piano roll.`}>
            <button className="app-no-drag" disabled={!hasLoop} onClick={() => useStore.getState().setLoopRegionActive(!loopActive)}
              style={iconBtn(hasLoop && loopActive, !hasLoop)} aria-label={t`Loop`}><Repeat size={15} /></button>
          </Tooltip>
        </span>
      </div>

      {/* ── Right: volume, time, metronome, Fix hands, Exit ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 0 }}>
        <div style={{ ...fade, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}>
          <Volume2 size={15} color="var(--text-muted)" />
          <input className="app-no-drag" type="range" min={0} max={100} value={Math.round(masterVolume * 100)} aria-label={t`Volume`}
            onChange={e => useStore.getState().setMasterVolume(Number(e.target.value) / 100)} style={{ width: 70, accentColor: 'var(--text-amber)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, padding: '0 8px', minWidth: 92 }}>
          <span style={val}>{formatTime(currentTime)} / {formatTime(midi?.duration ?? 0)}</span>
          <span style={{ ...cap, fontSize: 9 }}>{t`Bar`} <span style={{ color: 'var(--text-amber)', fontFamily: 'var(--font-mono)' }}>{bar}</span> / {Math.max(1, barStarts.length)}</span>
        </div>
        <div style={{ ...fade, display: 'flex', alignItems: 'center', gap: 2 }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Tooltip title={t`Metronome`} description={metroOk ? undefined : way === 'wait' ? t`No metronome in Wait for me: the song waits for you, so there is no beat to keep.` : t`No metronome at this level.`}>
              <button className="app-no-drag" disabled={!metroOk} onClick={() => useStore.getState().setMetronomeEnabled(!metronomeEnabled)}
                style={iconBtn(metroOk && metronomeEnabled, !metroOk)} aria-label={t`Metronome`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden><path d="M9 3h6l4 18H5z" /><path d="M12 15l5-8" /></svg>
              </button>
            </Tooltip>
            <button className="app-no-drag" onClick={() => toggle('metro')} style={{ ...iconBtn(open === 'metro'), minWidth: 18, padding: '0 2px' }} aria-label={t`Metronome settings`}><ChevronDown size={12} /></button>
            <Pop open={open === 'metro'} onClose={() => setOpen('')} align="right">
              <div style={{ ...cap, color: 'var(--text-amber)' }}>{t`Metronome`}</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-body)' }}>
                {t`Volume`}
                <input type="range" min={0} max={150} value={Math.round(metronomeVolume * 100)}
                  onChange={e => useStore.getState().setMetronomeVolume(Number(e.target.value) / 100)} style={{ flex: 1, accentColor: 'var(--text-amber)' }} />
              </label>
              {!metroOk && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{way === 'wait' ? t`No metronome in Wait for me.` : t`No metronome at this level.`}</div>}
            </Pop>
          </div>
          <Tooltip title={t`Fix hands`} description={t`A note belongs to the other hand? Leaves practice mode and opens the piano in the Note Editor, both hands, at the bars you were playing.`}>
            <button className="app-no-drag" onClick={fixHands} style={{ ...iconBtn(), color: 'var(--text-amber)' }}><Hand size={15} /> {t`Fix hands`}</button>
          </Tooltip>
          <Tooltip title={t`Exit`} description={t`Leave practice mode. Every track comes back exactly as it was.`}>
            <button className="app-no-drag" onClick={leavePractice} style={iconBtn()} aria-label={t`Leave practice mode`}><LogOut size={15} /> {t`Exit`}</button>
          </Tooltip>
        </div>
      </div>

      {/* ── Where you are in the song (and the loop), along the bar's bottom edge ── */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: 'var(--state-hover-bg)', pointerEvents: 'none' }}>
        {hasLoop && midi && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(loopStart! / midi.duration) * 100}%`, width: `${((loopEnd! - loopStart!) / midi.duration) * 100}%`, background: 'var(--accent-amber-active-bg)' }} />
        )}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${midi ? Math.min(100, (currentTime / midi.duration) * 100) : 0}%`, background: 'var(--text-amber)' }} />
      </div>
    </div>
  )
}
