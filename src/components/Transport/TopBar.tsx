import { useCallback, useRef, useEffect, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Repeat,
  FolderOpen, RotateCcw, ChevronUp, ChevronDown,
  Rewind, FastForward,
} from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { useMidiFile } from '../../hooks/useMidiFile'
import { formatTime } from '../../utils/midiParser'
import { formatKey, transposeDetectedKey } from '../../utils/keyDetection'
import OrfeoLogo from '../OrfeoLogo'
import MidiIcon from '../MidiIcon'
import VolumeKnob from '../VolumeKnob'
import LoopRegionStrip from '../LoopRegionStrip'
import Tooltip from '../Tooltip'
import { confirmDiscardDirtyNoteEdits } from '../../utils/noteEditorState'
import { confirmDiscardDirtyTempoKey } from '../../utils/tempoKeySave'

// NOTE: no more `C` shorthand object — every color below is a literal
// `var(--token-name)` string written directly at its point of use, so the
// token being referenced is visible right here in the JSX without having to
// cross-reference a lookup table elsewhere in the file.
const SKIP_SECS = 5

// ── Windows caption-button overlay inset — the real reserved width for the
// native –/□/× buttons, read live from the Window Controls Overlay API
// (Electron's titleBarOverlay in electron/main.ts turns this on) instead of
// a fixed guess. If the group's right padding equals this exactly, its
// content's right edge lands precisely where the buttons start — zero
// horizontal overlap into their hit-region, regardless of vertical position,
// so the group can stay vertically centered like its siblings instead of
// needing to duck below the buttons' 40px zone. DPI/monitor changes fire
// `geometrychange`, so this tracks the real safe zone live. Falls back to a
// conservative constant if the API isn't present yet (first paint, or a
// non-Windows build).
const OVERLAY_INSET_FALLBACK = 174

function useTitlebarOverlayInset(): number {
  const [inset, setInset] = useState(OVERLAY_INSET_FALLBACK)

  useEffect(() => {
    const overlay = (navigator as any).windowControlsOverlay
    if (!overlay) return

    const update = () => {
      const rect = overlay.getTitlebarAreaRect()
      if (rect.width > 0) setInset(Math.round(window.innerWidth - rect.width - rect.x))
    }
    update()
    overlay.addEventListener('geometrychange', update)
    return () => overlay.removeEventListener('geometrychange', update)
  }, [])

  return inset
}

