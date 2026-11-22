import { useEffect, useRef, useState } from 'react'
import { Piano, Hand, History, MonitorUp, FoldVertical, Hourglass, Volume2, VolumeX, Check } from 'lucide-react'
import { useStore } from '../../store'
import { useMidiSettings } from '../../store/midiSettings'
import { detectChord, localizeChord } from '../../utils/chordDetection'
import { getNoteName } from '../../utils/noteNames'
import { useToPlay } from '../../practice/practiceLights'
import { modelName } from '../../utils/midiDeviceNames'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import MidiIcon from '../MidiIcon'
import { usePractice, setHearMine, fixHandsFromPractice, type PracticeWay, type PracticeHand, type PracticeView } from '../../practice/practiceMode'
import { useSession } from '../../practice/session'
import { RAMP_ROUNDS, RAMP_START, RAMP_STEP } from '../../practice/take'
import { AMBER, barIcon, featLabel, featValue, toolBtn, BarPop, PopItem, popHeading, PopDivider, HandMarks, Reserve } from './practiceBar'

// ── Practice mode's footer, between the piano roll and the keyboard ──────────
// Left: how you play (MODE), which hands, and the waiting. Centre: the chord
// to play next and the chord in the keys you hold. Right: the view, the playbar, and the
// keyboard you play on. Each choice opens upwards, all in one panel.

// The name of a set of notes: a chord's name, a single note's name, or nothing
function useChordName(notes: number[] | Set<number>, settle = 0): string {
  const naming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const style = useStore(s => s.chordNamingStyle)
  const [name, setName] = useState('')
  const key = [...notes].sort((a, b) => a - b).join()
  useEffect(() => {
    const id = setTimeout(() => {
      const list = key ? key.split(',').map(Number) : []
      const nn = naming === 'sargam' || naming === 'hidden' ? 'english' : naming
      if (!list.length) { setName(''); return }
      const raw = list.length >= 2 ? detectChord(new Set(list)) : null
      setName(raw ? (localizeChord(raw, nn, accidentals, style) ?? raw) : getNoteName(list[0], nn, accidentals))
    }, settle)
    return () => clearTimeout(id)
  }, [key, naming, accidentals, style, settle])
  return name
}

// The centre of the footer: the chord your part plays next (as the keys light
// up) beside the chord in the keys you're holding
function Chords() {
  // the song's chord (steady through fast runs), or every note of your part (Settings › Practice)
  const shows = useStore(s => s.toPlayShows)
  const toPlayNotes = useChordName(useToPlay(s => s.notes))
  const songChord = useToPlay(s => s.chord)
  const naming = useStore(s => s.noteNaming), accidentals = useStore(s => s.accidentals), style = useStore(s => s.chordNamingStyle)
  const toPlay = shows === 'notes' ? toPlayNotes : songChord ? (localizeChord(songChord, naming === 'sargam' || naming === 'hidden' ? 'english' : naming, accidentals, style) ?? songChord) : ''
  // read a moment after the last key change, so a rolled chord doesn't flicker
  const youPlay = useChordName(useStore(s => s.midiHeldKeys), 40)
  const name = (v: string, colour: string) => (
    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, color: colour, minWidth: 72, textAlign: 'left', whiteSpace: 'nowrap' }}>{v || '—'}</span>
  )
  return (
    <div style={{ justifySelf: 'center', display: 'flex', alignItems: 'center', gap: 28 }}>
      <Tooltip title={t`To play`} description={shows === 'notes' ? t`The notes your part plays next, as its keys light up (a chord's name, or a single note's).
Settings › Practice: Chords, for the song's chords instead.` : t`The song's chord where your next notes are, as the chord display reads it.
Settings › Practice: Every note, for each note of your part.`} placement="top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={featLabel}>{t`To play:`}</span>{name(toPlay, AMBER)}
        </div>
      </Tooltip>
      <Tooltip title={t`You play`} description={t`The chord in the keys you're holding on your keyboard right now.`} placement="top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={featLabel}>{t`You play:`}</span>{name(youPlay, 'var(--text-active)')}
        </div>
      </Tooltip>
    </div>
  )
}

