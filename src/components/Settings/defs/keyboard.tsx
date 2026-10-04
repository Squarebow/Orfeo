import { Piano, Binary, CaseSensitive, Lightbulb, Clock } from 'lucide-react'
import { useStore } from '../../../store'
import type { KeyboardSize } from '../../../types'
import { OptionBtn, Switch } from '../controls'
import type { SettingDef } from '../types'

const KEYBOARD_SIZES: KeyboardSize[] = [61, 73, 88]

function KeyRangeControl() {
  const size = useStore(s => s.keyboardSize)
  const setSize = useStore(s => s.setKeyboardSize)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      {KEYBOARD_SIZES.map(n => <OptionBtn key={n} active={size === n} onClick={() => setSize(n)}>{n}</OptionBtn>)}
    </div>
  )
}

export const KEYBOARD_DEFS: SettingDef[] = [
  { id: 'keyRange', icon: Piano, kind: 'choice', Control: KeyRangeControl },
  {
    id: 'showOctaves', icon: Binary, kind: 'switch',
    Control: () => { const v = useStore(s => s.showOctaveLabels); return <Switch value={v} onChange={useStore.getState().setShowOctaveLabels} label="Show octaves" /> },
  },
  {
    id: 'showNoteNames', icon: CaseSensitive, kind: 'switch',
    Control: () => { const v = useStore(s => s.showNoteNamesOnKeyboard); return <Switch value={v} onChange={useStore.getState().setShowNoteNamesOnKeyboard} label="Show note names" /> },
  },
  {
    id: 'reflectPianoRoll', icon: Lightbulb, kind: 'switch',
    Control: () => { const v = useStore(s => s.reflectPianoRollOnKeyboard); return <Switch value={v} onChange={useStore.getState().setReflectPianoRollOnKeyboard} label="Reflect piano roll on keyboard" /> },
  },
  {
    id: 'preciseScrubTime', icon: Clock, kind: 'switch',
    Control: () => { const v = useStore(s => s.showPreciseScrubTime); return <Switch value={v} onChange={useStore.getState().setShowPreciseScrubTime} label="Show precise scrub time" /> },
  },
]
