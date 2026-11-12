import { useEffect, useMemo, useRef, useState } from 'react'
import { Piano, Check } from 'lucide-react'
import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import { onRangeKey, saveKeyboardRange, closeRangePrompt } from '../hooks/useMidiInput'
import { pressKey, keyCount, rangeLabel, fitKeyboardSize, type RangeStep } from '../utils/keyboardRange'
import { buildKeyLayoutRatios } from '../utils/keyLayout'
import { isBlackKey } from '../utils/midiParser'
import { getNoteLabel } from '../utils/noteNames'
import { t } from '../utils/i18n'

// ── "Press the lowest key, then the highest" — once per USB keyboard ────────
// Opens by itself the first time a keyboard Orfeo doesn't know is connected
// (hooks/useMidiInput.ts askRangeIfNeeded), or from Settings › MIDI Keyboard ›
// Measure keys. When both keys are in it says thank you and closes itself.
const DONE_MS = 2200
const LOW = 21, HIGH = 108  // the strip always shows 88 keys

export function KeyboardRangePrompt() {
  const prompt = useMidiSettings(s => s.rangePrompt)
  const naming = useStore(s => s.noteNaming)
  const acc = useStore(s => s.accidentals)
  const [state, setState] = useState<RangeStep>({ step: 'low' })
  const stateRef = useRef(state)
  const go = (s: RangeStep) => { stateRef.current = s; setState(s) }

  // A fresh start for every keyboard asked
  useEffect(() => { go({ step: 'low' }) }, [prompt?.key])

  // Keys from this keyboard (any keyboard in the Dev Tools test)
  useEffect(() => {
    if (!prompt) return
    return onRangeKey((deviceKey, note) => {
      if (!prompt.test && deviceKey !== prompt.key) return
      const next = pressKey(stateRef.current, note)
      if (next === stateRef.current) return
      go(next)
      if (next.step === 'done') saveKeyboardRange(next.range)
    })
  }, [prompt])

  // Done: a moment to read it, then away
  useEffect(() => {
    if (state.step !== 'done') return
    const id = setTimeout(closeRangePrompt, DONE_MS)
    return () => clearTimeout(id)
  }, [state.step])

  // Esc = Skip
  useEffect(() => {
    if (!prompt) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeRangePrompt() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [prompt])

  const layout = useMemo(() => buildKeyLayoutRatios(LOW, HIGH), [])
  if (!prompt) return null

  const names = naming === 'hidden' ? 'english' : naming
  const label = (n: number) => getNoteLabel(n, names, acc)
  const lit = (n: number) => state.step === 'high' ? n === state.low
    : state.step === 'done' ? n >= state.range.low && n <= state.range.high : false

  return (
    <div role="dialog" aria-label={t`Your keyboard's keys`}
      style={{
        position: 'fixed', left: '50%', top: '28%', transform: 'translateX(-50%)', zIndex: 11000, width: 420, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg-modal)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '16px 18px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.55)', fontFamily: 'var(--font-ui)',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-amber)', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 4 }}>
        {state.step === 'done' ? <Check size={14} strokeWidth={2} /> : <Piano size={14} strokeWidth={1.5} />}
        {state.step === 'done' ? t`Thank you, done!` : t`Let Orfeo get to know your keyboard`}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {prompt.name}
      </div>

      <div style={{ color: 'var(--text-default)', fontSize: 'var(--text-sm)', lineHeight: 1.55, minHeight: 44 }}>
        {state.step === 'low' && <>{t`Press the`} <b style={{ color: 'var(--text-amber)' }}>{t`lowest`}</b> {t`key on your keyboard.`}</>}
        {state.step === 'high' && <>{t`Lowest key:`} <b>{label(state.low)}</b>. {t`Now press the`} <b style={{ color: 'var(--text-amber)' }}>{t`highest`}</b> {t`key.`}</>}
        {state.step === 'done' && (
          <>
            {t`${keyCount(state.range)} keys, ${rangeLabel(state.range, naming, acc)}.`}{' '}
            {t`The on-screen keyboard now shows ${fitKeyboardSize(state.range)} keys.`}
          </>
        )}
      </div>

      {/* 88 keys, the part you've shown lit */}
      <div aria-hidden="true" style={{ position: 'relative', height: 34, margin: '12px 0 4px', borderRadius: 3, overflow: 'hidden', background: 'var(--key-white-bg)' }}>
        {layout.map((k, i) => {
          const n = LOW + i
          const black = isBlackKey(n)
          return (
            <div key={n} style={{
              position: 'absolute', left: `${k.x * 100}%`, width: `${k.width * 100}%`, top: 0, height: black ? '60%' : '100%', zIndex: black ? 1 : 0,
              boxSizing: 'border-box', borderRight: black ? 'none' : '1px solid var(--key-white-border)',
              borderRadius: black ? '0 0 1px 1px' : 0,
              background: lit(n) ? 'var(--text-amber)' : black ? 'var(--border-row)' : 'var(--key-white-bg)',
              filter: lit(n) && black ? 'brightness(0.6)' : undefined,
              transition: 'background 0.2s',
            }} />
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 10, marginTop: 12 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.4 }}>
          {state.step !== 'done' && t`Octave buttons on your keyboard? Set them to the middle first.`}
        </span>
        {state.step !== 'done' && (
          <button onClick={closeRangePrompt}
            style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--text-inactive)', background: 'transparent',
              color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>
            {t`Skip`}
          </button>
        )}
      </div>
    </div>
  )
}