export default function PracticeStrip() {
  const playbar = useStore(s => s.practicePlaybar)
  const { way, hand, waitOn, level, view, onlyHand, ramp, hearMine } = usePractice()
  const streak = useSession(s => s.ramp.streak)
  const set = usePractice.setState
  const [open, setOpen] = useState<'' | 'mode' | 'hands' | 'view' | 'midi'>('')
  const refs = { mode: useRef<HTMLButtonElement>(null), hands: useRef<HTMLButtonElement>(null), view: useRef<HTMLButtonElement>(null), midi: useRef<HTMLButtonElement>(null) }
  const toggle = (n: typeof open) => setOpen(o => (o === n ? '' : n))
  const close = () => setOpen('')

  // ── The three ways of playing ──
  const ways: Record<PracticeWay, { name: string; tip: string }> = {
    practise: { name: t`Play along`, tip: t`Play with the song, one hand or both, at any tempo. Turn on Wait to have the song wait for your notes.` },
    wait: { name: t`Wait for me`, tip: t`Both hands. The song waits for every note at its own tempo, so you can learn it at your own pace.` },
    perform: { name: t`Performance`, tip: t`Both hands. The song keeps going, as on stage. Three levels, from any tempo with a metronome to the song's own tempo with nothing else.` },
  }
  const levels: [1 | 2 | 3, string][] = [
    [1, t`Metronome and any tempo`],
    [2, t`No metronome, at most 20 % slower`],
    [3, t`The song's own tempo, nothing else`],
  ]
  // ── Hands: in Play along only; the other two ways are both hands ──
  const handName: Record<PracticeHand, string> = { L: t`Left`, R: t`Right`, B: t`Both` }
  const shownHand: PracticeHand = onlyHand ?? (way === 'practise' ? hand : 'B')
  const handsChoice = way === 'practise' && !onlyHand
  // ── Views ──
  const views: Record<PracticeView, { name: string; tip: string }> = {
    roll: { name: t`Piano roll`, tip: t`The notes fall onto the keyboard.` },
    split: { name: t`Split`, tip: t`The score above, the piano roll below it, half and half.` },
    score: { name: t`Score`, tip: t`The notes written out, a page at a time.` },
  }
  // ── Keyboards ──
  const allDevices = useMidiSettings(s => s.devices)
  const devices = allDevices.filter(d => d.connected)
  const activeDevice = useMidiSettings(s => s.activeDevice)
  const listenMode = useMidiSettings(s => s.listenMode)
  const selected = useMidiSettings(s => s.selectedDevices)
  const connected = useStore(s => s.midiDeviceConnected)
  const deviceName = useStore(s => s.midiDeviceName)
  const playOn = (key: string | null) => {
    const m = useMidiSettings.getState()
    if (key === null) m.set({ listenMode: 'all' })
    else { m.set({ listenMode: 'selected', selectedDevices: [key] }); useMidiSettings.setState({ activeDevice: key }) }
    close()
  }

  return (
    <div data-practice-strip style={{
      height: 48, flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center',
      padding: '0 20px', boxSizing: 'border-box', background: 'var(--bg-deep)', borderTop: '1px solid var(--state-hover-bg)',
    }}>
      {/* ── Left: mode, hands, wait ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
        <Tooltip title={ways[way].name} description={ways[way].tip + '\n' + t`Click to choose how you play.`} placement="top" disabled={open === 'mode'}>
          <button ref={refs.mode} onClick={() => toggle('mode')} style={toolBtn()} aria-label={t`Mode`} aria-expanded={open === 'mode'}>
            <Piano {...barIcon} />
            <span style={featLabel}>{t`Mode:`}</span>
            <Reserve options={[ways.practise.name, ways.wait.name, t`Performance ${3}`].map((x, i) => <span key={i} style={featValue}>{x}</span>)}>
              <span style={featValue}>{way === 'perform' ? t`Performance ${level}` : ways[way].name}</span>
            </Reserve>
          </button>
        </Tooltip>
        {open === 'mode' && (
          <BarPop anchor={refs.mode.current} up width={320} onClose={close} label={t`Mode`}>
            <div style={popHeading}>{t`How you play`}</div>
            {(['practise', 'wait', 'perform'] as PracticeWay[]).map(id => (
              <PopItem key={id} on={way === id} onClick={() => { set({ way: id }); if (id !== 'perform') close() }} hint={ways[id].tip}>
                {ways[id].name}
              </PopItem>
            ))}
            {way === 'perform' && (
              <>
                <PopDivider />
                <div style={popHeading}>{t`Level`}</div>
                {levels.map(([n, tip]) => (
                  <PopItem key={n} on={level === n} onClick={() => { set({ level: n }); close() }} hint={tip}>{t`Level ${n}`}</PopItem>
                ))}
              </>
            )}
            {way === 'practise' && (
              <>
                <PopDivider />
                <PopItem on={ramp} onClick={() => set({ ramp: !ramp })}
                  hint={t`Starts at ${RAMP_START} % of the song's tempo and goes up ${RAMP_STEP} % after every ${RAMP_ROUNDS} clean times round the loop (or through the song), up to the song's own tempo. Clean: nothing missed, at most one stray key, and the song never kept waiting. Off again: back to the speed you had.`}>
                  <History size={14} color={AMBER} />
                  <span style={{ flex: 1 }}>{t`Speed up`}</span>
                  <MiniSwitch on={ramp} />
                </PopItem>
              </>
            )}
          </BarPop>
        )}

        <Tooltip title={t`Hands`} placement="top" disabled={open === 'hands'}
          description={onlyHand ? t`The song's piano is for one hand only.`
            : handsChoice ? t`Which hand you play; Orfeo plays the other. Click to choose.`
            : t`${ways[way].name} is always both hands.`}>
          <button ref={refs.hands} onClick={() => (handsChoice || onlyHand) && toggle('hands')} style={toolBtn(!handsChoice && !onlyHand)} aria-label={t`Hands`} aria-expanded={open === 'hands'}>
            <Hand {...barIcon} />
            <span style={featLabel}>{t`Hands:`}</span>
            <Reserve options={[handName.L, handName.R, handName.B].map((x, i) => <span key={i} style={featValue}>{x}</span>)}>
              <span style={featValue}>{handName[shownHand]}</span>
            </Reserve>
            <Reserve options={[<HandMarks key="b" hand="B" />]}><HandMarks hand={shownHand} /></Reserve>
          </button>
        </Tooltip>
        {open === 'hands' && (
          <BarPop anchor={refs.hands.current} up width={230} onClose={close} label={t`Hands`}>
            <div style={popHeading}>{t`Hands`}</div>
            {onlyHand ? (
              <>
                <div style={{ padding: '4px 14px 8px', fontSize: 12, lineHeight: 1.4, color: 'var(--text-muted)' }}>
                  {onlyHand === 'L' ? t`The song's piano is for the left hand only.` : t`The song's piano is for the right hand only.`}
                </div>
                <PopItem onClick={() => { close(); fixHandsFromPractice() }} hint={t`If some notes are clearly for the other hand, check the hands in the MIDI Editor; saving then gives each hand its own track.`}>
                  {t`Two hands? Edit`}
                </PopItem>
              </>
            ) : (['L', 'R', 'B'] as PracticeHand[]).map(h => (
              <PopItem key={h} on={hand === h} onClick={() => { set({ hand: h }); close() }}>
                <HandMarks hand={h} />{h === 'L' ? t`Left hand` : h === 'R' ? t`Right hand` : t`Both hands`}
              </PopItem>
            ))}
          </BarPop>
        )}

        {way === 'practise' && (
          <Tooltip title={hearMine ? t`My part: heard` : t`My part: silent`} placement="top"
            description={hearMine ? t`Your part plays quietly with you, as a guide.\nClick to play it on your own.` : t`Only you play your part.\nClick to hear it quietly with you, as a guide.`}>
            <button onClick={() => setHearMine(!hearMine)} style={toolBtn()} aria-pressed={hearMine} aria-label={t`My part`}>
              {hearMine ? <Volume2 {...barIcon} /> : <VolumeX {...barIcon} />}
              <span style={featLabel}>{t`My part`}</span>
            </button>
          </Tooltip>
        )}

        {way === 'practise' && (
          <Tooltip title={waitOn ? t`Wait: on` : t`Wait: off`} placement="top"
            description={t`On, the song stops at your next notes and waits until you've played them. Off, it keeps going.`}>
            <button onClick={() => set({ waitOn: !waitOn })} style={toolBtn()} aria-pressed={waitOn} aria-label={t`Wait`}>
              <Hourglass {...barIcon} />
              <span style={featLabel}>{t`Wait:`}</span>
              <Reserve options={[t`On`, t`Off`].map((x, i) => <span key={i} style={featValue}>{x}</span>)}>
                <span style={featValue}>{waitOn ? t`On` : t`Off`}</span>
              </Reserve>
            </button>
          </Tooltip>
        )}
        {/* Speed up on: its clean rounds so far */}
        {way === 'practise' && ramp && (
          <Tooltip title={t`Speed up`} placement="top"
            description={t`Clean rounds at this speed: ${streak} of ${RAMP_ROUNDS}. After ${RAMP_ROUNDS}, the speed goes up ${RAMP_STEP} %.`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <History {...barIcon} />
              <span style={featValue}>{t`${streak} of ${RAMP_ROUNDS}`}</span>
            </span>
          </Tooltip>
        )}
      </div>

      <Chords />

      {/* ── Right: view, playbar, keyboard ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, minWidth: 0 }}>
        <Tooltip title={views[view].name} description={views[view].tip + '\n' + t`Click to change the view.`} placement="top" disabled={open === 'view'}>
          <button ref={refs.view} onClick={() => toggle('view')} style={toolBtn()} aria-label={t`View`} aria-expanded={open === 'view'}>
            <MonitorUp {...barIcon} />
            <span style={featLabel}>{t`View:`}</span>
            <span style={featValue}>{views[view].name}</span>
          </button>
        </Tooltip>
        {open === 'view' && (
          <BarPop anchor={refs.view.current} up align="right" width={250} onClose={close} label={t`View`}>
            <div style={popHeading}>{t`View`}</div>
            {(['roll', 'score', 'split'] as PracticeView[]).map(id => (
              <PopItem key={id} on={view === id} onClick={() => { set({ view: id }); close() }} hint={views[id].tip}>{views[id].name}</PopItem>
            ))}
          </BarPop>
        )}

        {view === 'roll' && (
          <Tooltip title={playbar ? t`Playbar: on` : t`Playbar: off`} placement="top"
            description={t`The line where the notes meet the keys.\nOff, the notes fall straight onto the keyboard.`}>
            <button onClick={() => useStore.getState().setPracticePlaybar(!playbar)} style={{ ...toolBtn(), opacity: playbar ? 1 : 0.45 }} aria-pressed={playbar} aria-label={t`Playbar`}>
              <FoldVertical {...barIcon} />
            </button>
          </Tooltip>
        )}

        <Tooltip title={connected ? modelName(activeDevice || deviceName) : t`No connected keyboards`} placement="top" disabled={open === 'midi'}
          description={devices.length > 1 ? t`Click to choose the keyboard you play on.` : t`The keyboard you play on.`}>
          <button ref={refs.midi} onClick={() => toggle('midi')} style={toolBtn()} aria-label={t`Your keyboard`} aria-expanded={open === 'midi'}>
            <MidiIcon size={22} color={connected ? AMBER : 'var(--topbar-midi-off)'} />
          </button>
        </Tooltip>
        {open === 'midi' && (
          <BarPop anchor={refs.midi.current} up align="right" width={260} onClose={close} label={t`Your keyboard`}>
            <div style={popHeading}>{t`Play on`}</div>
            {devices.length > 1 && (
              <PopItem on={listenMode === 'all'} onClick={() => playOn(null)} hint={t`Whichever you play.`}>{t`Every keyboard`}</PopItem>
            )}
            {devices.map(d => (
              <PopItem key={d.key} on={listenMode === 'selected' ? selected.includes(d.key) : devices.length === 1 || d.key === activeDevice} onClick={() => playOn(d.key)}>
                <Check size={12} style={{ visibility: (listenMode === 'selected' ? selected.includes(d.key) : devices.length === 1) ? 'visible' : 'hidden' }} />
                {modelName(d.key) || d.name}
              </PopItem>
            ))}
            <PopDivider />
            <PopItem onClick={() => { close(); useStore.getState().openSettingsWindow('midi') }}>{t`MIDI keyboard settings`}</PopItem>
          </BarPop>
        )}
      </div>
    </div>
  )
}

// a small on/off switch inside a choice (Speed up)
function MiniSwitch({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{ position: 'relative', display: 'inline-block', width: 26, height: 14, borderRadius: 7, flex: 'none', background: on ? 'var(--text-amber)' : 'var(--bg-input)' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: '50%', background: on ? 'var(--text-on-amber)' : 'var(--text-default)', transition: 'left .15s' }} />
    </span>
  )
}