export default function TopBar() {
  const overlayInset = useTitlebarOverlayInset()
  const midi = useStore((s) => s.midi)
  const playbackState = useStore((s) => s.playbackState)
  const currentTime = useStore((s) => s.currentTime)
  const bpm = useStore((s) => s.bpm)
  const originalBpm = useStore((s) => s.originalBpm)
  const loopRegionEnabled  = useStore((s) => s.loopRegionEnabled)
  const loopRegionActive   = useStore((s) => s.loopRegionActive)
  const loopStart          = useStore((s) => s.loopStart)
  const loopEnd            = useStore((s) => s.loopEnd)
  const setLoopRegionActive = useStore((s) => s.setLoopRegionActive)
  const setBpm = useStore((s) => s.setBpm)
  const resetBpm = useStore((s) => s.resetBpm)
  const detectedKey = useStore((s) => s.detectedKey)
  const metronomeEnabled = useStore((s) => s.metronomeEnabled)
  const setMetronomeEnabled = useStore((s) => s.setMetronomeEnabled)
  const midiDeviceConnected = useStore((s) => s.midiDeviceConnected)
  const midiDeviceName = useStore((s) => s.midiDeviceName)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const chordExplorerOpen = useStore((s) => s.chordExplorerOpen)
  const resetAll = useStore((s) => s.resetAll)
  const barStarts = useStore((s) => s.barStarts)


  const { play, pause, stop, seek, seekAndPlay } = usePlayback()
  const { openFile } = useMidiFile()
  const wasPlayingRef = useRef(false)

  const handlePlayPause = useCallback(() => {
    if (playbackState === 'playing') pause(); else play()
  }, [playbackState, play, pause])

  const handleReset = useCallback(async () => {
    const proceed = await confirmDiscardDirtyNoteEdits('Save changes before resetting?')
    if (!proceed) return
    const proceedTempoKey = await confirmDiscardDirtyTempoKey('Save tempo/key changes before resetting?')
    if (proceedTempoKey) resetAll()
  }, [resetAll])

  const handleScrubStart = useCallback(() => {
    wasPlayingRef.current = playbackState === 'playing'
    if (wasPlayingRef.current) pause()
  }, [playbackState, pause])

  const handleScrubChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useStore.setState({ currentTime: parseFloat(e.target.value) })
  }, [])

  const handleScrubEnd = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    const t = parseFloat(e.currentTarget.value)
    if (wasPlayingRef.current) seekAndPlay(t); else seek(t)
  }, [seek, seekAndPlay])

  const handleSkip = useCallback((dir: 1 | -1) => {
    if (!midi) return
    const t = Math.max(0, Math.min(midi.duration, currentTime + dir * SKIP_SECS))
    if (playbackState === 'playing') seekAndPlay(t); else seek(t)
  }, [midi, currentTime, playbackState, seek, seekAndPlay])

  const handleTranspose = (semitones: number) => {
    if (!detectedKey) return
    useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, semitones) })
  }

  const transpose = detectedKey?.transpose ?? 0
  const duration = midi?.duration ?? 0
  const isTempoChanged = !!midi && bpm !== originalBpm
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming, accidentals) : '—'

  // ── Nudge: region selected but loop not yet activated (regardless of strip visibility) ──
  const nudgeLoop = !!midi && loopStart !== null && loopEnd !== null && !loopRegionActive

  // ── Loop button tooltip — context-aware based on region state ─────────────
  const loopStartBar = loopStart !== null ? (() => {
    let bar = 1
    for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= loopStart) bar = i + 1 }
    return bar
  })() : null
  const loopEndBar = (loopEnd !== null && loopStartBar !== null) ? (() => {
    let rawBar = 1
    for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= loopEnd) rawBar = i + 1 }
    const pastLastBarStart = barStarts.length === 0 || loopEnd > barStarts[barStarts.length - 1] + 0.001
    return Math.max(loopStartBar, pastLastBarStart ? rawBar : rawBar - 1)
  })() : null
  const loopTooltipTitle = loopStart !== null
    ? (loopRegionActive ? `Looping bars ${loopStartBar}–${loopEndBar}` : `Loop bars ${loopStartBar}–${loopEndBar}`)
    : 'Loop entire song'
  const loopTooltipDesc = loopStart !== null
    ? (loopRegionActive ? 'Click to disable the loop.' : 'Click to enable the loop.')
    : 'Click to loop the whole file, or Alt+click and drag on the piano roll to select a specific region.'

  // ── Live BPM — reads current tempo from _tempoMap so rubato files update ─
  const rawTempoMap = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
  const currentFileBpm = rawTempoMap?.length
    ? rawTempoMap.reduce(
        (acc: number, e: { bpm: number; time: number }) => e.time <= currentTime ? e.bpm : acc,
        rawTempoMap[0].bpm,
      )
    : bpm
  const userRatio = originalBpm > 0 ? bpm / originalBpm : 1
  const liveBpm = midi ? Math.round(currentFileBpm * userRatio) : 0

  // ── Bar counter — uses same precomputed barStarts as PianoRoll ───────────
  const totalBars = barStarts.length
  // Binary search: find last index where barStarts[i] <= currentTime (= current bar index, 0-based)
  let currentBar = 0
  if (midi && barStarts.length > 0) {
    let lo = 0, hi = barStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (barStarts[mid] <= currentTime) lo = mid
      else hi = mid - 1
    }
    currentBar = lo + 1
  }

  return (
    <div
      className="app-drag-region"
      style={{
        // ── Height = the extra room this redesign needed: 20px clearance
        // above the tallest group's own content (center: filename +
        // transport + scrub, ~87.5px measured) + 20px clearance below it,
        // before the piano roll. Grown by the same 24px the loop-region
        // strip adds when present, same as before. ───────────────────────
        height: loopRegionEnabled ? 152 : 128,
        background: 'var(--bg-deep)',
        borderBottom: 'none',
        // ── CSS Grid, three real minmax(0,1fr) columns (not 1fr auto 1fr —
        // see CLAUDE.md's warning: an auto-sized center column combined with
        // content-driven side columns can still end up unequal width and
        // drag the center off true center). The center column is then
        // structurally centered by grid layout itself, not computed via
        // position:absolute + left:50%/transform math — that math measured
        // against the bar's full (asymmetrically-padded) width, which is
        // exactly what let the ~400px-wide center block overlap the side
        // groups near the 900px documented minimum window width. ──────────
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
        // ── Back to center — left (~39px) and right (~40px) vertically
        // center in the row like they always did. Only the center column
        // opts out (see its own `alignSelf:'flex-start'` below): its content
        // is much taller (~87.5px, it carries the transport row), and
        // center-aligning it put its own top just 4px from the row's edge.
        // Giving center its own top anchor + top margin — instead of
        // top-aligning the whole grid — keeps center's breathing room
        // without pulling left/right out of their normal centered spot. ──
        alignItems: 'center',
        // Symmetric 20px both sides, 0 top/bottom — the button dodge lives
        // on the right group's own box (see its comment below), not here,
        // and left/right's own vertical centering needs the grid's full,
        // unpadded height to center against (an asymmetric top-only pad
        // would skew their center off the row's true middle). Center's own
        // top clearance comes from its own margin instead (see below).
        padding: '0 20px',
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* ── LEFT GROUP: logo + BPM + KEY — independent of center, never shifts transport.
          Measured intrinsic width (~423px) exceeds this column's 1/3 share at the
          900px documented minimum (~235px content-box thirds) — stretched to the
          column and given the same internal-horizontal-scroll treatment as the
          Mixer's channel-strip row (`.mixer-scroll`) rather than letting it spill
          into the center column, so nothing is hidden/removed, just reachable via
          scroll at the floor width. No effect at normal window widths, where the
          column is wide enough that no scrolling occurs. ── */}
      <div className="mixer-scroll" style={{
        display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0,
        justifySelf: 'stretch', minWidth: 0, overflowX: 'auto', overflowY: 'hidden',
      }}>
      {/* ── LOGO ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 'var(--space-3)' }}>
        <Tooltip title="Reset" description="Closes the current file and resets tempo, transpose, and playback state back to their defaults." placement="bottom">
          <span onClick={handleReset} className="app-no-drag" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <OrfeoLogo />
            <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>v{__APP_VERSION__}</span>
          </span>
        </Tooltip>
        <Tooltip title="Open MIDI file (Ctrl+O)" description="Loads a .mid file from disk to start a new session." placement="bottom">
          <button
            onClick={openFile}
            className="app-no-drag"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--button-height)', height: 'var(--button-height)', borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', color: 'var(--text-default)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-default)'}
          >
            <FolderOpen size={16} strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>

      <VSep />

      {/* ── BPM ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 var(--space-3)', flexShrink: 0 }}>
        <Tooltip title={`Tempo: ${liveBpm || '—'} BPM`} description="The song's current playback tempo, scaled by your speed setting." placement="bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>BPM</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>TEMPO</span>
            </div>
            <span style={{ color: isTempoChanged ? 'var(--text-amber)' : 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
              {midi ? liveBpm : '—'}
            </span>
          </div>
        </Tooltip>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <LongPressArrow onStep={() => setBpm(Math.min(300, useStore.getState().bpm + 1))} disabled={!midi} title="BPM +1" description="Nudges playback tempo up by one beat per minute."><ChevronUp size={10} /></LongPressArrow>
          <LongPressArrow onStep={() => setBpm(Math.max(20, useStore.getState().bpm - 1))} disabled={!midi} title="BPM -1" description="Nudges playback tempo down by one beat per minute."><ChevronDown size={10} /></LongPressArrow>
        </div>
        {/* ── Reset — space always reserved so its appearance never shifts the transport controls ── */}
        {/* wrapperStyle carries the same visibility as the button itself — the
            button's own visibility:hidden alone no longer excludes this area
            from hit-testing once it's nested inside Tooltip's wrapper div,
            which would otherwise still show the tooltip over reserved-but-
            hidden blank space. */}
        <Tooltip title="Reset tempo" description="Restores the song's original BPM, undoing any speed adjustment." placement="bottom"
          wrapperStyle={{ visibility: isTempoChanged ? 'visible' : 'hidden', flexShrink: 0 }}
        >
          <button
            onClick={resetBpm}
            disabled={!isTempoChanged}
            style={{
              background: 'none', border: 'none', padding: 0, color: 'var(--text-amber)', display: 'flex',
              cursor: isTempoChanged ? 'pointer' : 'default',
            }}
          >
            <RotateCcw size={9} />
          </button>
        </Tooltip>
      </div>

      <VSep />

      {/* ── KEY ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 var(--space-3)', flexShrink: 0 }}>
        <Tooltip
          title={`Key: ${displayKey}${transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose} semitones)` : ''}`}
          description="The song's detected key, adjusted by any transpose applied here."
          placement="bottom"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>KEY</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>TRANSPOSE</span>
            </div>
            <span style={{ color: transpose !== 0 ? 'var(--text-amber)' : 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'right', lineHeight: 1 }}>
              {displayKey}
            </span>
          </div>
        </Tooltip>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ArrowBtn onClick={() => handleTranspose(1)} disabled={!midi || transpose >= 12} title="Transpose up" description="Shifts the detected key up by a semitone (max +12)."><ChevronUp size={10} /></ArrowBtn>
          <ArrowBtn onClick={() => handleTranspose(-1)} disabled={!midi || transpose <= -12} title="Transpose down" description="Shifts the detected key down by a semitone (max −12)."><ChevronDown size={10} /></ArrowBtn>
        </div>
        {/* ── Reset — space always reserved so its appearance never shifts the transport controls ── */}
        <Tooltip title="Reset key" description="Clears the transpose, back to the song's originally detected key." placement="bottom"
          wrapperStyle={{ visibility: transpose !== 0 ? 'visible' : 'hidden', flexShrink: 0 }}
        >
          <button
            onClick={() => useStore.setState({ detectedKey: detectedKey ? { ...detectedKey, transpose: 0 } : null })}
            disabled={transpose === 0}
            style={{
              display: 'flex', alignItems: 'center', color: 'var(--text-amber)',
              background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber-medium)',
              borderRadius: 4, padding: '1px 5px', fontSize: 9,
              cursor: transpose !== 0 ? 'pointer' : 'default',
            }}>
            <RotateCcw size={8} />
          </button>
        </Tooltip>
      </div>

      </div>

      {/* ── CENTER: transport + scrub + filename — its own grid column, so it's
          genuinely centered between the other two regardless of their content
          width; stretches to fill the (equal, minmax(0,1fr)) column instead of
          a fixed 400px box, so at the 900px floor it shrinks with the column
          rather than overflowing into the side groups. alignSelf:'flex-start'
          + its own marginTop opts this column out of the grid's
          alignItems:'center' (which left/right use) — center's content is
          tall enough (~87.5px) that center-aligning it left almost no gap
          above the transport row; anchoring it to the top with an explicit
          20px margin instead gives it the same breathing room without
          moving left/right off their normal centered spot. ── */}
      <div className="app-no-drag" style={{
        justifySelf: 'stretch', minWidth: 0, alignSelf: 'flex-start', marginTop: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      }}>
        {/* Filename — moved above the transport row so the center column's
            topmost line is comparably light (small text) to the left/right
            groups' top lines, now that all three groups share the same
            top-aligned start (see the grid's alignItems comment above). */}
        {midi?.fileName ? (
          <Tooltip title={midi.fileName} description="The loaded file's full name, in case the display above is truncated." placement="bottom">
            <span style={{ color: 'var(--text-default)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', lineHeight: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>
              {midi.fileName.replace(/\.(mid|midi)$/i, '')}
            </span>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--text-default)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', lineHeight: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>
            No file open
          </span>
        )}
        {/* Transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TBtn onClick={stop} disabled={!midi} title="Go to start" description="Jumps playback back to the beginning of the file."><SkipBack size={16} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => handleSkip(-1)} disabled={!midi} title={`Rewind ${SKIP_SECS}s`} description="Skips playback back by five seconds."><Rewind size={15} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={handlePlayPause} disabled={!midi || chordExplorerOpen} accent title="Play / Pause (Space)" description="Starts or pauses playback — same as pressing Space." large>
            {playbackState === 'playing'
              ? <Pause size={24} fill="currentColor" strokeWidth={0} />
              : <Play size={24} fill="currentColor" strokeWidth={0} />}
          </TBtn>
          <TBtn onClick={() => handleSkip(1)} disabled={!midi} title={`Forward ${SKIP_SECS}s`} description="Skips playback ahead by five seconds."><FastForward size={15} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => midi && seek(midi.duration)} disabled={!midi} title="Go to end" description="Jumps playback to the end of the file."><SkipForward size={16} strokeWidth={1.5} /></TBtn>
          {/* position:relative wrapper so the "click to loop" label can be
              position:absolute — it used to sit in normal flex flow as the
              row's last child, so its appearing/disappearing changed the
              row's total width, which shifted every button's position
              (the row is horizontally centered as a block, so a width
              change moves its center point). Absolute positioning removes
              it from flow entirely — buttons never move regardless of
              whether the label is showing. ── */}
          <div style={{ position: 'relative', display: 'flex' }}>
            <TBtn
              onClick={() => {
                const newActive = !loopRegionActive
                setLoopRegionActive(newActive)
                // Jump to loop start when activating with a selection, without forcing playback
                if (newActive && loopStart !== null) seek(loopStart)
              }}
              disabled={!midi} active={loopRegionActive} blink={nudgeLoop} title={loopTooltipTitle} description={loopTooltipDesc}
            ><Repeat size={13} strokeWidth={1.5} /></TBtn>
            {nudgeLoop && (
              <span style={{
                position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)',
                marginLeft: 4,
                color: 'var(--text-amber)', fontSize: 9, fontFamily: 'var(--font-ui)',
                whiteSpace: 'nowrap', letterSpacing: '0.04em',
                opacity: 0.85, pointerEvents: 'none', userSelect: 'none',
              }}>
                click to loop
              </span>
            )}
          </div>
        </div>
        {/* Scrub + loop strip — shared column; width: min(100%, 400px) centers both at
            the same visual width as the old scrub content (34+6+320+6+34 = 400px).
            position: relative lets LoopRegionStrip anchor its icon outside this column. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 'min(100%, 400px)', position: 'relative' }}>
          {/* Scrub */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
              {formatTime(currentTime)}
            </span>
            <Tooltip title="Scrub position" description="Drag to jump to any point in the song." wrapperStyle={{ flex: 1, maxWidth: 320 }}>
              <input
                type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
                onMouseDown={handleScrubStart} onChange={handleScrubChange} onMouseUp={handleScrubEnd}
                className="scrub-slider" style={{ flex: 1, maxWidth: 320 }} disabled={!midi}
              />
            </Tooltip>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, minWidth: 34, flexShrink: 0 }}>
              {formatTime(duration)}
            </span>
          </div>
          {/* Loop Region Strip — visible only when enabled in Settings */}
          {loopRegionEnabled && <LoopRegionStrip />}
        </div>
      </div>

      {/* ── TIME + METRONOME + MIDI — bottoms aligned. Same overflow treatment as
          the left group above: intrinsic width (~291px, more with the bar
          counter once a file's loaded) exceeds this column's ~235px share at
          the 900px floor, so it scrolls internally rather than spilling into
          the center column. This group was previously right-anchored
          (justifySelf:'end', flush against the window's right padding) — a
          plain overflowX:'auto' would pack content flush *left* instead
          (LTR overflow only accumulates rightward), visibly relocating the
          whole group at every window width, and MIDI/volume controls that
          overflow leftward off a flex-end box aren't reachable by scrolling
          at all (scrollWidth==clientWidth in that configuration — verified
          via CDP at 900x608, the Volume knob was invisible and unscrollable).
          direction:'rtl' on the scroll container + direction:'ltr' on the
          inner row is the standard fix: default (unscrolled) view still
          shows the group's right-anchored end (unchanged from before at
          normal widths), and the overflow that used to spill into the
          center column is now reachable by scrolling left instead. ── */}
      <div className="app-no-drag mixer-scroll" style={{
        justifySelf: 'stretch', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', direction: 'rtl',
        // ── Top-aligned like its siblings (inherits the grid's own
        // alignItems:'flex-start') — stays flush-right against the real Win
        // overlay button boundary via paddingRight (overlayInset is measured
        // from the window's true right edge; the grid container itself only
        // contributes a flat 20px here, so this makes up the rest), not by
        // ducking below the buttons' 40px zone. Content's right edge lands
        // exactly where the buttons start, so there's no horizontal overlap
        // into their hit-region at any vertical position.
        paddingRight: Math.max(overlayInset - 20, 0),
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, flexShrink: 0, direction: 'ltr', width: 'max-content' }}>

        {/* VOLUME */}
        <VolumeKnob />
        <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* BAR COUNTER — only when a file is loaded */}
        {midi && (
          <>
            <Tooltip title={`Bar ${currentBar} of ${totalBars}`} description="Your current position in the song, counted in bars." placement="bottom">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 var(--space-3)' }}>
                <div style={{
                  background: 'var(--bg-tile)', borderRadius: 4, padding: '2px 6px',
                  display: 'flex', alignItems: 'baseline', gap: 0,
                }}>
                  <span style={{ color: 'var(--topbar-bar-number)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 700, lineHeight: 1, minWidth: '3ch', textAlign: 'right', display: 'inline-block' }}>
                    {currentBar}
                  </span>
                  <span style={{ color: 'var(--topbar-bar-total)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', lineHeight: 1 }}>
                    |{totalBars}
                  </span>
                </div>
                <span style={{ color: 'var(--topbar-bar-label)', fontSize: 8, fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1, marginTop: 6 }}>
                  BAR
                </span>
              </div>
            </Tooltip>
            <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />
          </>
        )}

        {/* TIME SIGNATURE */}
        <Tooltip
          title={midi ? `Time signature: ${midi.timeSignatureNumerator ?? 4}/${midi.timeSignatureDenominator ?? 4}` : 'No file loaded'}
          description="How many beats make up each bar, and which note value counts as one beat."
          placement="bottom"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px' }}>
            {midi ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ color: 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 700 }}>
                  {midi.timeSignatureNumerator ?? 4}
                </span>
                <div style={{ width: 14, height: 1, background: 'var(--topbar-timesig-divider)', margin: '2px 0' }} />
                <span style={{ color: 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)', fontWeight: 700 }}>
                  {midi.timeSignatureDenominator ?? 4}
                </span>
              </div>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>—</span>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1, marginTop: 6 }}>TIME</span>
          </div>
        </Tooltip>

        <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* METRONOME */}
        <Tooltip
          title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
          description="Clicks along with the beat while a file plays — click to toggle."
          placement="bottom"
        >
          <button
            onClick={() => setMetronomeEnabled(!metronomeEnabled)}
            style={{
              flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '0 14px', border: 'none', cursor: 'pointer',
              background: 'transparent', color: metronomeEnabled ? 'var(--topbar-metronome-on)' : 'var(--topbar-metronome-off)', transition: 'color 0.15s',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 11.4V9.1" />
              <path d="m12 17 6.59-6.59" />
              <path d="m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2" />
              <circle cx="20" cy="9" r="2" />
            </svg>
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', lineHeight: 1, marginTop: 6 }}>
              {metronomeEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </Tooltip>

        <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* MIDI */}
        <Tooltip
          title={midiDeviceConnected ? `MIDI: ${midiDeviceName}` : 'No MIDI keyboard connected'}
          description={midiDeviceConnected ? 'A physical MIDI keyboard is connected and ready to play.' : 'Connect a MIDI keyboard via USB to play along live.'}
          placement="bottom"
          wrapperStyle={{ flexShrink: 0 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 14px', color: midiDeviceConnected ? 'var(--topbar-midi-on)' : 'var(--topbar-midi-off)' }}>
            <MidiIcon size={24} color={midiDeviceConnected ? 'var(--topbar-midi-on)' : 'var(--topbar-midi-off)'} />
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: midiDeviceConnected ? '0.08em' : '0.05em', color: midiDeviceConnected ? 'var(--topbar-midi-on)' : 'var(--topbar-midi-off)', lineHeight: 1, marginTop: 6, whiteSpace: 'nowrap' }}>
              {midiDeviceConnected ? (midiDeviceName?.split(' ')[0] ?? 'MIDI') : 'CONNECT A KEYBOARD'}
            </span>
          </div>
        </Tooltip>


      </div>
      </div>
    </div>
  )
}

