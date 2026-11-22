import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Circle, Square, Music, Layers, Repeat, FileMusic, Timer, Hand, Keyboard as KeyboardIcon, FolderOpen } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { getNoteName } from '../../utils/noteNames'
import Tooltip from '../Tooltip'
import { usePractice, practisedHand } from '../../practice/practiceMode'
import { useBlank, setBlankSetup } from '../../record/blank'
import { useRecord, setRecordMode, setRunUpBars, startRecord, stopRecord, openLastTake, punchRange, barsOf, type RecordMode } from '../../record/recordMode'
import type { Meter } from '../../record/click'
import { AMBER, barIcon, featLabel, featValue, toolBtn, BarPop, PopItem, popHeading, PopDivider, Reserve, MiniSwitch } from './practiceBar'

// ── Practice mode's REC (footer, right, before VIEW) ─────────────────────────
// Closed: the way of recording chosen (REC: OVER THE SONG). A click opens its
// choices upwards: the three ways, their switches, and Record. While recording
// the button is STOP, a red square, as in any recorder, with a red dot while
// it records and how far you've got. Pause (the header) only pauses the take;
// Stop ends it, and Orfeo asks Keep or Discard. (After 2.0: lives on the
// record-export branch.)

const RED = 'var(--status-error-hover)'
const METERS: Meter[] = [{ beats: 2, unit: 4 }, { beats: 3, unit: 4 }, { beats: 4, unit: 4 }, { beats: 6, unit: 8 }]

/** A row of small choices inside the panel (time signature) */
function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-default)', minWidth: 52 }}>{label}</span>
      {children}
    </div>
  )
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      padding: '3px 8px', fontFamily: 'var(--font-ui)', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
      background: on ? 'var(--accent-amber-subtle)' : 'none', color: on ? AMBER : 'var(--text-default)',
      border: `1px solid ${on ? 'var(--accent-amber-strong)' : 'var(--border)'}`,
    }}>{children}</button>
  )
}

