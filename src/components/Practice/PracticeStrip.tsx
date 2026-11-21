import { useEffect, useRef, useState } from 'react'
import { Piano, Hand, History, MonitorUp, FoldVertical, Check } from 'lucide-react'
import { useStore } from '../../store'
import { useMidiSettings } from '../../store/midiSettings'
import { detectChord, localizeChord } from '../../utils/chordDetection'
import { shortName } from '../../utils/midiDeviceNames'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import MidiIcon from '../MidiIcon'
import { usePractice, PRACTICE_SIZES, fixHandsFromPractice, type PracticeWay, type PracticeHand, type PracticeView } from '../../practice/practiceMode'
import { useSession } from '../../practice/session'
import { RAMP_ROUNDS, RAMP_START, RAMP_STEP } from '../../practice/take'
import { AMBER, barIcon, featLabel, featValue, toolBtn, BarPop, PopItem, popHeading, PopDivider, HandMarks } from './practiceBar'

// ── Practice mode's footer, between the piano roll and the keyboard ──────────
// Left: how you play (MODE), which hands, and the waiting. Centre: the chord
// you play, read from the keys you hold. Right: the view, the playbar, and the
// keyboard you play on. Each choice opens upwards, all in one panel.

function YouPlay() {
  const held = useStore(s => s.midiHeldKeys)
  const naming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const style = useStore(s => s.chordNamingStyle)
  const [name, setName] = useState('')
  // read a moment after the last key change, so a rolled chord doesn't flicker
  useEffect(() => {
    const id = setTimeout(() => {
      const raw = held.size >= 2 ? detectChord(held) : null
      setName(raw ? (localizeChord(raw, naming === 'sargam' ? 'english' : naming, accidentals, style) ?? raw) : '')
    }, 40)
    return () => clearTimeout(id)
  }, [held, naming, accidentals, style])
  return (
    <Tooltip title={t`You play`} description={t`The chord in the keys you're holding on your keyboard right now.`} placement="top">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, color: AMBER, minWidth: 28, textAlign: 'center' }}>{name || '—'}</span>
        <span style={featValue}>{t`You play`}</span>
      </div>
    </Tooltip>
  )
}

export default function PracticeStrip() {
  const keyboardSize = useStore(s => s.keyboardSize)
  const playbar = useStore(s => s.practicePlaybar)
  const { way, hand, waitOn, level, view, onlyHand, ramp } = usePractice()
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
            <span style={featValue}>{way === 'perform' ? t`Performance ${level}` : ways[way].name}</span>
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
                  {ramp ? t`Speed up: on` : t`Speed up: off`}
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
            <span style={featValue}>{handName[shownHand]}</span>
            <HandMarks hand={shownHand} />
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
          <Tooltip title={waitOn ? t`Wait: on` : t`Wait: off`} placement="top"
            description={t`On, the song stops at your next notes and waits until you've played them. Off, it keeps going.`}>
            <button onClick={() => set({ waitOn: !waitOn })} style={toolBtn()} aria-pressed={waitOn} aria-label={t`Wait`}>
              <History {...barIcon} />
              <span style={featLabel}>{t`Wait:`}</span>
              <span style={featValue}>{waitOn ? t`On` : t`Off`}</span>
            </button>
          </Tooltip>
        )}
        {way === 'practise' && ramp && <span style={{ ...featValue, color: 'var(--text-muted)', fontSize: 10 }}>{t`Clean ${streak} of ${RAMP_ROUNDS}`}</span>}
      </div>

      <YouPlay />

      {/* ── Right: view, playbar, keyboard ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, minWidth: 0 }}>
        <Tooltip title={views[view].name} description={views[view].tip + '\n' + t`Click to change the view or the keyboard's size.`} placement="top" disabled={open === 'view'}>
          <button ref={refs.view} onClick={() => toggle('view')} style={toolBtn()} aria-label={t`View`} aria-expanded={open === 'view'}>
            <MonitorUp {...barIcon} />
            <span style={featLabel}>{t`View:`}</span>
            <span style={featValue}>{views[view].name}</span>
          </button>
        </Tooltip>
        {open === 'view' && (
          <BarPop anchor={refs.view.current} up align="right" width={250} onClose={close} label={t`View`}>
            <div style={popHeading}>{t`View`}</div>
            {(['roll', 'split', 'score'] as PracticeView[]).map(id => (
              <PopItem key={id} on={view === id} onClick={() => { set({ view: id }); close() }} hint={views[id].tip}>{views[id].name}</PopItem>
            ))}
            <PopDivider />
            <div style={popHeading}>{t`Keyboard`}</div>
            <div style={{ display: 'flex', gap: 6, padding: '4px 14px 10px' }}>
              {PRACTICE_SIZES.map(n => (
                <button key={n} onClick={() => useStore.getState().setKeyboardSize(n)} aria-label={t`${n} keys`}
                  style={{
                    flex: 1, padding: '5px 0', fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                    background: keyboardSize === n ? 'var(--accent-amber-subtle)' : 'none', color: keyboardSize === n ? AMBER : 'var(--text-default)',
                    border: `1px solid ${keyboardSize === n ? 'var(--accent-amber-strong)' : 'var(--border)'}`,
                  }}>{n}</button>
              ))}
            </div>
          </BarPop>
        )}

        {view === 'roll' && (
          <Tooltip title={playbar ? t`Playbar: on` : t`Playbar: off`} placement="top"
            description={t`The line where the notes meet the keys. Off, the notes fall straight onto the keyboard.`}>
            <button onClick={() => useStore.getState().setPracticePlaybar(!playbar)} style={{ ...toolBtn(), opacity: playbar ? 1 : 0.45 }} aria-pressed={playbar} aria-label={t`Playbar`}>
              <FoldVertical {...barIcon} />
            </button>
          </Tooltip>
        )}

        <Tooltip title={connected ? deviceName : t`No connected keyboards`} placement="top" disabled={open === 'midi'}
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
                {shortName(d.key) || d.name}
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
