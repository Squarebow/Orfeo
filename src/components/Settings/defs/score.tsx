import { FileMusic, MessageSquareText, Hand, Divide, Music4, Layers, Footprints } from 'lucide-react'
import { useStore } from '../../../store'
import { Switch, OptionBtn, ButtonRow } from '../controls'
import type { SettingDef } from '../types'
import { t } from '../../../utils/i18n'
import type { ScoreOptions } from '../../../notation/scoreOptions'
import { PRACTICE_VISIBLE } from '../../../practice/practiceMode'

// ── Settings › Practice › Score: how practice mode's score is written ──────
// (src/notation/scoreOptions.ts; the score itself: components/Practice/ScoreView.tsx)

function useOpt<K extends keyof ScoreOptions>(k: K): [ScoreOptions[K], (v: ScoreOptions[K]) => void] {
  const v = useStore(s => s.scoreOptions[k])
  return [v, (nv) => useStore.getState().setScoreOptions({ [k]: nv } as Partial<ScoreOptions>)]
}

function Choice<K extends 'writing' | 'chords'>({ k, options }: { k: K; options: [ScoreOptions[K], string][] }) {
  const [v, set] = useOpt(k)
  return <ButtonRow>{options.map(([value, label]) => <OptionBtn key={String(value)} active={v === value} onClick={() => set(value)}>{label}</OptionBtn>)}</ButtonRow>
}
function Toggle({ k, label }: { k: 'triplets' | 'swing' | 'voices' | 'pedal' | 'fingering'; label: string }) {
  const [v, set] = useOpt(k)
  return <Switch value={v} onChange={set} label={label} />
}

export const SCORE_DEFS: SettingDef[] = [
  { id: 'scoreWriting', icon: FileMusic, kind: 'choice', useVisible: () => PRACTICE_VISIBLE,
    Control: () => <Choice k="writing" options={[['auto', t`Orfeo chooses`], ['full', t`As written`], ['simple', t`Simplified`]]} /> },
  { id: 'scoreChords', icon: MessageSquareText, kind: 'choice', useVisible: () => PRACTICE_VISIBLE,
    Control: () => <Choice k="chords" options={[['off', t`Off`], ['main', t`Main chords`], ['all', t`Every change`]]} /> },
  { id: 'scoreTriplets', icon: Divide, kind: 'switch', useVisible: () => PRACTICE_VISIBLE, Control: () => <Toggle k="triplets" label={t`Triplets`} /> },
  { id: 'scoreSwing', icon: Music4, kind: 'switch', useVisible: () => PRACTICE_VISIBLE, Control: () => <Toggle k="swing" label={t`Swing written straight`} /> },
  { id: 'scoreVoices', icon: Layers, kind: 'switch', useVisible: () => PRACTICE_VISIBLE, Control: () => <Toggle k="voices" label={t`Held notes as a second voice`} /> },
  { id: 'scoreFingering', icon: Hand, kind: 'switch', useVisible: () => PRACTICE_VISIBLE, Control: () => <Toggle k="fingering" label={t`Fingering`} /> },
  { id: 'scorePedal', icon: Footprints, kind: 'switch', useVisible: () => PRACTICE_VISIBLE, Control: () => <Toggle k="pedal" label={t`Pedal marks`} /> },
]
