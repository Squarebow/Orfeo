import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Play, Pause, SkipBack, Repeat, SlidersVertical, Volume2, VolumeX, ChevronUp, ChevronDown, WandSparkles, SquareArrowRightExit, Piano, Eye, EyeOff, Drum, UserRoundStar } from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { formatTime } from '../../utils/midiParser'
import { formatKey, transposeDetectedKey } from '../../utils/keyDetection'
import { stepDisplayedBpm, typedBpm, typedSpeed } from '../../utils/bpmStep'
import { isCountingIn, cancelCountIn } from '../../utils/countInRunner'
import { t } from '../../utils/i18n'
import { useWaiting } from '../../practice/listen'
import { endHold } from '../../practice/waiting'
import { reviewing } from '../../practice/reviewState'
import { togglePassage } from '../../practice/review'
import Tooltip from '../Tooltip'
import { HAND_ASSIGN_GROUPS } from '../../utils/keyboardGroups'
import OrfeoLogo from '../OrfeoLogo'
import VolumeKnob from '../VolumeKnob'
import { QueueButton } from '../Transport/QueueButton'
import { TBtn, BpmValue, TempoDisplayMenu, MetronomeMenu, METRO_MENU_WIDTH } from '../Transport/TopBar'
import { AMBER, barIcon, featLabel, featValue, toolBtn, BarPop, popHeading, PopDivider, HandMarks, Reserve, ResetMark } from './practiceBar'
import { useSession, toggleCard } from '../../practice/session'
import { tickPath } from '../../practice/songTicks'
import {
  usePractice, leavePractice, tempoLimits, metronomeAllowed, speedPercent, setSpeedPercent, practisedHand,
  fixHandsFromPractice, setBandPreset, bandPreset, type BandPreset,
} from '../../practice/practiceMode'

// ── Practice mode's header ───────────────────────────────────────────────────
// Top line: PRACTICE MODE (beside the window's own buttons). Then one row:
// ORFEO, the playlist, what you hear, key and tempo on the left; the song and
// its playback in the middle; volume, bar, metronome, Fix hands and Exit on
// the right. Under it, the song as a line of ticks (one every half second,
// every tenth taller; amber as far as you've played) to move through it. Always there; a little lower while the song
// plays, as a web page's header does once you scroll.
const TITLE_H = 40          // the window's buttons' row
const ROW_H = 74, ROW_H_PLAYING = 56
// the transport's sides, from Play outwards, and the room the left half leaves for Back
const CENTRE_SIDE = 300, CENTRE_LEFT = 64

const bigValue: CSSProperties = { color: 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }

function Chevrons({ up, down, upOff, downOff, upLabel, downLabel }: {
  up: () => void; down: () => void; upOff?: boolean; downOff?: boolean; upLabel: string; downLabel: string
}) {
  const b = (off?: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 13, padding: 0,
    border: 'none', background: 'none', color: AMBER, opacity: off ? 0.3 : 1, cursor: off ? 'default' : 'pointer',
  })
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <button className="app-no-drag" aria-label={upLabel} disabled={upOff} onClick={up} style={b(upOff)}><ChevronUp size={13} strokeWidth={2} /></button>
      <button className="app-no-drag" aria-label={downLabel} disabled={downOff} onClick={down} style={b(downOff)}><ChevronDown size={13} strokeWidth={2} /></button>
    </span>
  )
}

