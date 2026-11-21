import { useEffect, useState, type CSSProperties } from 'react'
import { useStore } from '../../store'
import { detectChord, localizeChord } from '../../utils/chordDetection'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { usePractice, PRACTICE_SIZES, fixHandsFromPractice, type PracticeWay, type PracticeHand, type PracticeView } from '../../practice/practiceMode'
import { useSession } from '../../practice/session'
import { RAMP_ROUNDS, RAMP_START, RAMP_STEP } from '../../practice/take'

// ── The strip between the piano roll and the keyboard, in practice mode ──────
// Left: the way of playing and its choices. Centre: the chord YOU play (read
// from the keys you hold, not the song's chords). Right: the view and the
// on-screen keyboard's size. While the song plays only the chord stays.
const segWrap: CSSProperties = { display: 'flex', gap: 2, padding: 2, background: 'var(--bg-tile)', borderRadius: 6 }
const seg = (active: boolean, disabled = false): CSSProperties => ({
  height: 24, padding: '0 10px', border: 'none', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  background: active && !disabled ? 'var(--bg-panel2)' : 'transparent',
  color: disabled ? 'var(--state-disabled)' : active ? 'var(--text-amber)' : 'var(--text-dim)',
})
const cap: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }

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
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10 }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 16, fontWeight: 700, color: 'var(--text-amber)', minWidth: 24, textAlign: 'center' }}>{name || '—'}</span>
      <span style={{ ...cap, fontSize: 9 }}>{t`You play`}</span>
    </div>
  )
}

export default function PracticeStrip() {
  const playing = useStore(s => s.playbackState === 'playing')
  const keyboardSize = useStore(s => s.keyboardSize)
  const { way, hand, waitOn, level, view, onlyHand, ramp } = usePractice()
  const streak = useSession(s => s.ramp.streak)
  const set = usePractice.setState
  const fade: CSSProperties = playing
    ? { opacity: 0, pointerEvents: 'none', transition: 'opacity .35s', minWidth: 0 }
    : { opacity: 1, transition: 'opacity .2s', minWidth: 0 }

  const ways: [PracticeWay, string, string][] = [
    ['practise', t`Practise`, t`Every tool: one hand or both, waiting on or off, any tempo.`],
    ['wait', t`Wait for me`, t`Both hands; the song waits for you at the song's own tempo.`],
    ['perform', t`Performance`, t`Both hands; the song keeps going. Three levels.`],
  ]
  const hands: [PracticeHand, string][] = [['L', t`Left`], ['B', t`Both`], ['R', t`Right`]]
  const levels: [1 | 2 | 3, string][] = [
    [1, t`Metronome and any tempo`],
    [2, t`No metronome · at most 20 % slower`],
    [3, t`The song's own tempo, nothing else`],
  ]
  const views: [PracticeView, string, boolean][] = [['roll', t`Piano roll`, true], ['split', t`Split`, false], ['score', t`Score`, false]]

  return (
    <div data-practice-strip style={{
      height: 36, flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center',
      padding: '0 10px', boxSizing: 'border-box', background: 'var(--bg-modal-header)', borderTop: '1px solid var(--border)',
    }}>
      <div style={fade}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={segWrap}>
            {ways.map(([id, label, tip]) => (
              <Tooltip key={id} title={label} description={tip}>
                <button style={seg(way === id)} onClick={() => set({ way: id })}>{label}</button>
              </Tooltip>
            ))}
          </div>
          {onlyHand && (
            // the song's piano is one hand throughout: always that hand
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={cap}>{onlyHand === 'L' ? t`Left hand only` : t`Right hand only`}</span>
              <Tooltip title={t`Two hands?`} description={t`If some notes are clearly for the other hand, check the hands in the Note Editor; saving then gives each hand its own track.`}>
                <button onClick={fixHandsFromPractice}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-amber)', fontSize: 11, fontFamily: 'var(--font-ui)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {t`Two hands? Edit`}
                </button>
              </Tooltip>
            </div>
          )}
          {way === 'practise' && (
            <>
              {!onlyHand && (
                <div style={segWrap}>
                  {hands.map(([id, label]) => <button key={id} style={seg(hand === id)} onClick={() => set({ hand: id })}>{label}</button>)}
                </div>
              )}
              <div style={segWrap}>
                <Tooltip title={t`Wait`} description={t`The song plays up to your next notes and waits there until you've played them.`}>
                  <button style={seg(waitOn)} aria-pressed={waitOn} onClick={() => set({ waitOn: !waitOn })}>{t`Wait`}</button>
                </Tooltip>
                <Tooltip title={t`Speed up`} description={t`Starts at ${RAMP_START} % of the song's tempo and goes up ${RAMP_STEP} % after every ${RAMP_ROUNDS} clean times round the loop (or through the song), up to the song's own tempo.`}>
                  <button style={seg(ramp)} aria-pressed={ramp} onClick={() => set({ ramp: !ramp })}>{t`Speed up`}</button>
                </Tooltip>
              </div>
              {ramp && <span style={{ ...cap, whiteSpace: 'nowrap' }}>{t`Clean ${streak} of ${RAMP_ROUNDS}`}</span>}
            </>
          )}
          {way === 'wait' && !onlyHand && <span style={cap}>{t`Both hands · song tempo`}</span>}
          {way === 'perform' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={cap}>{t`Level`}</span>
              <div style={segWrap}>
                {levels.map(([n, tip]) => (
                  <Tooltip key={n} title={t`Level ${n}`} description={tip}>
                    <button style={seg(level === n)} onClick={() => set({ level: n })}>{n}</button>
                  </Tooltip>
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{levels[level - 1][1]}</span>
            </div>
          )}
        </div>
      </div>

      <YouPlay />

      <div style={{ ...fade, justifySelf: 'end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={segWrap}>
            {views.map(([id, label, ready]) => (
              <Tooltip key={id} title={label} description={ready ? undefined : t`The score comes in a later stage.`}>
                <button disabled={!ready} style={seg(view === id, !ready)} onClick={() => set({ view: id })}>{label}</button>
              </Tooltip>
            ))}
          </div>
          <Tooltip title={t`Keyboard size`} description={t`How many keys the on-screen keyboard shows.`}>
            <div style={segWrap}>
              {PRACTICE_SIZES.map(n => (
                <button key={n} style={{ ...seg(keyboardSize === n), padding: '0 7px', fontFamily: 'var(--font-mono)', letterSpacing: 0 }}
                  onClick={() => useStore.getState().setKeyboardSize(n)}>{n}</button>
              ))}
            </div>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
