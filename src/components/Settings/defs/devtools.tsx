import { KeyboardMusic, Music2, TriangleAlert, ListOrdered, MicVocal, MousePointerClick, Heart, Ruler, Lightbulb, Languages } from 'lucide-react'
import type { SettingDef } from '../types'
import { SimulatorPanel, KeyRangeTestPanel, KeyLightsTestPanel } from './midi'
import { ExplorersHearPreview, UnsavedWarningPreview } from './playback'
import { QueueTestPanel, LyricsTestPanel, OpenWithTestPanel } from './library'
import { TranslationsTestPanel } from './language'
import { SupportNotePreview } from './appearance'

// ── Dev Tools — every "test builds only" tool in one group, shown only in dev
// mode (simAvailable: npm run dev, test builds, Ctrl+Alt+Shift+D). Each tool is
// still its own panel from the group it tests; to be sorted into tabs later. ──
export const DEVTOOLS_DEFS: SettingDef[] = [
  { id: 'devKeyboard', icon: KeyboardMusic, kind: 'choice', Control: SimulatorPanel },
  { id: 'devKeyRange', icon: Ruler, kind: 'choice', Control: KeyRangeTestPanel },
  { id: 'devKeyLights', icon: Lightbulb, kind: 'choice', Control: KeyLightsTestPanel },
  { id: 'devExplorers', icon: Music2, kind: 'choice', Control: ExplorersHearPreview },
  { id: 'devClosingWarning', icon: TriangleAlert, kind: 'choice', Control: UnsavedWarningPreview },
  { id: 'devQueue', icon: ListOrdered, kind: 'choice', Control: QueueTestPanel },
  { id: 'devLyrics', icon: MicVocal, kind: 'choice', Control: LyricsTestPanel },
  { id: 'devOpenWith', icon: MousePointerClick, kind: 'choice', Control: OpenWithTestPanel },
  { id: 'devTranslations', icon: Languages, kind: 'choice', Control: TranslationsTestPanel },
  { id: 'devSupportNote', icon: Heart, kind: 'choice', Control: SupportNotePreview },
]