export default function PracticeTopBar() {
  const midi = useStore(s => s.midi)
  const tracks = useStore(s => s.tracks)
  const playbackState = useStore(s => s.playbackState)
  const currentTime = useStore(s => s.currentTime)
  const barStarts = useStore(s => s.barStarts)
  const bpm = useStore(s => s.bpm)
  const originalBpm = useStore(s => s.originalBpm)
  // Speed up gradually counts in percent: the tempo shows as a speed while it's on
  const rampOn = usePractice(s => s.ramp && s.way === 'practise')
  const asPercent = useStore(s => s.tempoDisplay === 'percent') || rampOn
  const detectedKey = useStore(s => s.detectedKey)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const metronomeEnabled = useStore(s => s.metronomeEnabled)
  const countInEnabled = useStore(s => s.countInEnabled)
  const countInBars = useStore(s => s.countInBars)
  const loopStart = useStore(s => s.loopStart)
  const loopEnd = useStore(s => s.loopEnd)
  const loopActive = useStore(s => s.loopRegionActive)
  const way = usePractice(s => s.way)
  const level = usePractice(s => s.level)
  const songReady = usePractice(s => s.songReady)
  const card = useSession(s => s.card)
  const cardNew = useSession(s => s.cardNew)
  const cardOpen = useSession(s => s.cardOpen)
  usePractice(s => s.hand)   // the hand rows follow your choice
  const { play, pause, seek, seekAndPlay } = usePlayback()
  const [open, setOpen] = useState<'' | 'tracks'>('')
  const [tempoMenu, setTempoMenu] = useState<{ x: number; y: number } | null>(null)
  const [metroMenu, setMetroMenu] = useState<{ x: number; y: number } | null>(null)
  const tracksBtn = useRef<HTMLButtonElement>(null)

  // the song waiting for your notes is still the song playing, to you
  const holding = useWaiting(s => s.holding)
  const playing = playbackState === 'playing' || holding
  const rowH = playing ? ROW_H_PLAYING : ROW_H

  const band = tracks.filter(tr => !tr.practicePart)
  const hands = tracks.filter(tr => tr.practicePart).sort((a, b) => (a.practiceHand === 'L' ? -1 : 1) - (b.practiceHand === 'L' ? -1 : 1))
  const practised = practisedHand()
  const mine = (tr: { practiceHand?: 'L' | 'R' }) => practised === 'B' || tr.practiceHand === practised
  const preset = band.length ? bandPreset(tracks) : 'piano'
  const presetName: Record<BandPreset, string> = { piano: t`Piano only`, focus: t`Focus`, band: t`Band` }

  // ── Tempo: where you are in the song (it may change along the way), at your speed
  const pct = speedPercent()
  const tempoMap = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
  const fileBpm = tempoMap?.length ? tempoMap.reduce((acc, e) => (e.time <= currentTime ? e.bpm : acc), tempoMap[0].bpm) : bpm
  const liveBpm = Math.round(fileBpm * (originalBpm > 0 ? bpm / originalBpm : 1))
  const lim = tempoLimits()
  const fixedTempo = lim.min === lim.max
  const setBpmWithin = (next: number) => {
    const o = useStore.getState().originalBpm
    useStore.getState().setBpm(Math.max(o * lim.min / 100, Math.min(o * lim.max / 100, next)))
  }
  const stepTempo = (dir: 1 | -1) => {
    if (asPercent) { setSpeedPercent(pct + dir); return }
    const s = useStore.getState()
    setBpmWithin(stepDisplayedBpm(s.bpm, s.originalBpm, fileBpm, dir))
  }
  const levelRule = way === 'wait'
    ? t`Wait for me always plays at the song's own tempo: the waiting takes care of your pace.`
    : way === 'perform' && level === 3 ? t`Level 3 plays at the song's own tempo.`
    : way === 'perform' && level === 2 ? t`Level 2: at most 20 % slower than the song.`
    : t`Any tempo you like. Right-click to show it in BPM or as a speed in percent.`

  const transpose = detectedKey?.transpose ?? 0
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming, accidentals) : '—'
  const keyNames = ['—', ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].flatMap(semitone => [false, true].map(isMinor => formatKey({ semitone, isMinor, transpose: 0 }, noteNaming, accidentals)))]
  const metroOk = metronomeAllowed()

  let bar = 1
  for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= currentTime + 1e-6) bar = i + 1; else break }
  const hasLoop = loopStart !== null && loopEnd !== null && loopEnd > loopStart
  const sigMap = (midi as any)?._timeSigMap as { num: number; den: number; time: number }[] | undefined
  const timeSig = sigMap?.length
    ? sigMap.reduce((acc, e) => (e.time <= currentTime ? e : acc), sigMap[0])
    : { num: midi?.timeSignatureNumerator ?? 4, den: midi?.timeSignatureDenominator ?? 4 }

  const playPause = () => {
    if (isCountingIn()) { cancelCountIn(); return }
    if (holding) { endHold(false); return }
    if (reviewing()) { togglePassage(); return }   // the review: its bars go round
    if (playing) pause(); else play()
  }
  const back = () => {
    const to = hasLoop && loopActive ? loopStart! : 0
    if (playing) seekAndPlay(to); else seek(to)
  }

  return (
    <div className="app-drag-region" style={{ flexShrink: 0, position: 'relative', zIndex: 20, background: 'var(--bg-deep)', borderBottom: '1px solid var(--state-hover-bg)' }}>
      {/* ── The top line, beside the window's own buttons ── */}
      <div style={{ height: TITLE_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={featLabel}>{t`Practice mode`}</span>
      </div>

      {/* Two halves, left and right; the transport sits over the middle with Play
          exactly at the window's centre, under PRACTICE MODE (Back to its left,
          everything else to its right), so the left half has room up to it */}
      <div style={{
        height: rowH, transition: 'height .3s ease', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignItems: 'center',
        padding: '0 20px', boxSizing: 'border-box', position: 'relative',
      }}>
        {/* ── Left: ORFEO, playlist, what you hear, key, tempo ── */}
        <div className="topbar-scroll" style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', marginRight: CENTRE_LEFT }}>
          <OrfeoLogo scale={playing ? 1.2 : 1.45} />
          <div className="app-no-drag"><QueueButton practice /></div>

          <Tooltip title={t`What you hear`} description={t`The piano alone, Focus (the bass and drums too), or the whole band. Click to choose, or mute any track.`} placement="bottom" disabled={open === 'tracks'}>
            <button ref={tracksBtn} className="app-no-drag" onClick={() => setOpen(o => (o === 'tracks' ? '' : 'tracks'))} style={toolBtn()} aria-label={t`What you hear`} aria-expanded={open === 'tracks'}>
              <SlidersVertical {...barIcon} />
              <Reserve options={[presetName.piano, presetName.focus, presetName.band, t`Your mix`].map((x, i) => <span key={i} style={featValue}>{x}</span>)}>
                <span style={featValue}>{preset ? presetName[preset] : t`Your mix`}</span>
              </Reserve>
            </button>
          </Tooltip>
          {open === 'tracks' && (
            <BarPop anchor={tracksBtn.current} width={290} onClose={() => setOpen('')} label={t`What you hear`}>
              <div style={popHeading}>{t`What you hear`}</div>
              <div style={{ display: 'flex', gap: 6, padding: '4px 14px 8px' }}>
                {([['piano', Piano, t`Piano only`], ['focus', Eye, t`Focus`], ['band', Drum, t`Band`]] as const).map(([id, Icon, name]) => (
                  <Tooltip key={id} oneLine placement="bottom"
                    title={id === 'piano' ? t`Just your piano` : id === 'focus' ? t`The piano, bass and drums` : t`Every track`}>
                    <button className="app-no-drag" disabled={!band.length && id !== 'piano'} onClick={() => setBandPreset(id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 80, padding: '8px 0',
                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        border: `1px solid ${preset === id ? 'var(--accent-amber-strong)' : 'var(--border)'}`,
                        background: preset === id ? 'var(--accent-amber-subtle)' : 'none',
                        opacity: !band.length && id !== 'piano' ? 0.4 : 1,
                      }}>
                      <Icon size={18} strokeWidth={1.6} color={AMBER} />
                      <span style={{ ...featValue, fontSize: 10, color: preset === id ? AMBER : 'var(--text-default)' }}>{name}</span>
                    </button>
                  </Tooltip>
                ))}
              </div>
              <PopDivider />
              {hands.map(tr => (
                <div key={tr.index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px' }}>
                  <HandMarks hand={tr.practiceHand === 'L' ? 'L' : 'R'} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-active)', whiteSpace: 'nowrap' }}>{tr.practiceHand === 'L' ? t`Left hand` : t`Right hand`}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mine(tr) ? (tr.muted ? t`Your part is silent` : t`Your part is heard`) : t`Plays along`}</span>
                </div>
              ))}
              {band.length > 0 && <PopDivider />}
              {band.map(tr => (
                <div key={tr.index} style={{ display: 'flex', alignItems: 'center', width: '100%', paddingRight: 10, boxSizing: 'border-box' }}>
                  <button className="app-no-drag" onClick={() => useStore.getState().setTrackMuted(tr.index, !tr.muted)}
                    aria-label={tr.muted ? t`Unmute ${tr.trackName}` : t`Mute ${tr.trackName}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '6px 4px 6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, flex: 'none', background: tr.color, opacity: tr.muted ? 0.35 : 1 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: tr.muted ? 'var(--text-muted)' : 'var(--text-active)' }}>{tr.trackName}</span>
                    {tr.muted ? <VolumeX size={14} color="var(--text-muted)" /> : <Volume2 size={14} color={AMBER} />}
                  </button>
                  {/* a keyboard in the band: its notes on the piano roll too, for the harmony */}
                  {!tr.isDrum && HAND_ASSIGN_GROUPS.has(tr.group) ? (
                    <Tooltip oneLine placement="right" title={tr.practiceOnRoll ? t`Hide from the piano roll` : t`Show on the piano roll`}>
                      <button className="app-no-drag" onClick={() => useStore.getState().setPracticeOnRoll(tr.index, !tr.practiceOnRoll)}
                        aria-label={tr.practiceOnRoll ? t`Hide ${tr.trackName} from the piano roll` : t`Show ${tr.trackName} on the piano roll`} aria-pressed={!!tr.practiceOnRoll}
                        style={{ display: 'flex', alignItems: 'center', padding: 4, border: 'none', background: 'none', cursor: 'pointer' }}>
                        {tr.practiceOnRoll ? <Eye size={14} color={AMBER} /> : <EyeOff size={14} color="var(--text-muted)" />}
                      </button>
                    </Tooltip>
                  ) : <span style={{ width: 22, flex: 'none' }} />}
                </div>
              ))}
            </BarPop>
          )}

          <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Tooltip title={t`Key: `} titleValue={`${displayKey}${transpose !== 0 ? t` (semitones: ${transpose > 0 ? '+' : ''}${transpose})` : ''}`}
              description={t`The song's key. The arrows move it up or down a semitone.`} placement="bottom">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={featLabel}>{t`Key`}</span>
                <Reserve options={keyNames.map((k, i) => <span key={i} style={bigValue}>{k}</span>)}>
                  <span style={{ ...bigValue, color: transpose ? AMBER : 'var(--text-active)' }}>{displayKey}</span>
                </Reserve>
              </span>
            </Tooltip>
            <Chevrons upLabel={t`Transpose up`} downLabel={t`Transpose down`}
              upOff={!detectedKey || transpose >= 12} downOff={!detectedKey || transpose <= -12}
              up={() => detectedKey && useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, 1) })}
              down={() => detectedKey && useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, -1) })} />
            <ResetMark shown={transpose !== 0} title={t`Back to the song's own key`}
              onClick={() => detectedKey && useStore.setState({ detectedKey: { ...detectedKey, transpose: 0 } })} />
          </div>

          <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Tooltip title={asPercent ? t`Speed: ${pct} %` : t`Tempo: ${liveBpm} BPM`} description={levelRule} placement="bottom" disabled={!!tempoMenu}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                onContextMenu={e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setTempoMenu({ x: r.left, y: r.bottom + 6 }) }}>
                <span style={featLabel}>{t`Tempo`}</span>
                <span style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                  <BpmValue shown={String(asPercent ? pct : liveBpm)} label={asPercent ? t`Speed in percent` : t`Tempo in BPM`}
                    changed={pct !== 100} disabled={fixedTempo}
                    onType={text => {
                      const s = useStore.getState()
                      const next = asPercent ? typedSpeed(text, s.originalBpm) : typedBpm(text, s.originalBpm, fileBpm)
                      if (next !== null) setBpmWithin(next)
                    }} />
                  {/* the unit's foot on the number's foot (the number's box has room below its digits) */}
                  <Reserve options={['%', t`BPM`].map((x, i) => <span key={i} style={{ ...featValue, fontSize: 11 }}>{x}</span>)}>
                    <span style={{ ...featValue, fontSize: 11, display: 'inline-block', marginBottom: 2 }}>{asPercent ? '%' : t`BPM`}</span>
                  </Reserve>
                </span>
              </span>
            </Tooltip>
            {/* kept in place (hidden) where the tempo is fixed, so nothing moves */}
            <span style={{ visibility: fixedTempo ? 'hidden' : 'visible', display: 'flex' }}>
              <Chevrons upLabel={t`Faster`} downLabel={t`Slower`} upOff={fixedTempo || pct >= lim.max} downOff={fixedTempo || pct <= lim.min}
                up={() => stepTempo(1)} down={() => stepTempo(-1)} />
            </span>
            <ResetMark shown={!fixedTempo && pct !== 100} title={t`Back to the song's own tempo`} onClick={() => setSpeedPercent(100)} />
            {tempoMenu && <TempoDisplayMenu x={tempoMenu.x} y={tempoMenu.y} onClose={() => setTempoMenu(null)} />}
          </div>
        </div>

        {/* ── Centre: the song, and its playback (Play at the window's centre) ── */}
        <div className="app-no-drag" style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', gap: playing ? 2 : 5, transition: 'gap .3s', pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--text-default)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', lineHeight: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 560, pointerEvents: 'auto' }}>
            {midi?.fileName.replace(/\.(mid|midi)$/i, '') ?? ''}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: `${CENTRE_SIDE}px auto ${CENTRE_SIDE}px`, alignItems: 'center' }}>
            <div style={{ justifySelf: 'end', display: 'flex', pointerEvents: 'auto' }}>
              <TBtn onClick={back} disabled={!songReady} title={hasLoop && loopActive ? t`Back to the loop's start` : t`Go to start`} oneLine><SkipBack size={16} strokeWidth={1.5} /></TBtn>
            </div>
            <div style={{ pointerEvents: 'auto' }}>
              <TBtn onClick={playPause} disabled={!songReady} accent title={t`Play / Pause (Space)`} large={!playing} oneLine>
                {playing ? <Pause size={playing ? 20 : 24} fill="currentColor" strokeWidth={0} /> : <Play size={24} fill="currentColor" strokeWidth={0} />}
              </TBtn>
            </div>
            <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 2, pointerEvents: 'auto' }}>
              <TBtn onClick={() => useStore.getState().setLoopRegionActive(!loopActive)} disabled={!hasLoop} active={hasLoop && loopActive}
                title={t`Loop`} description={hasLoop ? t`Play the loop round after round.` : t`Set a loop first: Alt + drag on the piano roll.`}>
                <Repeat size={13} strokeWidth={1.5} />
              </TBtn>
              <span style={{ marginLeft: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-active)' }}>{formatTime(currentTime)}</span> / {formatTime(midi?.duration ?? 0)}
              </span>
              {/* how it went, when you want it (it never pops up by itself); the icon
                  pulses gently while there are words not read yet */}
              <Tooltip title={t`Practice log`} placement="bottom"
                description={card ? t`A few words on how it went since you last pressed Play,\nclick to open.` : t`after you've played,\na few words on how it went.`}>
                <button onClick={() => toggleCard()} disabled={!card} aria-pressed={cardOpen} aria-label={t`Practice log`}
                  style={{ ...toolBtn(!card), marginLeft: 18, gap: 6, height: 26 }}>
                  <UserRoundStar {...barIcon} size={16} className={cardNew ? 'orfeo-soft-pulse' : undefined} />
                  <span style={{ ...featValue, fontSize: 11 }}>{t`Practice log`}</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* ── Right: volume, bar, time signature, metronome, Fix hands, Exit (icons and values only) ── */}
        <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
          <VolumeKnob bare />
          <Tooltip title={t`Bar ${bar} of ${barStarts.length}`} description={t`Position in the song,
counted in bars.`} placement="bottom">
            <div style={{ background: 'var(--bg-tile)', borderRadius: 4, padding: '4px 7px', display: 'flex', alignItems: 'baseline', margin: '0 8px' }}>
              <span style={{ color: 'var(--topbar-bar-number)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, lineHeight: 1, minWidth: '3ch', textAlign: 'right' }}>{bar}</span>
              <span style={{ color: 'var(--topbar-bar-total)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 1 }}>|{barStarts.length}</span>
            </div>
          </Tooltip>

          {/* the time signature where you are (it may change along the way), as in the normal top bar */}
          <Tooltip title={t`Time signature: ${timeSig.num}/${timeSig.den}`} description={t`Number of beats in each bar,
and which note value counts as one beat.`} placement="bottom">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, padding: '0 6px' }}>
              <span style={{ color: 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 700 }}>{timeSig.num}</span>
              <div style={{ width: 14, height: 1, background: 'var(--topbar-timesig-divider)', margin: '2px 0' }} />
              <span style={{ color: 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 700 }}>{timeSig.den}</span>
            </div>
          </Tooltip>

          <Tooltip
            title={!metroOk ? t`Metronome off` : metronomeEnabled ? t`Metronome on` : t`Metronome off`}
            description={!metroOk
              ? (way === 'wait' ? t`No metronome in Wait for me: the song waits for you, so there is no beat to keep.` : t`No metronome at this level.`)
              : countInEnabled ? t`Click to toggle metronome ON/OFF. Right-click for volume and count-in.` : t`Click to turn it ON, right-click \nfor volume and count-in.`}
            placement="bottom" disabled={!!metroMenu}>
            <button
              onClick={() => metroOk && useStore.getState().setMetronomeEnabled(!metronomeEnabled)}
              onContextMenu={e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setMetroMenu({ x: Math.max(8, r.right - METRO_MENU_WIDTH), y: r.bottom + 6 }) }}
              aria-label={t`Metronome`}
              style={{
                position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 10px',
                border: 'none', background: 'transparent', cursor: metroOk ? 'pointer' : 'default', opacity: metroOk ? 1 : 0.4,
                color: metroOk && metronomeEnabled ? 'var(--topbar-metronome-on)' : 'var(--topbar-metronome-off)', transition: 'color 0.15s',
              }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 11.4V9.1" /><path d="m12 17 6.59-6.59" />
                <path d="m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2" />
                <circle cx="20" cy="9" r="2" />
              </svg>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', lineHeight: 1, marginTop: 5 }}>
                {metroOk && metronomeEnabled ? t`ON` : t`OFF`}
              </span>
              {countInEnabled && (
                <span aria-label={t`Count-in bars: ${countInBars}`} style={{
                  position: 'absolute', top: -4, right: 2, minWidth: 12, height: 12, borderRadius: 6, padding: '0 3px',
                  background: AMBER, color: 'var(--bg-tooltip)', fontSize: 8, fontWeight: 700,
                  fontFamily: 'var(--font-mono)', lineHeight: '12px', textAlign: 'center',
                }}>{countInBars}</span>
              )}
            </button>
          </Tooltip>
          {metroMenu && <MetronomeMenu x={metroMenu.x} y={metroMenu.y} onClose={() => setMetroMenu(null)} />}

          <Tooltip title={t`Something's not right?`} description={t`Fix hands in the MIDI Editor: leaves practice mode and opens the piano at the bars you were playing.`} placement="bottom">
            <button onClick={fixHandsFromPractice} style={toolBtn()} aria-label={t`Fix hands`}><WandSparkles {...barIcon} size={20} /></button>
          </Tooltip>
          <Tooltip title={t`Exit practice mode`} oneLine placement="bottom">
            <button onClick={leavePractice} style={toolBtn()} aria-label={t`Exit practice mode`}><SquareArrowRightExit {...barIcon} size={20} /></button>
          </Tooltip>
        </div>
      </div>

      <SongTicks playing={playing} hasLoop={hasLoop} />
    </div>
  )
}

