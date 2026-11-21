import { KeyboardMusic, Music2, TriangleAlert, ListOrdered, MicVocal, MousePointerClick, Heart, Ruler, Lightbulb, Languages, Keyboard, UserRound, Ear, History, Music, Disc } from 'lucide-react'
import { RecordingTestPanel } from './record'
import { PracticeKeysPanel, PianistPanel, ListenTestPanel, PracticeHistoryPanel, ScoreTestPanel } from './practice'
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
  { id: 'devPracticeKeys', icon: Keyboard, kind: 'choice', Control: PracticeKeysPanel },
  { id: 'devPianist', icon: UserRound, kind: 'choice', Control: PianistPanel },
  { id: 'devListen', icon: Ear, kind: 'choice', Control: ListenTestPanel },
  { id: 'devPracticeHistory', icon: History, kind: 'choice', Control: PracticeHistoryPanel },
  { id: 'devScore', icon: Music, kind: 'choice', Control: ScoreTestPanel },
  { id: 'devRecording', icon: Disc, kind: 'choice', Control: RecordingTestPanel },
  { id: 'devExplorers', icon: Music2, kind: 'choice', Control: ExplorersHearPreview },
  { id: 'devClosingWarning', icon: TriangleAlert, kind: 'choice', Control: UnsavedWarningPreview },
  { id: 'devQueue', icon: ListOrdered, kind: 'choice', Control: QueueTestPanel },
  { id: 'devLyrics', icon: MicVocal, kind: 'choice', Control: LyricsTestPanel },
  { id: 'devOpenWith', icon: MousePointerClick, kind: 'choice', Control: OpenWithTestPanel },
  { id: 'devTranslations', icon: Languages, kind: 'choice', Control: TranslationsTestPanel },
  { id: 'devSupportNote', icon: Heart, kind: 'choice', Control: SupportNotePreview },
]