function VSep() {
  return <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', flexShrink: 0 }} />
}

// Long-press button: single click = +1, hold = accelerating repeat
function LongPressArrow({ children, onStep, disabled, title, description }: {
  children: React.ReactNode; onStep: () => void; disabled?: boolean; title?: string; description?: string
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepsRef = useRef(0)

  const stop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    stepsRef.current = 0
  }

  const start = () => {
    if (disabled) return
    onStep()
    stepsRef.current = 0
    // After 400ms hold, start repeating
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onStep()
        stepsRef.current++
      // Accelerate: start at 120ms, ramp down to 40ms after 20 steps
      }, Math.max(40, 120 - stepsRef.current * 4))
    }, 400)
  }

  useEffect(() => () => stop(), [])

  const button = (
    <button
      disabled={disabled}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      style={{
        width: 16, height: 13, background: 'var(--bg-tile)',
        color: disabled ? 'var(--text-dim-control)' : 'var(--text-amber)',
        border: 'none', borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  )
  return title ? <Tooltip title={title} description={description} placement="bottom">{button}</Tooltip> : button
}

function ArrowBtn({ children, onClick, disabled, title, description }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string; description?: string
}) {
  const button = (
    <button onClick={onClick} disabled={disabled}
      style={{
        width: 16, height: 13, background: 'var(--bg-tile)',
        color: disabled ? 'var(--text-dim-control)' : 'var(--text-amber)',
        border: 'none', borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
  return title ? <Tooltip title={title} description={description} placement="bottom">{button}</Tooltip> : button
}

function TBtn({ children, onClick, disabled, accent, active, blink, title, description, large }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  accent?: boolean; active?: boolean; blink?: boolean; title?: string; description?: string; large?: boolean
}) {
  const sz = large ? 46 : 32
  const isAmber = active || accent || blink
  const button = (
    <button onClick={onClick} disabled={disabled}
      className={blink ? 'loop-nudge-blink' : undefined}
      style={{
        width: sz, height: sz,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: 'none', background: 'transparent',
        color: isAmber ? 'var(--text-amber)' : 'var(--text-default)',
        opacity: disabled ? 0.2 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: blink ? undefined : 'color 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { e.currentTarget.style.color = isAmber ? 'var(--text-amber)' : 'var(--text-default)' }}
    >
      {children}
    </button>
  )
  return title ? <Tooltip title={title} description={description} placement="bottom">{button}</Tooltip> : button
}