// ── The song as a line of ticks: one every half second (fewer when the song
// is long for the width, so they never crowd), every tenth taller. Not played
// yet: white; played: amber. Each tick sits on a whole pixel, worked out from
// the bar's real width, so the tall ones never drift into the short ones (a
// repeating background sized in % rounded each pattern on its own and did).
// Click or drag anywhere on it to move through the song. ────────────────────
function SongTicks({ playing, hasLoop }: { playing: boolean; hasLoop: boolean }) {
  const midi = useStore(s => s.midi)
  const currentTime = useStore(s => s.currentTime)
  const loopStart = useStore(s => s.loopStart)
  const loopEnd = useStore(s => s.loopEnd)
  const { pause, seek, seekAndPlay } = usePlayback()
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ wasPlaying: boolean } | null>(null)
  const [w, setW] = useState(0)
  const clipId = useId()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.round(el.getBoundingClientRect().width)))
    ro.observe(el)
    setW(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  const dur = midi?.duration ?? 0
  const { d, unit } = useMemo(() => tickPath(dur, w), [dur, w])
  const H = playing ? 10 : 14
  const timeAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.max(0, Math.min(dur, ((x - r.left) / r.width) * dur))
  }
  const played = dur ? Math.min(1, currentTime / dur) : 0
  const tip = unit < 1
    ? t`One tick every half second, every tenth taller.\nClick or drag to move through the song.`
    : t`One tick every ${unit} seconds, every tenth taller.\nClick or drag to move through the song.`
  return (
    <Tooltip title={t`Timeline`} description={tip} placement="bottom" wrapperStyle={{ display: 'block' }}>
      <div ref={ref} className="app-no-drag" role="slider" aria-label={t`Song position`} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(currentTime)}
        onPointerDown={e => {
          if (!dur) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const s = useStore.getState()
          if (useWaiting.getState().holding) endHold(false)
          drag.current = { wasPlaying: s.playbackState === 'playing' }
          if (drag.current.wasPlaying) pause()
          useStore.setState({ currentTime: timeAt(e.clientX) })
        }}
        onPointerMove={e => { if (drag.current) useStore.setState({ currentTime: timeAt(e.clientX) }) }}
        onPointerUp={e => {
          if (!drag.current) return
          const to = timeAt(e.clientX)
          if (drag.current.wasPlaying) seekAndPlay(to); else seek(to)
          drag.current = null
        }}
        style={{ position: 'relative', height: dur ? H : 14, margin: '0 0 4px', cursor: dur ? 'pointer' : 'default', transition: 'height .3s', touchAction: 'none' }}>
        {dur > 0 && hasLoop && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(loopStart! / dur) * 100}%`, width: `${((loopEnd! - loopStart!) / dur) * 100}%`, background: 'var(--accent-amber-subtle)' }} />
        )}
        {dur > 0 && w > 0 && (
          <svg width={w} height="100%" viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" aria-hidden
            style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }}>
            <defs><clipPath id={clipId}><rect x={0} y={0} width={Math.round(played * w)} height={100} /></clipPath></defs>
            <path d={d} stroke="var(--text-active)" strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" fill="none" />
            <path d={d} stroke="var(--text-amber)" strokeWidth={1} vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" fill="none" clipPath={`url(#${clipId})`} />
          </svg>
        )}
      </div>
    </Tooltip>
  )
}