export default function PracticeRecord() {
  const mode = useRecord(s => s.mode)
  const songPhase = useRecord(s => s.songPhase)
  const songNotes = useRecord(s => s.notes)
  const songMessage = useRecord(s => s.message)
  const lastSaved = useRecord(s => s.lastSaved)
  const asking = useRecord(s => s.asking)
  const countingIn = useStore(s => s.countIn !== null)
  const runUpBars = useRecord(s => s.runUpBars)
  const punchNow = useRecord(s => s.punchNow)
  // Overdub's punch points: the loop (its bars follow it as you change it)
  useStore(s => s.loopStart); useStore(s => s.loopEnd); useStore(s => s.barStarts)
  const blankPhase = useBlank(s => s.phase)
  const setup = useBlank(s => s.setup)
  const blankBar = useBlank(s => s.bar)
  const blankBeat = useBlank(s => s.beat)
  const blankNotes = useBlank(s => s.notes)
  const blankMessage = useBlank(s => s.message)
  usePractice(s => s.hand); usePractice(s => s.way); usePractice(s => s.onlyHand)   // the hand line follows your choice
  const naming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const [open, setOpen] = useState(false)
  const [choosingSplit, setChoosingSplit] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  const blankBusy = blankPhase === 'counting' || blankPhase === 'recording' || blankPhase === 'saving'
  const busy = songPhase !== 'idle' || blankBusy
  const live = songPhase === 'recording' || blankPhase === 'recording'
  const saving = songPhase === 'saving' || songPhase === 'asking' || blankPhase === 'saving'
  const hand = usePractice.getState().onlyHand ?? practisedHand()
  const twoHands = setup.hands === 'two'
  const nn = naming === 'sargam' || naming === 'hidden' ? 'english' : naming
  const keyName = (n: number) => `${getNoteName(n, nn, accidentals)}${Math.floor(n / 12) - 1}`
  const message = mode === 'blank' ? blankMessage : songMessage

  // the split key: the next key you press on your keyboard
  useEffect(() => {
    if (!choosingSplit) return
    let off = () => {}
    void import('../../hooks/useMidiInput').then(m => {
      off = m.onPlayedKey(k => { if (k.on) { setBlankSetup({ splitKey: k.note }); setChoosingSplit(false) } })
    })
    return () => off()
  }, [choosingSplit])
  useEffect(() => { if (!open) setChoosingSplit(false) }, [open])

  const ways: Record<RecordMode, { name: string; tip: string }> = {
    song: { name: t`Over the song`, tip: t`Record your own piano part over the song's arrangement. Keep it, and a new version of the song has your playing as its piano part.` },
    overdub: { name: t`Overdub`, tip: t`Record over the loop's bars only: punch in where the loop starts, punch out where it ends. Keep it, and your playing replaces the piano part there; the rest of the song stays as it is.` },
    blank: { name: t`Blank page`, tip: t`No song: just you, and a click if you like. Keep your take, and it's saved as a new song in Library › Orfeo › Recordings.` },
  }

  // what the button says
  const value = asking ? t`Keep?`
    : saving ? t`Saving…`
    : countingIn && (songPhase === 'starting' || songPhase === 'paused') ? t`Count-in`
    : songPhase === 'starting' ? t`Starting…`
    : songPhase === 'paused' ? t`Paused`
    : songPhase === 'recording' && punchNow === 'before' ? t`Run-up`
    : songPhase === 'recording' && punchNow === 'after' ? t`Punched out`
    : songPhase === 'recording' ? (songNotes === 1 ? t`1 note` : t`${songNotes} notes`)
    : blankPhase === 'counting' ? t`Count-in ${blankBeat}`
    : blankPhase === 'recording' ? (setup.withClick ? t`Bar ${blankBar}` : blankNotes === 1 ? t`1 note` : t`${blankNotes} notes`)
    : ways[mode].name
  const tip = busy
    ? { title: t`Stop`, description: mode !== 'blank'
        ? t`Stops the recording; Orfeo then asks whether to keep your take.
Pause only pauses it: Play goes on after a count-in.`
        : t`Stops the recording; Orfeo then asks whether to keep your take.` }
    : { title: ways[mode].name, description: ways[mode].tip + '\n' + t`Click to choose how you record, and to start.` }

  const punch = punchRange()
  const punchBars = punch ? barsOf(punch) : null
  const start = () => { setOpen(false); void startRecord() }

  return (
    <>
      <Tooltip title={tip.title} description={tip.description} placement="top" disabled={open}>
        <button ref={ref} onClick={() => (busy ? !saving && void stopRecord(true) : setOpen(o => !o))}
          style={toolBtn()} aria-label={busy ? t`Stop recording` : t`Record`} aria-expanded={open}>
          {busy && !saving ? <Square {...barIcon} color={RED} fill={RED} /> : <Circle {...barIcon} />}
          <Reserve options={[t`Rec:`, t`Stop`].map((x, i) => <span key={i} style={featLabel}>{x}</span>)}>
            {busy && !saving ? <span style={{ ...featLabel, color: RED }}>{t`Stop`}</span> : <span style={featLabel}>{t`Rec:`}</span>}
          </Reserve>
          <span aria-hidden className={live ? 'orfeo-soft-pulse' : undefined}
            style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: live ? RED : 'var(--text-muted)', visibility: busy && !saving ? 'visible' : 'hidden' }} />
          <Reserve options={[ways.song.name, ways.overdub.name, ways.blank.name, t`Count-in ${8}`, t`${8888} notes`, t`Paused`, t`Saving…`, t`Run-up`, t`Punched out`].map((x, i) => <span key={i} style={featValue}>{x}</span>)}>
            <span style={featValue}>{value}</span>
          </Reserve>
        </button>
      </Tooltip>
      {open && (
        <BarPop anchor={ref.current} up align="right" width={320} onClose={() => setOpen(false)} label={t`Record`}>
          <div style={popHeading}>{t`Record`}</div>
          {(['song', 'overdub', 'blank'] as RecordMode[]).map(id => (
            <PopItem key={id} on={mode === id} onClick={() => setRecordMode(id)} hint={ways[id].tip}>
              {id === 'song' ? <Music size={14} color={AMBER} /> : id === 'overdub' ? <Layers size={14} color={AMBER} /> : <FileMusic size={14} color={AMBER} />}
              {ways[id].name}
            </PopItem>
          ))}

          <PopDivider />
          <div style={popHeading}>{t`Switches`}</div>
          {mode === 'blank' && (
            <>
              <PopItem on={setup.withClick} onClick={() => setBlankSetup({ withClick: !setup.withClick })}
                hint={setup.withClick ? t`The bars are exact from the start. The click is heard, never recorded.` : t`Play freely, no click. The tempo and bars are worked out afterwards.`}>
                <Timer size={14} color={AMBER} />
                <span style={{ flex: 1 }}>{t`Click`}</span>
                <MiniSwitch on={setup.withClick} />
              </PopItem>
              {setup.withClick && (
                <>
                  <PopItem on={setup.countInBars > 0} onClick={() => setBlankSetup({ countInBars: setup.countInBars > 0 ? 0 : 1 })}
                    hint={t`A bar of clicks before you start.`}>
                    <Timer size={14} color={AMBER} />
                    <span style={{ flex: 1 }}>{t`Count-in`}</span>
                    <MiniSwitch on={setup.countInBars > 0} />
                  </PopItem>
                  <Chips label={t`Time`}>
                    {METERS.map(m => (
                      <Chip key={`${m.beats}/${m.unit}`} on={setup.meter.beats === m.beats && setup.meter.unit === m.unit} onClick={() => setBlankSetup({ meter: m })}>{`${m.beats}/${m.unit}`}</Chip>
                    ))}
                  </Chips>
                  <Chips label={t`Tempo`}>
                    <input type="number" min={30} max={240} value={setup.bpm} aria-label={t`Tempo`}
                      onChange={e => setBlankSetup({ bpm: Math.max(30, Math.min(240, Number(e.target.value) || 90)) })}
                      style={{ width: 58, padding: '3px 6px', background: 'var(--bg-input)', color: 'var(--text-active)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>{setup.meter.unit === 8 ? t`eighths a minute` : t`BPM`}</span>
                  </Chips>
                </>
              )}
            </>
          )}
          {mode === 'overdub' && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 14px 8px', fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: 1.4 }}>
                <Repeat size={14} color={AMBER} style={{ flexShrink: 0, marginTop: 1 }} />
                {punch ? (
                  <span style={{ color: 'var(--text-default)' }}>
                    {punchBars!.a === punchBars!.b ? t`Punch in and out: bar ${punchBars!.a}, the loop.` : t`Punch in and out: bars ${punchBars!.a} to ${punchBars!.b}, the loop.`}
                  </span>
                ) : (
                  <span style={{ color: AMBER }}>{t`Set a loop around the bars to record first: Alt + drag on the piano roll.`}</span>
                )}
              </div>
              <Chips label={t`Run-up`}>
                {([1, 2] as const).map(n => <Chip key={n} on={runUpBars === n} onClick={() => setRunUpBars(n)}>{n === 1 ? t`1 bar` : t`2 bars`}</Chip>)}
              </Chips>
            </>
          )}
          {mode !== 'blank' ? (
            hand === 'B' ? (
              <PopItem on={choosingSplit} onClick={() => setChoosingSplit(c => !c)}
                hint={choosingSplit ? t`Press a key on your keyboard…` : t`Below it your left hand, from it up your right. Click, then press a key on your keyboard.`}>
                <KeyboardIcon size={14} color={AMBER} />
                <span style={{ flex: 1 }}>{t`Split key`}</span>
                <span style={{ ...featValue, color: choosingSplit ? AMBER : 'var(--text-active)' }}>{keyName(setup.splitKey)}</span>
              </PopItem>
            ) : (
              <div style={{ padding: '6px 14px 8px', fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: 1.4, color: 'var(--text-muted)' }}>
                {mode === 'overdub'
                  ? (hand === 'L' ? t`You're playing the left hand: your take replaces the song's left hand in the loop.` : t`You're playing the right hand: your take replaces the song's right hand in the loop.`)
                  : (hand === 'L' ? t`You're playing the left hand: your take becomes the song's left hand.` : t`You're playing the right hand: your take becomes the song's right hand.`)}
              </div>
            )
          ) : (
            <>
              <PopItem on={twoHands} onClick={() => setBlankSetup({ hands: twoHands ? 'one' : 'two' })}
                hint={twoHands ? t`Below the split key the left hand, from it up the right. Each hand can be redone on its own.` : t`Both hands on one track.`}>
                <Hand size={14} color={AMBER} />
                <span style={{ flex: 1 }}>{t`A track for each hand`}</span>
                <MiniSwitch on={twoHands} />
              </PopItem>
              {twoHands && (
                <PopItem on={choosingSplit} onClick={() => setChoosingSplit(c => !c)}
                  hint={choosingSplit ? t`Press a key on your keyboard…` : t`Click, then press a key on your keyboard.`}>
                  <KeyboardIcon size={14} color={AMBER} />
                  <span style={{ flex: 1 }}>{t`Split key`}</span>
                  <span style={{ ...featValue, color: choosingSplit ? AMBER : 'var(--text-active)' }}>{keyName(setup.splitKey)}</span>
                </PopItem>
              )}
            </>
          )}

          <PopDivider />
          <div style={{ padding: '6px 14px 10px', display: 'grid', gap: 6 }}>
            <button onClick={start} disabled={mode === 'overdub' && !punch} style={{ ...startBtn, ...(mode === 'overdub' && !punch ? { opacity: 0.45, cursor: 'default' } : {}) }}>
              <Circle size={11} fill="currentColor" /> {t`Record`}
            </button>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, lineHeight: 1.35, color: 'var(--text-muted)' }}>
              {mode === 'overdub'
                ? (runUpBars === 1 ? t`The song starts a bar before the loop, after a count-in.` : t`The song starts two bars before the loop, after a count-in.`) + ' '
                  + t`Only what you play inside the loop is recorded; the song plays on after it until you Stop. Pause pauses the recording too; Play goes on after a count-in. Then: Keep or Discard.`
                : mode === 'song'
                ? t`The song plays from the start, after a count-in. Pause pauses the recording too; Play goes on after a count-in. Stop (the red square, here) or the song's end ends the take. Then: Keep or Discard.`
                : t`The song stops while you record. Stop (the red square, here) ends the take. Then: Keep or Discard.`}
            </span>
            {message && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, lineHeight: 1.35, color: 'var(--text-default)', wordBreak: 'break-word' }}>{message}</span>}
          </div>
          {lastSaved && (
            <>
              <PopDivider />
              <PopItem onClick={() => { setOpen(false); void openLastTake() }} hint={t`Leaves practice mode and opens it, to listen. ${lastSaved.split(/[\\/]/).pop()}`}>
                <FolderOpen size={14} color={AMBER} />
                {t`Open your last take`}
              </PopItem>
            </>
          )}
        </BarPop>
      )}
    </>
  )
}

const startBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0', borderRadius: 'var(--radius-md)', cursor: 'pointer',
  background: AMBER, color: 'var(--text-on-amber)', border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
}
